// 전체 territory에 대해 castle이 몇 개 안에 들어가는지 시뮬레이션
const fs = require('fs');

// 1. 모든 타일에서 territory 로드
const tileFiles = fs.readdirSync('public/tiles').filter(f => f.endsWith('.json') && f !== 'index.json');
const allFeatures = [];
tileFiles.forEach(f => {
    const data = JSON.parse(fs.readFileSync('public/tiles/' + f, 'utf8'));
    (data.features || []).forEach(feat => allFeatures.push(feat));
});

// 중복 제거
const uniqueMap = new Map();
allFeatures.forEach(f => {
    const id = f.properties && (f.properties._id || f.properties.id);
    if (id && !uniqueMap.has(id)) uniqueMap.set(id, f);
});
const territories = Array.from(uniqueMap.values());
console.log(`고유 territory: ${territories.length}개`);

// 2. castles 로드
const castles = JSON.parse(fs.readFileSync('public/castles.json', 'utf8'));
const normalCastles = castles.filter(c => 
    !c.deleted && typeof c.lat === 'number' && typeof c.lng === 'number' &&
    !c.is_label && !c.is_natural_feature && !c.is_military_flag
);
console.log(`일반 성/도시: ${normalCastles.length}개`);

// 3. Point-in-Polygon 함수
function isPointInPolygon(point, polygon) {
    const [y, x] = point; // [lat, lng]
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [yi, xi] = polygon[i];
        const [yj, xj] = polygon[j];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) {
            inside = !inside;
        }
    }
    return inside;
}

// 4. 각 territory에 성이 몇 개 들어가는지 계산
let withCastles = 0;
let withoutCastles = 0;
const results = [];

territories.forEach(feat => {
    const geom = feat.geometry;
    if (!geom || !geom.coordinates) return;
    
    let polygons = [];
    if (geom.type === 'Polygon') {
        const coords = geom.coordinates[0].map(c => [c[1], c[0]]); // [lat, lng]
        polygons = [coords];
    } else if (geom.type === 'MultiPolygon') {
        polygons = geom.coordinates.map(poly => poly[0].map(c => [c[1], c[0]]));
    }
    
    if (polygons.length === 0) return;
    
    // bbox 계산
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    polygons.forEach(poly => {
        poly.forEach(([lat, lng]) => {
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
        });
    });
    
    let castleCount = 0;
    normalCastles.forEach(c => {
        if (c.lat < minLat || c.lat > maxLat || c.lng < minLng || c.lng > maxLng) return;
        for (const poly of polygons) {
            if (isPointInPolygon([c.lat, c.lng], poly)) {
                castleCount++;
                break;
            }
        }
    });
    
    if (castleCount > 0) withCastles++;
    else withoutCastles++;
    
    results.push({
        name: feat.properties.name,
        level: feat.properties.level,
        castles: castleCount,
        bbox: `${minLat.toFixed(1)},${minLng.toFixed(1)} ~ ${maxLat.toFixed(1)},${maxLng.toFixed(1)}`
    });
});

results.sort((a, b) => b.castles - a.castles);

console.log(`\n성이 있는 territory: ${withCastles}개`);
console.log(`성이 없는 territory: ${withoutCastles}개`);
console.log(`\n--- 성이 많은 territory TOP 20 ---`);
results.slice(0, 20).forEach(r => {
    console.log(`  ${r.name} (${r.level}): ${r.castles}성, bbox=${r.bbox}`);
});

console.log(`\n--- 성이 0인 territory 샘플 ---`);
const zeros = results.filter(r => r.castles === 0);
zeros.slice(0, 20).forEach(r => {
    console.log(`  ${r.name} (${r.level}): bbox=${r.bbox}`);
});
