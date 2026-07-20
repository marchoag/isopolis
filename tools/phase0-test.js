/* Phase 0 regression test — extracts the SHIPPED code from isopolis.html and checks it
   against the original formulas it replaced.

   The contract:
     - Classic mode must reproduce the pre-overhaul approval number EXACTLY.
     - Campaign mode must differ ONLY in the red-months term (1.25/cap 10 vs 2.5/cap 15).
     - winThreshold must equal the REAL election bar (43+min(term,5)*2.2), which is what
       runElection always used, not the 48+term*1.6 the HUD used to display. */

const fs = require('fs');
const src = fs.readFileSync('/Users/marchoag/dev/Isopolis/isopolis.html', 'utf8');

function grab(startMarker, endMarker) {
  const a = src.indexOf(startMarker);
  if (a < 0) throw new Error('could not find: ' + startMarker);
  const b = src.indexOf(endMarker, a);
  if (b < 0) throw new Error('could not find end: ' + endMarker);
  return src.slice(a, b);
}

// Pull the real CFG table + the two new functions out of the shipped file.
const cfgBlock  = grab('const CFG_PRESETS = {', '/* ============================== UTILS');
const approvalFn = grab('function computeApproval(){', '\nfunction approvalParts');
const clampFn   = 'function clamp(v,a,b){return v<a?a:(v>b?b:v)}';

let S = {};
const sandbox = { S: null };
const code = `
  ${clampFn}
  ${cfgBlock}
  ${approvalFn}
  return { CFG, setMode, computeApproval, winThreshold, CFG_PRESETS };
`;
// setMode writes S.mode, so give the factory a live binding to our mock S.
const factory = new Function('getS', code.replace(/\bS\./g, 'getS().'));
const api = factory(() => S);

let pass = 0, fail = 0;
function check(name, got, want, tol) {
  const ok = tol !== undefined ? Math.abs(got - want) <= tol : got === want;
  if (ok) { pass++; }
  else { fail++; console.log(`  ✗ ${name}\n      got ${got}, want ${want}`); }
}

/* ---- reference: the ORIGINAL approval formula, verbatim from the pre-overhaul file ---- */
function originalApproval(s, redPerMonth = 2.5, redCap = 15) {
  const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
  const _grace = clamp((s.pop || 0) / 1200, 0.45, 1);
  const _estab = clamp((s.pop || 0) / 2500, 0, 1);
  const _stable = _estab * (clamp(1 - clamp(s.polAvg || 0, 0, 1) * 1.4, 0, 1) * clamp(1 - clamp(s.crimeAvg || 0, 0, 1) * 1.4, 0, 1)) * 11;
  const _prosper = (s._buildOut || 0) > 0.85 ? ((s._buildOut - 0.85) / 0.15) * clamp(1 - clamp(s.polAvg || 0, 0, 1), 0, 1) * 8 : 0;
  return Math.round(clamp(55
    + ((s.dem.res + s.dem.com + s.dem.ind) / 3) * 0.18
    + (7 - (s.tax || 0)) * 2.4
    - clamp(s.polAvg || 0, 0, 1) * 30 * _grace
    - clamp(s.crimeAvg || 0, 0, 1) * 27 * _grace
    - Math.min(s.unpowered || 0, 12) * 1.3
    + ((s.green || 0) - 0.45) * 16
    + _stable + _prosper
    - (s.leanGap || 0) * 0.16
    - Math.min((s.redMonths || 0) * redPerMonth, redCap)
    , 0, 100));
}

/* ---- a spread of city states, from founding hamlet to troubled metropolis ---- */
const cities = [
  { name: 'founding',        pop: 0,     dem: {res:18,com:6,ind:14}, tax:7,  polAvg:0,    crimeAvg:0,    unpowered:0,  green:0.5,  leanGap:0,  redMonths:0, _buildOut:0 },
  { name: 'village',         pop: 700,   dem: {res:30,com:20,ind:18},tax:7,  polAvg:0.08, crimeAvg:0.05, unpowered:0,  green:0.55, leanGap:20, redMonths:0, _buildOut:0.2 },
  { name: 'township, taxed', pop: 1800,  dem: {res:12,com:8,ind:6},  tax:11, polAvg:0.2,  crimeAvg:0.15, unpowered:2,  green:0.4,  leanGap:40, redMonths:0, _buildOut:0.4 },
  { name: 'boomtown',        pop: 5000,  dem: {res:45,com:30,ind:25},tax:5,  polAvg:0.3,  crimeAvg:0.2,  unpowered:0,  green:0.35, leanGap:55, redMonths:0, _buildOut:0.6 },
  { name: 'metropolis, red', pop: 18000, dem: {res:20,com:15,ind:10},tax:9,  polAvg:0.45, crimeAvg:0.35, unpowered:7,  green:0.25, leanGap:70, redMonths:6, _buildOut:0.88 },
  // the case that actually matters: a well-run city that dips into the red for a stretch.
  // This is normal play under the overhauled economy, and it must not clamp to zero.
  { name: 'healthy, 4mo red', pop: 6000,  dem: {res:35,com:22,ind:18},tax:7,  polAvg:0.15, crimeAvg:0.10, unpowered:0,  green:0.55, leanGap:25, redMonths:4, _buildOut:0.5 },
  { name: 'healthy, 8mo red', pop: 6000,  dem: {res:35,com:22,ind:18},tax:7,  polAvg:0.15, crimeAvg:0.10, unpowered:0,  green:0.55, leanGap:25, redMonths:8, _buildOut:0.5 },
  { name: 'deep trouble',    pop: 30000, dem: {res:-10,com:-5,ind:0},tax:14, polAvg:0.8,  crimeAvg:0.7,  unpowered:12, green:0.1,  leanGap:95, redMonths:12,_buildOut:0.95 },
];

console.log('\n── winThreshold: must equal the REAL bar runElection always used ──');
for (let term = 1; term <= 7; term++) {
  const want = Math.round(43 + Math.min(term, 5) * 2.2);
  const oldDisplayed = Math.round(48 + term * 1.6);
  check(`term ${term}`, api.winThreshold(term), want);
  if (term <= 3) console.log(`    term ${term}: real ${want}%  (HUD used to claim ${oldDisplayed}%  → overstated by ${oldDisplayed - want})`);
}

console.log('\n── CLASSIC mode: must reproduce the original approval number exactly ──');
api.setMode('classic');
check('mode is classic', api.CFG.mode, 'classic');
check('classic term length', api.CFG.election.termYears, 4);
for (const c of cities) {
  S = Object.assign({}, c);
  check(`classic / ${c.name}`, api.computeApproval(), originalApproval(c, 2.5, 15));
}

console.log('\n── CAMPAIGN mode: identical except the softened red-month penalty ──');
api.setMode('campaign');
check('mode is campaign', api.CFG.mode, 'campaign');
check('campaign term length', api.CFG.election.termYears, 8);
check('campaign probation', api.CFG.election.probationYears, 4);
for (const c of cities) {
  S = Object.assign({}, c);
  check(`campaign / ${c.name}`, api.computeApproval(), originalApproval(c, 1.25, 10));
}

console.log('\n── the softening is real where it matters (a city in the red) ──');
for (const c of cities.filter(c => c.redMonths > 0)) {
  S = Object.assign({}, c);
  api.setMode('classic');  const classic = api.computeApproval();
  api.setMode('campaign'); const campaign = api.computeApproval();
  console.log(`    ${c.name} (${c.redMonths} red months): classic ${classic}%  →  campaign ${campaign}%  (+${campaign - classic})`);
  if (campaign < classic) { fail++; console.log('  ✗ campaign should never be harsher on red months'); }
  else pass++;
}

console.log('\n── mode switching is idempotent and does not leak ──');
api.setMode('campaign'); api.setMode('classic'); api.setMode('campaign');
check('redPerMonth after round trip', api.CFG.approval.redPerMonth, 1.25);
check('termYears after round trip', api.CFG.election.termYears, 8);
api.setMode('bogus-value');
check('unknown mode falls back to campaign', api.CFG.mode, 'campaign');

console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
