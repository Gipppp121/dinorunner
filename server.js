// Dinorunner server: static files, live ghosts of everyone running, and a leaderboard.
import http from 'http';
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
const MAX_PER_IP = +(process.env.MAX_PER_IP || 4);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml' };
const now = () => Date.now() / 1000;
const day = () => new Date().toISOString().slice(0, 10);

// ---------- static ----------
const cache = new Map();
const server = http.createServer((req, res) => {
  let p; try { p = decodeURIComponent(req.url.split('?')[0]); } catch { res.writeHead(400); return res.end(); }
  if (p === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ok: true, online: players.size, running: [...players.values()].filter(x => x.running).length, best: board.all[0] ? { name: board.all[0].name, score: board.all[0].score } : null })); }
  if (p === '/' || p === '/embed') p = '/index.html';
  const f = path.join(ROOT, path.normalize(p)); if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  const send = b => {
    const ext = path.extname(f);
    if (ext === '.html') { const proto = (req.headers['x-forwarded-proto'] || '').split(',')[0] || 'http'; b = Buffer.from(b.toString().replaceAll('__ORIGIN__', `${proto}://${req.headers.host}`)); }
    res.writeHead(200, { 'content-type': TYPES[ext] || 'application/octet-stream', 'cache-control': ext === '.png' ? 'public, max-age=600' : 'no-cache' }); res.end(b);
  };
  if (cache.has(f)) return send(cache.get(f));
  fs.readFile(f, (e, b) => { if (e) { res.writeHead(404); return res.end('not found'); } cache.set(f, b); send(b); });
});
const wss = new WebSocketServer({ server, maxPayload: 1024 });

// ---------- leaderboard ----------
// best score per player token, all time and today
let board = { all: [], today: [], day: day() };
try { const b = JSON.parse(fs.readFileSync(DATA, 'utf8')); if (Array.isArray(b.all)) board = b; } catch {}
let saveTimer = null;
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { fs.mkdir(path.dirname(DATA), { recursive: true }, () => fs.writeFile(DATA, JSON.stringify(board), () => {})); }, 2000); }
function insert(list, e, n = 50) {
  const i = list.findIndex(x => x.tok === e.tok);
  if (i >= 0) { if (list[i].score >= e.score) { list[i].name = e.name; return false; } list.splice(i, 1); }
  list.push(e); list.sort((a, b) => b.score - a.score); list.length = Math.min(list.length, n); return true;
}
function record(p, score) {
  if (board.day !== day()) { board.today = []; board.day = day(); }
  const e = { tok: p.tok, name: p.name, score, color: p.color, at: Date.now() };
  const a = insert(board.all, { ...e }), b = insert(board.today, { ...e });
  if (a || b) { save(); broadcast(lbMsg()); }
}
const pub = l => l.slice(0, 10).map(x => [x.name, x.score, x.color]);
const lbMsg = () => JSON.stringify({ t: 'lb', all: pub(board.all), today: pub(board.today) });

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
  const p = { id: nextId++, name: 'dino' + Math.floor(Math.random() * 900 + 100), tok: '', color: COLORS[nextId % COLORS.length], running: false, score: 0, y: 0, duck: 0, t0: 0, best: 0, deadAt: 0 };
  players.set(ws, p);
  ws.alive = true; ws.on('pong', () => { ws.alive = true; });
  ws.tokens = 30; ws.fill = now();
  ws.send(JSON.stringify({ t: 'hi', id: p.id, color: p.color })); ws.send(lbMsg());
  ws.on('message', raw => {
    const t = now(); ws.tokens = Math.min(30, ws.tokens + (t - ws.fill) * 25); ws.fill = t;
    if (ws.tokens < 1) return; ws.tokens--;
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object') return;
    if (m.t === 'name') { p.name = clean(m.name) || p.name; p.tok = String(m.tok || '').replace(/[^a-z0-9]/gi, '').slice(0, 24) || 'anon' + p.id; }
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

// live ghosts, 10 times a second. Recently crashed players stay visible for 2 s.
setInterval(() => {
  const t = now();
  const ps = [...players.values()].filter(p => p.running || t - p.deadAt < 2).sort((a, b) => b.score - a.score).slice(0, 40)
    .map(p => [p.id, p.name, Math.floor(p.score), Math.round(p.y), p.duck, p.running ? 1 : 0, p.color]);
  broadcast(JSON.stringify({ t: 'live', ps, online: players.size }));
}, 100);

process.on('uncaughtException', e => console.error('uncaught', e));
server.listen(PORT, () => console.log(`dinorunner on http://localhost:${PORT}`));
