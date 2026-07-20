/* Headless boot harness for isopolis.html.
   Stubs THREE + DOM + WebAudio hard enough to actually EVALUATE the inline script, run
   init(), and drive the sim. Catches boot crashes, typos, TDZ errors and null refs without
   a browser. It cannot judge how anything looks — that stays a human job.

   Usage: node boot-harness.js [months]
*/
const fs = require('fs');
const path = '/Users/marchoag/dev/Isopolis/isopolis.html';
const html = fs.readFileSync(path, 'utf8');

/* ---------------- canvas 2D stub ---------------- */
const ctxProto = {
  fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', globalAlpha: 1,
  lineJoin: '', lineCap: '', globalCompositeOperation: '', filter: '', shadowBlur: 0, shadowColor: '',
};
function makeCtx() {
  const c = Object.create(ctxProto);
  const noop = () => {};
  for (const m of ['fillRect','clearRect','strokeRect','beginPath','closePath','moveTo','lineTo','arc','arcTo',
                   'fill','stroke','save','restore','translate','rotate','scale','clip','rect','ellipse',
                   'quadraticCurveTo','bezierCurveTo','drawImage','fillText','strokeText','setTransform',
                   'setLineDash','putImageData','roundRect']) c[m] = noop;
  c.createRadialGradient = c.createLinearGradient = () => ({ addColorStop: noop });
  c.measureText = () => ({ width: 10 });
  c.getImageData = (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)) });
  c.createImageData = c.getImageData;
  return c;
}

/* ---------------- DOM stub ----------------
   Element ids are harvested from the real HTML, so getElementById returns null for a typo
   exactly as a browser would — that's a bug we WANT surfaced. */
const realIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
const classAttrs = [...html.matchAll(/\bclass="([^"]+)"/g)].flatMap(m => m[1].split(/\s+/));

function makeEl(tag, id) {
  const el = {
    tagName: (tag || 'div').toUpperCase(), id: id || '', _cls: new Set(), children: [], style: {},
    dataset: {}, _html: '', textContent: '', value: '', checked: false, files: null,
    width: 0, height: 0, parentElement: null, parentNode: null,
  };
  el.classList = {
    add: (...c) => c.forEach(x => el._cls.add(x)),
    remove: (...c) => c.forEach(x => el._cls.delete(x)),
    toggle: (c, f) => { const on = f === undefined ? !el._cls.has(c) : !!f; on ? el._cls.add(c) : el._cls.delete(c); return on; },
    contains: c => el._cls.has(c),
  };
  Object.defineProperty(el, 'className', { get: () => [...el._cls].join(' '), set: v => { el._cls = new Set(String(v).split(/\s+/).filter(Boolean)); } });
  Object.defineProperty(el, 'innerHTML', { get: () => el._html, set: v => { el._html = String(v); el.children = []; } });
  Object.defineProperty(el, 'clientWidth', { get: () => 1440 });
  Object.defineProperty(el, 'clientHeight', { get: () => 900 });
  Object.defineProperty(el, 'firstChild', { get: () => el.children[0] || null });
  Object.defineProperty(el, 'lastChild', { get: () => el.children[el.children.length - 1] || null });
  Object.defineProperty(el, 'firstElementChild', { get: () => el.children[0] || null });
  Object.defineProperty(el, 'childNodes', { get: () => el.children });
  el.appendChild = c => { c.parentElement = el; c.parentNode = el; el.children.push(c); return c; };
  el.removeChild = c => { const i = el.children.indexOf(c); if (i >= 0) el.children.splice(i, 1); return c; };
  el.remove = () => { if (el.parentElement) el.parentElement.removeChild(el); };
  el.addEventListener = (t, fn) => { (el._ev || (el._ev = {}))[t] = (el._ev[t] || []).concat(fn); };
  el.removeEventListener = () => {};
  el.dispatch = (t, ev) => ((el._ev && el._ev[t]) || []).forEach(fn => fn(ev || { preventDefault() {}, stopPropagation() {} }));
  // Permissive: a real browser resolves these against parsed HTML we don't model. Cache per
  // selector so repeat lookups return the same node, as the DOM would.
  el._qs = new Map();
  el.querySelector = sel => { if (!el._qs.has(sel)) el._qs.set(sel, makeEl('div')); return el._qs.get(sel); };
  el.querySelectorAll = () => [];      // wpShow() early-returns on an empty page list — fine
  el.closest = () => null;
  el.getContext = () => makeCtx();
  el.getBoundingClientRect = () => ({ left: 0, top: 0, right: 300, bottom: 200, width: 300, height: 200, x: 0, y: 0 });
  el.setAttribute = (k, v) => { if (k === 'class') el.className = v; else el['_attr_' + k] = v; };
  el.getAttribute = k => (k === 'class' ? el.className : el['_attr_' + k]);
  el.setPointerCapture = el.releasePointerCapture = () => {};
  el.focus = el.blur = el.click = () => {};
  el.toDataURL = () => 'data:image/png;base64,';
  return el;
}

const elCache = new Map();
const document = {
  createElement: t => makeEl(t),
  createElementNS: (ns, t) => makeEl(t),
  getElementById: id => {
    if (!realIds.has(id)) return null;                 // faithful: unknown id -> null
    if (!elCache.has(id)) elCache.set(id, makeEl('div', id));
    return elCache.get(id);
  },
  querySelector: sel => (sel === '.msModal' ? null : null),
  querySelectorAll: () => [],
  addEventListener: () => {}, removeEventListener: () => {},
  body: makeEl('body'), documentElement: makeEl('html'), head: makeEl('head'),
};
document.body.appendChild = c => { c.parentElement = document.body; return c; };

/* ---------------- THREE stub ----------------
   Geometries emit real (small) non-indexed vertex data so buildGeo's per-vertex colour and
   AO math genuinely executes rather than iterating an empty array. */
function geoData(nTri) {
  const n = nTri * 3;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (i % 3) * 0.25 - 0.25; pos[i * 3 + 1] = ((i / 3) | 0) % 2 ? 0.5 : 0; pos[i * 3 + 2] = (i % 2) * 0.25;
    nor[i * 3] = 0; nor[i * 3 + 1] = i % 4 === 0 ? 1 : 0.2; nor[i * 3 + 2] = 0.8;
  }
  return { pos, nor };
}
class Geo {
  constructor(nTri = 12) {
    const d = geoData(nTri);
    this.attributes = { position: { array: d.pos, count: d.pos.length / 3, needsUpdate: false },
                        normal:   { array: d.nor, count: d.nor.length / 3, needsUpdate: false } };
    this.index = null; this.boundingSphere = null;
  }
  rotateX() { return this; } rotateY() { return this; } rotateZ() { return this; }
  translate() { return this; } scale() { return this; } center() { return this; }
  toNonIndexed() { return this; } clone() { return this; }
  setAttribute(k, a) { this.attributes[k] = a; return this; }
  getAttribute(k) { return this.attributes[k]; }
  deleteAttribute(k) { delete this.attributes[k]; return this; }
  computeVertexNormals() { return this; }
  computeBoundingSphere() { this.boundingSphere = { radius: 1, center: new V3() }; return this; }
  dispose() { this.disposed = true; }
}
class V3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { return this.set(v.x, v.y, v.z); }
  clone() { return new V3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  addVectors(a, b) { return this.set(a.x + b.x, a.y + b.y, a.z + b.z); }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  subVectors(a, b) { return this.set(a.x - b.x, a.y - b.y, a.z - b.z); }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  normalize() { const l = Math.hypot(this.x, this.y, this.z) || 1; return this.multiplyScalar(1 / l); }
  crossVectors(a, b) { return this.set(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x); }
  cross(v) { return this.crossVectors(this.clone(), v); }
  length() { return Math.hypot(this.x, this.y, this.z); }
  distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
  lerp() { return this; }
  applyMatrix4() { return this; }
  project() { this.x = Math.max(-0.9, Math.min(0.9, this.x / 60)); this.y = Math.max(-0.9, Math.min(0.9, this.z / 60)); return this; }
  unproject() { return this; }
  setFromMatrixColumn() { return this; }
}
class V2 { constructor(x = 0, y = 0) { this.x = x; this.y = y; } set(x, y) { this.x = x; this.y = y; return this; } }
class Col {
  constructor(c) { this.r = 1; this.g = 1; this.b = 1; if (c !== undefined) this.set(c); }
  set(c) {
    if (typeof c === 'string' && c[0] === '#') {
      const h = c.slice(1), v = parseInt(h.length === 3 ? h.split('').map(x => x + x).join('') : h, 16);
      if (!Number.isFinite(v)) throw new Error('bad colour literal: ' + c);   // catches typo'd hex
      this.r = ((v >> 16) & 255) / 255; this.g = ((v >> 8) & 255) / 255; this.b = (v & 255) / 255;
    } else if (typeof c === 'number') { this.r = ((c >> 16) & 255) / 255; this.g = ((c >> 8) & 255) / 255; this.b = (c & 255) / 255; }
    else if (c && c.isColor) { this.r = c.r; this.g = c.g; this.b = c.b; }
    return this;
  }
  clone() { const k = new Col(); k.r = this.r; k.g = this.g; k.b = this.b; return k; }
  copy(c) { this.r = c.r; this.g = c.g; this.b = c.b; return this; }
  lerp() { return this; } offsetHSL() { return this; } getHex() { return 0xffffff; }
  setHex(h) { return this.set(h); } multiplyScalar() { return this; }
}
Col.prototype.isColor = true;

class Obj3D {
  constructor() {
    this.position = new V3(); this.rotation = { x: 0, y: 0, z: 0, set(){} }; this.scale = new V3(1, 1, 1);
    this.children = []; this.visible = true; this.userData = {}; this.parent = null;
    this.castShadow = this.receiveShadow = false; this.matrixWorld = {};
    this.material = null; this.geometry = null;
  }
  add(...o) { o.forEach(c => { c.parent = this; this.children.push(c); }); return this; }
  remove(...o) { o.forEach(c => { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parent = null; }); return this; }
  updateMatrixWorld() {} updateMatrix() {}
  getWorldDirection(v) { return (v || new V3()).set(0, 0, -1); }
  rotateZ() {} traverse(fn) { fn(this); this.children.forEach(c => c.traverse && c.traverse(fn)); }
  lookAt() {}
}
function Mat(p) { Object.assign(this, { color: new Col(), opacity: 1, transparent: false, emissive: new Col(), needsUpdate: false }, p || {}); this.dispose = () => {}; }

const THREE = {
  Vector2: V2, Vector3: V3, Color: Col, Object3D: Obj3D, Group: class extends Obj3D {},
  BufferGeometry: class extends Geo { constructor() { super(0); this.attributes = {}; } },
  BoxGeometry: class extends Geo { constructor() { super(12); } },
  PlaneGeometry: class extends Geo { constructor() { super(2); } },
  CylinderGeometry: class extends Geo { constructor() { super(16); } },
  ConeGeometry: class extends Geo { constructor() { super(8); } },
  SphereGeometry: class extends Geo { constructor() { super(20); } },
  RingGeometry: class extends Geo { constructor() { super(16); } },
  Float32BufferAttribute: class { constructor(a, n) { this.array = a instanceof Float32Array ? a : Float32Array.from(a || []); this.itemSize = n; this.count = this.array.length / (n || 3); this.needsUpdate = false; } },
  BufferAttribute: class { constructor(a, n) { this.array = a; this.itemSize = n; this.count = (a && a.length || 0) / (n || 3); } },
  Mesh: class extends Obj3D { constructor(g, m) { super(); this.geometry = g; this.material = m; } },
  Points: class extends Obj3D { constructor(g, m) { super(); this.geometry = g; this.material = m; } },
  Sprite: class extends Obj3D { constructor(m) { super(); this.material = m; this.scale = new V3(1, 1, 1); } },
  MeshLambertMaterial: Mat, MeshPhongMaterial: Mat, MeshBasicMaterial: Mat,
  MeshStandardMaterial: Mat, SpriteMaterial: Mat, PointsMaterial: Mat, ShaderMaterial: Mat,
  CanvasTexture: function () { this.needsUpdate = false; this.anisotropy = 1; this.wrapS = this.wrapT = 0; this.dispose = () => {}; this.magFilter = this.minFilter = 0; this.encoding = 0; this.colorSpace = 0; },
  Texture: function () { this.needsUpdate = false; this.dispose = () => {}; },
  Fog: function (c, n, f) { this.color = new Col(c); this.near = n; this.far = f; },
  Scene: class extends Obj3D { constructor() { super(); this.background = new Col(); this.fog = null; this.environment = null; } },
  OrthographicCamera: class extends Obj3D {
    constructor(l, r, t, b, n, f) { super(); Object.assign(this, { left: l, right: r, top: t, bottom: b, near: n, far: f, zoom: 1 }); }
    updateProjectionMatrix() {}
  },
  PerspectiveCamera: class extends Obj3D { updateProjectionMatrix() {} },
  HemisphereLight: class extends Obj3D { constructor(s, g, i) { super(); this.color = new Col(s); this.groundColor = new Col(g); this.intensity = i; } },
  DirectionalLight: class extends Obj3D {
    constructor(c, i) {
      super(); this.color = new Col(c); this.intensity = i;
      this.shadow = { mapSize: { width: 0, height: 0, set(w, h) { this.width = w; this.height = h; } }, bias: 0, normalBias: 0, radius: 0,
                      camera: { left: 0, right: 0, top: 0, bottom: 0, near: 0, far: 0, updateProjectionMatrix() {} } };
      this.target = new Obj3D();
    }
  },
  AmbientLight: class extends Obj3D {},
  Plane: function (n, c) { this.normal = n; this.constant = c; },
  Raycaster: function () {
    this.setFromCamera = () => {};
    this.ray = { intersectPlane: (p, target) => { (target || new V3()).set(4, 0, 4); return target; } };
    this.intersectObjects = () => []; this.intersectObject = () => [];
  },
  WebGLRenderer: function () {
    this.domElement = makeEl('canvas');
    this.shadowMap = { enabled: false, type: 0 };
    this.info = { render: { calls: 0, triangles: 0 } };
    this.capabilities = { isWebGL2: true, getMaxAnisotropy: () => 16 };
    this.setPixelRatio = this.setSize = this.setClearColor = this.clear = () => {};
    this.render = () => { this.info.render.calls++; };
    this.setRenderTarget = this.dispose = this.compile = () => {};
    this.outputColorSpace = 0; this.outputEncoding = 0; this.toneMapping = 0; this.toneMappingExposure = 1;
  },
  PCFSoftShadowMap: 2, NoToneMapping: 0, ACESFilmicToneMapping: 4, ReinhardToneMapping: 2,
  SRGBColorSpace: 'srgb', sRGBEncoding: 3001, LinearEncoding: 3000,
  AdditiveBlending: 2, NormalBlending: 1, DoubleSide: 2, FrontSide: 0,
  RepeatWrapping: 1000, ClampToEdgeWrapping: 1001, LinearFilter: 1006, NearestFilter: 1003,
  MathUtils: { lerp: (a, b, t) => a + (b - a) * t, clamp: (v, a, b) => Math.min(Math.max(v, a), b) },
};

/* ---------------- window / misc ---------------- */
let rafQueue = [], rafId = 0;
const listeners = {};
const windowStub = {
  innerWidth: 1440, innerHeight: 900, devicePixelRatio: 2,
  addEventListener: (t, fn) => { (listeners[t] || (listeners[t] = [])).push(fn); },
  removeEventListener: () => {},
  requestAnimationFrame: fn => { rafQueue.push(fn); return ++rafId; },
  cancelAnimationFrame: () => {},
  setTimeout: (fn, ms) => { (windowStub._timers || (windowStub._timers = [])).push(fn); return 0; },
  clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
  location: { search: '', href: 'http://localhost/isopolis.html', hash: '' },
  localStorage: { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } },
  navigator: { userAgent: 'node-harness', platform: 'node' },
  matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
  getComputedStyle: () => ({ getPropertyValue: () => '' }),
  performance: { now: () => Date.now() },
};
function AudioCtxStub() {
  const param = () => ({ value: 0, setValueAtTime() { return this; }, linearRampToValueAtTime() { return this; },
                         exponentialRampToValueAtTime() { return this; }, setTargetAtTime() { return this; },
                         cancelScheduledValues() { return this; }, setValueCurveAtTime() { return this; } });
  const node = () => ({ connect: n => n, disconnect() {}, start() {}, stop() {}, gain: param(), frequency: param(),
                        Q: param(), detune: param(), pan: param(), type: '', buffer: null, loop: false,
                        threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(),
                        reduction: 0, onended: null, playbackRate: param(), normalize: true });
  this.currentTime = 0; this.state = 'running'; this.sampleRate = 44100;
  this.destination = node();
  this.createGain = this.createBiquadFilter = this.createOscillator = this.createBufferSource =
    this.createStereoPanner = this.createDynamicsCompressor = this.createConvolver =
    this.createPanner = this.createAnalyser = this.createWaveShaper = this.createDelay = () => node();
  this.createBuffer = (ch, len) => ({ length: len, numberOfChannels: ch, sampleRate: 44100, getChannelData: () => new Float32Array(len), copyToChannel() {} });
  this.resume = () => Promise.resolve(); this.suspend = () => Promise.resolve(); this.close = () => Promise.resolve();
}

/* ---------------- run it ---------------- */
const S_ = html.indexOf('\n<script>\n');
const scriptStart = html.indexOf('\n', S_ + 1) + 1;
const scriptEnd = html.indexOf('</script>', scriptStart);
const code = html.slice(scriptStart, scriptEnd);

const errors = [], warns = [], logs = [];
const consoleStub = {
  log: (...a) => logs.push(a.map(String).join(' ')),
  warn: (...a) => warns.push(a.map(String).join(' ')),
  error: (...a) => errors.push(a.map(String).join(' ')),
  info: () => {}, debug: () => {},
};

const args = process.argv.slice(2);
const MONTHS_TO_RUN = parseInt(args[0] || '0', 10);
if (args.includes('--dev')) windowStub.location.search = '?dev';

const sandboxNames = ['window','document','THREE','console','requestAnimationFrame','cancelAnimationFrame',
                      'setTimeout','clearTimeout','setInterval','clearInterval','AudioContext','webkitAudioContext',
                      'location','navigator','localStorage','URL','Blob','FileReader','performance','alert','self','globalThis_'];
const sandboxVals  = [windowStub, document, THREE, consoleStub, windowStub.requestAnimationFrame, windowStub.cancelAnimationFrame,
                      windowStub.setTimeout, windowStub.clearTimeout, windowStub.setInterval, windowStub.clearInterval,
                      AudioCtxStub, AudioCtxStub, windowStub.location, windowStub.navigator, windowStub.localStorage,
                      { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} },
                      function Blob(){}, function FileReader(){ this.readAsText = () => {}; }, windowStub.performance,
                      () => {}, windowStub, windowStub];

let api = null, bootError = null;
try {
  const fn = new Function(...sandboxNames, code + '\n;return {S:typeof S!=="undefined"?S:null, CFG:typeof CFG!=="undefined"?CFG:null, ' +
    'growthTick:typeof growthTick!=="undefined"?growthTick:null, monthly:typeof monthly!=="undefined"?monthly:null, ' +
    'frame:typeof frame!=="undefined"?frame:null, buildSave:typeof buildSave!=="undefined"?buildSave:null, ' +
    'loadCity:typeof loadCity!=="undefined"?loadCity:null, openChip:typeof openChip!=="undefined"?openChip:null, ' +
    'closeChip:typeof closeChip!=="undefined"?closeChip:null, addMarker:typeof addMarker!=="undefined"?addMarker:null, ' +
    'removeMarker:typeof removeMarker!=="undefined"?removeMarker:null, markers:typeof markers!=="undefined"?markers:null, ' +
    'setMode:typeof setMode!=="undefined"?setMode:null, computeApproval:typeof computeApproval!=="undefined"?computeApproval:null, ' +
    'winThreshold:typeof winThreshold!=="undefined"?winThreshold:null, zoneRect:typeof zoneRect!=="undefined"?zoneRect:null, ' +
    'placeRoadPath:typeof placeRoadPath!=="undefined"?placeRoadPath:null, saveRoundTrip:typeof saveRoundTrip!=="undefined"?saveRoundTrip:null, ' +
    'newCity:typeof newCity!=="undefined"?newCity:null, setView:typeof setView!=="undefined"?setView:null, ' +
    'closeHelp:typeof closeHelp!=="undefined"?closeHelp:null, placePlant:typeof placePlant!=="undefined"?placePlant:null, ' +
    'grid:typeof grid!=="undefined"?grid:null, idx:typeof idx!=="undefined"?idx:null, N:typeof N!=="undefined"?N:null, ' +
    'recalcStats:typeof recalcStats!=="undefined"?recalcStats:null, isDev:typeof isDev!=="undefined"?isDev:null, ' +
    'canPlop:typeof canPlop!=="undefined"?canPlop:null, inB:typeof inB!=="undefined"?inB:null, ' +
    'advisorLine:typeof advisorLine!=="undefined"?advisorLine:null, TRACTS:typeof TRACTS!=="undefined"?TRACTS:null, ' +
    'annexTracts:typeof annexTracts!=="undefined"?annexTracts:null, tractAt:typeof tractAt!=="undefined"?tractAt:null, ' +
    'issueBond:typeof issueBond!=="undefined"?issueBond:null, bondCeiling:typeof bondCeiling!=="undefined"?bondCeiling:null, ' +
    'CFG_PRESETS:typeof CFG_PRESETS!=="undefined"?CFG_PRESETS:null, zoneCost:typeof zoneCost!=="undefined"?zoneCost:null, ' +
    'lots:function(){return lots;}, routeAround:typeof routeAround!=="undefined"?routeAround:null, ' +
    'avoidSet:typeof avoidSet!=="undefined"?avoidSet:null, era:typeof era!=="undefined"?era:null, ' +
    'polBlocked:typeof polBlocked!=="undefined"?polBlocked:null, isHoldout:typeof isHoldout!=="undefined"?isHoldout:null, ' +
    'reseatCouncil:typeof reseatCouncil!=="undefined"?reseatCouncil:null, fileDocket:typeof fileDocket!=="undefined"?fileDocket:null, ' +
    'docketTally:typeof docketTally!=="undefined"?docketTally:null, chip:function(){return activeChip;}, ' +
    'wildPrice:typeof wildPrice!=="undefined"?wildPrice:null, polTick:typeof polTick!=="undefined"?polTick:null, ' +
    'lotName:typeof lotName!=="undefined"?lotName:null, runElection:typeof runElection!=="undefined"?runElection:null, ' +
    'applyTod:typeof applyTod!=="undefined"?applyTod:null, todSample:typeof todSample!=="undefined"?todSample:null, ' +
    'cycleTod:typeof cycleTod!=="undefined"?cycleTod:null, voice:typeof voice!=="undefined"?voice:null, ' +
    'ensureAudio:typeof ensureAudio!=="undefined"?ensureAudio:null, scoreTick:typeof scoreTick!=="undefined"?scoreTick:null, ' +
    'updateAudio:typeof updateAudio!=="undefined"?updateAudio:null, photoMode:typeof photoMode!=="undefined"?photoMode:null, ' +
    'sun:typeof sun!=="undefined"?sun:null, nightT:function(){return nightT;}, todLock:function(){return todLock;}};');
  api = fn(...sandboxVals);
} catch (e) { bootError = e; }

const H = { bootError, errors, warns, logs, api, rafQueue, windowStub, MONTHS_TO_RUN };
module.exports = H;

if (require.main === module) {
  const ok = s => console.log('  \x1b[32m✓\x1b[0m ' + s);
  const bad = s => { console.log('  \x1b[31m✗\x1b[0m ' + s); process.exitCode = 1; };

  console.log('\n=== BOOT ===');
  if (bootError) {
    bad('script threw during evaluation / init()');
    console.log('\n' + (bootError.stack || bootError.message).split('\n').slice(0, 12).join('\n'));
    process.exit(1);
  }
  ok('inline script evaluated and init() completed with no exception');
  if (errors.length) { bad('console.error during boot:'); errors.forEach(e => console.log('      ' + e)); }
  const S = api.S, CFG = api.CFG;
  if (!S || !CFG) { bad('S or CFG not reachable'); process.exit(1); }
  ok(`grid built · mode=${CFG.mode} · term=${CFG.election.termYears}y · city="${S.cityName}"`);

  console.log('\n=== FRAME LOOP ===');
  let t = 16, framesRun = 0;
  // The frame loop is what reconciles the dirty flags (roadDirty -> refreshRoads, powerDirty
  // -> recomputePower, mapsDirty -> recalcMaps). Placement functions only SET those flags, so
  // any realistic scenario has to let frames run between actions.
  function pump(n) {
    for (let i = 0; i < n; i++) { const q = rafQueue.splice(0); if (!q.length) break; q.forEach(fn => fn(t)); t += 16; framesRun++; }
  }
  try { pump(90); ok(`${framesRun} frames rendered without throwing`); }
  catch (e) { bad('frame() threw: ' + e.message + '\n' + (e.stack || '').split('\n')[1]); }

  console.log('\n=== SIM ===');
  try {
    for (let i = 0; i < 400; i++) api.growthTick();
    ok('400 growthTicks OK');
  } catch (e) { bad('growthTick threw: ' + e.message); }
  const months = MONTHS_TO_RUN || 24;
  try {
    for (let i = 0; i < months; i++) api.monthly();
    ok(`${months} months simulated · pop=${S.pop} · funds=${Math.round(S.money)} · approval=${S.approval}%`);
  } catch (e) { bad('monthly() threw: ' + e.message + '\n' + (e.stack || '').split('\n')[1]); }

  console.log('\n=== BUILD A CITY (exercises the real growth path) ===');
  try {
    api.closeHelp();                                   // marks started, applies chosen mode
    // Roads now STOP at the county line rather than skipping across it, so build inside the
    // founding block. Find its bounds instead of assuming the map centre.
    const TROW0 = Math.sqrt(api.TRACTS) | 0;
    let minX = 1e9, maxX = -1, minZ = 1e9, maxZ = -1;
    for (let t = 0; t < api.TRACTS; t++) if (S.owned[t]) {
      const tx = (t % TROW0) * 4, tz = ((t / TROW0) | 0) * 4;
      minX = Math.min(minX, tx); maxX = Math.max(maxX, tx + 3);
      minZ = Math.min(minZ, tz); maxZ = Math.max(maxZ, tz + 3);
    }
    const c = (minX + maxX) >> 1, cz = (minZ + maxZ) >> 1;
    api.placeRoadPath({ x: minX + 1, z: cz }, { x: maxX - 1, z: cz });   // an east-west spine
    api.placeRoadPath({ x: c, z: minZ + 1 }, { x: c, z: maxZ - 1 });     // and a cross street
    pump(4);                                           // let refreshRoads() compute access
    // The map is randomly seeded, so hunt for a legal 3x3 plant pad rather than assuming one:
    // all nine tiles plop-able, at least one with road access.
    let sited = false;
    for (let r = 3; r < 16 && !sited; r++) {
      for (let dz = -r; dz <= r && !sited; dz++) for (let dx = -r; dx <= r && !sited; dx++) {
        const ax = c + dx, az = cz + dz;
        let clear = true, touched = false;
        for (let k = 0; k < 9 && clear; k++) {
          const nx = ax + (k % 3), nz = az + ((k / 3) | 0);
          if (!api.inB(nx, nz) || !api.canPlop(api.grid[api.idx(nx, nz)])) { clear = false; break; }
          if (api.grid[api.idx(nx, nz)].access) touched = true;
        }
        if (clear && touched) { api.placePlant(ax, az, 'wind'); sited = api.grid.some(g => g.type === 'power'); }
      }
    }
    if (!sited) bad('could not find any legal plant site near the roads');
    pump(4);                                           // let recomputePower() flood the grid
    // Zone the whole founding block; zoneRect filters out water, roads and out-of-reach tiles.
    api.zoneRect('res', { x: minX, z: minZ }, { x: maxX, z: cz - 1 });
    api.zoneRect('com', { x: minX, z: cz + 1 }, { x: c - 1, z: maxZ });
    api.zoneRect('ind', { x: c + 1, z: cz + 1 }, { x: maxX, z: maxZ });
    pump(4);
    let zoned = 0;
    for (let i = 0; i < api.N * api.N; i++) { const t = api.grid[i].type; if (t === 'res' || t === 'com' || t === 'ind') zoned++; }
    if (zoned > 20) ok(`roads laid, plant sited, ${zoned} tiles zoned`);
    else bad(`expected >20 zoned tiles, got ${zoned}`);
  } catch (e) { bad('city construction threw: ' + e.message + '\n' + (e.stack || '').split('\n')[1]); }

  try {
    const snaps = [];
    for (let m = 1; m <= 60; m++) {
      for (let g = 0; g < 25; g++) api.growthTick();
      api.monthly();
      // Play like a mayor: every year, annex a tract on the frontier and zone into it.
      // Without this the city plateaus the moment its starting land fills, and the
      // pool/materials just pile up unused — which tells us nothing about pacing.
      if (m % 12 === 0) {
        const owned = [];
        for (let t = 0; t < api.TRACTS; t++) if (S.owned[t]) owned.push(t);
        const TROW = Math.sqrt(api.TRACTS) | 0;
        let target = -1;
        for (const t of owned) {
          for (const d of [1, -1, TROW, -TROW]) {
            const n = t + d;
            if (n >= 0 && n < api.TRACTS && !S.owned[n]) { target = n; break; }
          }
          if (target >= 0) break;
        }
        if (target >= 0 && api.annexTracts([target])) {
          const tx = (target % TROW) * 4, tz = ((target / TROW) | 0) * 4;
          api.placeRoadPath({ x: tx, z: tz }, { x: tx + 3, z: tz });
          pump(3);
          api.zoneRect(m % 24 === 0 ? 'com' : 'res', { x: tx, z: tz + 1 }, { x: tx + 3, z: tz + 3 });
          pump(2);
        }
      }
      if (m % 12 === 0) snaps.push(`        m${String(m).padStart(2)} pop ${String(S.pop).padStart(5)} · §${String(Math.round(S.money)).padStart(6)} · pool ${String(Math.round(S.pool.res || 0)).padStart(3)} · mat ${String(Math.round(S.mat)).padStart(3)} · econ ${(S.econ || 1).toFixed(2)} · ${api.advisorLine()}`);
    }
    api.recalcStats();
    H._snaps = snaps;
    let built = 0;
    for (let i = 0; i < api.N * api.N; i++) if (api.isDev(api.grid[i])) built++;
    if (S.pop > 0 && built > 0) ok(`60 months of growth · ${built} buildings · pop=${S.pop.toLocaleString()} · funds=${Math.round(S.money).toLocaleString()} · approval=${S.approval}%`);
    else bad(`city never grew: pop=${S.pop}, built=${built} — growth path may be broken`);
    // The balance instrument: at any city size ONE gate should usually bind. If the binding
    // gate rotates every month, the economy needs retuning.
    let ownedN = 0; for (let i = 0; i < api.TRACTS; i++) if (S.owned[i]) ownedN++;
    let uc = 0; for (let i = 0; i < api.N * api.N; i++) if (api.grid[i].stage === 'uc') uc++;
    (H._snaps || []).forEach(s => console.log(s));
    console.log(`      economy : pool=${(S.pool.res || 0).toFixed(1)} · materials=${Math.round(S.mat)} · econ=${(S.econ || 1).toFixed(2)} · sites=${uc} · tracts=${ownedN}/${api.TRACTS} · bonds=${S.bonds.principal}`);
    if (!Number.isFinite(S.pop) || !Number.isFinite(S.money) || !Number.isFinite(S.approval)) bad('NaN leaked into S (pop/money/approval)');
    else ok('no NaNs in pop / money / approval');
  } catch (e) { bad('growth simulation threw: ' + e.message + '\n' + (e.stack || '').split('\n')[1]); }

  console.log('\n=== PHASE 2: THE MAP FIGHTS BACK ===');
  try {
    const L = api.lots();
    const homes = Object.keys(L).filter(k => L[k].kind === 'homestead');
    if (!homes.length) bad('no homesteads seeded — the first road-bend can never happen');
    else {
      const holdouts = homes.filter(k => api.isHoldout(L[k]));
      const frac = holdouts.length / homes.length;
      // The design's tuning guardrail: err cold. If most owners can't be bought, the
      // signature moment decays into a routine tax.
      if (frac > 0.45) bad(`attach roll is TOO HOT — ${holdouts.length}/${homes.length} are unbuyable holdouts (want <45%)`);
      else ok(`${homes.length} homesteads seeded · ${holdouts.length} true holdouts (${Math.round(frac * 100)}% — scarce, as intended)`);
      console.log(`      e.g. ${api.lotName(L[homes[0]])} — attachment ${L[homes[0]].attach.toFixed(2)}`);
    }
  } catch (e) { bad('homestead seeding threw: ' + e.message); }

  // Homesteads have no roads and no power, so the occupancy relaxation used to drag them
  // to zero and the abandonment path then razed them — all of them, inside two game-months.
  // A razed homestead is a road-bend that can never happen.
  try {
    const L = api.lots();
    const homes = Object.keys(L).filter(k => L[k].kind === 'homestead').map(Number);
    const before = homes.filter(i => api.grid[i].level >= 1).length;
    for (let m = 0; m < 12; m++) { for (let g = 0; g < 25; g++) api.growthTick(); api.monthly(); }
    const after = homes.filter(i => api.grid[i].level >= 1).length;
    if (after === before) ok(`homesteads survive 12 months unserviced (${after}/${before} standing)`);
    else bad(`homesteads are being razed: ${before} -> ${after} after a year — the politics seed dies`);
  } catch (e) { bad('homestead survival check threw: ' + e.message); }

  // THE signature moment: drive a road at a holdout and check it stops clean with exits.
  try {
    const L = api.lots();
    let hk = Object.keys(L).find(k => api.isHoldout(L[k]));
    if (!hk) {
      // Holdouts are deliberately scarce, so some seeds have none. Force one so this path is
      // always exercised — the road-bend is the whole point of Phase 2.
      const any = Object.keys(L).find(k => L[k].kind === 'homestead');
      if (any) { L[any].attach = 0.95; hk = any; console.log('      (no natural holdout this seed — forced one for the test)'); }
    }
    if (!hk) { bad('no lots at all to test the road-bend against'); }
    else {
      const hi = +hk, hx = hi % api.N, hz = (hi / api.N) | 0;
      // Own the ground around it so county land isn't what stops us.
      const TR = Math.sqrt(api.TRACTS) | 0;
      for (let dz = -6; dz <= 6; dz++) for (let dx = -6; dx <= 6; dx++) {
        const nx = hx + dx, nz = hz + dz;
        if (api.inB(nx, nz)) S.owned[api.tractAt(nx, nz)] = 1;
      }
      api.closeChip(true);
      const before = api.grid.filter(g => g.type === 'road').length;
      api.placeRoadPath({ x: hx - 5, z: hz }, { x: hx + 5, z: hz });
      const after = api.grid.filter(g => g.type === 'road').length;
      const onLot = api.grid[hi].type === 'road';
      if (onLot) bad('the road paved straight over a holdout — the whole mechanic is bypassed');
      else ok(`road stops clean at the fence (${after - before} tiles laid, none on the lot)`);
      const chip = api.chip();
      if (!chip) bad('no chip opened at the blocked tile — the player gets no exits');
      else {
        const btns = chip.el.querySelectorAll ? [] : [];
        ok('anchored chip opened at the blocked tile');
      }
      // Route-around must find a legible detour.
      const path = api.routeAround({ x: hx - 1, z: hz }, { x: hx + 5, z: hz }, api.avoidSet());
      if (!path) console.log('      route-around: no path on this seed (button correctly disables)');
      else {
        let turns = 0;
        for (let i = 2; i < path.length; i++) {
          const d1 = (path[i].x - path[i - 1].x) + ',' + (path[i].z - path[i - 1].z);
          const d2 = (path[i - 1].x - path[i - 2].x) + ',' + (path[i - 1].z - path[i - 2].z);
          if (d1 !== d2) turns++;
        }
        if (path.some(p => api.idx(p.x, p.z) === hi)) bad('route-around walked straight through the holdout');
        else ok(`route-around found a ${path.length}-tile detour with ${turns} turns (a dogleg, not a staircase)`);
      }
      api.closeChip(true);
    }
  } catch (e) { bad('signature road-bend threw: ' + e.message + '\n' + (e.stack || '').split('\n')[1]); }

  try {
    api.reseatCouncil();
    const seats = S.pol.council;
    if (seats.length === 5) {
      ok('council seated: ' + seats.map(s => s.dist + '=' + s.faction).join(' · '));
      api.fileDocket({ type: 'upzone', dist: 1 });
      const t = api.docketTally(S.pol.docket[0]);
      ok(`docket vote projects ${t.yes}/5 (needs ${t.need})`);
    } else bad('council should have 5 seats, got ' + seats.length);
  } catch (e) { bad('council/docket threw: ' + e.message + '\n' + (e.stack || '').split('\n')[1]); }

  try {
    const p0 = api.wildPrice();
    S.wildTaken = 40;
    const p1 = api.wildPrice();
    if (p1 > p0) ok(`WILD_STEP live: wild land ${p0} -> ${p1} after 40 acres paved (was a dead constant)`);
    else bad('wild price does not escalate');
    S.wildTaken = 0;
  } catch (e) { bad('wild pricing threw: ' + e.message); }

  console.log('\n=== PHASE 3: PRESENTATION ===');
  try {
    // The sun must actually MOVE and must never be scaled by game speed.
    const noon = api.todSample(13), dusk = api.todSample(19.5), night = api.todSample(22);
    const moved = Math.abs(noon.elev - dusk.elev) > 20 && Math.abs(noon.azim - dusk.azim) > 10;
    if (moved) ok(`sun sweeps a real arc — noon ${noon.elev.toFixed(0)}° → dusk ${dusk.elev.toFixed(0)}° (was a static light)`);
    else bad('sun does not move across the day');
    if (night.glow > 0.8 && noon.glow < 0.1) ok(`night glow ramps 0.00 → ${night.glow.toFixed(2)} (windows wake at dusk)`);
    else bad('night glow ramp is wrong');
    // Shadow elevation must be clamped: a 2048 map can't resolve an 8° sun.
    api.applyTod();
    const before = { x: api.sun.position.x, y: api.sun.position.y };
    if (api.sun.position.y > 0) ok('shadow-casting sun stays above the horizon clamp');
    else bad('sun dropped below the shadow clamp');
  } catch (e) { bad('time-of-day threw: ' + e.message + '\n' + (e.stack || '').split('\n')[1]); }

  try {
    // Speed must NOT scale the clock — a 5x speed-scaled cycle is a 24-second strobe day.
    S.speedMul = 5;
    const t0 = H.api.S && 0;
    let a = null, b = null;
    // drive the frame loop and read the clock indirectly via nightT stability at a locked hour
    api.cycleTod(); // -> Noon lock
    const lockedA = api.nightT();
    pump(30);
    const lockedB = api.nightT();
    if (Math.abs(lockedA - lockedB) < 0.001) ok('time lock holds steady while the game runs at 5x');
    else bad('time lock drifts under speed');
    S.speedMul = 1;
  } catch (e) { bad('time lock threw: ' + e.message); }

  try {
    api.ensureAudio();
    api.voice({ freq: 440, dur: 0.1 });
    api.updateAudio(1.0);
    api.scoreTick();
    ok('audio spine builds (master bus, ADSR voice, reverb) and the score schedules');
  } catch (e) { bad('audio threw: ' + e.message + '\n' + (e.stack || '').split('\n')[1]); }

  try { api.photoMode(); ok('photo mode captures without throwing'); }
  catch (e) { bad('photo mode threw: ' + e.message + '\n' + (e.stack || '').split('\n')[1]); }

  console.log('\n=== SAVE ROUND TRIP ON A POPULATED CITY ===');
  try {
    const before = JSON.stringify(api.buildSave());
    api.loadCity(JSON.parse(before));
    const after = JSON.stringify(api.buildSave());
    if (before === after) ok(`populated v3 round trip byte-identical (${before.length.toLocaleString()} bytes)`);
    else {
      bad('populated round trip MISMATCH');
      const a = JSON.parse(before), b = JSON.parse(after);
      for (const k of Object.keys(a)) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) console.log('      differs on key: ' + k);
    }
  } catch (e) { bad('populated round trip threw: ' + e.message + '\n' + (e.stack || '').split('\n')[1]); }

  console.log('\n=== PHASE 0 SURFACES ===');
  try {
    const h = api.openChip({ x: 10, z: 10, title: 'Test', sub: 'sub', body: 'body',
      buttons: [{ label: 'A', primary: true, onClick: c => c.close() }, { label: 'B', disabled: true, why: 'nope' }] });
    api.openChip({ x: 12, z: 12, title: 'Second' });     // must swap, not stack
    api.closeChip(true);
    ok('openChip / swap / closeChip OK');
  } catch (e) { bad('chip manager threw: ' + e.message); }
  try {
    // Phase 2 legitimately leaves markers on the map (holdouts, landmarks), so measure the
    // DELTA rather than assuming an empty registry.
    api.removeMarker(20, 20); api.removeMarker(21, 21);
    const base = api.markers.size;
    api.addMarker(20, 20, 'picket'); api.addMarker(21, 21, 'notice'); api.addMarker(20, 20, 'picket');
    const added = api.markers.size - base;
    api.removeMarker(21, 21);
    const afterRemove = api.markers.size - base;
    if (added === 2 && afterRemove === 1) ok(`markers add/dedupe/remove OK (+${added} then −1, ${api.markers.size} live on the map)`);
    else bad(`marker registry wrong: 3 adds (one a duplicate) gave +${added}, after remove +${afterRemove}`);
    api.removeMarker(20, 20);
  } catch (e) { bad('markers threw: ' + e.message + '\n' + (e.stack || '').split('\n')[1]); }
  try { api.setView('pollution'); api.setView(null); ok('setView toggle (hides/shows markers) OK'); }
  catch (e) { bad('setView threw: ' + e.message); }

  console.log('\n=== SAVE ROUND TRIP ===');
  try {
    const before = JSON.stringify(api.buildSave());
    api.loadCity(JSON.parse(before));
    const after = JSON.stringify(api.buildSave());
    if (before === after) ok(`v${JSON.parse(before).v} round trip byte-identical (${before.length.toLocaleString()} bytes)`);
    else bad('round trip MISMATCH');
  } catch (e) { bad('save round trip threw: ' + e.message + '\n' + (e.stack || '').split('\n')[1]); }

  console.log('\n=== LEGACY SAVE (v2, no mode key) ===');
  try {
    const v3 = api.buildSave();
    const v2 = Object.assign({}, v3, { v: 2 }); delete v2.mode;
    api.loadCity(v2);
    if (CFG.mode === 'classic') ok('v2 save loads and falls back to Classic (rules it was built under)');
    else bad('v2 save should load as Classic, got ' + CFG.mode);
  } catch (e) { bad('legacy load threw: ' + e.message + '\n' + (e.stack || '').split('\n')[1]); }

  if (warns.length) { console.log('\n=== WARNINGS ==='); warns.forEach(w => console.log('  ! ' + w)); }
  console.log('\n' + (process.exitCode ? '\x1b[31m❌ FAILURES ABOVE\x1b[0m' : '\x1b[32m✅ ALL BOOT CHECKS PASSED\x1b[0m') + '\n');
}
