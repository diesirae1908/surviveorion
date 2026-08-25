// Social video templates: YouTube thumbnail overlay (1280x720) and a
// vertical cover / end-card (1080x1920) for TikTok + Reels + Shorts.
// {{TOKEN}} slots are plain string replaces, same convention as the share card.
const fs = require('fs'), path = require('path');
const OUT = require('path').resolve(__dirname, '..', 'assets');
const write = (rel, body) => { const p = path.join(OUT, rel); fs.mkdirSync(path.dirname(p), {recursive:true}); fs.writeFileSync(p, body.trim()+'\n'); console.log('  '+rel); };
const FONT = "Rajdhani, 'Titillium Web', 'Segoe UI', system-ui, sans-serif";

const rng = (s) => () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
function starfield(w,h,n,seed,maxR=1.9){const r=rng(seed);let o='';for(let i=0;i<n;i++){o+=`<circle cx="${(r()*w).toFixed(1)}" cy="${(r()*h).toFixed(1)}" r="${(0.5+r()*maxR).toFixed(2)}" fill="#fff7e0" opacity="${(0.18+r()*0.5).toFixed(2)}"/>`}return o}
function hex(cx,cy,r,rot=0){const p=[];for(let i=0;i<6;i++){const a=Math.PI/3*i+rot;p.push(`${(cx+Math.cos(a)*r).toFixed(1)},${(cy+Math.sin(a)*r).toFixed(1)}`)}return p.join(' ')}
function swarm(x0,x1,y0,y1,n,seed){const r=rng(seed);let o='';for(let i=0;i<n;i++){const t=r();const x=x0+(x1-x0)*Math.pow(r(),0.6);const y=y0+(y1-y0)*r();const rad=5+t*13;const op=(0.25+0.6*((x-x0)/(x1-x0))).toFixed(2);
o+=`<polygon points="${hex(x,y,rad,r()*1.05)}" fill="none" stroke="#ff4455" stroke-width="2.4" opacity="${op}"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(rad*0.28).toFixed(1)}" fill="#c41e3a" opacity="${op}"/>`}return o}
const MARK = (s,c)=>`<g fill="none" stroke="${s}" stroke-width="10"><path d="M26.71 21.25 A37 37 0 0 1 73.29 21.25"/><path d="M78.75 26.71 A37 37 0 0 1 78.75 73.29"/><path d="M73.29 78.75 A37 37 0 0 1 26.71 78.75"/><path d="M21.25 73.29 A37 37 0 0 1 21.25 26.71"/></g><circle cx="50" cy="50" r="15" fill="${c}"/>`;
const GOLD=`<linearGradient id="g" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="#ffee88"/><stop offset="0.55" stop-color="#ffd700"/><stop offset="1" stop-color="#cc8800"/></linearGradient>`;
const GOLDV=`<linearGradient id="gv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffee88"/><stop offset="0.55" stop-color="#ffd700"/><stop offset="1" stop-color="#cc8800"/></linearGradient>`;
const CORE=`<radialGradient id="c" cx="0.38" cy="0.34" r="0.8"><stop offset="0" stop-color="#ff4455"/><stop offset="1" stop-color="#c41e3a"/></radialGradient>`;

console.log('social/');

// ---- YouTube thumbnail, 1280x720. The gameplay still goes UNDER this overlay
// (layer it in ffmpeg/canvas); the placeholder rect previews the composition.
write('social/orion-thumbnail-template.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" role="img" aria-label="ORION video thumbnail template">
  <title>ORION thumbnail template (1280x720): overlay over a gameplay still</title>
  <defs>${GOLD}${GOLDV}${CORE}
    <linearGradient id="scrim" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#0a0a12" stop-opacity="0.94"/>
      <stop offset="0.46" stop-color="#0a0a12" stop-opacity="0.82"/>
      <stop offset="0.72" stop-color="#0a0a12" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <!-- gameplay still goes here; this rect is the placeholder -->
  <rect width="1280" height="720" fill="#12121e"/>
  <g>${starfield(1280,720,60,19,2.2)}</g>
  <rect width="1280" height="720" fill="url(#scrim)"/>
  <g>${swarm(1010,1280,20,700,26,63)}</g>
  <rect x="14" y="14" width="1252" height="692" rx="10" fill="none" stroke="#2a2a3a" stroke-width="4"/>
  <g transform="translate(64,58) scale(0.94)">${MARK('url(#g)','url(#c)')}</g>
  <text x="184" y="124" fill="#aa8844" font-family="${FONT}" font-size="40" font-weight="600" letter-spacing="8">ORION</text>
  <text x="64" y="330" fill="#fff7e0" font-family="${FONT}" font-size="110" font-weight="700" letter-spacing="2">{{TITLE_LINE1}}</text>
  <text x="64" y="448" fill="url(#gv)" font-family="${FONT}" font-size="110" font-weight="700" letter-spacing="2">{{TITLE_LINE2}}</text>
  <g transform="translate(64,530)">
    <rect x="0" y="0" width="420" height="76" rx="6" fill="#c41e3a"/>
    <text x="210" y="52" text-anchor="middle" fill="#fff7e0" font-family="${FONT}" font-size="40" font-weight="700" letter-spacing="4">{{TAG}}</text>
  </g>
  <text x="64" y="672" fill="#8a7a55" font-family="${FONT}" font-size="34" font-weight="600" letter-spacing="2">surviveorion.com</text>
</svg>`);

// ---- Vertical cover / end-card, 1080x1920 (TikTok, Reels, Shorts).
// Safe zones respected: nothing in the top 220px or bottom 320px.
write('social/orion-cover-vertical-template.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920" role="img" aria-label="ORION vertical cover template">
  <title>ORION vertical cover template (1080x1920) for TikTok, Reels, Shorts</title>
  <defs>${GOLD}${GOLDV}${CORE}
    <radialGradient id="sp" cx="0.5" cy="0.42" r="0.85"><stop offset="0" stop-color="#12121e"/><stop offset="1" stop-color="#0a0a12"/></radialGradient>
    <filter id="glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="12" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="1080" height="1920" fill="url(#sp)"/>
  <g>${starfield(1080,1920,140,47)}</g>
  <g>${swarm(760,1080,1150,1920,30,29)}</g>
  <g transform="translate(415,320) scale(2.5)" filter="url(#glow)">${MARK('url(#g)','url(#c)')}</g>
  <text x="540" y="700" text-anchor="middle" fill="#aa8844" font-family="${FONT}" font-size="52" font-weight="600" letter-spacing="14">ORION</text>
  <text x="540" y="900" text-anchor="middle" fill="#fff7e0" font-family="${FONT}" font-size="96" font-weight="700" letter-spacing="2">{{HOOK_LINE1}}</text>
  <text x="540" y="1040" text-anchor="middle" fill="url(#gv)" font-family="${FONT}" font-size="96" font-weight="700" letter-spacing="2">{{HOOK_LINE2}}</text>
  <g transform="translate(330,1180)">
    <rect x="0" y="0" width="420" height="84" rx="6" fill="none" stroke="#ffd700" stroke-width="3"/>
    <text x="210" y="56" text-anchor="middle" fill="#ffd700" font-family="${FONT}" font-size="42" font-weight="700" letter-spacing="4">{{TAG}}</text>
  </g>
  <text x="540" y="1500" text-anchor="middle" fill="#8a7a55" font-family="${FONT}" font-size="40" font-weight="600" letter-spacing="3">free &#183; in your browser &#183; no install</text>
  <text x="540" y="1560" text-anchor="middle" fill="#ccaa66" font-family="${FONT}" font-size="44" font-weight="700" letter-spacing="2">surviveorion.com</text>
</svg>`);
