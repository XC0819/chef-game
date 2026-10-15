import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CONFIG } from './config.js';

const $ = id => document.getElementById(id);
const app = $('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
$('pot').after(renderer.domElement);   // 画布在锅图片之上、HUD 之下；画布背景透明
renderer.domElement.style.position = 'absolute'; renderer.domElement.style.left = renderer.domElement.style.top = '0';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 9 / 16, 0.1, 100);

let potDepth = 1.3, frames = 0;
let level = 0, R = 4, items = [], tray = [], shuffles = 2, state = 'loading';
const ELEV = 49 * Math.PI / 180;   // 镜头俯角，和锅贴图的透视（开口椭圆 4:3）大致吻合
function resize() {
  const w = app.clientWidth, h = app.clientHeight;
  renderer.setSize(w, h); camera.aspect = w / h;
  // 镜头距离：让「锅 + 把手」刚好占满宽度（世界半宽 ≈ R+1.5）
  const d = (R + 1.5) / (Math.tan(camera.fov * Math.PI / 360) * camera.aspect);
  camera.position.set(0, d * Math.sin(ELEV), d * Math.cos(ELEV)); camera.lookAt(0, 0, 0);
  // 把锅放在「订单区」和「小厨师/托盘区」之间的空白里
  const ar = app.getBoundingClientRect();
  const top = Math.max($('orders').getBoundingClientRect().bottom - ar.top, 0) + 4 || h * 0.3;
  const bot = $('props').getBoundingClientRect().top - ar.top + 30;
  camera.setViewOffset(w, h, 0, -((top + bot) / 2 - h / 2), w, h);
  camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
  layoutPot();
}
addEventListener('resize', resize);

// 锅贴图（DOM，放在画布后面）：让贴图里的「开口椭圆」对齐物理圆（半径 R）在屏幕上的投影
const POT_ART = { w: 512, h: 366, cx: 255, cy: 156, ax: 200, ay: 150 };   // pot.png 里开口椭圆的中心 / 半轴（像素）
function layoutPot() {
  const Rm = R + 0.2, y = 0.3, P = POT_ART;
  const l = screenOf(new THREE.Vector3(-Rm, y, 0)), r = screenOf(new THREE.Vector3(Rm, y, 0));
  const t = screenOf(new THREE.Vector3(0, y, -Rm)), b = screenOf(new THREE.Vector3(0, y, Rm));
  const cx = (l.x + r.x) / 2, cy = (t.y + b.y) / 2, sx = (r.x - l.x) / 2 / P.ax, sy = (b.y - t.y) / 2 / P.ay;
  Object.assign($('pot').style, { width: P.w * sx + 'px', height: P.h * sy + 'px', left: cx - P.cx * sx + 'px', top: cy - P.cy * sy + 'px' });
  document.querySelectorAll('.steam').forEach(e => { e.style.top = cy - (b.y - t.y) / 2 * 1.05 + 'px'; });
}

// ---------- 食材精灵（2D 贴图 + 球形碰撞体） ----------
const textures = {}; const thumbs = {}; const spriteMats = {};
const SPRITE = () => CONFIG.itemSize * CONFIG.spriteScale;
const texLoader = new THREE.TextureLoader();
const loadTex = url => new Promise(res => texLoader.load(url, t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; res(t); }, undefined, () => res(null)));
function makeShape(it) {
  const r = CONFIG.itemSize / 2 * (it.colliderScale ?? CONFIG.colliderScale);
  return () => new CANNON.Sphere(r);
}
const shapes = {};
let iceTex = null, iceCrackedTex = null, shadowTex = null;
function makeShadowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(60,30,10,.55)'); gr.addColorStop(1, 'rgba(60,30,10,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const shadowGeo = new THREE.PlaneGeometry(1.15, 1.15).rotateX(-Math.PI / 2);
async function loadAssets() {
  await Promise.all(CONFIG.items.map(async it => {
    textures[it.id] = await loadTex(it.image); thumbs[it.id] = it.image;
    spriteMats[it.id] = new THREE.SpriteMaterial({ map: textures[it.id], transparent: true, depthWrite: false });
    shapes[it.id] = makeShape(it);
  }));
  iceTex = await loadTex(CONFIG.art.ice); iceCrackedTex = await loadTex(CONFIG.art.iceCracked); shadowTex = makeShadowTex();
  // 预加载其它界面图片，避免第一次出现时闪一下
  const urls = [...CONFIG.dishes.map(d => d.image), ...CONFIG.customers, ...Object.values(CONFIG.art.chef), CONFIG.art.coin, CONFIG.art.pop, CONFIG.art.boom, CONFIG.art.orderCard, CONFIG.art.tray];
  await Promise.all(urls.map(u => new Promise(res => { const i = new Image(); i.onload = i.onerror = res; i.src = u; })));
}

// ---------- 物理世界 + 锅 ----------
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -20, 0) });
world.allowSleep = true;
const mat = new CANNON.Material(); world.defaultContactMaterial.friction = 0.4; world.defaultContactMaterial.restitution = 0.1;
let potBodies = [];
function buildPot(R) {   // 只建不可见的物理墙；外观由 art/ui/pot.png 负责
  potBodies.forEach(b => world.removeBody(b)); potBodies = [];
  const floor = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(R + 1, 0.5, R + 1)) });
  floor.position.set(0, -0.5, 0); world.addBody(floor); potBodies.push(floor);
  const N = 28;
  for (let i = 0; i < N; i++) {
    const a = i / N * Math.PI * 2;
    const w = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(0.2, 8, R * Math.PI / N + 0.1)) });
    w.position.set(Math.cos(a) * (R + 0.2), 7.5, Math.sin(a) * (R + 0.2));
    w.quaternion.setFromEuler(0, -a, 0); world.addBody(w); potBodies.push(w);
  }
}

// ---------- 游戏状态 ----------
let endTimer, L = null, orders = [], completed = 0, coins = 0, plate = null, orderSeq = 0, lastExplosion = null;
const itemDef = id => CONFIG.items.find(i => i.id === id);
const dishDef = id => CONFIG.dishes.find(d => d.id === id);
let spawnCount = 0;

function spawnItem(id, iced = false) {
  const mesh = new THREE.Group(); mesh.userData.id = id;
  const spr = new THREE.Sprite(spriteMats[id]); spr.scale.setScalar(SPRITE()); mesh.add(spr);
  const shadow = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthTest: false, depthWrite: false }));
  shadow.renderOrder = -1; shadow.position.y = 0.03; scene.add(shadow);
  const body = new CANNON.Body({ mass: 1, shape: shapes[id](), linearDamping: 0.3, angularDamping: 0.5 });
  body.allowSleep = true; body.sleepSpeedLimit = 0.15;
  const r = Math.sqrt(Math.random()) * (R - 0.9), a = Math.random() * Math.PI * 2;
  body.position.set(Math.cos(a) * r, 1.5 + (spawnCount++ % 60) * 0.22, Math.sin(a) * r);
  world.addBody(body); scene.add(mesh);
  const item = { id, mesh, body, shadow, ice: 0 }; mesh.userData.item = item; items.push(item);
  if (iced) { item.ice = CONFIG.ice.taps;
    // 冰块精灵略往镜头方向偏一点，保证画在食材前面；半透明，能隐约看到里面的食材
    item.iceMesh = new THREE.Sprite(new THREE.SpriteMaterial({ map: iceTex, transparent: true, opacity: 0.72, depthWrite: false }));
    item.iceMesh.scale.setScalar(CONFIG.itemSize * 1.25); item.iceMesh.position.set(0, 0.04, 0.03); mesh.add(item.iceMesh); }
  return item;
}
function disposeItem(it) { scene.remove(it.mesh); scene.remove(it.shadow); it.shadow.material.dispose(); if (it.iceMesh) it.iceMesh.material.dispose(); }
// 生成 n 组（每组 3 个）同一食材，按关卡比例随机冰冻
function spawnTriples(id, n = 1) {
  for (let k = 0; k < n * CONFIG.matchCount; k++) spawnItem(id, itemDef(id).special !== 'chili' && Math.random() < (L.ice || 0));
}
const ingredientIds = () => CONFIG.items.filter(i => !i.special).map(i => i.id);
function spawnFiller() { const ids = ingredientIds(); spawnTriples(ids[Math.floor(Math.random() * ids.length)]); }

function newOrder() {
  let pool = L.dishes.filter(id => !orders.some(o => o.dish.id === id)); if (!pool.length) pool = L.dishes;
  const d = dishDef(pool[Math.floor(Math.random() * pool.length)]);
  const o = { uid: ++orderSeq, dish: d, got: {}, fresh: true, cust: CONFIG.customers[Math.floor(Math.random() * CONFIG.customers.length)] };
  for (const [id, n] of Object.entries(d.needs)) { o.got[id] = 0; spawnTriples(id, n); }
  return o;
}

function startLevel(n, silent = false) {
  level = n; L = CONFIG.levels[Math.min(n, CONFIG.levels.length - 1)];
  R = L.potRadius; potDepth = L.potDepth ?? 1.3;
  items.forEach(it => { disposeItem(it); world.removeBody(it.body); }); items = []; tray = []; shuffles = 2;
  document.querySelectorAll('.flyer,.fx,.trayfx').forEach(f => f.remove());
  clearTimeout(endTimer); buildPot(R); spawnCount = 0;
  orders = []; completed = 0; plate = null; renderPlate();
  for (let i = 0; i < Math.min(L.maxOrders, L.goal); i++) orders.push(newOrder());
  for (let i = 0; i < L.fillers; i++) spawnFiller();
  for (let i = 0; i < L.chili; i++) spawnTriples('chili');
  state = 'play'; $('overlay').style.display = 'none'; $('title').style.display = 'none';
  renderTray(); renderOrders(); updateHud(); setMood('', 0, true); resize();
  if (!silent) toast(`第 ${n + 1} 关 · ${L.name}`);
}

function updateHud() {
  $('lvl').textContent = `第 ${level + 1} 关`; $('coins').textContent = coins;
  $('goal').textContent = `订单 ${completed}/${L.goal}`; $('shufN').textContent = shuffles;
}

// ---------- 订单 ----------
function renderOrders() {
  const box = $('orders'); box.innerHTML = '';
  for (const o of orders) {
    const c = document.createElement('div'); c.className = 'order' + (o.fresh ? ' fresh' : ''); o.fresh = false; c.title = o.dish.name;
    c.innerHTML = `<div class="card" style="background-image:url(${CONFIG.art.orderCard})"><img class="cust" src="${o.cust}" alt="">` +
      (o.dish.image ? `<img class="dish" src="${o.dish.image}" alt="${o.dish.name}" onerror="this.replaceWith('${o.dish.icon}')">` : o.dish.icon) +
      `<div class="reward"><img src="${CONFIG.art.coin}" alt="">${o.dish.coins}</div></div><div class="needs">` +
      Object.entries(o.dish.needs).map(([id, n]) => `<span class="need ${o.got[id] >= n ? 'ok' : ''}"><img src="${thumbs[id]}" alt="">${o.got[id] >= n ? '✓' : `${o.got[id]}/${n}`}</span>`).join('') + `</div>`;
    box.appendChild(c);
  }
}
function onCleared(id, pos) {
  if (itemDef(id).special === 'chili') explode(pos);
  const o = orders.find(o => o.dish.needs[id] && o.got[id] < o.dish.needs[id]);
  if (o) {
    o.got[id]++;
    if (Object.entries(o.dish.needs).every(([k, n]) => o.got[k] >= n)) {
      completed++; coins += o.dish.coins; celebrate(o);
      const i = orders.indexOf(o);
      if (completed + orders.length - 1 < L.goal) orders[i] = newOrder(); else orders.splice(i, 1);
      if (completed >= L.goal) { end(true); }
    }
  }
  renderOrders(); updateHud();
}
function celebrate(o) {
  setMood('cheer', 1500);
  toast(`${o.dish.name} 完成！ +${o.dish.coins} <img src="${CONFIG.art.coin}" alt="">`, true);
  for (let i = 0; i < 14; i++) {
    const f = document.createElement('img'); f.className = 'fx confetti'; f.src = i % 2 ? CONFIG.art.pop : CONFIG.art.coin; f.alt = '';
    f.style.left = 20 + Math.random() * 60 + '%'; f.style.top = '16%'; f.style.setProperty('--dx', (Math.random() - .5) * 200 + 'px');
    app.appendChild(f); setTimeout(() => f.remove(), 1200);
  }
}
function toast(t, html = false) { const el = $('toast'); el[html ? 'innerHTML' : 'textContent'] = t; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); }

// ---------- 辣椒爆炸 ----------
function explode(pos) {
  const c = pos || new THREE.Vector3(0, 0.5, 0); let hit = 0;
  for (const it of items) {
    const d = new THREE.Vector3().copy(it.body.position).sub(c); const dist = d.length();
    if (dist > CONFIG.chili.radius) continue; hit++;
    d.y = 0; d.normalize(); const f = CONFIG.chili.power * (1 - dist / CONFIG.chili.radius * 0.6);
    it.body.wakeUp(); it.body.velocity.set(d.x * f * 0.5, f, d.z * f * 0.5);
    it.body.angularVelocity.set(Math.random() * 10, Math.random() * 10, Math.random() * 10);
  }
  lastExplosion = { hit, at: performance.now() };
  const p = c.clone().project(camera), cr = renderer.domElement.getBoundingClientRect(), ar = app.getBoundingClientRect();
  const b = document.createElement('img'); b.className = 'fx boom'; b.src = CONFIG.art.boom; b.alt = '';
  b.style.left = (p.x + 1) / 2 * cr.width + cr.left - ar.left + 'px'; b.style.top = (1 - p.y) / 2 * cr.height + cr.top - ar.top + 'px';
  app.appendChild(b); setTimeout(() => b.remove(), 700);
  toast(`辣椒爆炸！炸开了 ${hit} 个食材`);
}

// ---------- 托盘（逻辑 tray + 视觉 vtray 分离，逻辑立即生效，动画只负责表现） ----------
let vtray = [], uidSeq = 0;
function buildTraySlots() {
  const el = $('tray'); el.innerHTML = '';
  el.style.backgroundImage = `url(${CONFIG.art.tray})`;
  // 托盘贴图里 7 个格子的位置（占 768 宽贴图的比例）：第 i 格 left = (19 + 106.2*i)/768
  for (let i = 0; i < CONFIG.traySlots; i++) { const s = document.createElement('div'); s.className = 'slot'; s.style.left = (19 + 106.2 * i) / 768 * 100 + '%'; el.appendChild(s); }
  vtray.forEach(v => v.el.remove()); vtray = [];
}
function slotRect(i) {
  const slots = $('tray').children; const s = slots[Math.max(0, Math.min(i, CONFIG.traySlots - 1))];
  return { left: s.offsetLeft, top: s.offsetTop, w: s.offsetWidth, h: s.offsetHeight };
}
function layoutTray() {
  vtray.forEach((v, i) => { const r = slotRect(i);
    Object.assign(v.el.style, { left: r.left + 'px', top: r.top + 'px', width: r.w + 'px', height: r.h + 'px' }); });
}
function renderTray() { buildTraySlots(); }
function visualInsert(id) {
  let idx = -1; vtray.forEach((v, i) => { if (v.id === id && !v.popping) idx = i; });
  idx = idx < 0 ? vtray.length : idx + 1;
  const el = new Image(); el.src = thumbs[id]; el.className = 'titem'; el.style.opacity = 0;
  $('tray').appendChild(el);
  const v = { uid: ++uidSeq, id, el }; vtray.splice(idx, 0, v);
  layoutTray(); return v;
}

// 把一个食材加入托盘：逻辑立即结算；from = 动画起点（app 内坐标）
function addToTray(id, from, worldPos) {
  let idx = tray.lastIndexOf(id); idx = idx < 0 ? tray.length : idx + 1;
  tray.splice(idx, 0, id);
  let matched = false;
  if (tray.filter(x => x === id).length >= CONFIG.matchCount) {
    let k = 0; tray = tray.filter(x => !(x === id && k++ < CONFIG.matchCount)); matched = true;
  }
  const v = visualInsert(id);
  const ar = app.getBoundingClientRect();
  const fly = new Image(); fly.src = thumbs[id]; fly.className = 'flyer';
  const sz = 64, sx = from.x - sz / 2, sy = from.y - sz / 2;
  Object.assign(fly.style, { left: sx + 'px', top: sy + 'px', width: sz + 'px', height: sz + 'px' });
  app.appendChild(fly);
  const t0 = performance.now(), D = 320;
  (function step(now) {
    const t = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - t, 3);
    const tr = $('tray').getBoundingClientRect(), r = slotRect(vtray.indexOf(v));   // 每帧追踪目标格
    const tx = tr.left - ar.left + r.left, ty = tr.top - ar.top + r.top;
    fly.style.left = sx + (tx - sx) * e + 'px'; fly.style.top = sy + (ty - sy) * e - Math.sin(t * Math.PI) * 60 + 'px';
    fly.style.width = fly.style.height = sz + (r.w - sz) * e + 'px';
    if (t < 1 && fly.isConnected) return requestAnimationFrame(step);
    fly.remove(); if (!vtray.includes(v)) return; v.el.style.opacity = 1;
    if (matched) {
      const group = vtray.filter(x => x.id === id && !x.popping).slice(0, CONFIG.matchCount);
      group.forEach(x => { x.popping = true; x.el.classList.add('pop');
        const fx = new Image(); fx.src = CONFIG.art.pop; fx.className = 'trayfx';
        Object.assign(fx.style, { left: x.el.offsetLeft - x.el.offsetWidth * .15 + 'px', top: x.el.offsetTop - x.el.offsetHeight * .1 + 'px', width: x.el.offsetWidth * 1.3 + 'px', height: x.el.offsetHeight * 1.2 + 'px' });
        $('tray').appendChild(fx); setTimeout(() => fx.remove(), 450); });
      setTimeout(() => { group.forEach(x => { x.el.remove(); vtray.splice(vtray.indexOf(x), 1); }); layoutTray(); }, 250);
    }
  })(t0);
  if (matched) onCleared(id, worldPos);
  updateHud(); setMood(restMood());
  if (state === 'play' && tray.length >= CONFIG.traySlots) end(false);
  if (state === 'play' && items.length < L.minPot) spawnFiller();
}

function clientOf(v3) { const s = screenOf(v3), ar = app.getBoundingClientRect(); return { x: s.x + ar.left, y: s.y + ar.top }; }
function screenOf(v3) {
  const p = v3.clone().project(camera), cr = renderer.domElement.getBoundingClientRect(), ar = app.getBoundingClientRect();
  return { x: (p.x + 1) / 2 * cr.width + cr.left - ar.left, y: (1 - p.y) / 2 * cr.height + cr.top - ar.top };
}

// 点击锅里的食材：冰冻的先敲冰，否则放入托盘
function tap(item) {
  if (state !== 'play' || !items.includes(item)) return 'none';
  if (item.ice > 0) {
    item.ice--;
    const s = screenOf(item.mesh.position); const c = document.createElement('img'); c.className = 'fx crack'; c.src = CONFIG.art.pop; c.alt = '';
    c.style.left = s.x + 'px'; c.style.top = s.y + 'px'; if (item.ice) c.style.opacity = .6; app.appendChild(c); setTimeout(() => c.remove(), 600);
    if (item.ice === 0) { item.mesh.remove(item.iceMesh); item.iceMesh.material.dispose(); item.iceMesh = null; }
    else { item.iceMesh.material.map = iceCrackedTex; item.iceMesh.material.opacity = 0.62; item.iceMesh.material.needsUpdate = true; }
    return 'ice';
  }
  items.splice(items.indexOf(item), 1); world.removeBody(item.body); disposeItem(item);
  addToTray(item.id, screenOf(item.mesh.position), item.mesh.position.clone());
  return 'picked';
}

// ---------- 小厨师：手里的盘子 = 临时第 8 格 ----------
function helperTap() {
  if (state !== 'play') return;
  if (!plate) {
    if (!tray.length) { toast('小厨师：托盘空空，没东西可以帮你装～'); return; }
    const id = tray.pop();
    let vi = -1; vtray.forEach((v, i) => { if (v.id === id && !v.popping) vi = i; });
    if (vi >= 0) { vtray[vi].el.remove(); vtray.splice(vi, 1); layoutTray(); }
    plate = id; setMood('full', 800);
  } else {
    const id = plate; plate = null;
    const r = $('plate').getBoundingClientRect(), ar = app.getBoundingClientRect();
    addToTray(id, { x: r.left - ar.left + r.width / 2, y: r.top - ar.top + r.height / 2 }, null);
  }
  renderPlate(); updateHud();
}
function renderPlate() {
  $('plate').innerHTML = plate ? `<img src="${thumbs[plate]}" alt="">` : '';
  $('helper').classList.toggle('holding', !!plate); refreshChef();
}
// 小厨师图片：按心情换图；盘子上有东西时（游戏进行中）一律用「端盘」
const chefImg = $('chef');
function refreshChef() {
  const m = $('helper').dataset.mood; let key = m === 'full' ? '' : m;
  if (plate && state !== 'win' && state !== 'lose') key = 'holding';
  const src = CONFIG.art.chef[key] ?? CONFIG.art.chef[''];
  if (!chefImg.src.endsWith(src)) chefImg.src = src;
}
const restMood = () => tray.length >= CONFIG.traySlots - 2 ? 'worried' : '';
let moodTimer, moodLocked = false;
// ms = 临时心情（期间不会被普通心情覆盖）；force = 强制覆盖
function setMood(m, ms, force) {
  if (!ms && moodLocked && !force) return;
  const el = $('helper'); clearTimeout(moodTimer); moodLocked = !!ms; el.dataset.mood = m; refreshChef();
  if (ms) moodTimer = setTimeout(() => { moodLocked = false; el.dataset.mood = restMood(); refreshChef(); }, ms);
}

function end(win) {
  state = win ? 'win' : 'lose';
  if (win) setTimeout(() => state === 'win' && setMood('happy', 0, true), 900); else setMood('sad', 0, true);
  endTimer = setTimeout(() => {
    $('card').classList.toggle('lose', !win);
    $('msg').innerHTML = win ? `通关啦！<small>完成 ${completed} 份订单 · 金币 ${coins}</small>` : '托盘满啦';
    $('next').textContent = win ? '下一关' : '再试一次';
    $('next').onclick = () => startLevel(win ? level + 1 : level);
    $('overlay').style.display = 'flex';
  }, 900);
}

// ---------- 点击（射线：只能点到最前面可见的物品） ----------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function itemAt(clientX, clientY) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set((clientX - r.left) / r.width * 2 - 1, -(clientY - r.top) / r.height * 2 + 1);
  ray.setFromCamera(ndc, camera);
  // 精灵的包围面是整张方形图，用 uv 过滤掉透明的四角，避免点到空白处
  for (const h of ray.intersectObjects(items.map(i => i.mesh), true)) {
    if (h.uv && Math.hypot(h.uv.x - 0.5, h.uv.y - 0.5) > 0.46) continue;
    let o = h.object; while (o && !o.userData.item) o = o.parent; if (o) return o.userData.item;
  }
  return null;
}
renderer.domElement.addEventListener('pointerdown', e => { const it = itemAt(e.clientX, e.clientY); if (it) tap(it); });
$('helper').addEventListener('pointerdown', helperTap);
$('restart').onclick = () => startLevel(level);
$('shuffle').onclick = () => {
  if (state !== 'play' || shuffles <= 0) return; shuffles--; updateHud();
  items.forEach(it => { it.body.wakeUp(); it.body.velocity.set((Math.random() - .5) * 4, 8 + Math.random() * 6, (Math.random() - .5) * 4);
    it.body.angularVelocity.set(Math.random() * 8, Math.random() * 8, Math.random() * 8); });
};

// ---------- 主循环 ----------
let last = performance.now();
function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  world.step(1 / 60, dt, 4);
  for (const it of items) {
    if (it.body.position.y < -4) { it.body.position.set(0, 4, 0); it.body.velocity.setZero(); }
    // 防卡锅沿：靠近锅壁且高于锅沿的物品轻推回中心
    const b = it.body, rr = Math.hypot(b.position.x, b.position.z);
    if (rr > R - 0.6 && b.position.y > potDepth * 0.5) { b.wakeUp(); b.velocity.x -= b.position.x / rr * 0.4; b.velocity.z -= b.position.z / rr * 0.4; }
    it.mesh.position.copy(it.body.position);   // 精灵永远朝向镜头，不需要旋转
    it.shadow.position.set(b.position.x, 0.03, b.position.z);   // 地面圆形阴影：越高越淡
    it.shadow.material.opacity = Math.max(0, Math.min(1, 1.2 - (b.position.y - 0.5) / 2.5));
  }
  renderer.render(scene, camera); frames++;
  requestAnimationFrame(tick);
}

// 调试接口（自动化测试用）
window.__game = {
  get state() { return state; }, get tray() { return [...tray]; }, get remaining() { return items.length; },
  get level() { return level; }, get coins() { return coins; }, get completed() { return completed; }, get plate() { return plate; },
  get lastExplosion() { return lastExplosion; }, get frames() { return frames; },
  orders: () => orders.map(o => ({ dish: o.dish.id, needs: o.dish.needs, got: { ...o.got } })),
  items: () => items.map(i => i.id), iced: () => items.filter(i => i.ice > 0).length,
  // 按 id 点一个食材（优先没冰的；都冰住时会敲冰）
  pickId: id => { const c = items.filter(i => i.id === id); const it = c.find(i => !i.ice) || c[0]; return it ? tap(it) : 'none'; },
  tapIced: () => { const it = items.find(i => i.ice > 0); return it ? [tap(it), it.ice, items.includes(it) ? tap(it) : 'gone', items.includes(it) ? tap(it) : 'gone'] : null; },
  clickAt: (x, y) => { const it = itemAt(x, y); if (it) tap(it); return it ? it.id : null; },
  helper: helperTap, start: n => startLevel(n),
  clickableCount: () => { const ok = new Set(); const r = renderer.domElement.getBoundingClientRect();
    for (let x = 2; x < r.width; x += 4) for (let y = 2; y < r.height * 0.8; y += 4) { const it = itemAt(r.left + x, r.top + y); if (it) ok.add(it); }
    return ok.size; },
  // 某个食材（优先没冰的）当前的屏幕坐标（client 坐标），测试里用来做真实鼠标点击
  posOf: id => { for (const i of items) if (i.id === id) { const p = clientOf(i.mesh.position); if (itemAt(p.x, p.y) === i) return p; } return null; },
  vtray: () => vtray.filter(v => !v.popping).map(v => v.id),
  outsideRim: () => items.filter(i => Math.hypot(i.body.position.x, i.body.position.z) > R + 0.1).length,
};

await loadAssets();
$('loading').remove();
$('start').onclick = () => { if (state === 'title') { state = 'play'; $('title').style.display = 'none'; toast(`第 1 关 · ${L.name}`); } };
startLevel(0, true);
resize();
if (/autostart/.test(location.search + location.hash)) toast(`第 1 关 · ${L.name}`);
else { state = 'title'; $('title').style.display = 'flex'; }
requestAnimationFrame(tick);
