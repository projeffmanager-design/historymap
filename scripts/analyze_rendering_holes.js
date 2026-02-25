/**
 * analyze_rendering_holes.js
 * 3-pass 렌더링에서 구멍(색칠 안 되는 영토)이 어디서 생기는지 분석
 * + 겹침 쌍(같은 영역에 2개 이상 국가) 전수 조사
 */
const { MongoClient } = require('mongodb');

async function main() {
    const client = new MongoClient('mongodb://localhost:27017');
    await client.connect();
    const db = client.db('koreahistory');
    
    const territories = await db.collection('territories').find({}).toArray();
    const castles = await db.collection('castle').find({}).toArray();
    const countries = await db.collection('countries').find({}).toArray();
    
    const year = 401;
    const countryMap = {};
    countries.forEach(c => { countryMap[c._id.toString()] = c; });
    
    console.log(`=== ${year}년 렌더링 분석 ===`);
    console.log(`영토: ${territories.length}개, 성: ${castles.length}개\n`);

    // 해당 시점 활성 성 필터
    const activeCastles = castles.filter(c => {
        const s = c.start || c.start_year || -5000;
        const e = c.end || c.end_year || 3000;
        return year >= s && year <= e && c.lat && c.lng && c.country_id;
    });
    console.log(`활성 성: ${activeCastles.length}개\n`);

    // 각 영토별 국가 분석
    function analyzeTerritory(t) {
        if (!t.bbox || !t.bbox.minLat) return null;
        const b = t.bbox;
        const inCastles = activeCastles.filter(c => 
            c.lat >= b.minLat && c.lat <= b.maxLat &&
            c.lng >= b.minLng && c.lng <= b.maxLng
        );
        if (inCastles.length === 0) return { castleCount: 0, countries: [] };
        
        const cMap = {};
        inCastles.forEach(c => {
            const cid = c.country_id.toString();
            if (!cMap[cid]) cMap[cid] = 0;
            cMap[cid]++;
        });
        const sorted = Object.entries(cMap).sort((a,b) => b[1] - a[1]);
        return {
            castleCount: inCastles.length,
            countries: sorted.map(([id, cnt]) => ({ id, name: countryMap[id]?.name || id, count: cnt })),
            dominant: sorted[0]
        };
    }

    // ============ PASS 1: province ============
    const provinces = territories.filter(t => t.level === 'province');
    const cities = territories.filter(t => t.level === 'city');
    const countryLevel = territories.filter(t => t.level === 'country');
    
    console.log(`province: ${provinces.length}개, city: ${cities.length}개, country: ${countryLevel.length}개\n`);
    
    const provinceStatus = new Map(); // name → painted/city_only/empty
    let paintedProvinces = 0, cityOnlyProvinces = 0, emptyProvinces = 0;
    
    console.log('=== PASS 1: province 분석 (city_only = 구멍 원인) ===');
    for (const prov of provinces) {
        const result = analyzeTerritory(prov);
        if (!result || result.castleCount === 0) {
            provinceStatus.set(prov._id.toString(), 'empty');
            emptyProvinces++;
            continue;
        }
        if (result.countries.length > 1) {
            provinceStatus.set(prov._id.toString(), 'city_only');
            cityOnlyProvinces++;
            // 혼재 province에서 하위 city가 커버하는지 체크
            const b = prov.bbox;
            const childCities = cities.filter(c => {
                if (!c.bbox) return false;
                const clat = (c.bbox.minLat + c.bbox.maxLat) / 2;
                const clng = (c.bbox.minLng + c.bbox.maxLng) / 2;
                return clat >= b.minLat && clat <= b.maxLat && clng >= b.minLng && clng <= b.maxLng;
            });
            console.log(`  🟡 ${prov.name}: city_only (${result.countries.length}국가 혼재, 성 ${result.castleCount}개) → 하위city ${childCities.length}개`);
            result.countries.forEach(c => console.log(`      ${c.name}: ${c.count}개`));
            if (childCities.length === 0) {
                console.log(`      ⚠️ 하위 city 없음! → 이 영역 구멍 발생!`);
            }
        } else {
            provinceStatus.set(prov._id.toString(), 'painted');
            paintedProvinces++;
        }
    }
    
    console.log(`\nprovince 결과: painted=${paintedProvinces}, city_only=${cityOnlyProvinces}, empty=${emptyProvinces}\n`);

    // ============ PASS 2: city 분석 ============
    let cityPainted = 0, citySkipped = 0, cityEmpty = 0;
    const skippedCities = [];
    
    for (const city of cities) {
        const result = analyzeTerritory(city);
        if (!result || result.castleCount === 0) {
            cityEmpty++;
            continue;
        }
        
        // 상위 province가 painted면 스킵
        if (city.bbox) {
            const clat = (city.bbox.minLat + city.bbox.maxLat) / 2;
            const clng = (city.bbox.minLng + city.bbox.maxLng) / 2;
            const parentPainted = provinces.some(prov => {
                const ps = provinceStatus.get(prov._id.toString());
                if (ps !== 'painted') return false;
                if (!prov.bbox) return false;
                return clat >= prov.bbox.minLat && clat <= prov.bbox.maxLat &&
                       clng >= prov.bbox.minLng && clng <= prov.bbox.maxLng;
            });
            if (parentPainted) {
                citySkipped++;
                continue;
            }
        }
        cityPainted++;
    }
    console.log(`city 결과: painted=${cityPainted}, skipped(상위province)=${citySkipped}, empty=${cityEmpty}\n`);

    // ============ 영토 간 겹침 쌍 분석 ============
    console.log('=== 영토 간 겹침 분석 (bbox 교차) ===');
    const allWithBbox = territories.filter(t => t.bbox && t.bbox.minLat);
    let overlapPairs = [];
    
    for (let i = 0; i < allWithBbox.length; i++) {
        for (let j = i + 1; j < allWithBbox.length; j++) {
            const a = allWithBbox[i];
            const b = allWithBbox[j];
            
            // bbox 교차 체크
            if (a.bbox.maxLat < b.bbox.minLat || b.bbox.maxLat < a.bbox.minLat) continue;
            if (a.bbox.maxLng < b.bbox.minLng || b.bbox.maxLng < a.bbox.minLng) continue;
            
            // 교차 면적 계산
            const overlapLat = Math.min(a.bbox.maxLat, b.bbox.maxLat) - Math.max(a.bbox.minLat, b.bbox.minLat);
            const overlapLng = Math.min(a.bbox.maxLng, b.bbox.maxLng) - Math.max(a.bbox.minLng, b.bbox.minLng);
            const overlapArea = overlapLat * overlapLng;
            
            // 작은 쪽 면적
            const aArea = (a.bbox.maxLat - a.bbox.minLat) * (a.bbox.maxLng - a.bbox.minLng);
            const bArea = (b.bbox.maxLat - b.bbox.minLat) * (b.bbox.maxLng - b.bbox.minLng);
            const smallerArea = Math.min(aArea, bArea);
            
            // 교차 비율이 작은 쪽의 50% 이상이면 중요한 겹침
            if (smallerArea > 0 && overlapArea / smallerArea > 0.5) {
                // 같은 레벨끼리만 (province-province, city-city)
                if (a.level === b.level) {
                    // 둘 다 같은 국가면 상관없고, 다른 국가가 겹치면 문제
                    const rA = analyzeTerritory(a);
                    const rB = analyzeTerritory(b);
                    const domA = rA?.dominant ? rA.dominant[0] : null;
                    const domB = rB?.dominant ? rB.dominant[0] : null;
                    
                    overlapPairs.push({
                        a: a.name, b: b.name,
                        level: a.level,
                        overlapPct: (overlapArea / smallerArea * 100).toFixed(0),
                        countryA: countryMap[domA]?.name || '없음',
                        countryB: countryMap[domB]?.name || '없음',
                        sameCountry: domA === domB
                    });
                }
            }
        }
    }
    
    // 다른 국가 겹침만 출력 (문제 되는 것)
    const diffCountryOverlaps = overlapPairs.filter(p => !p.sameCountry);
    console.log(`\n같은 레벨 겹침 총: ${overlapPairs.length}쌍`);
    console.log(`다른 국가 겹침: ${diffCountryOverlaps.length}쌍\n`);
    
    diffCountryOverlaps.sort((a,b) => parseInt(b.overlapPct) - parseInt(a.overlapPct));
    console.log('--- 다른 국가 겹침 (겹침비율 높은 순) ---');
    diffCountryOverlaps.slice(0, 50).forEach(p => {
        console.log(`  ${p.level} | ${p.a} (${p.countryA}) ↔ ${p.b} (${p.countryB}) | 겹침: ${p.overlapPct}%`);
    });

    // ============ 구멍 원인 분석 ============
    console.log('\n=== 구멍 원인: city_only province 중 하위 city 없는 것 ===');
    for (const prov of provinces) {
        if (provinceStatus.get(prov._id.toString()) !== 'city_only') continue;
        if (!prov.bbox) continue;
        
        const b = prov.bbox;
        const childCities = cities.filter(c => {
            if (!c.bbox) return false;
            const clat = (c.bbox.minLat + c.bbox.maxLat) / 2;
            const clng = (c.bbox.minLng + c.bbox.maxLng) / 2;
            return clat >= b.minLat && clat <= b.maxLat && clng >= b.minLng && clng <= b.maxLng;
        });
        
        // child가 province 면적의 일부만 커버하면 구멍
        const provArea = (b.maxLat - b.minLat) * (b.maxLng - b.minLng);
        let childCoverage = 0;
        childCities.forEach(c => {
            if (c.bbox) {
                childCoverage += (c.bbox.maxLat - c.bbox.minLat) * (c.bbox.maxLng - c.bbox.minLng);
            }
        });
        const coveragePct = provArea > 0 ? (childCoverage / provArea * 100) : 0;
        
        if (coveragePct < 80) {
            console.log(`  ⚠️ ${prov.name}: 하위city ${childCities.length}개, 커버리지 ${coveragePct.toFixed(0)}% → 구멍 가능성`);
        }
    }
    
    await client.close();
}

main().catch(console.error);
