// Dinorunner server: static files, live ghosts of everyone running, and a leaderboard.
import http from 'http';
import zlib from 'zlib';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { maxScore, COLORS } from './public/rules.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, 'public');
const DATA = path.join(HERE, 'data', 'leaderboard.json');
const PORT = +process.env.PORT || 8080;
const MAX_CONN = +(process.env.MAX_CONN || 600);
const MAX_PER_IP = +(process.env.MAX_PER_IP || 10); // phones on one carrier often share an address
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml' };
const now = () => Date.now() / 1000;
const day = () => new Date().toISOString().slice(0, 10);

// ---------- static ----------
const cache = new Map(), gz = new Map();
const server = http.createServer((req, res) => {
  let p; try { p = decodeURIComponent(req.url.split('?')[0]); } catch { res.writeHead(400); return res.end(); }
  if (p === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ok: true, online: players.size, running: [...players.values()].filter(x => x.running).length, best: board.all[0] ? { name: board.all[0].name, score: board.all[0].score } : null })); }
  if (p === '/' || p === '/embed') p = '/index.html';
  const f = path.join(ROOT, path.normalize(p)); if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  const send = b => {
    const ext = path.extname(f);
    if (ext === '.html') { const proto = (req.headers['x-forwarded-proto'] || '').split(',')[0] || 'http'; b = Buffer.from(b.toString().replaceAll('__ORIGIN__', `${proto}://${req.headers.host}`)); }
    const h = { 'content-type': TYPES[ext] || 'application/octet-stream', 'cache-control': ext === '.png' ? 'public, max-age=600' : 'no-cache' };
    // text files go out gzipped, about a third of the size
    if (ext !== '.png' && /gzip/.test(req.headers['accept-encoding'] || '')) { const key = f + '|gz|' + (ext === '.html' ? req.headers.host : ''); let z = gz.get(key); if (!z) { z = zlib.gzipSync(b); gz.set(key, z); } h['content-encoding'] = 'gzip'; h.vary = 'accept-encoding'; res.writeHead(200, h); return res.end(z); }
    res.writeHead(200, h); res.end(b);
  };
  if (cache.has(f)) return send(cache.get(f));
  fs.readFile(f, (e, b) => { if (e) { res.writeHead(404); return res.end('not found'); } cache.set(f, b); send(b); });
});
const wss = new WebSocketServer({ server, maxPayload: 1024 });

// ---------- leaderboard ----------
// best score per player token, all time and today
let board = { all: [], today: [], day: day() };
try { const b = JSON.parse(fs.readFileSync(DATA, 'utf8')); if (Array.isArray(b.all)) board = b; } catch {}
// Free hosting wipes local files on every restart, so if Upstash Redis keys are set the board also lives there.
const KV_URL = (process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, ''), KV_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '', KV_KEY = 'dinorunner:board';
async function kv(cmd) {
  const r = await fetch(KV_URL, { method: 'POST', headers: { authorization: `Bearer ${KV_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify(cmd) });
  if (!r.ok) throw new Error('kv ' + r.status); return (await r.json()).result;
}
if (KV_URL && KV_TOKEN) {
  kv(['GET', KV_KEY]).then(v => {
    if (!v) return console.log('leaderboard: upstash connected, empty');
    const b = JSON.parse(v);
    // merge with anything recorded while we were loading
    for (const e of b.all || []) insert(board.all, e);
    if (b.day === day()) for (const e of b.today || []) insert(board.today, e);
    lastLb = ''; broadcast(lbMsg()); console.log(`leaderboard: loaded ${board.all.length} from upstash`);
  }).catch(e => console.error('leaderboard: upstash load failed', e.message));
} else console.log('leaderboard: local file only (set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to keep it across restarts)');
// writes are batched: at most one every 10 s, which stays far inside the free plan
let saveTimer = null;
function flush() {
  saveTimer = null; const json = JSON.stringify(board);
  fs.mkdir(path.dirname(DATA), { recursive: true }, () => fs.writeFile(DATA, json, () => {}));
  if (KV_URL && KV_TOKEN) return kv(['SET', KV_KEY, json]).catch(e => console.error('leaderboard: upstash save failed', e.message));
}
function save() { if (!saveTimer) saveTimer = setTimeout(flush, 10000); }
// Render sends SIGTERM before it stops the service: write right away
process.on('SIGTERM', async () => { if (saveTimer) { clearTimeout(saveTimer); await flush(); } process.exit(0); });
function insert(list, e, n = 50) {
  const i = list.findIndex(x => x.tok === e.tok);
  if (i >= 0) { if (list[i].score >= e.score) { list[i].name = e.name; return false; } list.splice(i, 1); }
  list.push(e); list.sort((a, b) => b.score - a.score); list.length = Math.min(list.length, n); return true;
}
function record(p, score) {
  if (board.day !== day()) { board.today = []; board.day = day(); }
  const e = { tok: p.tok, name: p.name, score, color: p.color, at: Date.now() };
  const a = insert(board.all, { ...e }), b = insert(board.today, { ...e });
  // only tell everyone when the visible top 10 actually changed
  if (a || b) { save(); const msg = lbMsg(); if (msg !== lastLb) { lastLb = msg; broadcast(msg); } }
}
const pub = l => l.slice(0, 10).map(x => [x.name, x.score, x.color]);
let lastLb = '';
const lbMsg = () => { if (board.day !== day()) { board.today = []; board.day = day(); } return JSON.stringify({ t: 'lb', all: pub(board.all), today: pub(board.today) }); };

// ---------- players ----------
let nextId = 1;
const players = new Map(); // ws -> player
const perIp = new Map();
const clean = s => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 14);
function broadcast(s) { for (const ws of wss.clients) if (ws.readyState === 1 && ws.bufferedAmount < 128 * 1024) ws.send(s); }

wss.on('connection', (ws, req) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (wss.clients.size > MAX_CONN || (perIp.get(ip) || 0) >= MAX_PER_IP) { ws.close(1013, 'server full'); return; }
  perIp.set(ip, (perIp.get(ip) || 0) + 1);
  const p = { id: nextId++, name: 'dino' + Math.floor(Math.random() * 900 + 100), tok: '', color: COLORS[nextId % COLORS.length], ci: nextId % COLORS.length, running: false, score: 0, y: 0, duck: 0, t0: 0, best: 0, deadAt: 0 };
  players.set(ws, p);
  ws.alive = true; ws.on('pong', () => { ws.alive = true; });
  ws.known = new Map(); ws.hidden = false; ws.lastG = '';
  ws.tokens = 30; ws.fill = now();
  ws.send(JSON.stringify({ t: 'hi', id: p.id, color: p.color })); ws.send(lbMsg());
  ws.on('message', raw => {
    const t = now(); ws.tokens = Math.min(30, ws.tokens + (t - ws.fill) * 25); ws.fill = t;
    if (ws.tokens < 1) return; ws.tokens--;
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object') return;
    if (m.t === 'vis') { ws.hidden = !!m.h; }
    else if (m.t === 'name') { p.name = clean(m.name) || p.name; p.nv = (p.nv || 0) + 1; p.tok = String(m.tok || '').replace(/[^a-z0-9]/gi, '').slice(0, 24) || 'anon' + p.id; }
    else if (m.t === 'go') { p.running = true; p.score = 0; p.t0 = t; p.y = 0; p.duck = 0; }
    else if (m.t === 'p' && p.running) {
      const cap = maxScore(t - p.t0) * 1.06 + 15;
      p.score = Math.max(0, Math.min(cap, Math.floor(+m.s || 0))); p.y = Math.max(0, Math.min(200, +m.y || 0)); p.duck = m.d ? 1 : 0;
    } else if (m.t === 'dead' && p.running) {
      p.running = false; p.deadAt = t;
      const cap = Math.floor(maxScore(t - p.t0) * 1.06 + 15);
      const score = Math.max(0, Math.min(cap, Math.floor(+m.s || 0)));
      p.score = score; p.best = Math.max(p.best, score);
      if (score > 0 && p.tok) record(p, score);
    }
  });
  ws.on('close', () => { players.delete(ws); const n = (perIp.get(ip) || 1) - 1; if (n > 0) perIp.set(ip, n); else perIp.delete(ip); });
  ws.on('error', () => {});
});
setInterval(() => { for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; try { ws.ping(); } catch {} } }, 15000);

// What each player gets, kept small because free hosting has a tight monthly traffic budget:
//  - 'g' about 3 times a second: the 6 runners closest to your score, the ones you can see as ghosts
//  - 'top' once a second: the top 8, how many are online and running, and your live place
// Names are sent once per player and again only if they change.
const flags = p => (p.duck ? 1 : 0) | (p.running ? 2 : 0);
function names(ws, list) {
  let n = null;
  for (const p of list) { const v = p.nv || 0; if (ws.known.get(p.id) !== v) { ws.known.set(p.id, v); (n ||= {})[p.id] = p.name; } }
  if (ws.known.size > 500) ws.known.clear();
  return n;
}
function visible(t) { return [...players.values()].filter(p => p.running || t - p.deadAt < 2).sort((a, b) => b.score - a.score); }
function sendTo(ws, o) { if (ws.readyState === 1 && ws.bufferedAmount < 64 * 1024) ws.send(JSON.stringify(o)); }
setInterval(() => {
  const t = now(), R = visible(t); if (!R.length) { for (const ws of wss.clients) if (ws.lastG !== '0') { ws.lastG = '0'; sendTo(ws, { t: 'g', g: [] }); } return; }
  for (const ws of wss.clients) {
    if (ws.hidden) continue;
    const me = players.get(ws); if (!me) continue;
    const ref = me.running || t - me.deadAt < 2 ? me.score : R[0].score;
    const near = R.filter(p => p !== me).sort((a, b) => Math.abs(a.score - ref) - Math.abs(b.score - ref)).slice(0, 6);
    const g = near.map(p => [p.id, Math.floor(p.score), Math.round(p.y), flags(p), p.ci]);
    const key = JSON.stringify(g); if (key === ws.lastG) continue; ws.lastG = key;
    const o = { t: 'g', g }, n = names(ws, near); if (n) o.n = n; sendTo(ws, o);
  }
}, 300);
setInterval(() => {
  const t = now(), R = visible(t), top = R.slice(0, 8), run = R.filter(p => p.running).length;
  for (const ws of wss.clients) {
    if (ws.hidden) continue;
    const me = players.get(ws); if (!me) continue;
    const o = { t: 'top', ps: top.map(p => [p.id, Math.floor(p.score), p.running ? 1 : 0, p.ci]), on: players.size, run };
    if (me.running) o.me = R.filter(p => p.running && p.score > me.score).length + 1;
    const n = names(ws, top); if (n) o.n = n; sendTo(ws, o);
  }
}, 1000);

process.on('uncaughtException', e => console.error('uncaught', e));
server.listen(PORT, () => console.log(`dinorunner on http://localhost:${PORT}`));
