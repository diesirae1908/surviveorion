const fs = require('fs'), path = require('path');
const OUT = require('path').resolve(__dirname, '..', 'assets');
const write = (rel, body) => {
  const p = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body.trim() + '\n');
  console.log('  ' + rel);
};
const FONT = "Rajdhani, 'Titillium Web', 'Segoe UI', system-ui, sans-serif";

// deterministic PRNG so the starfield is identical on every rebuild
const rng = (s) => () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;

function starfield(w, h, n, seed, maxR = 1.9) {
  const r = rng(seed); let out = '';
  for (let i = 0; i < n; i++) {
    const x = +(r() * w).toFixed(1), y = +(r() * h).toFixed(1);
    const rad = +(0.5 + r() * maxR).toFixed(2), o = +(0.18 + r() * 0.5).toFixed(2);
    out += `<circle cx="${x}" cy="${y}" r="${rad}" fill="#fff7e0" opacity="${o}"/>`;
  }
  return out;
}

function hex(cx, cy, r, rot = 0) {
  const p = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 3 * i + rot;
    p.push(`${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`);
  }
  return p.join(' ');
}

/** The drone swarm: hex shells fading in from the right edge. */
function swarm(x0, x1, y0, y1, n, seed) {
  const r = rng(seed); let out = '';
  for (let i = 0; i < n; i++) {
    const t = r();
    const x = x0 + (x1 - x0) * Math.pow(r(), 0.6);
    const y = y0 + (y1 - y0) * r();
    const rad = 5 + t * 11;
    const op = +(0.25 + 0.6 * ((x - x0) / (x1 - x0))).toFixed(2);
    out += `<polygon points="${hex(x, y, rad, r() * 1.05)}" fill="none" stroke="#ff4455" stroke-width="2.2" opacity="${op}"/>`
         + `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(rad * 0.28).toFixed(1)}" fill="#c41e3a" opacity="${op}"/>`;
  }
  return out;
}

const MARK = (s) => `<g fill="none" stroke="${s.stroke}" stroke-width="10">
      <path d="M26.71 21.25 A37 37 0 0 1 73.29 21.25"/>
      <path d="M78.75 26.71 A37 37 0 0 1 78.75 73.29"/>
      <path d="M73.29 78.75 A37 37 0 0 1 26.71 78.75"/>
      <path d="M21.25 73.29 A37 37 0 0 1 21.25 26.71"/>
    </g>
    <circle cx="50" cy="50" r="15" fill="${s.core}"/>`;

const LP = {
  O: 'M22 0 L56 0 L78 22 L78 78 L56 100 L22 100 L0 78 L0 22 Z M30 22 L48 22 L56 30 L56 70 L48 78 L30 78 L22 70 L22 30 Z',
  R: 'M0 0 L56 0 L78 22 L78 38 L58 60 L78 100 L48 100 L28 60 L22 60 L22 100 L0 100 Z M22 20 L46 20 L56 30 L46 40 L22 40 Z',
  I: 'M0 0 L22 0 L22 100 L0 100 Z',
  N: 'M0 22 L22 0 L24 0 L56 58 L56 0 L78 0 L78 78 L56 100 L54 100 L22 42 L22 100 L0 100 Z',
};
const WM = (fill) => `<g fill="${fill}" fill-rule="evenodd">` +
  [['O',0],['R',104],['I',203],['O',249],['N',353]]
    .map(([c,x]) => `<path transform="translate(${x},0)" d="${LP[c]}"/>`).join('') + `</g>`;

const GOLD = `<linearGradient id="g" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stop-color="#ffee88"/><stop offset="0.55" stop-color="#ffd700"/><stop offset="1" stop-color="#cc8800"/>
    </linearGradient>`;
const GOLDV = `<linearGradient id="gv" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffee88"/><stop offset="0.55" stop-color="#ffd700"/><stop offset="1" stop-color="#cc8800"/>
    </linearGradient>`;
const CORE = `<radialGradient id="c" cx="0.38" cy="0.34" r="0.8">
      <stop offset="0" stop-color="#ff4455"/><stop offset="1" stop-color="#c41e3a"/>
    </radialGradient>`;
const SPACE = (id, w, h) => `<radialGradient id="${id}" cx="0.5" cy="0.5" r="0.78">
      <stop offset="0" stop-color="#12121e"/><stop offset="1" stop-color="#0a0a12"/>
    </radialGradient>`;
const GLOW = `<filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="10" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>`;

console.log('icon/');

// --- app icon, full bleed 1024 -------------------------------------------
write('icon/orion-app-icon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-label="ORION app icon">
  <title>ORION app icon</title>
  <defs>${SPACE('sp')}${GOLD}${CORE}${GLOW}</defs>
  <rect width="1024" height="1024" fill="url(#sp)"/>
  <g>${starfield(1024, 1024, 90, 7, 2.6)}</g>
  <g transform="translate(160,160) scale(7.04)" filter="url(#glow)">${MARK({ stroke: 'url(#g)', core: 'url(#c)' })}</g>
</svg>`);

// --- maskable icon: mark inside the 80% safe circle ----------------------
write('icon/orion-app-icon-maskable.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-label="ORION maskable app icon">
  <title>ORION maskable app icon (mark inside the 80% safe zone)</title>
  <defs>${SPACE('sp')}${GOLD}${CORE}${GLOW}</defs>
  <rect width="1024" height="1024" fill="url(#sp)"/>
  <g>${starfield(1024, 1024, 90, 7, 2.6)}</g>
  <g transform="translate(266,266) scale(4.92)" filter="url(#glow)">${MARK({ stroke: 'url(#g)', core: 'url(#c)' })}</g>
</svg>`);

// --- favicon: solid ring, survives 16px ----------------------------------
write('icon/orion-favicon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="ORION favicon">
  <title>ORION favicon (solid ring: the diagonal cuts close up below 32px)</title>
  <circle cx="50" cy="50" r="37" fill="none" stroke="#ffd700" stroke-width="11"/>
  <circle cx="50" cy="50" r="15" fill="#c41e3a"/>
</svg>`);
write('icon/orion-favicon-tile.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="ORION favicon tile">
  <title>ORION favicon on the deep-space tile</title>
  <rect width="100" height="100" rx="22" fill="#0a0a12"/>
  <circle cx="50" cy="50" r="31" fill="none" stroke="#ffd700" stroke-width="9"/>
  <circle cx="50" cy="50" r="12.5" fill="#c41e3a"/>
</svg>`);

console.log('social/');

// --- OG / link preview 1200x630 ------------------------------------------
write('social/orion-og.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" role="img" aria-label="ORION link preview">
  <title>ORION link preview (1200x630)</title>
  <defs>${SPACE('sp')}${GOLD}${GOLDV}${CORE}${GLOW}</defs>
  <rect width="1200" height="630" fill="url(#sp)"/>
  <g>${starfield(1200, 630, 110, 31)}</g>
  <g>${swarm(880, 1200, 20, 610, 46, 99)}</g>
  <g transform="translate(78,250) scale(1.3)" filter="url(#glow)">${MARK({ stroke: 'url(#g)', core: 'url(#c)' })}</g>
  <g transform="translate(258,258) scale(0.86)">${WM('url(#gv)')}</g>
  <text x="258" y="410" fill="#aa8844" font-family="${FONT}" font-size="31" font-weight="600"
    textLength="486" lengthAdjust="spacing">DAILY PATROL · SURVIVE THE SWARM</text>
  <text x="258" y="466" fill="#8a7a55" font-family="${FONT}" font-size="27" font-weight="500">Three attempts a day. Same run for every pilot.</text>
  <text x="258" y="506" fill="#8a7a55" font-family="${FONT}" font-size="27" font-weight="500">surviveorion.com</text>
</svg>`);

// --- X / Twitter header 1500x500 -----------------------------------------
write('social/orion-header-1500x500.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1500 500" role="img" aria-label="ORION social header">
  <title>ORION social header (1500x500)</title>
  <defs>${SPACE('sp')}${GOLD}${GOLDV}${CORE}${GLOW}</defs>
  <rect width="1500" height="500" fill="url(#sp)"/>
  <g>${starfield(1500, 500, 120, 53)}</g>
  <g>${swarm(1180, 1500, 10, 490, 34, 17)}</g>
  <g transform="translate(523,196) scale(1.08)" filter="url(#glow)">${MARK({ stroke: 'url(#g)', core: 'url(#c)' })}</g>
  <g transform="translate(667,208) scale(0.72)">${WM('url(#gv)')}</g>
  <text x="667" y="330" fill="#aa8844" font-family="${FONT}" font-size="23" font-weight="600"
    textLength="430" lengthAdjust="spacing">SURVIVE THE SWARM · surviveorion.com</text>
</svg>`);

// --- daily result card template 1080x1080 --------------------------------
write('social/orion-share-card-template.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080" role="img" aria-label="ORION daily result card template">
  <title>ORION daily result card template (1080x1080)</title>
  <defs>${SPACE('sp')}${GOLD}${GOLDV}${CORE}${GLOW}</defs>
  <rect width="1080" height="1080" fill="url(#sp)"/>
  <g>${starfield(1080, 1080, 100, 77)}</g>
  <g>${swarm(760, 1080, 620, 1080, 26, 41)}</g>
  <rect x="56" y="56" width="968" height="968" rx="28" fill="none" stroke="#2a2a3a" stroke-width="3"/>
  <g transform="translate(112,120) scale(0.9)" filter="url(#glow)">${MARK({ stroke: 'url(#g)', core: 'url(#c)' })}</g>
  <g transform="translate(226,132) scale(0.36)">${WM('url(#gv)')}</g>
  <text x="226" y="212" fill="#8a7a55" font-family="${FONT}" font-size="27" font-weight="600" letter-spacing="4">DAILY PATROL No. <tspan fill="#aa8844">{{DAY}}</tspan></text>

  <text x="112" y="330" fill="#8a7a55" font-family="${FONT}" font-size="30" font-weight="600" letter-spacing="6">PILOT</text>
  <text x="112" y="392" fill="#fff7e0" font-family="${FONT}" font-size="56" font-weight="700">{{CALLSIGN}}</text>

  <text x="112" y="500" fill="#8a7a55" font-family="${FONT}" font-size="30" font-weight="600" letter-spacing="6">SCORE</text>
  <text x="112" y="616" fill="url(#gv)" font-family="${FONT}" font-size="132" font-weight="700">{{SCORE}}</text>

  <text x="112" y="712" fill="#8a7a55" font-family="${FONT}" font-size="30" font-weight="600" letter-spacing="6">SURVIVED</text>
  <text x="112" y="774" fill="#fff7e0" font-family="${FONT}" font-size="52" font-weight="600">{{TIME}}</text>

  <text x="112" y="872" fill="#8a7a55" font-family="${FONT}" font-size="30" font-weight="600" letter-spacing="6">TODAY'S MUTATOR</text>
  <text x="112" y="932" fill="#ff4455" font-family="${FONT}" font-size="48" font-weight="700" letter-spacing="2">{{MUTATOR}}</text>

  <g transform="translate(800,258)">
    <polygon points="${hex(96, 96, 96, Math.PI / 6)}" fill="none" stroke="#ffd700" stroke-width="7"/>
    <polygon points="${hex(96, 96, 74, Math.PI / 6)}" fill="#1a1208"/>
    <text x="96" y="86" text-anchor="middle" fill="#8a7a55" font-family="${FONT}" font-size="24" font-weight="600" letter-spacing="3">MEDAL</text>
    <text x="96" y="140" text-anchor="middle" fill="url(#gv)" font-family="${FONT}" font-size="38" font-weight="700">{{MEDAL}}</text>
  </g>
  <text x="968" y="966" text-anchor="end" fill="#8a7a55" font-family="${FONT}" font-size="30" font-weight="600" letter-spacing="3">surviveorion.com</text>
</svg>`);

console.log('badges/');

const MEDALS = [
  ['gold',   'Gold',   '#ffee88', '#ffd700', '#cc8800', '#1a1208'],
  ['silver', 'Silver', '#f2f2f6', '#d7d7d7', '#8a9aa8', '#151520'],
  ['copper', 'Copper', '#e0a878', '#cd7f32', '#8a5a24', '#1a1006'],
];
for (const [id, label, light, mid, dark, plate] of MEDALS) {
  write(`badges/orion-medal-${id}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" role="img" aria-label="ORION ${label} medal">
  <title>ORION ${label} medal</title>
  <defs>
    <linearGradient id="m" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0" stop-color="${light}"/><stop offset="0.55" stop-color="${mid}"/><stop offset="1" stop-color="${dark}"/>
    </linearGradient>
  </defs>
  <polygon points="${hex(100, 100, 92, Math.PI / 6)}" fill="url(#m)"/>
  <polygon points="${hex(100, 100, 74, Math.PI / 6)}" fill="${plate}"/>
  <g fill="none" stroke="url(#m)" stroke-width="9">
    <path d="M76.6 74.4 A29.6 29.6 0 0 1 123.4 74.4"/>
    <path d="M129 79 A29.6 29.6 0 0 1 129 121"/>
    <path d="M123.4 125.6 A29.6 29.6 0 0 1 76.6 125.6"/>
    <path d="M71 121 A29.6 29.6 0 0 1 71 79"/>
  </g>
  <circle cx="100" cy="100" r="12" fill="#c41e3a"/>
</svg>`);
}
