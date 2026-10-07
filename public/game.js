// Dinorunner client: endless runner, live ghosts of other players, leaderboard.
import { RUN, speedAt, COLORS } from './rules.js?v=4';

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
const sfx = { jump: () => tone('square', 380, 760, .09, .06), point: () => { tone('square', 990, 990, .07, .05); tone('square', 1320, 1320, .12, .05, .08); }, die: () => { tone('sawtooth', 300, 60, .45, .1); tone('square', 120, 50, .3, .08); }, best: () => [660, 880, 1100, 1320].forEach((f, i) => tone('triangle', f, f, .15, .07, i * .07)) };
function setMute(v) { muted = v; store.set('dr_mute', v ? '1' : '0'); $('mute').textContent = v ? '🔇' : '🔊'; }
setMute(muted); $('mute').onclick = e => { e.stopPropagation(); audio(); setMute(!muted); };

// ---------- net ----------
let ws, myId = 0, myColor = COLORS[0], live = [], lb = { all: [], today: [] }, lbTab = 'today';
const tok = store.get('dr_tok') || Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 8); store.set('dr_tok', tok);
$('name').value = store.get('dr_name') || '';
function connect() {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.onopen = () => { if (myName) send({ t: 'name', name: myName, tok }); };
  ws.onmessage = e => { const m = JSON.parse(e.data);
    if (m.t === 'hi') { myId = m.id; myColor = m.color; }
    else if (m.t === 'live') { live = m.ps; $('online').textContent = m.online; renderLive(); }
    else if (m.t === 'lb') { lb = m; renderLb(); } };
  ws.onclose = () => setTimeout(connect, 2000);
}
const send = o => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };
let myName = store.get('dr_name') || '';
connect();
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
function renderLive() {
  const ol = $('live'); if (!live.length) { ol.innerHTML = '<div class="empty">nobody is running right now</div>'; return; }
  ol.innerHTML = live.slice(0, 8).map(([id, n, s, , , alive, col], i) => `<li class="${id === myId ? 'me' : ''} ${alive ? '' : 'dead'}"><span class="n">${i + 1}</span><span class="d" style="background:${col}"></span><span class="nm">${esc(n)}${id === myId ? ' (you)' : ''}</span><span class="s">${s}</span></li>`).join('');
}
function renderLb() {
  const list = lb[lbTab] || [], ol = $('lb');
  if (!list.length) { ol.innerHTML = `<div class="empty">no scores ${lbTab === 'today' ? 'today' : 'yet'}. be the first</div>`; return; }
  ol.innerHTML = list.map(([n, s, col], i) => `<li class="${n === myName ? 'me' : ''}"><span class="n">${['🥇', '🥈', '🥉'][i] || i + 1}</span><span class="d" style="background:${col}"></span><span class="nm">${esc(n)}</span><span class="s">${s}</span></li>`).join('');
}
document.querySelectorAll('.tabs span').forEach(s => s.onclick = () => { lbTab = s.dataset.b; document.querySelectorAll('.tabs span').forEach(x => x.classList.toggle('on', x === s)); renderLb(); });

// ---------- game state ----------
let state = 'menu'; // menu | run | dead
let t = 0, runT = 0, dist = 0, score = 0, best = +(store.get('dr_best') || 0), speed = RUN.v0;
const dino = { y: 0, vy: 0, duck: false, held: false, frame: 0 };
let obs = [], nextGap = 600, clouds = [], pebbles = [], night = 0, flash = 0, sendT = 0, lastHundred = 0, newBest = false;
for (let i = 0; i < 4; i++) clouds.push({ x: Math.random() * W, y: 30 + Math.random() * 70 });
for (let i = 0; i < 40; i++) pebbles.push({ x: Math.random() * W, y: GROUND + 4 + Math.random() * 14, w: 1 + (Math.random() * 3 | 0) });
const stars = [...Array(40)].map(() => ({ x: Math.random() * W, y: Math.random() * 150, r: Math.random() < .2 ? 2 : 1 }));
fit(); addEventListener('resize', fit);

function start() {
  audio(); myName = $('name').value.trim().slice(0, 14) || myName || 'dino' + Math.floor(Math.random() * 900 + 100);
  store.set('dr_name', myName); send({ t: 'name', name: myName, tok }); send({ t: 'go' });
  state = 'run'; runT = 0; dist = 0; score = 0; speed = RUN.v0; obs = []; nextGap = 520; lastHundred = 0; newBest = false;
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
function jumpPress() { if (state !== 'run') return; dino.held = true; if (dino.y <= 0 && !dino.duck) { dino.vy = 780; sfx.jump(); } }
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

// ---------- world ----------
function spawn() {
  const big = score > 150 && Math.random() < .35;
  if (score > 250 && Math.random() < .28) {
    const lvl = [14, 38, 70][(Math.random() * 3) | 0]; // bottom of drone above ground: jump / duck / run under
    obs.push({ k: 'drone', x: W + 20, w: 48, h: 18, y: lvl }); return;
  }
  const n = big ? 1 + (Math.random() * 2 | 0) : 1 + (Math.random() * 3 | 0), h = big ? 48 + Math.random() * 12 : 32 + Math.random() * 10;
  const parts = []; let x = 0; for (let i = 0; i < n; i++) { const w = big ? 22 : 15; parts.push({ dx: x, w, h: h - (i % 2) * 6 }); x += w + 2; }
  obs.push({ k: 'cactus', x: W + 20, w: x - 2, h, parts, y: 0 });
}
function hitboxes() {
  const y = GROUND - dino.y;
  if (dino.duck && dino.y <= 0) return [[DINO_X + 6, y - 24, 66, 20]];
  return [[DINO_X + 30, y - 51, 24, 18], [DINO_X + 10, y - 33, 30, 24], [DINO_X + 12, y - 12, 20, 12]];
}
const overlap = (a, b) => a[0] < b[0] + b[2] && a[0] + a[2] > b[0] && a[1] < b[1] + b[3] && a[1] + a[3] > b[1];
function step(dt) {
  t += dt;
  if (state !== 'run') return;
  runT += dt; speed = speedAt(runT); const dx = speed * dt; dist += dx; score = Math.floor(dist * RUN.perPx);
  if (Math.floor(score / 100) > lastHundred) { lastHundred = Math.floor(score / 100); sfx.point(); flash = 1; }
  night = Math.floor(score / 700) % 2 === 1 ? Math.min(1, night + dt) : Math.max(0, night - dt);
  // dino physics (y is height above ground)
  let grav = 2600; if (dino.held && dino.vy > 0) grav *= .55; if (dino.duck && dino.y > 0) grav *= 3;
  dino.vy -= grav * dt; dino.y += dino.vy * dt; if (dino.y <= 0) { dino.y = 0; dino.vy = 0; }
  dino.frame += dx * .045;
  // obstacles
  nextGap -= dx; if (nextGap <= 0) { spawn(); const min = 260 + speed * .5; nextGap = min * (1 + Math.random() * .9); }
  for (const o of obs) o.x -= dx * (o.k === 'drone' ? 1.08 : 1);
  obs = obs.filter(o => o.x + o.w > -20);
  for (const c of clouds) { c.x -= dx * .15; if (c.x < -60) { c.x = W + Math.random() * 200; c.y = 30 + Math.random() * 70; } }
  for (const p of pebbles) { p.x -= dx; if (p.x < 0) p.x += W; }
  const hb = hitboxes();
  for (const o of obs) {
    const r = o.k === 'drone' ? [o.x + 4, GROUND - o.y - o.h, o.w - 8, o.h - 4] : null;
    if (r && hb.some(b => overlap(b, r))) return die();
    if (o.k === 'cactus') for (const p of o.parts) { const pr = [o.x + p.dx + 3, GROUND - p.h + 3, p.w - 6, p.h - 3]; if (hb.some(b => overlap(b, pr))) return die(); }
  }
  sendT += dt; if (sendT > .1) { sendT = 0; send({ t: 'p', s: score, y: Math.round(dino.y), d: dino.duck ? 1 : 0 }); }
}

// ---------- draw ----------
function cactus(x, p, col) {
  const y = GROUND - p.h, c = p.w, s = Math.max(3, Math.round(c / 5));
  g.fillStyle = col; g.fillRect(x + c * .3, y, c * .4, p.h);
  g.fillRect(x, y + p.h * .3, s, p.h * .35); g.fillRect(x, y + p.h * .6, c * .35, s);
  g.fillRect(x + c - s, y + p.h * .2, s, p.h * .3); g.fillRect(x + c * .65, y + p.h * .47, c * .35, s);
  g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x + c * .58, y + 3, 2, p.h - 6);
}
function draw() {
  const N = night, sky = mix('#fbfaf6', '#15171c', N), ink = mix('#535353', '#d8d5ce', N), ground = mix('#9a958a', '#5b5f68', N);
  document.body.classList.toggle('night', N > .5);
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  if (N > 0) { g.globalAlpha = N; g.fillStyle = '#e8e4d8'; for (const s of stars) g.fillRect((s.x - t * 4 + W * 10) % W, s.y, s.r, s.r); g.beginPath(); g.arc(640, 60, 16, 0, 7); g.fill(); g.fillStyle = sky; g.beginPath(); g.arc(648, 55, 14, 0, 7); g.fill(); g.globalAlpha = 1; }
  g.fillStyle = mix('#e4e0d6', '#2a2d34', N); for (const c of clouds) { g.fillRect(c.x, c.y, 46, 8); g.fillRect(c.x + 8, c.y - 6, 26, 6); g.fillRect(c.x + 14, c.y - 10, 12, 4); }
  // ground
  g.fillStyle = ground; g.fillRect(0, GROUND, W, 2); for (const p of pebbles) g.fillRect(p.x, p.y, p.w, 1);
  // obstacles
  for (const o of obs) {
    if (o.k === 'cactus') for (const p of o.parts) cactus(o.x + p.dx, p, mix('#3f7d4f', '#7fb98e', N));
    else { const spr = sprite(Math.floor(t * 14) % 2 ? DRONE_A : DRONE_B, '#333', N > .5); g.drawImage(spr, o.x, GROUND - o.y - o.h); }
  }
  // ghosts: placed by how far ahead or behind they are
  const ref = state === 'menu' ? (live[0] ? live[0][2] : 0) : score;
  const edge = [];
  let gi = 0; const tags = [];
  for (const [id, name, s, y, duck, alive, col] of live) {
    if (id === myId) continue; gi++;
    const diff = s - ref, gx = DINO_X + (diff >= 0 ? Math.log1p(diff) * 80 : -Math.log1p(-diff) * 26);
    if (gx < -50 || gx > W - 60) { edge.push({ name, s, col, right: gx > 0 }); continue; }
    const fr = !alive ? DEAD : duck && y <= 0 ? (Math.floor(t * 10) % 2 ? DUCK_A : DUCK_B) : y > 0 ? RUN_A : (Math.floor(t * 12) % 2 ? RUN_B : RUN_C);
    const spr = sprite(fr, col, N > .5); g.globalAlpha = alive ? .38 : .2; g.drawImage(spr, gx, GROUND - y - spr.height); g.globalAlpha = 1;
    // name tags: push up until they stop overlapping each other
    g.font = '10px ui-monospace,monospace'; const lw = g.measureText(name).width, cx = gx + 27; let ly = GROUND - y - spr.height - 5;
    for (let k = 0; k < 8 && tags.some(r => Math.abs(r.x - cx) < (r.w + lw) / 2 + 4 && Math.abs(r.y - ly) < 11); k++) ly -= 11;
    tags.push({ x: cx, y: ly, w: lw }); g.textAlign = 'center'; g.fillStyle = col; g.fillText(name, cx, ly); g.textAlign = 'left';
  }
  // off-screen runners as edge tags
  let ey = { true: 52, false: 18 };
  g.font = '11px ui-monospace,monospace';
  for (const e of edge.slice(0, 6)) { const txt = e.right ? `${e.name} +${e.s - ref} ▶` : `◀ ${e.name} ${e.s - ref}`; const w = g.measureText(txt).width + 10; const x = e.right ? W - w - 6 : 6; g.fillStyle = mix('rgba(255,255,255,.85)', 'rgba(30,32,38,.85)', N); g.fillRect(x, ey[e.right] - 11, w, 15); g.fillStyle = e.col; g.fillText(txt, x + 5, ey[e.right]); ey[e.right] += 18; }
  // me
  if (state !== 'menu') {
    const fr = state === 'dead' ? DEAD : dino.duck && dino.y <= 0 ? (Math.floor(dino.frame) % 2 ? DUCK_A : DUCK_B) : dino.y > 0 ? RUN_A : (Math.floor(dino.frame) % 2 ? RUN_B : RUN_C);
    const spr = sprite(fr, myColor, N > .5); g.drawImage(spr, DINO_X, GROUND - dino.y - spr.height);
  }
  // score
  g.font = '16px ui-monospace,monospace'; g.textAlign = 'right';
  const show = state === 'menu' ? best : score;
  g.fillStyle = mix('#8f8b82', '#8a8780', N); g.fillText(`HI ${String(best).padStart(5, '0')}`, W - 120, 30);
  g.globalAlpha = flash > 0 && Math.floor(flash * 8) % 2 ? .25 : 1; g.fillStyle = ink; g.fillText(String(show).padStart(5, '0'), W - 40, 30); g.globalAlpha = 1; g.textAlign = 'left';
  flash = Math.max(0, flash - 1 / 60);
}
function mix(a, b, u) { if (u <= 0) return a; if (u >= 1) return b; const p = s => s.startsWith('rgba') ? s.match(/[\d.]+/g).map(Number) : [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16), 1]; const A = p(a), B = p(b); const c = A.map((v, i) => v + (B[i] - v) * u); return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${c[3]})`; }

// ---------- loop ----------
let last = performance.now(), acc = 0;
function frame(nowMs) {
  acc += Math.min(.1, (nowMs - last) / 1000); last = nowMs;
  while (acc >= 1 / 120) { step(1 / 120); acc -= 1 / 120; }
  draw(); requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
renderLive(); renderLb();
window.__dr = { get state() { return state; }, get score() { return score; }, start, dino, obs: () => obs };
