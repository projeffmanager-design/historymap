/**
 * simulate_rendering.js - 3-pass 렌더링 시뮬레이션 (산동/제주)
 * 특정 연도에서 어떤 영토가 렌더링되는지 확인
 */
const { MongoClient } = require('mongodb');

async function main() {
    const client = new MongoClient('mongodb://localhost:27017');
    await client.connect();
    const db = client.db('koreahistory');
    
    const year = 401;
    const month = 1;
    
    // 영토 전체
    const territories = await db.collection('territories').find({}).toArray();
    const castles = await db.collection('castle').find({}).toArray();
    const countries = await db.collection('countries').find({}).toArray();
    
    console.log(`=== 시뮬레이션: ${year}년 ${month}월 ===`);
    console.log(`영토: ${territories.length}개, 성: ${castles.length}개, 국가: ${countries.length}개`);
    
    // calculateDominantCountry 간단 시뮬레이션
    function simulateDominant(territory) {
        if (!territory.bbox) return null;
        const tBbox = territory.bbox;
        
        // bbox 안의 성 찾기
        const inCastles = castles.filter(c => {
            if (!c.lat || !c.lng) return false;
            return c.lat >= tBbox.minLat && c.lat <= tBbox.maxLat &&
                   c.lng >= tBbox.minLng && c.lng <= tBbox.maxLng;
        });
        
        if (inCastles.length === 0) return null;
        
        // 해당 시점에 활성인 성만 필터
        const activeCastles = inCastles.filter(c => {
            const startY = c.start || c.start_year || -5000;
            const endY = c.end || c.end_year || 3000;
            return year >= startY && year <= endY;
        });
        
        if (activeCastles.length === 0) return null;
        
        // 국가별 성 수
        const countryMap = {};
        activeCastles.forEach(c => {
            if (c.country_id) {
                countryMap[c.country_id] = (countryMap[c.country_id] || 0) + 1;
            }
        });
        
        const countryIds = Object.keys(countryMap);
        if (countryIds.length === 0) return null;
        
        // 가장 많은 성을 가진 국가
        countryIds.sort((a, b) => countryMap[b] - countryMap[a]);
        
        return {
            countryId: countryIds[0],
            countriesInZone: countryIds,
            totalCastles: activeCastles.length,
            countryBreakdown: countryMap
        };
    }
    
    // 산동 영역 영토 추출
    const shandongTerritories = territories.filter(t => {
        if (!t.bbox) return false;
        const lat = (t.bbox.minLat + t.bbox.maxLat) / 2;
        const lng = (t.bbox.minLng + t.bbox.maxLng) / 2;
        return lat >= 33 && lat <= 39 && lng >= 114 && lng <= 123;
    });
    
    console.log(`\n산동 영역 영토: ${shandongTerritories.length}개`);
    
    // province 먼저
    const provinces = shandongTerritories.filter(t => t.level === 'province');
    const cities = shandongTerritories.filter(t => t.level === 'city');
    
    console.log(`  province: ${provinces.length}개, city: ${cities.length}개`);
    
    // PASS 1: province 분석
    console.log('\n=== PASS 1: province ===');
    const provinceStatus = new Map();
    
    for (const prov of provinces) {
        const result = simulateDominant(prov);
        if (!result) {
            provinceStatus.set(prov.name, 'empty');
            console.log(`  ${prov.name}: empty (성 없음)`);
            continue;
        }
        
        if (result.countriesInZone.length > 1) {
            provinceStatus.set(prov.name, 'city_only');
            console.log(`  ${prov.name}: city_only (${result.countriesInZone.length}개 국가 혼재, 성 ${result.totalCastles}개)`);
        } else {
            provinceStatus.set(prov.name, 'painted');
            const countryInfo = countries.find(c => c._id.toString() === result.countryId);
            console.log(`  ${prov.name}: painted → ${countryInfo?.name || result.countryId} (성 ${result.totalCastles}개)`);
        }
    }
    
    // PASS 2: city 분석
    console.log('\n=== PASS 2: city ===');
    for (const city of cities) {
        // 상위 province 찾기
        const cLat = (city.bbox.minLat + city.bbox.maxLat) / 2;
        const cLng = (city.bbox.minLng + city.bbox.maxLng) / 2;
        
        const parentProv = provinces.find(prov => {
            return cLat >= prov.bbox.minLat && cLat <= prov.bbox.maxLat &&
                   cLng >= prov.bbox.minLng && cLng <= prov.bbox.maxLng;
        });
        
        const parentStatus = parentProv ? provinceStatus.get(parentProv.name) : 'none';
        
        if (parentStatus === 'painted') {
            console.log(`  ${city.name}: SKIP (상위 ${parentProv.name}이 painted)`);
            continue;
        }
        
        const result = simulateDominant(city);
        if (!result) {
            console.log(`  ${city.name}: 성 없음 → 미색칠 (상위: ${parentProv?.name || '없음'} ${parentStatus})`);
            continue;
        }
        
        const countryInfo = countries.find(c => c._id.toString() === result.countryId);
        console.log(`  ${city.name}: 색칠 → ${countryInfo?.name || result.countryId} (성 ${result.totalCastles}개, 상위: ${parentProv?.name || '없음'} ${parentStatus})`);
    }
    
    // 제주
    console.log('\n=== 제주 ===');
    const jeju = territories.find(t => t.name === '제주특별자치도');
    if (jeju) {
        const result = simulateDominant(jeju);
        if (result) {
            const countryInfo = countries.find(c => c._id.toString() === result.countryId);
            console.log(`제주: ${countryInfo?.name || result.countryId} (성 ${result.totalCastles}개, 국가수: ${result.countriesInZone.length})`);
        } else {
            console.log('제주: 성 없음');
        }
    }
    
    await client.close();
}

main().catch(console.error);
