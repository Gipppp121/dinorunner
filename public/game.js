// Dinorunner client: endless runner, live ghosts of other players, leaderboard.
import { RUN, speedAt, COLORS } from './rules.js?v=7';

const $ = id => document.getElementById(id);
const cv = $('c'), g = cv.getContext('2d');
const W = 800, PX = 3, DINO_X = 150;
let H = 260, GROUND = 222;
const TOUCH = matchMedia('(pointer: coarse)').matches;
if (window.top !== window.self) document.body.classList.add('embed');
if (TOUCH) $('keys').textContent = 'tap to jump · hold for higher · hold the left side to duck';
// the view is always 800 game pixels wide so everyone sees the same distance ahead; tall screens just get more sky
function fit() {
  const st = $('stage'), cw = st.clientWidth || 800, ch = st.clientHeight || 260, r = Math.min(2, devicePixelRatio || 1);
  H = Math.round(Math.max(260, Math.min(620, 800 * ch / cw))); GROUND = H - 38;
  cv.width = Math.round(cw * r); cv.height = Math.round(ch * r); const k = cv.width / W; g.setTransform(k, 0, 0, k, 0, 0); g.imageSmoothingEnabled = false;
  for (const p of pebbles) p.y = GROUND + 4 + Math.random() * 14;
}

const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };

// ---------- sprites ----------
const RUN_A = [
  '...........GGGGGG..',
  '..........GGGGGGGG.',
  '..........GWKGGGGG.',
  '..........GWWGGGGGG',
  '..........GGGGGGGGG',
  '..........GGGGGBBB.',
  '.....D.D.GGGGGG....',
  '....GSSSSSGGGG.....',
  'G..GGSSSGGGGGGGG...',
  'GG.GGGGGGBBBGG.G...',
  'GGGGGGGGBBBBGG.....',
  '.GGGGGGGBBBBG......',
  '..GGGGGGGGGGG......',
  '...GGGGGGGGG.......',
  '....GG...GG........',
  '....G.....G........',
  '....GG....GG.......'];
const RUN_B = RUN_A.slice(0, 14).concat(['....GG...GG........', '.....G..GG.........', '.........GGG.......']);
const RUN_C = RUN_A.slice(0, 14).concat(['....GG...GG........', '....GG...G.........', '...GGG....G........']);
const DUCK_A = [
  '..................GGGGGG.',
  '.....D.D.D.......GGWKGGGG',
  '....GGGGGGGGGGGGGGGWWGGGG',
  'G..GGGGGSSSSSGGGGGGGGGGG.',
  'GGGGGGGGBBBBBBGGGGGGBBB..',
  '.GGGGGGGBBBBBBBGGGG......',
  '..GGGGGGGGGGGGGGG........',
  '...GG....GG..............',
  '...G......G..............'];
const DUCK_B = DUCK_A.slice(0, 7).concat(['....GG..GG...............', '.....G...GG..............']);
const DEAD = RUN_A.map(r => r.replace('WK', 'XX').replace('WW', 'XX'));
const DRONE_A = ['.KKKKK....KKKKK.', '...K........K...', '..KKKKKKKKKKKK..', '.KKRKKKKKKKKKRK.', '..KKKKKKKKKKKK..', '....K......K....'];
const DRONE_B = ['....KKK..KKK....', '...K........K...', '..KKKKKKKKKKKK..', '.KKRKKKKKKKKKRK.', '..KKKKKKKKKKKK..', '....K......K....'];
const sprCache = new Map();
function sprite(rows, body, night, dark = '#1d3b2a') {
  const key = rows.join('') + body + night; if (sprCache.has(key)) return sprCache.get(key);
  const w = rows[0].length, h = rows.length, c = document.createElement('canvas'); c.width = w * PX; c.height = h * PX; const x = c.getContext('2d');
  const col = { G: body, D: shade(body, .55), B: shade(body, 1.35), S: '#ff7a45', W: '#fff', K: night ? '#cfd3da' : '#222', X: '#222', R: '#ff4d4d' };
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const ch = rows[j][i]; if (ch === '.') continue; x.fillStyle = ch === 'X' ? '#222' : col[ch] || dark; x.fillRect(i * PX, j * PX, PX, PX); }
  if (rows === DEAD) { x.fillStyle = '#222'; x.fillRect(11 * PX, 2 * PX, PX, PX); x.fillRect(12 * PX, 3 * PX, PX, PX); x.fillRect(12 * PX, 2 * PX, PX, PX); x.fillRect(11 * PX, 3 * PX, PX, PX); }
  sprCache.set(key, c); return c;
}
function shade(hex, k) { const n = parseInt(hex.slice(1), 16); const f = v => Math.max(0, Math.min(255, Math.round(v * k))); return `rgb(${f(n >> 16 & 255)},${f(n >> 8 & 255)},${f(n & 255)})`; }

// ---------- sound ----------
let AC = null, muted = store.get('dr_mute') === '1';
function audio() { if (AC) { if (AC.state === 'suspended') AC.resume(); return; } try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch {} }
function tone(type, f0, f1, dur, vol, delay = 0) { if (!AC || muted) return; const t = AC.currentTime + delay, o = AC.createOscillator(), e = AC.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur); e.gain.setValueAtTime(vol, t); e.gain.exponentialRampToValueAtTime(.0001, t + dur); o.connect(e); e.connect(AC.destination); o.start(t); o.stop(t + dur + .02); }
const sfx = { jump: () => tone('square', 380, 760, .09, .06), point: () => { tone('square', 990, 990, .07, .05); tone('square', 1320, 1320, .12, .05, .08); }, die: () => { tone('sawtooth', 300, 60, .45, .1); tone('square', 120, 50, .3, .08); }, best: () => [660, 880, 1100, 1320].forEach((f, i) => tone('triangle', f, f, .15, .07, i * .07)),
  zone: () => { [440, 554, 659, 880].forEach((f, i) => tone('square', f, f, .12, .045, i * .06)); tone('triangle', 220, 880, .5, .05, .05); } };
function setMute(v) { muted = v; store.set('dr_mute', v ? '1' : '0'); $('mute').textContent = v ? '🔇' : '🔊'; }
setMute(muted); $('mute').onclick = e => { e.stopPropagation(); audio(); setMute(!muted); };

// ---------- net ----------
let ws, myId = 0, myColor = COLORS[0], live = [], lb = { all: [], today: [] }, lbTab = 'today';
// live data from the server: names by id, the top list, and the ghosts near you (smoothed between updates)
const nameOf = new Map(), ghosts = new Map(); let top = [], liveRank = 0, liveRun = 0;
function ghostList() {
  const now = performance.now() / 1000, out = [];
  for (const [id, gh] of ghosts) {
    const k = Math.min(1, (now - gh.at) / .3), dt = Math.min(.6, now - gh.at);
    const s = gh.alive ? gh.s + gh.rate * dt : gh.s, y = gh.y0 + (gh.y1 - gh.y0) * k;
    out.push([id, nameOf.get(id) || 'dino', Math.floor(s), Math.max(0, y), gh.duck, gh.alive, COLORS[gh.ci] || COLORS[0]]);
  }
  return out.sort((a, b) => b[2] - a[2]);
}
const tok = store.get('dr_tok') || Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 8); store.set('dr_tok', tok);
$('name').value = store.get('dr_name') || '';
function connect() {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.onopen = () => { if (myName) send({ t: 'name', name: myName, tok }); if (document.hidden) send({ t: 'vis', h: 1 }); };
  ws.onmessage = e => { const m = JSON.parse(e.data);
    if (m.t === 'hi') { myId = m.id; myColor = m.color; }
    else if (m.t === 'g') {
      if (m.n) for (const k in m.n) nameOf.set(+k, m.n[k]);
      const now = performance.now() / 1000, seen = new Set();
      for (const [id, s, y, f, ci] of m.g) {
        seen.add(id); const o = ghosts.get(id), cur = o ? ghostList().find(x => x[0] === id) : null;
        const rate = o && now > o.at ? Math.max(0, Math.min(60, (s - o.s) / (now - o.at))) : 0;
        ghosts.set(id, { s, rate: o ? o.rate * .5 + rate * .5 : 0, y0: cur ? cur[3] : y, y1: y, at: now, duck: f & 1, alive: (f & 2) ? 1 : 0, ci });
      }
      for (const id of [...ghosts.keys()]) if (!seen.has(id)) ghosts.delete(id);
    }
    else if (m.t === 'top') {
      if (m.n) for (const k in m.n) nameOf.set(+k, m.n[k]);
      top = m.ps; liveRank = m.me || 0; liveRun = m.run; $('online').textContent = m.on; renderLive();
    }
    else if (m.t === 'lb') { lb = m; renderLb(); } };
  ws.onclose = () => setTimeout(connect, 2000);
}
const send = o => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };
let myName = store.get('dr_name') || '';
connect();
document.addEventListener('visibilitychange', () => send({ t: 'vis', h: document.hidden ? 1 : 0 }));
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
function renderLive() {
  const ol = $('live'); if (!top.length) { ol.innerHTML = '<div class="empty">nobody is running right now</div>'; return; }
  ol.innerHTML = top.map(([id, s, alive, ci]) => [id, nameOf.get(id) || 'dino', s, 0, 0, alive, COLORS[ci] || COLORS[0]]).map(([id, n, s, , , alive, col], i) => `<li class="${id === myId ? 'me' : ''} ${alive ? '' : 'dead'}"><span class="n">${i + 1}</span><span class="d" style="background:${col}"></span><span class="nm">${esc(n)}${id === myId ? ' (you)' : ''}</span><span class="z" title="${ZONES[zoneOf(s).i].name}">${ZONES[zoneOf(s).i].icon}</span><span class="s">${s}</span></li>`).join('');
}
function renderLb() {
  const list = lb[lbTab] || [], ol = $('lb');
  if (!list.length) { ol.innerHTML = `<div class="empty">no scores ${lbTab === 'today' ? 'today' : 'yet'}. be the first</div>`; return; }
  ol.innerHTML = list.map(([n, s, col], i) => `<li class="${n === myName ? 'me' : ''}"><span class="n">${['🥇', '🥈', '🥉'][i] || i + 1}</span><span class="d" style="background:${col}"></span><span class="nm">${esc(n)}</span><span class="z" title="${ZONES[zoneOf(s).i].name}">${ZONES[zoneOf(s).i].icon}</span><span class="s">${s}</span></li>`).join('');
}
document.querySelectorAll('.tabs span').forEach(s => s.onclick = () => { lbTab = s.dataset.b; document.querySelectorAll('.tabs span').forEach(x => x.classList.toggle('on', x === s)); renderLb(); });

// ---------- game state ----------
let state = 'menu'; // menu | run | dead
let t = 0, runT = 0, dist = 0, score = 0, best = +(store.get('dr_best') || 0), speed = RUN.v0;
const dino = { y: 0, vy: 0, duck: false, held: false, frame: 0 };
let obs = [], nextGap = 600, pebbles = [], flash = 0, sendT = 0, lastHundred = 0, newBest = false;
for (let i = 0; i < 40; i++) pebbles.push({ x: Math.random() * W, y: GROUND + 4 + Math.random() * 14, w: 1 + (Math.random() * 3 | 0) });
fit(); addEventListener('resize', fit);

function start() {
  audio(); myName = $('name').value.trim().slice(0, 14) || myName || 'dino' + Math.floor(Math.random() * 900 + 100);
  store.set('dr_name', myName); send({ t: 'name', name: myName, tok }); send({ t: 'go' });
  state = 'run'; runT = 0; dist = 0; score = 0; speed = RUN.v0; obs = []; nextGap = 520; lastHundred = 0; newBest = false; zFrom = zTo = 0; zBlend = 1; banner = null;
  Object.assign(dino, { y: 0, vy: 0, duck: false }); $('overlay').style.display = 'none';
}
function die() {
  state = 'dead'; sfx.die(); send({ t: 'dead', s: score });
  if (score > best) { best = score; newBest = true; store.set('dr_best', best); }
  setTimeout(() => {
    $('ovTitle').textContent = newBest ? 'NEW BEST!' : 'GAME OVER';
    $('ovText').innerHTML = `<span class="big">${score}</span><br>your best ${best}${rankText()}<br>${TOUCH ? 'tap PLAY' : 'space or PLAY'} to run again`;
    $('name').style.display = 'none'; $('play').textContent = 'PLAY AGAIN'; $('overlay').style.display = 'flex';
  }, 450);
}
function rankText() { const l = lb.today || []; let r = l.findIndex(x => score >= x[1]); if (r < 0 && l.length < 10) r = l.length; return r >= 0 && r < 10 ? ` · #${r + 1} today` : ''; }
$('play').onclick = e => { e.stopPropagation(); start(); };

// ---------- input ----------
function jumpPress() { if (state !== 'run') return; dino.held = true; if (dino.y <= 0 && !dino.duck) { dino.vy = 780 * jumpK(); sfx.jump(); } }
function jumpRelease() { dino.held = false; }
addEventListener('keydown', e => {
  if (document.activeElement === $('name') && e.code !== 'Enter') return;
  if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
  if (e.code === 'KeyM') setMute(!muted);
  if ((e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'Enter') && state !== 'run' && !e.repeat) { start(); return; }
  if (e.code === 'Space' || e.code === 'ArrowUp') jumpPress();
  if (e.code === 'ArrowDown') dino.duck = true;
});
addEventListener('keyup', e => { if (e.code === 'Space' || e.code === 'ArrowUp') jumpRelease(); if (e.code === 'ArrowDown') dino.duck = false; });
const pts = new Map();
$('stage').addEventListener('pointerdown', e => {
  if (state !== 'run' || e.target.closest('#overlay') || e.target.id === 'mute') return; e.preventDefault(); audio();
  const r = cv.getBoundingClientRect(); const left = (e.clientX - r.left) < r.width * .3 && TOUCH;
  pts.set(e.pointerId, left ? 'duck' : 'jump'); if (left) dino.duck = true; else jumpPress();
});
const up = e => { const k = pts.get(e.pointerId); pts.delete(e.pointerId); if (k === 'duck') dino.duck = [...pts.values()].includes('duck'); if (k === 'jump') jumpRelease(); };
addEventListener('pointerup', up); addEventListener('pointercancel', up);

// ---------- zones ----------
// every zone has its own sky, ground and obstacles. Hitboxes stay the same everywhere, only the look changes.
const ZONES = [
  { name: 'DESERT', icon: '🌵', at: 0, dark: 0, skyA: '#fbfaf6', skyB: '#f3ecdb', ground: '#9a958a', fill: '#f7f2e6', peb: '#b9b2a2', ink: '#535353', dim: '#8f8b82', acc: '#2fbf71', drone: .24, grav: 1 },
  { name: 'OCEAN', icon: '🌊', at: 350, dark: 1, skyA: '#0e4a73', skyB: '#06243b', ground: '#e3cf98', fill: '#bfa266', peb: '#8a7445', ink: '#e8f6ff', dim: '#8fc3e0', acc: '#4fd1ff', drone: .3, grav: 1 },
  { name: 'TUNDRA', icon: '❄️', at: 800, dark: 0, skyA: '#c9dcee', skyB: '#f3f8fc', ground: '#8fa6bd', fill: '#ffffff', peb: '#c7d5e3', ink: '#34465a', dim: '#71859b', acc: '#3aa0e0', drone: .3, grav: 1 },
  { name: 'NEON CITY', icon: '🌃', at: 1300, dark: 1, skyA: '#0e0824', skyB: '#3a1150', ground: '#ff4fd8', fill: '#140a22', peb: '#5b2a7a', ink: '#f8edff', dim: '#b796d6', acc: '#ff4fd8', drone: .34, grav: 1 },
  { name: 'MARS', icon: '🔴', at: 1900, dark: 1, skyA: '#2c0f0c', skyB: '#c4562c', ground: '#5e2414', fill: '#8a391f', peb: '#5a2112', ink: '#ffe9d9', dim: '#e8a986', acc: '#ff8a4c', drone: .35, grav: 1 },
  { name: 'MOON BASE', icon: '🚀', at: 2600, dark: 1, skyA: '#02030a', skyB: '#111629', ground: '#a9afbb', fill: '#3b3f49', peb: '#6c717c', ink: '#eef1f7', dim: '#9aa3b5', acc: '#b48cff', drone: .38, grav: .8 }];
const LAP = 3400;
function zoneOf(s) { const r = s % LAP; let i = 0; for (let k = 0; k < ZONES.length; k++) if (r >= ZONES[k].at) i = k; const next = i + 1 < ZONES.length ? ZONES[i + 1].at : LAP; return { i, lap: Math.floor(s / LAP), left: next - r, next: ZONES[(i + 1) % ZONES.length], frac: (r - ZONES[i].at) / (next - ZONES[i].at) }; }
let zFrom = 0, zTo = 0, zBlend = 1, banner = null, scroll = 0;
function setZone(i, announce) {
  if (i === zTo) return;
  zFrom = zTo; zTo = i; zBlend = 0;
  if (announce) { banner = { i, t0: t }; sfx.zone(); }
}
const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

// ---------- world ----------
function spawn() {
  const z = ZONES[zTo], big = score > 150 && Math.random() < .35 + Math.min(.2, score / 15000);
  if (score > 250 && Math.random() < z.drone) {
    const lvl = [14, 38, 70][(Math.random() * 3) | 0]; // bottom of the flyer above ground: jump / duck / run under
    obs.push({ k: 'drone', x: W + 20, w: 48, h: 18, y: lvl, b: zTo, seed: Math.random() }); return;
  }
  const n = big ? 1 + (Math.random() * 2 | 0) : 1 + (Math.random() * 3 | 0), h = big ? 48 + Math.random() * 12 : 32 + Math.random() * 10;
  const parts = []; let x = 0; for (let i = 0; i < n; i++) { const w = big ? 22 : 15; parts.push({ dx: x, w, h: h - (i % 2) * 6 }); x += w + 2; }
  obs.push({ k: 'cactus', x: W + 20, w: x - 2, h, parts, y: 0, b: zTo, seed: Math.random() });
}
function hitboxes() {
  const y = GROUND - dino.y;
  if (dino.duck && dino.y <= 0) return [[DINO_X + 6, y - 24, 66, 20]];
  return [[DINO_X + 30, y - 51, 24, 18], [DINO_X + 10, y - 33, 30, 24], [DINO_X + 12, y - 12, 20, 12]];
}
const overlap = (a, b) => a[0] < b[0] + b[2] && a[0] + a[2] > b[0] && a[1] < b[1] + b[3] && a[1] + a[3] > b[1];
// faster runs get a snappier jump: same height, shorter time in the air, so it stays playable
const jumpK = () => Math.pow(speed / RUN.v0, .3);
function step(dt) {
  t += dt; zBlend = Math.min(1, zBlend + dt / 1.4);
  if (state !== 'run') { scroll += 140 * dt; return; }
  runT += dt; speed = speedAt(runT); const dx = speed * dt; dist += dx; scroll += dx; score = Math.floor(dist * RUN.perPx);
  if (Math.floor(score / 100) > lastHundred) { lastHundred = Math.floor(score / 100); sfx.point(); flash = 1; }
  setZone(zoneOf(score).i, true);
  // dino physics (y is height above ground)
  const k = jumpK(); let grav = 2600 * k * k * ZONES[zTo].grav; if (dino.held && dino.vy > 0) grav *= .55; if (dino.duck && dino.y > 0) grav *= 3;
  dino.vy -= grav * dt; dino.y += dino.vy * dt; if (dino.y <= 0) { dino.y = 0; dino.vy = 0; }
  dino.frame += dx * .045;
  // obstacles
  nextGap -= dx; if (nextGap <= 0) { spawn(); const min = 280 + speed * .6; nextGap = min * (1 + Math.random() * .85); }
  for (const o of obs) o.x -= dx * (o.k === 'drone' ? 1.08 : 1);
  obs = obs.filter(o => o.x + o.w > -80);
  for (const p of pebbles) { p.x -= dx; if (p.x < 0) p.x += W; }
  const hb = hitboxes();
  for (const o of obs) {
    const r = o.k === 'drone' ? [o.x + 4, GROUND - o.y - o.h, o.w - 8, o.h - 4] : null;
    if (r && hb.some(b => overlap(b, r))) return die();
    if (o.k === 'cactus') for (const p of o.parts) { const pr = [o.x + p.dx + 3, GROUND - p.h + 3, p.w - 6, p.h - 3]; if (hb.some(b => overlap(b, pr))) return die(); }
  }
  sendT += dt; if (sendT > .1) { sendT = 0; send({ t: 'p', s: score, y: Math.round(dino.y), d: dino.duck ? 1 : 0 }); }
}

// ---------- draw: backgrounds ----------
// endless rows of things that scroll at a parallax rate, placed by index so nothing needs to be stored
function rowOf(spacing, par, fn) { const off = scroll * par, b0 = Math.floor(off / spacing) - 1; for (let b = b0; b < b0 + Math.ceil(W / spacing) + 3; b++) fn(b * spacing - off, b); }
function hills(par, col, base, amp, f1, f2) {
  const off = scroll * par; g.fillStyle = col; g.beginPath(); g.moveTo(0, GROUND);
  for (let x = 0; x <= W; x += 8) g.lineTo(x, GROUND - base - amp * (.6 * Math.sin((x + off) / f1) + .4 * Math.sin((x + off) / f2 + 1.3)));
  g.lineTo(W, GROUND); g.closePath(); g.fill();
}
const BG = [
  // desert: sun, blocky clouds, dunes
  () => {
    g.fillStyle = '#f6e7b8'; g.beginPath(); g.arc(640, 64, 22, 0, 7); g.fill();
    g.fillStyle = '#e6e1d4'; rowOf(230, .12, (x, b) => { const y = 34 + hash(b) * 70; if (hash(b + 7) < .25) return; g.fillRect(x, y, 46, 8); g.fillRect(x + 8, y - 6, 26, 6); g.fillRect(x + 14, y - 10, 12, 4); });
    hills(.2, '#efe6cf', 16, 12, 90, 37);
  },
  // ocean: light rays, far fish, bubbles, seaweed
  () => {
    g.save(); for (let i = 0; i < 5; i++) { const x = ((i * 190 + t * 9) % 1000) - 100; const gr = g.createLinearGradient(0, 0, 0, GROUND); gr.addColorStop(0, 'rgba(160,220,255,.16)'); gr.addColorStop(1, 'rgba(160,220,255,0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 50, 0); g.lineTo(x + 130, GROUND); g.lineTo(x + 40, GROUND); g.fill(); } g.restore();
    g.fillStyle = 'rgba(10,40,70,.55)'; rowOf(260, .1, (x, b) => { const y = 50 + hash(b) * (GROUND - 130), fx = x + Math.sin(t + b) * 10; g.beginPath(); g.ellipse(fx, y, 16, 6, 0, 0, 7); g.fill(); g.beginPath(); g.moveTo(fx + 14, y); g.lineTo(fx + 24, y - 6); g.lineTo(fx + 24, y + 6); g.fill(); });
    g.strokeStyle = 'rgba(210,240,255,.45)'; g.lineWidth = 1.2; for (let i = 0; i < 34; i++) { const x = (hash(i) * W * 1.2 - scroll * .08 % (W * 1.2) + W * 1.2) % (W * 1.2), y = GROUND - ((t * (24 + hash(i + 9) * 40) + hash(i + 3) * GROUND) % GROUND), r = 1.5 + hash(i + 5) * 2.5; g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke(); }
    rowOf(120, 1, (x, b) => { if (hash(b) < .35) return; const h = 18 + hash(b + 1) * 34, c = hash(b + 2) < .5 ? '#2f9e6e' : '#3fbf7f'; g.strokeStyle = c; g.lineWidth = 3; g.beginPath(); g.moveTo(x, GROUND); for (let s = 1; s <= 6; s++) g.lineTo(x + Math.sin(t * 2 + b + s * .8) * 4, GROUND - h * s / 6); g.stroke(); });
  },
  // tundra: mountains with snow caps, falling snow
  () => {
    const mtn = (par, col, cap, sp, hh) => rowOf(sp, par, (x, b) => { const h = hh * (.6 + hash(b) * .5), w = sp * .8; g.fillStyle = col; g.beginPath(); g.moveTo(x - w / 2, GROUND); g.lineTo(x, GROUND - h); g.lineTo(x + w / 2, GROUND); g.fill(); g.fillStyle = cap; g.beginPath(); g.moveTo(x - w * .13, GROUND - h * .74); g.lineTo(x, GROUND - h); g.lineTo(x + w * .13, GROUND - h * .74); g.lineTo(x + w * .05, GROUND - h * .78); g.lineTo(x - w * .03, GROUND - h * .72); g.fill(); });
    mtn(.06, '#b3c7da', '#f4f8fc', 240, 150); mtn(.16, '#cfdcea', '#ffffff', 170, 90);
    g.fillStyle = 'rgba(255,255,255,.9)'; for (let i = 0; i < 70; i++) { const x = ((hash(i) * W - t * 30 - scroll * .3) % W + W) % W, y = (hash(i + 4) * H + t * (30 + hash(i + 8) * 40)) % GROUND, s = hash(i + 2) < .3 ? 3 : 2; g.fillRect(x, y, s, s); }
  },
  // neon city: striped sun, two rows of buildings with lit windows, grid floor
  () => {
    const sx = 600, sy = GROUND - 60; const sg = g.createLinearGradient(0, sy - 70, 0, sy + 70); sg.addColorStop(0, '#ffd23f'); sg.addColorStop(1, '#ff3d9a'); g.fillStyle = sg; g.save(); g.beginPath(); g.arc(sx, sy, 70, 0, 7); g.clip(); g.fillRect(sx - 70, sy - 70, 140, 140); g.fillStyle = '#2a0e40'; for (let i = 0; i < 6; i++) g.fillRect(sx - 70, sy + 4 + i * 11, 140, 2 + i); g.restore();
    const city = (par, col, sp, hh, lit) => rowOf(sp, par, (x, b) => { const h = hh * (.45 + hash(b) * .7), w = sp * (.7 + hash(b + 3) * .25); g.fillStyle = col; g.fillRect(x, GROUND - h, w, h); for (let wy = GROUND - h + 8; wy < GROUND - 10; wy += 12) for (let wx = x + 6; wx < x + w - 8; wx += 10) if (hash(b * 31 + wx * 7 + wy) < lit) { g.fillStyle = hash(wx + wy) < .5 ? '#ffd8f3' : '#7ef0ff'; g.fillRect(wx, wy, 4, 5); } });
    city(.12, '#1f1236', 70, 150, .25); city(.3, '#2b1748', 95, 95, .35);
  },
  // mars: two moons, mesas, blowing dust
  () => {
    g.fillStyle = '#f0c9a8'; g.beginPath(); g.arc(150, 54, 11, 0, 7); g.fill(); g.fillStyle = '#d9a383'; g.beginPath(); g.arc(560, 38, 6, 0, 7); g.fill();
    const mesa = (par, col, sp, hh) => rowOf(sp, par, (x, b) => { if (hash(b) < .3) return; const h = hh * (.5 + hash(b + 1) * .6), w = sp * (.5 + hash(b + 2) * .4); g.fillStyle = col; g.beginPath(); g.moveTo(x, GROUND); g.lineTo(x + w * .18, GROUND - h); g.lineTo(x + w * .82, GROUND - h); g.lineTo(x + w, GROUND); g.fill(); });
    mesa(.07, '#8c3520', 220, 90); mesa(.2, '#6d2817', 160, 55);
    g.fillStyle = 'rgba(255,190,140,.5)'; for (let i = 0; i < 50; i++) { const x = ((hash(i) * W * 1.5 - t * 160 - scroll * .5) % (W * 1.5) + W * 1.5) % (W * 1.5), y = GROUND - hash(i + 3) * GROUND * .9; g.fillRect(x, y, 3 + hash(i + 1) * 5, 1.5); }
  },
  // moon base: twinkling stars, the earth, grey hills
  () => {
    for (let i = 0; i < 90; i++) { const x = ((hash(i) * W - scroll * .02) % W + W) % W, y = hash(i + 7) * (GROUND - 30), a = .4 + .6 * Math.abs(Math.sin(t * (1 + hash(i)) + i)); g.fillStyle = `rgba(255,255,255,${a})`; g.fillRect(x, y, hash(i + 2) < .15 ? 2 : 1, hash(i + 2) < .15 ? 2 : 1); }
    g.save(); g.beginPath(); g.arc(640, 74, 32, 0, 7); g.clip(); g.fillStyle = '#2f6fe0'; g.fillRect(600, 40, 80, 70); g.fillStyle = '#4bbf6a'; g.beginPath(); g.ellipse(628, 64, 14, 9, .5, 0, 7); g.fill(); g.beginPath(); g.ellipse(652, 88, 10, 7, -.3, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,.6)'; g.fillRect(612, 54, 22, 3); g.fillStyle = 'rgba(0,0,10,.55)'; g.beginPath(); g.arc(662, 80, 34, 0, 7); g.fill(); g.restore();
    hills(.15, '#2a2e38', 26, 18, 120, 47); hills(.32, '#353a46', 10, 9, 70, 29);
  }];
// ground details that scroll with the floor
function floorDetail(i) {
  if (i === 1) { g.fillStyle = 'rgba(255,255,255,.25)'; rowOf(90, 1, (x, b) => { if (hash(b) < .5) return; g.beginPath(); g.ellipse(x, GROUND + 12 + hash(b + 1) * 12, 5, 3, 0, 0, 7); g.fill(); }); }
  if (i === 3) { g.strokeStyle = 'rgba(255,79,216,.35)'; g.lineWidth = 1; for (let k = 1; k < 6; k++) { const y = GROUND + k * k * 1.6; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); } rowOf(60, 1, x => { g.beginPath(); g.moveTo(x, GROUND); g.lineTo(x + (x - W / 2) * .5, H); g.stroke(); }); }
  if (i === 5) { g.fillStyle = 'rgba(0,0,0,.28)'; rowOf(140, 1, (x, b) => { if (hash(b) < .4) return; g.beginPath(); g.ellipse(x, GROUND + 14, 14 + hash(b + 2) * 12, 4, 0, 0, 7); g.fill(); }); }
}

// ---------- draw: obstacles ----------
function cactus(x, p, col) {
  const y = GROUND - p.h, c = p.w, s = Math.max(3, Math.round(c / 5));
  g.fillStyle = col; g.fillRect(x + c * .3, y, c * .4, p.h);
  g.fillRect(x, y + p.h * .3, s, p.h * .35); g.fillRect(x, y + p.h * .6, c * .35, s);
  g.fillRect(x + c - s, y + p.h * .2, s, p.h * .3); g.fillRect(x + c * .65, y + p.h * .47, c * .35, s);
  g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x + c * .58, y + 3, 2, p.h - 6);
}
function ground(x, p, o) {
  const y = GROUND - p.h, c = p.w, h = p.h;
  switch (o.b) {
    case 0: return cactus(x, p, '#3f7d4f');
    case 1: { // coral
      const col = ['#ff7e8a', '#ffa94d', '#c77dff'][(o.seed * 3) | 0]; g.fillStyle = col;
      g.fillRect(x + c * .32, y + 4, c * .36, h - 4); g.fillRect(x, y + h * .3, c * .26, h * .45); g.fillRect(x + c * .74, y + h * .18, c * .26, h * .4);
      g.fillRect(x, y + h * .68, c * .5, c * .22); g.fillRect(x + c * .5, y + h * .55, c * .5, c * .22);
      for (const [cx, cy] of [[x + c * .5, y + 4], [x + c * .13, y + h * .3], [x + c * .87, y + h * .18]]) { g.beginPath(); g.arc(cx, cy, c * .2, 0, 7); g.fill(); }
      g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x + c * .4, y + 8, 2, h * .6); return;
    }
    case 2: { // ice spike
      g.fillStyle = '#9fd6f2'; g.beginPath(); g.moveTo(x, GROUND); g.lineTo(x + c * .5, y); g.lineTo(x + c, GROUND); g.fill();
      g.fillStyle = '#e8f7ff'; g.beginPath(); g.moveTo(x + c * .2, GROUND); g.lineTo(x + c * .5, y); g.lineTo(x + c * .5, GROUND); g.fill();
      g.strokeStyle = '#4f9fcf'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, GROUND); g.lineTo(x + c * .5, y); g.lineTo(x + c, GROUND); g.stroke(); return;
    }
    case 3: { // traffic cone or road block, with a glow
      g.save(); g.shadowColor = '#ff7a1a'; g.shadowBlur = 10;
      if (c < 20) { g.fillStyle = '#ff7a1a'; g.beginPath(); g.moveTo(x - 2, GROUND); g.lineTo(x + c * .38, y); g.lineTo(x + c * .62, y); g.lineTo(x + c + 2, GROUND); g.fill(); g.shadowBlur = 0; g.fillStyle = '#fff'; g.fillRect(x + c * .2, y + h * .4, c * .6, 3); g.fillRect(x + c * .1, y + h * .7, c * .8, 3); }
      else { g.fillStyle = '#ffd23f'; g.fillRect(x, y, c, h * .42); g.shadowBlur = 0; g.fillStyle = '#222'; for (let k = -1; k < 4; k++) { g.beginPath(); g.moveTo(x + k * 9, y + h * .42); g.lineTo(x + k * 9 + 6, y); g.lineTo(x + k * 9 + 10, y); g.lineTo(x + k * 9 + 4, y + h * .42); g.fill(); } g.fillStyle = '#9aa0ad'; g.fillRect(x + 3, y + h * .42, 3, h * .58); g.fillRect(x + c - 6, y + h * .42, 3, h * .58); g.fillStyle = Math.floor(t * 4) % 2 ? '#ff4d4d' : '#ffb3b3'; g.fillRect(x + c / 2 - 3, y - 5, 6, 5); }
      g.restore(); return;
    }
    case 4: { // red rock
      const s = o.seed * 10 + p.dx; g.fillStyle = '#a8462a'; g.beginPath(); g.moveTo(x, GROUND); g.lineTo(x + c * (.05 + hash(s) * .15), y + h * .3); g.lineTo(x + c * (.35 + hash(s + 1) * .2), y); g.lineTo(x + c * (.75 + hash(s + 2) * .15), y + h * .2); g.lineTo(x + c, GROUND); g.fill();
      g.fillStyle = '#6e2614'; g.beginPath(); g.moveTo(x + c * .55, GROUND); g.lineTo(x + c * (.75 + hash(s + 2) * .15), y + h * .2); g.lineTo(x + c, GROUND); g.fill();
      g.fillStyle = 'rgba(255,200,160,.35)'; g.fillRect(x + c * .25, y + h * .35, 3, 3); return;
    }
    case 5: { // crystal shards
      g.save(); g.shadowColor = '#b48cff'; g.shadowBlur = 12;
      const shard = (bx, bw, bh, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(bx, GROUND); g.lineTo(bx + bw * .2, GROUND - bh * .8); g.lineTo(bx + bw * .5, GROUND - bh); g.lineTo(bx + bw * .8, GROUND - bh * .8); g.lineTo(bx + bw, GROUND); g.fill(); };
      shard(x, c, h, '#8b5cf6'); g.shadowBlur = 0; shard(x + c * .2, c * .4, h * .9, '#c4a8ff'); g.restore(); return;
    }
  }
}
const FISH_A = ['....GGGGGG......', '..GGGBBBGGGG..GG', '.GKWGBBBGGGGGGG.', '.GGGGGGGGGGGGGG.', '..GGGGGGGGGG..GG', '....GGGGGG......'];
const FISH_B = ['....GGGGGG......', '..GGGBBBGGGG....', '.GKWGBBBGGGGGGGG', '.GGGGGGGGGGGGGGG', '..GGGGGGGGGG....', '....GGGGGG......'];
const BIRD_A = ['.......GG.......', '......GGGG......', '.KGGGGGGGGGGG...', 'SSGGGGGGGGGGGGG.', '...........GG...', '................'];
const BIRD_B = ['................', '..KGGGGGGGGGG...', 'SSGGGGGGGGGGGGG.', '......GGGG......', '.......GG.......', '................'];
const UFO_A = ['......BBBB......', '.....BWWWWB.....', '..GGGGGGGGGGGG..', 'GGRGGRGGGGRGGRGG', '..GGGGGGGGGGGG..', '....K......K....'];
const UFO_B = UFO_A.map(r => r.replace(/R/g, 'W'));
function flyer(o) {
  const x = o.x, y = GROUND - o.y - o.h, f = Math.floor(t * 8) % 2;
  switch (o.b) {
    case 1: return g.drawImage(sprite(f ? FISH_A : FISH_B, o.seed < .5 ? '#ffb347' : '#ffd23f', false), x, y);
    case 2: return g.drawImage(sprite(f ? BIRD_A : BIRD_B, '#f2f5f8', false), x, y);
    case 3: { g.drawImage(sprite(Math.floor(t * 14) % 2 ? DRONE_A : DRONE_B, '#333', true), x, y); g.fillStyle = 'rgba(126,240,255,.5)'; g.fillRect(x + 6, y + o.h + 2, o.w - 12, 2); return; }
    case 4: { // meteor with a fire trail
      const cx = x + 14, cy = y + 9, tr = g.createLinearGradient(cx, 0, cx + 70, 0); tr.addColorStop(0, 'rgba(255,190,90,.9)'); tr.addColorStop(1, 'rgba(255,90,40,0)');
      g.fillStyle = tr; g.beginPath(); g.moveTo(cx, cy - 9); g.lineTo(cx + 70 + Math.sin(t * 30) * 6, cy); g.lineTo(cx, cy + 9); g.fill();
      g.fillStyle = '#5a2a1a'; g.beginPath(); g.arc(cx, cy, 10, 0, 7); g.fill(); g.fillStyle = '#ffb35a'; g.beginPath(); g.arc(cx - 3, cy - 3, 3, 0, 7); g.fill(); return;
    }
    case 5: return g.drawImage(sprite(Math.floor(t * 6) % 2 ? UFO_A : UFO_B, '#9aa3b5', false), x, y);
    default: return g.drawImage(sprite(Math.floor(t * 14) % 2 ? DRONE_A : DRONE_B, '#333', false), x, y);
  }
}

// ---------- draw ----------
function draw() {
  const A = ZONES[zFrom], B = ZONES[zTo], u = zBlend < 1 ? zBlend * zBlend * (3 - 2 * zBlend) : 1;
  const P = k => mix(A[k], B[k], u), N = A.dark + (B.dark - A.dark) * u;
  const ink = P('ink'), dim = P('dim'), acc = P('acc');
  document.body.classList.toggle('night', N > .5); document.documentElement.classList.toggle('night', N > .5);
  const sky = g.createLinearGradient(0, 0, 0, GROUND); sky.addColorStop(0, P('skyA')); sky.addColorStop(1, P('skyB')); g.fillStyle = sky; g.fillRect(0, 0, W, GROUND);
  if (u < 1) { g.globalAlpha = 1 - u; BG[zFrom](); }
  g.globalAlpha = u; BG[zTo](); g.globalAlpha = 1;
  // ground
  g.fillStyle = P('fill'); g.fillRect(0, GROUND, W, H - GROUND + 800);
  if (u < 1) { g.globalAlpha = 1 - u; floorDetail(zFrom); } g.globalAlpha = u; floorDetail(zTo); g.globalAlpha = 1;
  if (B.name === 'NEON CITY' && u > .5) { g.save(); g.shadowColor = '#ff4fd8'; g.shadowBlur = 12; g.fillStyle = P('ground'); g.fillRect(0, GROUND, W, 2); g.restore(); }
  else { g.fillStyle = P('ground'); g.fillRect(0, GROUND, W, 2); }
  g.fillStyle = P('peb'); for (const p of pebbles) g.fillRect(p.x, p.y, p.w, 1);
  // obstacles
  for (const o of obs) { if (o.k === 'cactus') for (const p of o.parts) ground(o.x + p.dx, p, o); else flyer(o); }
  // ghosts: placed by how far ahead or behind they are
  live = ghostList();
  const ref = state === 'menu' ? (top[0] ? top[0][1] : 0) : score;
  const edge = [];
  let gi = 0; const tags = [];
  for (const [id, name, s, y, duck, alive, col] of live) {
    if (id === myId) continue; gi++;
    const diff = s - ref, gx = DINO_X + (diff >= 0 ? Math.log1p(diff) * 80 : -Math.log1p(-diff) * 26);
    if (gx < -50 || gx > W - 60) { edge.push({ name, s, col, right: gx > 0 }); continue; }
    const fr = !alive ? DEAD : duck && y <= 0 ? (Math.floor(t * 10) % 2 ? DUCK_A : DUCK_B) : y > 0 ? RUN_A : (Math.floor(t * 12) % 2 ? RUN_B : RUN_C);
    const spr = sprite(fr, col, N > .5); g.globalAlpha = alive ? (N > .5 ? .6 : .42) : .2; g.drawImage(spr, gx, GROUND - y - spr.height); g.globalAlpha = 1;
    g.font = '10px ui-monospace,monospace'; const lw = g.measureText(name).width, cx = gx + 27; let ly = GROUND - y - spr.height - 5;
    for (let k = 0; k < 8 && tags.some(r => Math.abs(r.x - cx) < (r.w + lw) / 2 + 4 && Math.abs(r.y - ly) < 11); k++) ly -= 11;
    tags.push({ x: cx, y: ly, w: lw }); g.textAlign = 'center'; g.fillStyle = col; g.fillText(name, cx, ly); g.textAlign = 'left';
  }
  let ey = { true: 74, false: 86 };
  g.font = '11px ui-monospace,monospace';
  for (const e of edge.slice(0, 6)) { const txt = e.right ? `${e.name} +${e.s - ref} ▶` : `◀ ${e.name} ${e.s - ref}`; const w = g.measureText(txt).width + 10; const x = e.right ? W - w - 6 : 6; g.fillStyle = N > .5 ? 'rgba(20,22,30,.8)' : 'rgba(255,255,255,.85)'; g.fillRect(x, ey[e.right] - 11, w, 15); g.fillStyle = e.col; g.fillText(txt, x + 5, ey[e.right]); ey[e.right] += 18; }
  // me
  if (state !== 'menu') {
    const fr = state === 'dead' ? DEAD : dino.duck && dino.y <= 0 ? (Math.floor(dino.frame) % 2 ? DUCK_A : DUCK_B) : dino.y > 0 ? RUN_A : (Math.floor(dino.frame) % 2 ? RUN_B : RUN_C);
    const spr = sprite(fr, myColor, N > .5); g.drawImage(spr, DINO_X, GROUND - dino.y - spr.height);
    if (zTo === 5 && u > .5) { g.strokeStyle = 'rgba(200,230,255,.55)'; g.lineWidth = 1.5; g.beginPath(); g.arc(DINO_X + 41, GROUND - dino.y - 42, 15, 0, 7); g.stroke(); }
  }
  hud(ink, dim, acc, N, ref);
}
function hud(ink, dim, acc, N, ref) {
  const z = zoneOf(state === 'menu' ? ref : score), Z = ZONES[z.i];
  // zone chip, progress to the next zone
  g.textAlign = 'left'; g.font = 'bold 13px ui-monospace,monospace';
  const label = `${Z.icon} ${Z.name}`; const lw = g.measureText(label).width;
  g.fillStyle = N > .5 ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.05)'; g.fillRect(10, 8, Math.max(170, lw + 70), state === 'menu' ? 24 : 58);
  g.fillStyle = ink; g.fillText(label, 18, 25);
  g.font = '10px ui-monospace,monospace'; g.fillStyle = dim; g.fillText(`${z.i + 1}/${ZONES.length}${z.lap ? ' · lap ' + (z.lap + 1) : ''}`, 26 + lw, 25);
  if (state !== 'menu') {
    g.fillStyle = N > .5 ? 'rgba(255,255,255,.14)' : 'rgba(0,0,0,.1)'; g.fillRect(18, 32, 150, 4); g.fillStyle = acc; g.fillRect(18, 32, 150 * z.frac, 4);
    g.fillStyle = dim; g.fillText(`next ${z.next.icon} ${z.next.name} in ${z.left}`, 18, 50);
    if (liveRun > 1 && liveRank && state === 'run') { g.fillStyle = acc; g.font = 'bold 10px ui-monospace,monospace'; g.fillText(`LIVE #${liveRank} of ${liveRun}`, 18, 62); }
  }
  // score, best, speed
  g.font = '16px ui-monospace,monospace'; g.textAlign = 'right';
  const show = state === 'menu' ? best : score;
  g.fillStyle = dim; g.fillText(`HI ${String(best).padStart(5, '0')}`, W - 120, 30);
  g.globalAlpha = flash > 0 && Math.floor(flash * 8) % 2 ? .25 : 1; g.fillStyle = ink; g.fillText(String(show).padStart(5, '0'), W - 40, 30); g.globalAlpha = 1;
  if (state === 'run') {
    const mult = speed / RUN.v0, seg = 8, on = Math.round((speed - RUN.v0) / (RUN.vmax - RUN.v0) * seg);
    for (let i = 0; i < seg; i++) { g.fillStyle = i < on ? (i >= 6 ? '#ff5a5a' : acc) : (N > .5 ? 'rgba(255,255,255,.15)' : 'rgba(0,0,0,.12)'); g.fillRect(W - 40 - (seg - i) * 9, 40, 7, 8); }
    g.font = 'bold 11px ui-monospace,monospace'; g.fillStyle = on >= 7 ? '#ff5a5a' : dim; g.fillText(`×${mult.toFixed(1)}`, W - 40 - seg * 9 - 6, 48);
  }
  g.textAlign = 'left'; flash = Math.max(0, flash - 1 / 60);
  // zone banner
  if (banner) {
    const a = t - banner.t0; if (a > 2.6) banner = null; else {
      const al = Math.min(1, a / .25, (2.6 - a) / .5), Zb = ZONES[banner.i], cy = Math.min(GROUND - 70, H * .38);
      g.globalAlpha = al; g.textAlign = 'center';
      g.fillStyle = N > .5 ? 'rgba(0,0,0,.35)' : 'rgba(255,255,255,.55)'; g.fillRect(0, cy - 36, W, 58);
      g.fillStyle = Zb.acc; g.fillRect(0, cy - 36, W, 2); g.fillRect(0, cy + 20, W, 2);
      g.font = 'bold 30px ui-monospace,monospace'; g.fillStyle = ink; g.fillText(`${Zb.icon} ${Zb.name}`, W / 2 + (1 - Math.min(1, a / .3)) * 60, cy);
      g.font = '11px ui-monospace,monospace'; g.fillStyle = dim; g.fillText(`zone ${banner.i + 1} · speed ×${(speed / RUN.v0).toFixed(1)}`, W / 2, cy + 12);
      g.textAlign = 'left'; g.globalAlpha = 1;
    }
  }
}
function mix(a, b, u) { if (u <= 0) return a; if (u >= 1) return b; const p = s => s.startsWith('rgba') ? s.match(/[\d.]+/g).map(Number) : [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16), 1]; const A = p(a), B = p(b); const c = A.map((v, i) => v + (B[i] - v) * u); return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${c[3]})`; }

// ---------- loop ----------
let last = performance.now(), acc = 0;
function frame(nowMs) {
  acc += Math.min(.1, (nowMs - last) / 1000); last = nowMs;
  while (acc >= 1 / 120) { step(1 / 120); acc -= 1 / 120; }
  if (state === 'menu') setZone(zoneOf(top[0] ? top[0][1] : 0).i, false);
  draw(); requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
renderLive(); renderLb();
window.__dr = { get state() { return state; }, get score() { return score; }, get speed() { return speed; }, warp(sc, rt) { dist = sc / RUN.perPx; runT = rt; }, start, dino, obs: () => obs };
