// 2차 정리: 중복 이름 영토 + 남은 포함 겹침 해결
const { MongoClient, ObjectId } = require('mongodb');

async function main() {
    const atlasUri = 'mongodb+srv://projeffmanager_db_user:Bv3Lres9O0L3Nrrz@realhistory.6vfgerd.mongodb.net/';
    const localUri = 'mongodb://localhost:27017';
    const atlasClient = new MongoClient(atlasUri);
    const localClient = new MongoClient(localUri);
    await Promise.all([atlasClient.connect(), localClient.connect()]);
    const atlasDb = atlasClient.db('realhistory');
    const localDb = localClient.db('koreahistory');

    const toDeleteIds = [];

    // === 1. 중복 이름 영토: 더 오래된(작은 ID = 먼저 생성) 것을 보존, 나중것 삭제 ===
    console.log('=== 1. 중복 이름 영토 정리 ===');
    const all = await atlasDb.collection('territories').find({}, {
        projection: { _id: 1, name: 1, level: 1, bbox: 1, type: 1 }
    }).toArray();

    const nameMap = {};
    all.forEach(t => {
        if (!nameMap[t.name]) nameMap[t.name] = [];
        nameMap[t.name].push(t);
    });

    for (const [name, docs] of Object.entries(nameMap)) {
        if (docs.length <= 1) continue;
        // 더 오래된 것(ObjectId 기준 먼저 생성된 것) 보존
        docs.sort((a, b) => a._id.toString().localeCompare(b._id.toString()));
        for (let i = 1; i < docs.length; i++) {
            console.log(`  삭제: ${name} [${docs[i].level}] id=${docs[i]._id} (중복 #${i+1})`);
            toDeleteIds.push(docs[i]._id);
        }
    }

    // === 2. 포함 겹침: 큰 것 삭제 (단, 한국 도(道)는 보존하고 하위 광역시를 삭제) ===
    console.log('\n=== 2. 포함 겹침 정리 ===');
    // 삭제 대상에서 제외할 한국 행정구역
    const koreaPreserve = new Set(['경상북도', '전라남도', '전라북도', '충청남도', '충청북도', 
        '경상남도', '강원도', '제주도', '서울특별시']);

    const remaining = all.filter(t => !toDeleteIds.some(id => id.equals(t._id)));
    const withBbox = remaining.filter(t => t.bbox);

    for (const big of withBbox) {
        if (toDeleteIds.some(id => id.equals(big._id))) continue;
        const bA = (big.bbox.maxLng - big.bbox.minLng) * (big.bbox.maxLat - big.bbox.minLat);
        
        for (const small of withBbox) {
            if (big._id.equals(small._id)) continue;
            if (toDeleteIds.some(id => id.equals(small._id))) continue;
            const sA = (small.bbox.maxLng - small.bbox.minLng) * (small.bbox.maxLat - small.bbox.minLat);
            if (sA >= bA) continue;

            if (small.bbox.minLat >= big.bbox.minLat - 0.1 &&
                small.bbox.maxLat <= big.bbox.maxLat + 0.1 &&
                small.bbox.minLng >= big.bbox.minLng - 0.1 &&
                small.bbox.maxLng <= big.bbox.maxLng + 0.1) {
                
                // 한국 도 보존: 큰 게 한국 도이면 → 작은 것(광역시) 삭제
                if (koreaPreserve.has(big.name)) {
                    console.log(`  삭제(하위): ${small.name} [${small.level}] (${big.name} 안에 포함)`);
                    toDeleteIds.push(small._id);
                } else {
                    // 그 외: 큰 것 삭제
                    console.log(`  삭제(상위): ${big.name} [${big.level}] area=${bA.toFixed(1)} (${small.name} 포함)`);
                    toDeleteIds.push(big._id);
                    break;  // 큰 것 한번 삭제하면 loop 종료
                }
            }
        }
    }

    // === 3. 실행 ===
    // 중복 제거
    const uniqueIds = [...new Set(toDeleteIds.map(id => id.toString()))].map(id => new ObjectId(id));
    console.log('\n총 삭제 대상:', uniqueIds.length, '개');

    if (uniqueIds.length > 0) {
        const r1 = await atlasDb.collection('territories').deleteMany({ _id: { $in: uniqueIds } });
        console.log('Atlas 삭제:', r1.deletedCount);
        const r2 = await localDb.collection('territories').deleteMany({ _id: { $in: uniqueIds } });
        console.log('Local 삭제:', r2.deletedCount);
    }

    const ac = await atlasDb.collection('territories').countDocuments({});
    const lc = await localDb.collection('territories').countDocuments({});
    console.log('\n최종: Atlas', ac, '/ Local', lc);

    await atlasClient.close();
    await localClient.close();
}

main().catch(console.error);
