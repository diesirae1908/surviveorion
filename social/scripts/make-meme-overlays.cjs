// Meme overlay kit for orion-social. Original assets in the classic formats:
// impact-style text cards (Anton, OFL licence), a hand-wobble red circle, a red
// arrow, a REPLAY tag, an edge vignette. All transparent PNGs at 1000px wide,
// rendered via headless Chromium (needs playwright + NODE_PATH to global modules).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const OUT = path.resolve(__dirname, '../assets/memes');
fs.mkdirSync(OUT, { recursive: true });

// Classic meme text: white, heavy black stroke, subtle shadow. Anton ~ Impact, OFL.
const card = (lines, size = 130) => `<div class="card" style="font-size:${size}px">${
  lines.map(l => `<div>${l}</div>`).join('')}</div>`;

const CARDS = [
  ['at-this-moment',  card(['AT THIS MOMENT'], 118)],
  ['he-knew',         card(['HE KNEW HE', 'F&#42;CKED UP'], 118)],
  ['wait-for-it',     card(['WAIT FOR IT'], 130)],
  ['bro-thought',     card(['BRO THOUGHT', 'HE HAD IT'], 118)],
  ['skill-issue',     card(['SKILL ISSUE'], 130)],
  ['rip',             card(['RIP'], 210)],
  ['clean',           card(['CLEAN.'], 170)],
  ['how',             card(['HOW.'], 190)],
  ['could-you',       card(['COULD YOU', 'DODGE THIS?'], 118)],
  ['one-pixel',       card(['ONE PIXEL.'], 140)],
  ['undefeated',      card(['THE DAILY PATROL', 'IS UNDEFEATED'], 96)],
  ['nah-hes-gone',    card(['NAH, HE&#8217;S GONE'], 118)],
];

// red circle: 3 slightly-off ellipse passes = hand-drawn wobble
const circle = `<svg width="1000" height="1000" viewBox="0 0 1000 1000" xmlns="http://www.w3.org/2000/svg">
  <g fill="none" stroke="#ff1f33" stroke-width="26" stroke-linecap="round" opacity="0.95">
    <ellipse cx="500" cy="500" rx="430" ry="400" transform="rotate(-4 500 500)"/>
    <ellipse cx="505" cy="492" rx="418" ry="412" transform="rotate(3 500 500)" stroke-width="18" opacity="0.8"/>
    <path d="M 120 560 Q 90 430 210 300" stroke-width="16" opacity="0.65"/>
  </g></svg>`;
const arrow = `<svg width="1000" height="600" viewBox="0 0 1000 600" xmlns="http://www.w3.org/2000/svg">
  <g fill="none" stroke="#ff1f33" stroke-width="42" stroke-linecap="round" stroke-linejoin="round">
    <path d="M 80 520 Q 420 470 780 220"/>
    <path d="M 640 180 L 800 205 L 745 360" fill="none"/>
  </g></svg>`;
const replayTag = `<div style="display:inline-flex;align-items:center;gap:18px;background:#ff1f33;color:#fff;
  font-family:Anton,sans-serif;font-size:84px;letter-spacing:4px;padding:14px 44px 18px;border-radius:12px;
  transform:rotate(-3deg)">&#9654; REPLAY</div>`;
const vignette = `<svg width="1080" height="1920" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">
  <defs><radialGradient id="v" cx="0.5" cy="0.5" r="0.72">
    <stop offset="0.62" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.55"/>
  </radialGradient></defs><rect width="1080" height="1920" fill="url(#v)"/></svg>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 1 });
  const fontB64 = fs.readFileSync(path.join(__dirname, '../assets/brand/fonts/Anton-Regular.ttf')).toString('base64');
  const shell = (body) => `<!doctype html><html><head>
    <style>
      @font-face{font-family:Anton;src:url(data:font/ttf;base64,${fontB64}) format('truetype')}
      body{margin:0;background:transparent}
      #w{display:inline-block;padding:30px}
      .card{font-family:Anton,'Arial Black',sans-serif;color:#fff;text-align:center;line-height:1.04;
        letter-spacing:2px;
        text-shadow:0 6px 22px rgba(0,0,0,.55);
        -webkit-text-stroke:0; paint-order:stroke fill;}
      .card div{ -webkit-text-stroke:10px #000; paint-order:stroke fill; }
    </style></head><body><div id="w">${body}</div></body></html>`;
  const shoot = async (name, body) => {
    await page.setContent(shell(body), { waitUntil: 'load' });
    try { await page.evaluate(() => document.fonts.ready); } catch (e) {}
    await page.waitForTimeout(150);
    const el = await page.$('#w');
    await el.screenshot({ path: path.join(OUT, name + '.png'), omitBackground: true });
    console.log('  ' + name + '.png');
  };
  const only = process.argv[2];
  for (const [name, body] of CARDS) if (!only || only === name) await shoot(name, body);
  if (only && !['red-circle','red-arrow','replay-tag','vignette-1080x1920'].includes(only) && !CARDS.find(c=>c[0]===only)) console.log('unknown: '+only);
  await shoot('red-circle', circle);
  await shoot('red-arrow', arrow);
  await shoot('replay-tag', replayTag);
  await shoot('vignette-1080x1920', vignette);
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'LICENSE.md'),
    'Original overlays for orion-social. Text set in Anton (SIL OFL, Google Fonts). Drawn shapes original. Free to use in ORION content.\n');
})();
