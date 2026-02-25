// 내몽골 지역 영토 겹침 상세 분석
const { MongoClient } = require('mongodb');

const ATLAS_URI = 'mongodb+srv://projeffmanager_db_user:Bv3Lres9O0L3Nrrz@realhistory.6vfgerd.mongodb.net/';

async function main() {
    const client = new MongoClient(ATLAS_URI);
    await client.connect();
    const db = client.db('realhistory');
    
    // 내몽골 관련 영토 검색 (이름에 Mongol, 몽골, Inner 포함)
    const mongoRelated = await db.collection('territories').find({
        $or: [
            { name: { $regex: /mongol/i } },
            { name: { $regex: /몽골/i } },
            { name: { $regex: /inner/i } },
            { name: { $regex: /내몽/i } }
        ]
    }).toArray();
    
    console.log('=== 내몽골/몽골 관련 영토 ===');
    console.log(`총 ${mongoRelated.length}개\n`);
    
    for (const t of mongoRelated) {
        // 이 영토에 할당된 국가들 조회
        const contributions = await db.collection('contributions').find({
            territory_id: t._id
        }).toArray();
        
        console.log(`📌 ${t.name} (ID: ${t._id})`);
        console.log(`   level: ${t.level}, type: ${t.type}`);
        console.log(`   bbox: ${t.bbox ? `[${t.bbox.minLat.toFixed(2)},${t.bbox.minLng.toFixed(2)} ~ ${t.bbox.maxLat.toFixed(2)},${t.bbox.maxLng.toFixed(2)}]` : 'NONE'}`);
        console.log(`   coordinates 개수: ${t.coordinates ? JSON.stringify(t.coordinates).length : 0} chars`);
        
        if (contributions.length > 0) {
            console.log(`   할당된 국가:`);
            for (const c of contributions) {
                const country = await db.collection('countries').findOne({ _id: c.country_id });
                console.log(`     - ${country ? country.name : c.country_id} (${c.start_year || '?'}~${c.end_year || '?'})`);
            }
        } else {
            console.log(`   ⚠️ 할당된 국가 없음`);
        }
        console.log('');
    }
    
    // bbox로 내몽골 지역과 겹치는 모든 영토 찾기
    // Inner Mongolia 대략적 범위: lat 37~53, lng 97~126
    console.log('\n=== 내몽골 bbox 영역과 겹치는 모든 영토 ===');
    const innerMongolTerritory = mongoRelated.find(t => t.name && t.name.match(/Inner Mongol/i));
    
    if (innerMongolTerritory && innerMongolTerritory.bbox) {
        const ib = innerMongolTerritory.bbox;
        console.log(`Inner Mongolia bbox: [${ib.minLat.toFixed(2)},${ib.minLng.toFixed(2)} ~ ${ib.maxLat.toFixed(2)},${ib.maxLng.toFixed(2)}]`);
        
        // 이 bbox와 겹치는 영토들 찾기
        const allTerritories = await db.collection('territories').find({ bbox: { $exists: true } }).toArray();
        
        const overlapping = [];
        for (const t of allTerritories) {
            if (t._id.toString() === innerMongolTerritory._id.toString()) continue;
            const tb = t.bbox;
            // bbox 겹침 검사
            if (tb.minLat <= ib.maxLat && tb.maxLat >= ib.minLat &&
                tb.minLng <= ib.maxLng && tb.maxLng >= ib.minLng) {
                
                // 겹침 면적 계산
                const overlapMinLat = Math.max(tb.minLat, ib.minLat);
                const overlapMaxLat = Math.min(tb.maxLat, ib.maxLat);
                const overlapMinLng = Math.max(tb.minLng, ib.minLng);
                const overlapMaxLng = Math.min(tb.maxLng, ib.maxLng);
                const overlapArea = (overlapMaxLat - overlapMinLat) * (overlapMaxLng - overlapMinLng);
                const innerArea = (ib.maxLat - ib.minLat) * (ib.maxLng - ib.minLng);
                const tArea = (tb.maxLat - tb.minLat) * (tb.maxLng - tb.minLng);
                const overlapPctOfInner = ((overlapArea / innerArea) * 100).toFixed(1);
                const overlapPctOfT = ((overlapArea / tArea) * 100).toFixed(1);
                
                overlapping.push({
                    name: t.name,
                    level: t.level,
                    bbox: tb,
                    overlapPctOfInner,
                    overlapPctOfT,
                    overlapArea
                });
            }
        }
        
        // 겹침 면적 기준 정렬
        overlapping.sort((a, b) => b.overlapArea - a.overlapArea);
        
        console.log(`\n겹치는 영토: ${overlapping.length}개\n`);
        console.log('상위 20개 (겹침 면적 기준):');
        for (const o of overlapping.slice(0, 20)) {
            const contributions = await db.collection('contributions').find({
                territory_id: { $in: allTerritories.filter(t => t.name === o.name).map(t => t._id) }
            }).toArray();
            const countryNames = [];
            for (const c of contributions) {
                const country = await db.collection('countries').findOne({ _id: c.country_id });
                if (country) countryNames.push(country.name);
            }
            
            console.log(`  ${o.name} [${o.level}] — Inner Mongolia의 ${o.overlapPctOfInner}% 차지, 자기 영역의 ${o.overlapPctOfT}% 겹침`);
            console.log(`    bbox: [${o.bbox.minLat.toFixed(2)},${o.bbox.minLng.toFixed(2)} ~ ${o.bbox.maxLat.toFixed(2)},${o.bbox.maxLng.toFixed(2)}]`);
            console.log(`    국가: ${countryNames.join(', ') || '없음'}`);
        }
    }
    
    // 몽골(Mongolia) 영토와 내몽골(Inner Mongolia) 겹침 상세
    console.log('\n\n=== Mongolia vs Inner Mongolia 상세 비교 ===');
    const mongolia = mongoRelated.find(t => t.name === 'Mongolia');
    const innerMongol = mongoRelated.find(t => t.name && t.name.match(/Inner Mongol/i));
    
    if (mongolia && innerMongol) {
        console.log(`Mongolia: level=${mongolia.level}, bbox=${JSON.stringify(mongolia.bbox)}`);
        console.log(`Inner Mongol: level=${innerMongol.level}, bbox=${JSON.stringify(innerMongol.bbox)}`);
        
        if (mongolia.bbox && innerMongol.bbox) {
            const mb = mongolia.bbox;
            const ib = innerMongol.bbox;
            const overlapMinLat = Math.max(mb.minLat, ib.minLat);
            const overlapMaxLat = Math.min(mb.maxLat, ib.maxLat);
            const overlapMinLng = Math.max(mb.minLng, ib.minLng);
            const overlapMaxLng = Math.min(mb.maxLng, ib.maxLng);
            
            if (overlapMinLat < overlapMaxLat && overlapMinLng < overlapMaxLng) {
                const overlapArea = (overlapMaxLat - overlapMinLat) * (overlapMaxLng - overlapMinLng);
                const mArea = (mb.maxLat - mb.minLat) * (mb.maxLng - mb.minLng);
                const iArea = (ib.maxLat - ib.minLat) * (ib.maxLng - ib.minLng);
                console.log(`\nMongolia 면적: ${mArea.toFixed(1)}`);
                console.log(`Inner Mongol 면적: ${iArea.toFixed(1)}`);
                console.log(`겹침 면적: ${overlapArea.toFixed(1)}`);
                console.log(`Mongolia의 ${((overlapArea/mArea)*100).toFixed(1)}% 겹침`);
                console.log(`Inner Mongol의 ${((overlapArea/iArea)*100).toFixed(1)}% 겹침`);
            }
        }
        
        // 각각에 할당된 국가
        for (const t of [mongolia, innerMongol]) {
            const contribs = await db.collection('contributions').find({ territory_id: t._id }).toArray();
            console.log(`\n${t.name}에 할당된 국가:`);
            for (const c of contribs) {
                const country = await db.collection('countries').findOne({ _id: c.country_id });
                console.log(`  - ${country ? country.name : c.country_id} (${c.start_year || '?'}~${c.end_year || '?'})`);
            }
        }
    }
    
    await client.close();
}

main().catch(console.error);
