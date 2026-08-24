const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = require('path').resolve(__dirname, '..', 'assets');
// [svg, out, width, transparent]
const JOBS = [
  ['icon/orion-app-icon.svg',            'icon/png/orion-app-icon-1024.png', 1024, false],
  ['icon/orion-app-icon.svg',            'icon/png/orion-app-icon-512.png',   512, false],
  ['icon/orion-app-icon.svg',            'icon/png/orion-app-icon-192.png',   192, false],
  ['icon/orion-app-icon.svg',            'icon/png/orion-app-icon-180.png',   180, false],
  ['icon/orion-app-icon-maskable.svg',   'icon/png/orion-app-icon-maskable-512.png', 512, false],
  ['icon/orion-favicon-tile.svg',        'icon/png/orion-favicon-32.png',      32, false],
  ['icon/orion-favicon-tile.svg',        'icon/png/orion-favicon-180.png',    180, false],
  ['social/orion-og.svg',                'social/png/orion-og-1200x630.png', 1200, false],
  ['social/orion-header-1500x500.svg',   'social/png/orion-header-1500x500.png', 1500, false],
  ['social/orion-share-card-template.svg','social/png/orion-share-card-1080.png', 1080, false],
  ['logo/orion-logo-horizontal.svg',     'logo/png/orion-logo-horizontal-1600.png', 1600, true],
  ['logo/orion-logo-horizontal-mono-white.svg', 'logo/png/orion-logo-horizontal-mono-white-1600.png', 1600, true],
  ['logo/orion-logo-horizontal-mono-black.svg', 'logo/png/orion-logo-horizontal-mono-black-1600.png', 1600, true],
  ['logo/orion-logo-stacked-tagline.svg','logo/png/orion-logo-stacked-tagline-1000.png', 1000, true],
  ['logo/orion-wordmark.svg',            'logo/png/orion-wordmark-1600.png', 1600, true],
  ['logo/orion-mark.svg',                'logo/png/orion-mark-512.png',       512, true],
  ['badges/orion-medal-gold.svg',        'badges/png/orion-medal-gold-400.png',   400, true],
  ['badges/orion-medal-silver.svg',      'badges/png/orion-medal-silver-400.png', 400, true],
  ['badges/orion-medal-copper.svg',      'badges/png/orion-medal-copper-400.png', 400, true],
  ['palette/orion-palette.svg',          'palette/png/orion-palette.png',    1300, false],
  ['logo/orion-clearspace.svg',          'logo/png/orion-clearspace.png',     900, false],
];
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.setContent(`<!doctype html><html><head>
    <link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&display=swap" rel="stylesheet">
    </head><body style="margin:0"><div id="wrap"></div></body></html>`);
  try { await page.evaluate(() => document.fonts.ready); } catch (e) {}
  for (const [src, out, w, transparent] of JOBS) {
    const svg = fs.readFileSync(path.join(ROOT, src), 'utf8')
      .replace(/<svg /, `<svg style="width:${w}px;height:auto;display:block" `);
    await page.evaluate(([html, bg]) => {
      document.body.style.background = bg;
      document.getElementById('wrap').innerHTML = html;
    }, [svg, transparent ? 'transparent' : '#0a0a12']);
    await page.waitForTimeout(180);
    const dest = path.join(ROOT, out);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    await (await page.$('#wrap svg')).screenshot({ path: dest, omitBackground: transparent });
    console.log('  ' + out);
  }
  await browser.close();
})();
