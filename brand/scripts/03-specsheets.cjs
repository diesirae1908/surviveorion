const fs = require('fs'), path = require('path');
const OUT = require('path').resolve(__dirname, '..', 'assets');
const write = (rel, body) => { const p = path.join(OUT, rel); fs.mkdirSync(path.dirname(p), {recursive:true}); fs.writeFileSync(p, body.trim()+'\n'); console.log('  '+rel); };
const FONT = "Rajdhani, 'Titillium Web', 'Segoe UI', system-ui, sans-serif";
const MARK = (s,c) => `<g fill="none" stroke="${s}" stroke-width="10">
      <path d="M26.71 21.25 A37 37 0 0 1 73.29 21.25"/><path d="M78.75 26.71 A37 37 0 0 1 78.75 73.29"/>
      <path d="M73.29 78.75 A37 37 0 0 1 26.71 78.75"/><path d="M21.25 73.29 A37 37 0 0 1 21.25 26.71"/>
    </g><circle cx="50" cy="50" r="15" fill="${c}"/>`;
const LP = {
  O:'M22 0 L56 0 L78 22 L78 78 L56 100 L22 100 L0 78 L0 22 Z M30 22 L48 22 L56 30 L56 70 L48 78 L30 78 L22 70 L22 30 Z',
  R:'M0 0 L56 0 L78 22 L78 38 L58 60 L78 100 L48 100 L28 60 L22 60 L22 100 L0 100 Z M22 20 L46 20 L56 30 L46 40 L22 40 Z',
  I:'M0 0 L22 0 L22 100 L0 100 Z',
  N:'M0 22 L22 0 L24 0 L56 58 L56 0 L78 0 L78 78 L56 100 L54 100 L22 42 L22 100 L0 100 Z' };
const WM = f => `<g fill="${f}" fill-rule="evenodd">` + [['O',0],['R',104],['I',203],['O',249],['N',353]]
  .map(([c,x])=>`<path transform="translate(${x},0)" d="${LP[c]}"/>`).join('') + `</g>`;
const GOLD = `<linearGradient id="g" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="#ffee88"/><stop offset="0.55" stop-color="#ffd700"/><stop offset="1" stop-color="#cc8800"/></linearGradient>`;
const GOLDV = `<linearGradient id="gv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffee88"/><stop offset="0.55" stop-color="#ffd700"/><stop offset="1" stop-color="#cc8800"/></linearGradient>`;
const CORE = `<radialGradient id="c" cx="0.38" cy="0.34" r="0.8"><stop offset="0" stop-color="#ff4455"/><stop offset="1" stop-color="#c41e3a"/></radialGradient>`;

console.log('logo/');
// ---- clearspace + minimum size spec -------------------------------------
const X = 38; // clearspace unit = diameter of the red core at lockup scale
write('logo/orion-clearspace.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 520" role="img" aria-label="ORION clearspace and minimum size">
  <title>ORION clearspace and minimum size</title>
  <defs>${GOLD}${GOLDV}${CORE}</defs>
  <rect width="900" height="520" fill="#0a0a12"/>
  <text x="60" y="48" fill="#ffd700" font-family="${FONT}" font-size="27" font-weight="700" letter-spacing="5">CLEARSPACE AND MINIMUM SIZE</text>
  <text x="60" y="82" fill="#8a7a55" font-family="${FONT}" font-size="21" font-weight="500">X = the diameter of the red core. Keep X clear on all four sides of every lockup.</text>

  <rect x="60" y="110" width="${603 + X * 2}" height="${128 + X * 2}" fill="none" stroke="#c41e3a" stroke-width="2" stroke-dasharray="9 7"/>
  <rect x="98" y="148" width="603" height="128" fill="none" stroke="#2a2a3a" stroke-width="1.5"/>
  <g transform="translate(98,148)"><g transform="scale(1.28)">${MARK('url(#g)', 'url(#c)')}</g><g transform="translate(172,14)">${WM('url(#gv)')}</g></g>
  <g stroke="#c41e3a" stroke-width="1.5">
    <line x1="60" y1="232" x2="98" y2="232"/><line x1="60" y1="226" x2="60" y2="238"/><line x1="98" y1="226" x2="98" y2="238"/>
    <line x1="440" y1="110" x2="440" y2="148"/><line x1="434" y1="110" x2="446" y2="110"/><line x1="434" y1="148" x2="446" y2="148"/>
  </g>
  <text x="79" y="222" text-anchor="middle" fill="#ff4455" font-family="${FONT}" font-size="21" font-weight="700">X</text>
  <text x="456" y="136" fill="#ff4455" font-family="${FONT}" font-size="21" font-weight="700">X</text>

  <g transform="translate(60,352)">
    <g transform="scale(0.199)"><g transform="scale(1.28)">${MARK('url(#g)', 'url(#c)')}</g><g transform="translate(172,14)">${WM('url(#gv)')}</g></g>
    <text x="0" y="54" fill="#8a7a55" font-family="${FONT}" font-size="17" font-weight="600">Horizontal lockup: min 120 px wide (30 mm in print)</text>
  </g>
  <g transform="translate(60,436)">
    <g transform="scale(0.24)">${MARK('url(#g)', 'url(#c)')}</g>
    <text x="0" y="54" fill="#8a7a55" font-family="${FONT}" font-size="17" font-weight="600">Mark: min 24 px. Smaller than that, use the solid-ring favicon.</text>
  </g>
</svg>`);

console.log('palette/');
// ---- palette swatch sheet ------------------------------------------------
const CORE_C = [['Void','#0a0a12'],['Deep Space','#12121e'],['Hull Line','#2a2a3a'],['Hull Gold','#ffd700'],['Flare','#ffee88'],['Ingot','#cc8800'],['Bronze','#aa8844'],['Dust','#8a7a55'],['Rising Red','#c41e3a'],['Alarm','#ff4455'],['Ash Red','#7a1020'],['Starlight','#fff7e0']];
const SIGNAL = [['Aegis Shield','#66ccff'],['Pulse Shot','#ffaa33'],['Magnet','#cc66ff'],['Afterburner','#ff6633'],['Cryo Field','#9fe8ff'],['Missile Swarm','#a8ff9e'],['Starshell','#ffd24d'],['Arc Lightning','#88eeff'],['Autocannon','#e8e8f8'],['Meteors','#ffce55'],['Vortex','#8877ff'],['Shockwave','#ffd700']];
const METAL = [['Gold','#ffd700'],['Silver','#d7d7d7'],['Copper','#cd7f32']];
const row = (items, y, cols = 6, w = 186, h = 116, gap = 14) => items.map((it, i) => {
  const [n, hexv] = it, cx = 60 + (i % cols) * (w + gap), cy = y + Math.floor(i / cols) * (h + 58);
  return `<g><rect x="${cx}" y="${cy}" width="${w}" height="${h}" rx="8" fill="${hexv}" stroke="#2a2a3a" stroke-width="1.5"/>
    <text x="${cx}" y="${cy + h + 26}" fill="#fff7e0" font-family="${FONT}" font-size="21" font-weight="600">${n}</text>
    <text x="${cx}" y="${cy + h + 48}" fill="#8a7a55" font-family="${FONT}" font-size="19" font-weight="500">${hexv}</text></g>`;
}).join('');
const head = (t, y) => `<text x="60" y="${y}" fill="#aa8844" font-family="${FONT}" font-size="24" font-weight="700" letter-spacing="5">${t}</text>`;
write('palette/orion-palette.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1300 1130" role="img" aria-label="ORION colour palette">
  <title>ORION colour palette</title>
  <rect width="1300" height="1130" fill="#0a0a12"/>
  <text x="60" y="76" fill="#ffd700" font-family="${FONT}" font-size="40" font-weight="700" letter-spacing="6">ORION PALETTE</text>
  ${head('CORE', 140)}${row(CORE_C, 164)}
  ${head('POWER SIGNALS  (functional, never decorative)', 540)}${row(SIGNAL, 564)}
  ${head('MEDAL METALS', 940)}${row(METAL, 964)}
</svg>`);
