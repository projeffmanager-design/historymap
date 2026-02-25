// 겹치는 큰 영토(country/province)를 DB에서 찾아 삭제
// 조건: 하위 영토가 2개 이상 포함된 큰 영토
const { MongoClient } = require('mongodb');

async function findOverlaps(db) {
    const all = await db.collection('territories').find({}, {
        projection: { _id: 1, name: 1, level: 1, bbox: 1 }
    }).toArray();

    console.log('총 영토:', all.length);

    const withBbox = all.filter(t => t.bbox);
    const toDelete = [];

    // 모든 영토 쌍 비교: 큰 영토가 작은 영토를 bbox로 완전 포함하는 경우
    for (const big of withBbox) {
        const bigArea = (big.bbox.maxLng - big.bbox.minLng) * (big.bbox.maxLat - big.bbox.minLat);
        const children = [];

        for (const small of withBbox) {
            if (big._id.equals(small._id)) continue;
            const smallArea = (small.bbox.maxLng - small.bbox.minLng) * (small.bbox.maxLat - small.bbox.minLat);
            if (smallArea >= bigArea) continue;

            // bbox 포함 (약간의 여유 0.1도)
            if (small.bbox.minLat >= big.bbox.minLat - 0.1 &&
                small.bbox.maxLat <= big.bbox.maxLat + 0.1 &&
                small.bbox.minLng >= big.bbox.minLng - 0.1 &&
                small.bbox.maxLng <= big.bbox.maxLng + 0.1) {
                children.push(small.name);
            }
        }

        if (children.length >= 2) {
            toDelete.push({
                id: big._id,
                name: big.name,
                level: big.level,
                area: bigArea.toFixed(1),
                childCount: children.length,
                children: children.slice(0, 5).join(', ') + (children.length > 5 ? '...' : '')
            });
        }
    }

    return toDelete;
}

async function main() {
    // Atlas 
    const atlasUri = 'mongodb+srv://projeffmanager_db_user:Bv3Lres9O0L3Nrrz@realhistory.6vfgerd.mongodb.net/';
    const localUri = 'mongodb://localhost:27017';

    const atlasClient = new MongoClient(atlasUri);
    const localClient = new MongoClient(localUri);

    await Promise.all([atlasClient.connect(), localClient.connect()]);

    const atlasDb = atlasClient.db('realhistory');
    const localDb = localClient.db('koreahistory');

    console.log('=== Atlas DB 겹침 분석 ===');
    const atlasDeletes = await findOverlaps(atlasDb);
    
    console.log('\n삭제 대상:', atlasDeletes.length, '개');
    atlasDeletes.forEach(d => console.log(`  [${d.level}] ${d.name} (area=${d.area}, ${d.childCount}개 하위) → ${d.children}`));

    // 삭제 실행 확인
    const ids = atlasDeletes.map(d => d.id);
    if (ids.length > 0) {
        console.log('\n--- Atlas 삭제 실행 ---');
        const r1 = await atlasDb.collection('territories').deleteMany({ _id: { $in: ids } });
        console.log('Atlas 삭제:', r1.deletedCount);

        console.log('--- Local 삭제 실행 ---');
        const r2 = await localDb.collection('territories').deleteMany({ _id: { $in: ids } });
        console.log('Local 삭제:', r2.deletedCount);
    }

    // 삭제 후 현황
    const atlasCount = await atlasDb.collection('territories').countDocuments({});
    const localCount = await localDb.collection('territories').countDocuments({});
    console.log('\n삭제 후: Atlas', atlasCount, '/ Local', localCount);

    await atlasClient.close();
    await localClient.close();
}

main().catch(console.error);
