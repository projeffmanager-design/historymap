const fs = require('fs');
const raw = fs.readFileSync('public/castles.json', 'utf8');
const castles = JSON.parse(raw);
const active = castles.filter(c => !c.deleted && typeof c.lat === 'number' && typeof c.lng === 'number');
const labels = active.filter(c => c.is_label);
const natural = active.filter(c => c.is_natural_feature);
const military = active.filter(c => c.is_military_flag);
const normalCastles = active.filter(c => !c.is_label && !c.is_natural_feature && !c.is_military_flag);
const withCountry = normalCastles.filter(c => c.country_id || (c.history && c.history.length > 0 && c.history.some(h => h.country_id)));
console.log('전체 castles:', castles.length);
console.log('활성 (lat/lng 있음, 삭제 아닌):', active.length);
console.log('  라벨:', labels.length);
console.log('  자연지형:', natural.length);
console.log('  군사깃발:', military.length);
console.log('  일반 성/도시:', normalCastles.length);
console.log('  country_id 있는 일반 성:', withCountry.length);

// 위경도 분포 확인
const latMin = Math.min(...normalCastles.map(c => c.lat));
const latMax = Math.max(...normalCastles.map(c => c.lat));
const lngMin = Math.min(...normalCastles.map(c => c.lng));
const lngMax = Math.max(...normalCastles.map(c => c.lng));
console.log('\n일반 성/도시 좌표 범위:');
console.log(`  lat: ${latMin.toFixed(2)} ~ ${latMax.toFixed(2)}`);
console.log(`  lng: ${lngMin.toFixed(2)} ~ ${lngMax.toFixed(2)}`);

// 지역별 분포
const korea = normalCastles.filter(c => c.lat >= 33 && c.lat <= 43 && c.lng >= 124 && c.lng <= 132);
const china = normalCastles.filter(c => c.lat >= 18 && c.lat <= 54 && c.lng >= 73 && c.lng <= 135);
const japan = normalCastles.filter(c => c.lat >= 30 && c.lat <= 46 && c.lng >= 129 && c.lng <= 146);
console.log('\n지역별 대략 분포:');
console.log('  한반도:', korea.length);
console.log('  중국대륙:', china.length);
console.log('  일본:', japan.length);

// 타일과 매칭 테스트: 한반도 주변 territory에 성이 몇 개 들어가는지
const tileFiles = fs.readdirSync('public/tiles').filter(f => f.endsWith('.json') && f !== 'index.json');
let koreanTerritories = [];
tileFiles.forEach(f => {
    const data = JSON.parse(fs.readFileSync('public/tiles/' + f, 'utf8'));
    (data.features || []).forEach(feat => {
        const bbox = feat.properties && feat.properties.bbox;
        // 한반도 근처 territory
        if (feat.geometry && feat.geometry.coordinates) {
            const coords = feat.geometry.type === 'Polygon' ? feat.geometry.coordinates[0] : 
                          (feat.geometry.type === 'MultiPolygon' ? feat.geometry.coordinates[0][0] : null);
            if (coords) {
                const lats = coords.map(c => c[1]);
                const lngs = coords.map(c => c[0]);
                const cLat = (Math.min(...lats) + Math.max(...lats)) / 2;
                const cLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
                if (cLat >= 33 && cLat <= 43 && cLng >= 124 && cLng <= 132) {
                    koreanTerritories.push({
                        name: feat.properties.name,
                        center: [cLat.toFixed(2), cLng.toFixed(2)]
                    });
                }
            }
        }
    });
});
console.log('\n한반도 근처 territory:', koreanTerritories.length);
if (koreanTerritories.length > 0) {
    koreanTerritories.slice(0, 10).forEach(t => console.log('  ', t.name, t.center));
}
