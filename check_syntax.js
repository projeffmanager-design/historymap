const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

// 가장 큰 <script> 블록 찾기 (src 없는 inline 블록들)
const blocks = [];
let pos = 0;
while (true) {
  const s = html.indexOf('<script>', pos);
  if (s === -1) break;
  const e = html.indexOf('</script>', s);
  if (e === -1) break;
  blocks.push({ start: s + 8, end: e, htmlLine: html.slice(0, s + 8).split('\n').length });
  pos = e + 9;
}

console.log('Found', blocks.length, 'inline script blocks');

for (const block of blocks) {
  const content = html.slice(block.start, block.end);
  if (content.trim().length < 100) continue; // skip tiny blocks
  try {
    new Function(content);
  } catch(e) {
    console.log('\n=== SYNTAX ERROR in block starting at HTML line', block.htmlLine, '===');
    console.log('Error:', e.message);
    
    // Binary search within this block
    const lines = content.split('\n');
    let lo = 0, hi = lines.length;
    while (hi - lo > 3) {
      const mid = Math.floor((lo + hi) / 2);
      try { new Function(lines.slice(0, mid).join('\n')); lo = mid; }
      catch(e2) { hi = mid; }
    }
    console.log('Error near block-relative lines', lo, '-', hi);
    for (let i = Math.max(0, lo - 3); i < Math.min(lines.length, hi + 3); i++) {
      const htmlLine = block.htmlLine + i - 1;
      console.log('[HTML:' + htmlLine + '] ' + lines[i].substring(0, 130));
    }
  }
}
