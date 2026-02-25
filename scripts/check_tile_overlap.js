// 타일 파일에서 겹치는 영토 탐지
const fs = require('fs');
const path = require('path');

const tilesDir = './public/tiles';
const idx = JSON.parse(fs.readFileSync(path.join(tilesDir, 'index.json'), 'utf8'));
console.log('타일 수:', idx.length);
console.log('첫 항목 키:', Object.keys(idx[0]));

// 타일 파일명 패턴 확인
const files = fs.readdirSync(tilesDir).filter(f => f.endsWith('.json') && f !== 'index.json');
console.log('타일 파일 수:', files.length, '/ 첫 3개:', files.slice(0,3));

const names = new Set();
const nameToTiles = {};   // name → [tile, tile, ...]
let featureCount = 0;

for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(tilesDir, file), 'utf8'));
    if (data.features) {
        data.features.forEach(f => {
            const name = f.properties?.name || 'unknown';
            names.add(name);
            if (!nameToTiles[name]) nameToTiles[name] = [];
            nameToTiles[name].push(file);
            featureCount++;
        });
    }
}
console.log('\n총 features:', featureCount, '/ 고유 영토:', names.size);

// 삭제 대상 province 잔존 확인
const deleted = ['Jilin','Liaoning','Guangxi','Guangdong','Fujian','Zhejiang',
    'Jiangsu','Shandong','Hebei','Sichuan','Hunan','Shaanxi','Shanxi','Jiangxi',
    'Henan','Hubei','Anhui','North Korea'];
const found = deleted.filter(n => names.has(n));
console.log('\n=== 삭제 대상 province 잔존 확인 ===');
console.log(found.length ? '❌ 아직 남아있음: ' + found.join(', ') : '✅ 모두 제거됨');

// 같은 이름의 feature가 여러 타일에 나타나는 것 분석 (겹침 후보)
console.log('\n=== 여러 타일에 나타나는 영토 (상위 20개) ===');
const multi = Object.entries(nameToTiles)
    .map(([name, tiles]) => ({ name, count: tiles.length }))
    .sort((a,b) => b.count - a.count);
multi.slice(0,20).forEach(m => console.log(`  ${m.name}: ${m.count}개 타일`));

// province/city 겹침 탐지: bbox 기반
console.log('\n=== 타일 내 bbox 겹침 탐지 ===');
let overlapCount = 0;
for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(tilesDir, file), 'utf8'));
    if (!data.features || data.features.length < 2) continue;
    
    const feats = data.features.map(f => {
        const coords = f.geometry?.coordinates;
        if (!coords) return null;
        let minLat=999, maxLat=-999, minLng=999, maxLng=-999;
        const flat = JSON.stringify(coords);
        const nums = flat.match(/-?\d+\.?\d*/g);
        if (!nums) return null;
        for (let i = 0; i < nums.length - 1; i += 2) {
            const lng = parseFloat(nums[i]);
            const lat = parseFloat(nums[i+1]);
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
        }
        return { name: f.properties?.name, minLat, maxLat, minLng, maxLng,
                 area: (maxLng-minLng)*(maxLat-minLat) };
    }).filter(Boolean);
    
    // 큰 영토가 작은 영토를 완전 포함하는지
    for (let i = 0; i < feats.length; i++) {
        for (let j = 0; j < feats.length; j++) {
            if (i === j) continue;
            const big = feats[i], small = feats[j];
            if (big.area <= small.area) continue;
            if (small.minLat >= big.minLat && small.maxLat <= big.maxLat &&
                small.minLng >= big.minLng && small.maxLng <= big.maxLng) {
                if (overlapCount < 30) {
                    console.log(`  ❌ ${big.name} (area=${big.area.toFixed(1)}) 포함 → ${small.name} (area=${small.area.toFixed(1)}) [${file}]`);
                }
                overlapCount++;
            }
        }
    }
}
console.log(`\n총 겹침 쌍: ${overlapCount}개`);
