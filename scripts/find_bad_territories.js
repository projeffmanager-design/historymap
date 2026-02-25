/**
 * find_bad_territories.js - 비정상 + 중복 영토 찾기
 */
const { MongoClient } = require('mongodb');

async function main() {
    const client = new MongoClient('mongodb://localhost:27017');
    await client.connect();
    const db = client.db('koreahistory');
    
    const allT = await db.collection('territories').find({}).toArray();
    console.log(`전체 영토: ${allT.length}개\n`);
    
    // 1. 비정상 영토 (geometry 없음 / bbox 0)
    console.log('=== 비정상 영토 ===');
    const badIds = [];
    for (const t of allT) {
        let issue = null;
        if (!t.geometry) {
            issue = 'geometry 없음';
        } else if (!t.geometry.coordinates || t.geometry.coordinates.length === 0) {
            issue = 'coordinates 비어있음';
        } else if (t.bbox && t.bbox.minLat === 0 && t.bbox.maxLat === 0 && t.bbox.minLng === 0 && t.bbox.maxLng === 0) {
            issue = 'bbox [0,0~0,0] (빈 geometry)';
        }
        if (issue) {
            console.log(`  ❌ ${t.name} (${t._id}) | ${issue}`);
            badIds.push({ id: t._id, name: t.name, reason: issue });
        }
    }
    
    // 2. 중복 이름 영토
    console.log('\n=== 중복 이름 영토 ===');
    const nameMap = {};
    for (const t of allT) {
        if (!nameMap[t.name]) nameMap[t.name] = [];
        nameMap[t.name].push(t);
    }
    
    const dupIds = [];
    for (const [name, list] of Object.entries(nameMap)) {
        if (list.length > 1) {
            console.log(`  🔄 ${name}: ${list.length}개`);
            list.forEach((t, i) => {
                const hasGeo = !!(t.geometry && t.geometry.coordinates && t.geometry.coordinates.length > 0);
                const bboxOk = t.bbox && typeof t.bbox.minLat === 'number' && t.bbox.minLat !== 0;
                console.log(`     [${i}] id=${t._id} | geo:${hasGeo} | bbox:${bboxOk ? 'OK' : 'BAD'} | level:${t.level}`);
            });
            // 첫 번째를 유지, 나머지 삭제
            for (let i = 1; i < list.length; i++) {
                dupIds.push({ id: list[i]._id, name: list[i].name, reason: `중복 #${i+1}` });
            }
        }
    }
    
    console.log(`\n=== 삭제 대상 요약 ===`);
    const allBad = [...badIds, ...dupIds];
    // 중복 제거 (badIds와 dupIds에 같은 id가 있을 수 있음)
    const uniqueIds = new Map();
    for (const item of allBad) {
        uniqueIds.set(item.id.toString(), item);
    }
    
    console.log(`비정상: ${badIds.length}개, 중복: ${dupIds.length}개, 총 고유: ${uniqueIds.size}개`);
    for (const [id, item] of uniqueIds) {
        console.log(`  - ${item.name} (${id}): ${item.reason}`);
    }
    
    await client.close();
}

main().catch(console.error);
