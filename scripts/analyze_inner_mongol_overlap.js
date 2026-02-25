// 내몽골(Inner Mongol) 영역 겹침 문제 분석
// 1. Inner Mongol vs Mongolia 겹침 상태
// 2. 내몽골 영역의 모든 영토 목록 + 국가할당 + 레벨
// 3. 겹침 영토 쌍 분석
// 4. 렌더링 시뮬레이션

const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

const ATLAS_URI = 'mongodb+srv://projeffmanager_db_user:Bv3Lres9O0L3Nrrz@realhistory.6vfgerd.mongodb.net/';

function bboxOverlapRatio(a, b) {
    if (!a || !b) return 0;
    const overlapMinLat = Math.max(a.minLat, b.minLat);
    const overlapMaxLat = Math.min(a.maxLat, b.maxLat);
    const overlapMinLng = Math.max(a.minLng, b.minLng);
    const overlapMaxLng = Math.min(a.maxLng, b.maxLng);
    if (overlapMinLat >= overlapMaxLat || overlapMinLng >= overlapMaxLng) return 0;
    const overlapArea = (overlapMaxLat - overlapMinLat) * (overlapMaxLng - overlapMinLng);
    const aArea = (a.maxLat - a.minLat) * (a.maxLng - a.minLng);
    const bArea = (b.maxLat - b.minLat) * (b.maxLng - b.minLng);
    const smallerArea = Math.min(aArea, bArea);
    return smallerArea > 0 ? overlapArea / smallerArea : 0;
}

function bboxArea(b) {
    if (!b) return 0;
    return (b.maxLat - b.minLat) * (b.maxLng - b.minLng);
}

async function main() {
    const client = new MongoClient(ATLAS_URI);
    await client.connect();
    const db = client.db('realhistory');

    const allTerritories = await db.collection('territories').find({ bbox: { $exists: true } }).toArray();
    const allContributions = await db.collection('contributions').find({}).toArray();
    const allCountries = await db.collection('countries').find({}).toArray();

    const countryMap = new Map(allCountries.map(c => [c._id.toString(), c]));
    const contribByTerritory = new Map();
    for (const c of allContributions) {
        const key = c.territory_id.toString();
        if (!contribByTerritory.has(key)) contribByTerritory.set(key, []);
        contribByTerritory.get(key).push(c);
    }

    // ========================================================
    // 1. Inner Mongol과 Mongolia 찾기
    // ========================================================
    const innerMongol = allTerritories.find(t => t.name === 'Inner Mongol');
    const mongolia = allTerritories.find(t => t.name === 'Mongolia');

    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║       내몽골 영역 겹침 문제 상세 분석           ║');
    console.log('╚══════════════════════════════════════════════════╝');

    console.log('\n━━━ 1. Inner Mongol & Mongolia 기본 정보 ━━━');
    for (const t of [innerMongol, mongolia]) {
        if (!t) continue;
        const contribs = contribByTerritory.get(t._id.toString()) || [];
        const activeCountries = contribs.map(c => {
            const country = countryMap.get(c.country_id.toString());
            return country ? `${country.name} (${c.start_year||'?'}~${c.end_year||'?'})` : '?';
        });
        const hasCoords = t.coordinates && JSON.stringify(t.coordinates).length > 10;
        console.log(`\n[${t.name}]`);
        console.log(`  _id: ${t._id}`);
        console.log(`  level: ${t.level || '(없음)'}`);
        console.log(`  type: ${t.type || '(없음)'}`);
        console.log(`  bbox: ${t.bbox ? `[${t.bbox.minLat.toFixed(2)},${t.bbox.minLng.toFixed(2)} ~ ${t.bbox.maxLat.toFixed(2)},${t.bbox.maxLng.toFixed(2)}]` : '없음'}`);
        console.log(`  bbox면적: ${bboxArea(t.bbox).toFixed(2)}`);
        console.log(`  coordinates: ${hasCoords ? '있음 (' + JSON.stringify(t.coordinates).length + ' bytes)' : '❌ 없음'}`);
        console.log(`  국가할당: ${activeCountries.length > 0 ? activeCountries.join(', ') : '❌ 없음'}`);
    }

    // 겹침 비율
    if (innerMongol && mongolia && innerMongol.bbox && mongolia.bbox) {
        const overlap = bboxOverlapRatio(innerMongol.bbox, mongolia.bbox);
        console.log(`\n[겹침] Inner Mongol ↔ Mongolia bbox 겹침 비율: ${(overlap * 100).toFixed(1)}%`);
    }

    // ========================================================
    // 2. 내몽골 영역(확장 bbox) 안의 모든 영토
    // ========================================================
    // Inner Mongol bbox를 기준으로 살짝 확장
    const searchBbox = innerMongol ? {
        minLat: innerMongol.bbox.minLat - 2,
        maxLat: innerMongol.bbox.maxLat + 2,
        minLng: innerMongol.bbox.minLng - 2,
        maxLng: innerMongol.bbox.maxLng + 2
    } : { minLat: 37, maxLat: 55, minLng: 95, maxLng: 128 };

    const nearbyTerritories = allTerritories.filter(t => {
        if (!t.bbox) return false;
        const cLat = (t.bbox.minLat + t.bbox.maxLat) / 2;
        const cLng = (t.bbox.minLng + t.bbox.maxLng) / 2;
        return cLat >= searchBbox.minLat && cLat <= searchBbox.maxLat &&
               cLng >= searchBbox.minLng && cLng <= searchBbox.maxLng;
    });

    console.log(`\n\n━━━ 2. 내몽골 주변 영토 (center 기준, ${nearbyTerritories.length}개) ━━━`);
    
    // 레벨별 정리
    const byLevel = {};
    for (const t of nearbyTerritories) {
        const lv = t.level || 'city';
        if (!byLevel[lv]) byLevel[lv] = [];
        byLevel[lv].push(t);
    }

    for (const level of ['country', 'province', 'city']) {
        const list = byLevel[level] || [];
        console.log(`\n--- ${level} (${list.length}개) ---`);
        for (const t of list.sort((a, b) => bboxArea(b.bbox) - bboxArea(a.bbox))) {
            const contribs = contribByTerritory.get(t._id.toString()) || [];
            const activeCountries = [...new Set(contribs.map(c => {
                const country = countryMap.get(c.country_id.toString());
                return country ? country.name : '?';
            }))];
            console.log(`  ${t.name.padEnd(25)} lv=${(t.level||'city').padEnd(8)} 면적=${bboxArea(t.bbox).toFixed(1).padStart(8)} 국가=[${activeCountries.join(',')}]`);
        }
    }

    // ========================================================
    // 3. Inner Mongol과 겹치는 영토 쌍
    // ========================================================
    if (innerMongol && innerMongol.bbox) {
        console.log(`\n\n━━━ 3. Inner Mongol과 겹치는 영토들 ━━━`);
        const overlaps = [];
        for (const t of allTerritories) {
            if (t._id.toString() === innerMongol._id.toString()) continue;
            if (!t.bbox) continue;
            const ratio = bboxOverlapRatio(innerMongol.bbox, t.bbox);
            if (ratio > 0.1) { // 10% 이상 겹침
                overlaps.push({ territory: t, ratio });
            }
        }
        overlaps.sort((a, b) => b.ratio - a.ratio);
        console.log(`Inner Mongol과 10% 이상 겹치는 영토: ${overlaps.length}개`);
        for (const o of overlaps) {
            const contribs = contribByTerritory.get(o.territory._id.toString()) || [];
            const countries = [...new Set(contribs.map(c => {
                const country = countryMap.get(c.country_id.toString());
                return country ? country.name : '?';
            }))];
            console.log(`  ${o.territory.name.padEnd(25)} lv=${(o.territory.level||'city').padEnd(8)} 겹침=${(o.ratio*100).toFixed(1).padStart(5)}% 국가=[${countries.join(',')}]`);
        }
    }

    // ========================================================
    // 4. Mongolia와 겹치는 영토 쌍
    // ========================================================
    if (mongolia && mongolia.bbox) {
        console.log(`\n\n━━━ 4. Mongolia와 겹치는 영토들 ━━━`);
        const overlaps = [];
        for (const t of allTerritories) {
            if (t._id.toString() === mongolia._id.toString()) continue;
            if (!t.bbox) continue;
            const ratio = bboxOverlapRatio(mongolia.bbox, t.bbox);
            if (ratio > 0.1) {
                overlaps.push({ territory: t, ratio });
            }
        }
        overlaps.sort((a, b) => b.ratio - a.ratio);
        console.log(`Mongolia와 10% 이상 겹치는 영토: ${overlaps.length}개`);
        for (const o of overlaps) {
            const contribs = contribByTerritory.get(o.territory._id.toString()) || [];
            const countries = [...new Set(contribs.map(c => {
                const country = countryMap.get(c.country_id.toString());
                return country ? country.name : '?';
            }))];
            console.log(`  ${o.territory.name.padEnd(25)} lv=${(o.territory.level||'city').padEnd(8)} 겹침=${(o.ratio*100).toFixed(1).padStart(5)}% 국가=[${countries.join(',')}]`);
        }
    }

    // ========================================================
    // 5. 렌더링 시뮬레이션 (여러 시대)
    // ========================================================
    console.log('\n\n━━━ 5. 렌더링 시뮬레이션 ━━━');
    const testYears = [-108, 37, 200, 668, 900, 1200, 1400, 1600, 1900];
    
    for (const year of testYears) {
        const provinces = nearbyTerritories.filter(t => t.level === 'province');
        const citiesLocal = nearbyTerritories.filter(t => t.level === 'city' || !t.level);
        const provStatus = new Map();
        const paintedSet = new Set();
        
        // PASS 1
        for (const t of provinces) {
            const contribs = contribByTerritory.get(t._id.toString()) || [];
            const active = contribs.filter(c => year >= (c.start_year || -5000) && year <= (c.end_year || 3000));
            const countryIds = [...new Set(active.map(c => c.country_id.toString()))];
            if (countryIds.length === 0) provStatus.set(t._id.toString(), 'empty');
            else if (countryIds.length === 1) { provStatus.set(t._id.toString(), 'painted'); paintedSet.add(t._id.toString()); }
            else provStatus.set(t._id.toString(), 'city_only');
        }
        
        // PASS 1.5
        provStatus.forEach((status, provId) => {
            if (status !== 'city_only') return;
            const prov = nearbyTerritories.find(t => t._id.toString() === provId);
            if (!prov || !prov.bbox) return;
            const pb = prov.bbox;
            const childCount = citiesLocal.filter(c => {
                if (!c.bbox) return false;
                const cLat = (c.bbox.minLat + c.bbox.maxLat) / 2;
                const cLng = (c.bbox.minLng + c.bbox.maxLng) / 2;
                return cLat >= pb.minLat && cLat <= pb.maxLat && cLng >= pb.minLng && cLng <= pb.maxLng;
            }).length;
            if (childCount === 0) { provStatus.set(provId, 'painted_1.5'); paintedSet.add(provId); }
        });
        
        // 결과
        let paintedCount = 0, cityOnlyCount = 0, emptyCount = 0, pass15Count = 0;
        provStatus.forEach(s => {
            if (s === 'painted') paintedCount++;
            else if (s === 'city_only') cityOnlyCount++;
            else if (s === 'empty') emptyCount++;
            else if (s === 'painted_1.5') pass15Count++;
        });
        
        // Inner Mongol & Mongolia가 어떤 국가로 표시되는지
        let innerMongolStatus = '-';
        let mongoliaStatus = '-';
        if (innerMongol) {
            const contribs = contribByTerritory.get(innerMongol._id.toString()) || [];
            const active = contribs.filter(c => year >= (c.start_year || -5000) && year <= (c.end_year || 3000));
            const countries = active.map(c => countryMap.get(c.country_id.toString())?.name || '?');
            innerMongolStatus = countries.length > 0 ? countries.join(',') : '없음';
        }
        if (mongolia) {
            const contribs = contribByTerritory.get(mongolia._id.toString()) || [];
            const active = contribs.filter(c => year >= (c.start_year || -5000) && year <= (c.end_year || 3000));
            const countries = active.map(c => countryMap.get(c.country_id.toString())?.name || '?');
            mongoliaStatus = countries.length > 0 ? countries.join(',') : '없음';
        }

        console.log(`${String(year).padStart(5)}년: province[painted=${paintedCount}, city_only=${cityOnlyCount}, pass1.5=${pass15Count}, empty=${emptyCount}] InnerMongol=[${innerMongolStatus}] Mongolia=[${mongoliaStatus}]`);
    }

    // ========================================================
    // 6. Inner Mongol의 contributions 상세
    // ========================================================
    console.log('\n\n━━━ 6. Inner Mongol & Mongolia contributions 상세 ━━━');
    for (const t of [innerMongol, mongolia]) {
        if (!t) continue;
        const contribs = contribByTerritory.get(t._id.toString()) || [];
        console.log(`\n[${t.name}] contributions: ${contribs.length}개`);
        for (const c of contribs) {
            const country = countryMap.get(c.country_id.toString());
            console.log(`  ${country ? country.name : '?'} — ${c.start_year||'?'}~${c.end_year||'?'} (territory_id: ${c.territory_id}, country_id: ${c.country_id})`);
        }
    }

    await client.close();
}

main().catch(console.error);
