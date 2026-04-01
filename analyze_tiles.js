const fs = require('fs');
const dir = './public/tiles/';
const files = fs.readdirSync(dir).filter(f => f.match(/^tile_.*\.json$/));
let totalFeatures = 0;
let missingCountryId = 0;
let sample = [];
let countryIdStats = {};

files.forEach(f => {
  const data = JSON.parse(fs.readFileSync(dir+f,'utf8'));
  const feats = data.features || [];
  totalFeatures += feats.length;
  feats.forEach(feat => {
    const p = feat.properties || {};
    const cid = p.country_id;
    if (!cid || cid === 'null') {
      missingCountryId++;
      if (sample.length < 8) sample.push({file: f, name: p.name, level: p.level, type: p.type, country_id: cid});
    } else {
      countryIdStats[cid] = (countryIdStats[cid] || 0) + 1;
    }
  });
});

console.log('총 tile 파일:', files.length);
console.log('총 features:', totalFeatures);
console.log('country_id 없음:', missingCountryId, '(' + ((missingCountryId/totalFeatures*100).toFixed(1)) + '%)');
console.log('country_id 있음:', totalFeatures - missingCountryId);
console.log('\n=== country_id 누락 샘플 ===');
sample.forEach(s => console.log(JSON.stringify(s)));
console.log('\n=== 상위 country_id (features 수) ===');
Object.entries(countryIdStats).sort((a,b)=>b[1]-a[1]).slice(0,10).forEach(([k,v]) => console.log(k, v));
