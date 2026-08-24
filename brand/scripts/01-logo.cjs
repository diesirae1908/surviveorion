const fs = require('fs');
const path = require('path');
const OUT = require('path').resolve(__dirname, '..', 'assets');

// ---------------------------------------------------------------- geometry
const WM_W = 431, CAP = 100;
const L = {
  O: 'M22 0 L56 0 L78 22 L78 78 L56 100 L22 100 L0 78 L0 22 Z M30 22 L48 22 L56 30 L56 70 L48 78 L30 78 L22 70 L22 30 Z',
  R: 'M0 0 L56 0 L78 22 L78 38 L58 60 L78 100 L48 100 L28 60 L22 60 L22 100 L0 100 Z M22 20 L46 20 L56 30 L46 40 L22 40 Z',
  I: 'M0 0 L22 0 L22 100 L0 100 Z',
  N: 'M0 22 L22 0 L24 0 L56 58 L56 0 L78 0 L78 78 L56 100 L54 100 L22 42 L22 100 L0 100 Z',
};
const LETTERS = [['O',0],['R',104],['I',203],['O',249],['N',353]];

const wordmarkPaths = (fill, idp) =>
  `<g fill="${fill}" fill-rule="evenodd">\n` +
  LETTERS.map(([c,x]) => `    <path transform="translate(${x},0)" d="${L[c]}"/>`).join('\n') +
  `\n  </g>`;

const markPaths = (stroke, coreFill) => `<g fill="none" stroke="${stroke}" stroke-width="10">
    <path d="M26.71 21.25 A37 37 0 0 1 73.29 21.25"/>
    <path d="M78.75 26.71 A37 37 0 0 1 78.75 73.29"/>
    <path d="M73.29 78.75 A37 37 0 0 1 26.71 78.75"/>
    <path d="M21.25 73.29 A37 37 0 0 1 21.25 26.71"/>
  </g>
  <circle cx="50" cy="50" r="15" fill="${coreFill}"/>`;

const goldGrad = (id, x2 = 0, y2 = 1) => `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">
      <stop offset="0" stop-color="#ffee88"/><stop offset="0.55" stop-color="#ffd700"/><stop offset="1" stop-color="#cc8800"/>
    </linearGradient>`;
const coreGrad = (id) => `<radialGradient id="${id}" cx="0.38" cy="0.34" r="0.8">
      <stop offset="0" stop-color="#ff4455"/><stop offset="1" stop-color="#c41e3a"/>
    </radialGradient>`;

function write(rel, body) {
  const p = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body.trim() + '\n');
  console.log('  ' + rel);
}
const svg = (vb, title, defs, body, extra = '') =>
`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"${extra} role="img" aria-label="${title}">
  <title>${title}</title>
  ${defs ? `<defs>\n    ${defs}\n  </defs>` : ''}
  ${body}
</svg>`;

// ---------------------------------------------------------------- variants
// [suffix, wordmark fill, mark stroke, core fill, needs gold defs, needs core defs]
const VARIANTS = [
  ['',              'url(#og)', 'url(#og)', 'url(#oc)', true,  true ],
  ['-gold',         '#ffd700',  '#ffd700',  '#c41e3a',  false, false],
  ['-mono-white',   '#fff7e0',  '#fff7e0',  '#fff7e0',  false, false],
  ['-mono-black',   '#0a0a12',  '#0a0a12',  '#0a0a12',  false, false],
];

console.log('logo/');
for (const [sfx, wf, ms, cf, gd, cd] of VARIANTS) {
  const defs = [gd ? goldGrad('og', 0.35, 1) : '', cd ? coreGrad('oc') : ''].filter(Boolean).join('\n    ');

  // mark alone
  write(`logo/orion-mark${sfx}.svg`, svg('0 0 100 100', 'ORION mark', defs, markPaths(ms, cf)));

  // wordmark alone
  const wmDefs = gd ? goldGrad('og', 0, 1) : '';
  write(`logo/orion-wordmark${sfx}.svg`, svg(`0 0 ${WM_W} ${CAP}`, 'ORION wordmark', wmDefs, wordmarkPaths(wf)));

  // horizontal lockup: mark 128, gap 44, wordmark cap 100
  write(`logo/orion-logo-horizontal${sfx}.svg`, svg('0 0 603 128', 'ORION logo, horizontal lockup', defs,
`<g transform="translate(0,0) scale(1.28)">${markPaths(ms, cf)}</g>
  <g transform="translate(172,14)">${wordmarkPaths(wf)}</g>`));

  // stacked lockup: mark 150, gap 36, wordmark width 380 (scale .8817)
  write(`logo/orion-logo-stacked${sfx}.svg`, svg('0 0 380 274', 'ORION logo, stacked lockup', defs,
`<g transform="translate(115,0) scale(1.5)">${markPaths(ms, cf)}</g>
  <g transform="translate(0,186) scale(0.8817)">${wordmarkPaths(wf)}</g>`));

  // stacked + tagline
  const tagFill = sfx === '-mono-black' ? '#0a0a12' : (sfx === '-mono-white' ? '#fff7e0' : '#aa8844');
  write(`logo/orion-logo-stacked-tagline${sfx}.svg`, svg('0 0 380 330', 'ORION logo with tagline', defs,
`<g transform="translate(115,0) scale(1.5)">${markPaths(ms, cf)}</g>
  <g transform="translate(0,186) scale(0.8817)">${wordmarkPaths(wf)}</g>
  <text x="190" y="318" text-anchor="middle" fill="${tagFill}"
    font-family="Rajdhani, 'Titillium Web', 'Segoe UI', system-ui, sans-serif"
    font-size="26" font-weight="600" textLength="336" lengthAdjust="spacing">SURVIVE THE SWARM</text>`));
}
