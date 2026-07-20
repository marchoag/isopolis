/* Are the seeded homesteads being razed by the abandonment path? */
const H = require('./boot-harness.js');
const api = H.api, S = api.S;
let t = 16;
function pump(n) { for (let i = 0; i < n; i++) { const q = H.rafQueue.splice(0); if (!q.length) break; q.forEach(fn => fn(t)); t += 16; } }

pump(20);
api.closeHelp();
pump(5);

const L = api.lots();
const homes = Object.keys(L).filter(k => L[k].kind === 'homestead').map(Number);
console.log('homesteads seeded:', homes.length);
if (!homes.length) { console.log('none to test'); process.exit(0); }

const h0 = homes[0], c0 = api.grid[h0];
console.log(`sample: level=${c0.level} occ=${c0.occ.toFixed(2)} access=${c0.access} netOn=${c0.netOn} age=${c0.age}`);
console.log(`cap at level 1 = ${api.capOf ? 'n/a' : 'n/a'} · decay=${c0.decay || 0}`);

function alive() { return homes.filter(i => api.grid[i].level >= 1).length; }
console.log('\nalive at start:', alive(), '/', homes.length);

for (let tick = 1; tick <= 8; tick++) {
  for (let g = 0; g < 25; g++) api.growthTick();
  const c = api.grid[h0];
  console.log(`  after ${tick * 25} ticks: alive ${alive()}/${homes.length} · sample occ=${c.occ.toFixed(2)} decay=${c.decay || 0} level=${c.level}`);
}

console.log('\nnow with a month of occupancy relaxation:');
for (let m = 1; m <= 6; m++) {
  for (let g = 0; g < 25; g++) api.growthTick();
  api.monthly();
  const c = api.grid[h0];
  console.log(`  month ${m}: alive ${alive()}/${homes.length} · sample occ=${c.occ.toFixed(2)} decay=${c.decay || 0} level=${c.level}`);
}
