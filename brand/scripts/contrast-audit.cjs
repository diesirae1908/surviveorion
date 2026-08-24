const lin = c => { c/=255; return c<=0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055,2.4); };
const L = h => { const n=parseInt(h.slice(1),16); return 0.2126*lin(n>>16&255)+0.7152*lin(n>>8&255)+0.0722*lin(n&255); };
const cr = (a,b) => { const x=L(a),y=L(b); const [hi,lo]=x>y?[x,y]:[y,x]; return (hi+0.05)/(lo+0.05); };
const VOID='#0a0a12', DEEP='#12121e', STAR='#fff7e0';
const fg = { 'Starlight #fff7e0':'#fff7e0','Hull Gold #ffd700':'#ffd700','Flare #ffee88':'#ffee88','Ingot #cc8800':'#cc8800','Bronze #aa8844':'#aa8844','Dust #8a7a55':'#8a7a55','Rising Red #c41e3a':'#c41e3a','Alarm #ff4455':'#ff4455','Shield #66ccff':'#66ccff','Silver #d7d7d7':'#d7d7d7','Copper #cd7f32':'#cd7f32' };
const rate = r => r>=7 ? 'AAA' : r>=4.5 ? 'AA' : r>=3 ? 'AA large only' : 'FAIL';
console.log('foreground'.padEnd(22), 'on Void'.padEnd(9), 'rating'.padEnd(15), 'on Deep Space');
for (const [k,v] of Object.entries(fg)) {
  const a=cr(v,VOID), b=cr(v,DEEP);
  console.log(k.padEnd(22), a.toFixed(2).padEnd(9), rate(a).padEnd(15), b.toFixed(2)+'  '+rate(b));
}
console.log('\nOn light (Starlight #fff7e0):');
for (const [k,v] of Object.entries({'Void #0a0a12':'#0a0a12','Rising Red #c41e3a':'#c41e3a','Ingot #cc8800':'#cc8800','Hull Gold #ffd700':'#ffd700','Bronze #aa8844':'#aa8844'})) {
  const a=cr(v,STAR); console.log(' ', k.padEnd(22), a.toFixed(2).padEnd(8), rate(a));
}
