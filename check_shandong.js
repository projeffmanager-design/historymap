// check_shandong v4 - koreahistory level 업데이트 + 산동 분석
const { MongoClient } = require('mongodb');
const client = new MongoClient('mongodb://localhost:27017');
client.connect().then(async () => {
    const db = client.db('koreahistory');
    const all = await db.collection('territories').find({}, { projection: { _id:1, name:1, bbox:1, level:1 } }).toArray();
    console.log('총:', all.length);
    let stats = { country:0, province:0, city:0, skipped:0 };
    const ops = [];
    for (const t of all) {
        if (t.level) { stats.skipped++; continue; }
        let area = 0;
        if (t.bbox && t.bbox.maxLng != null) {
            area = (t.bbox.maxLng - t.bbox.minLng) * (t.bbox.maxLat - t.bbox.minLat);
        }
        const level = area >= 100 ? 'country' : area >= 5 ? 'province' : 'city';
        stats[level]++;
        ops.push({ updateOne: { filter: { _id: t._id }, update: { $set: { level } } } });
    }
    if (ops.length) {
        const r = await db.collection('territories').bulkWrite(ops);
        console.log('업데이트:', r.modifiedCount, '개');
    } else {
        console.log('이미 모두 level 있음');
    }
    console.log('분포:', stats);

    // 401년 산동 부근 영토의 level 확인
    const shandong = await db.collection('territories').find({
        'bbox.maxLat': { $gte: 35 }, 'bbox.maxLng': { $gte: 118 },
        'bbox.minLat': { $lte: 38 }, 'bbox.minLng': { $lte: 123 },
        start: { $lte: 401 }, end: { $gte: 401 }
    }, { projection: { name:1, level:1, bbox:1 } }).toArray();
    console.log('\n=== 산동 401년 영토 ===');
    shandong.forEach(t => {
        const area = t.bbox ? ((t.bbox.maxLng-t.bbox.minLng)*(t.bbox.maxLat-t.bbox.minLat)).toFixed(1) : '?';
        console.log('[' + t.level + '] ' + t.name + ' area=' + area);
    });

    await client.close();
}).catch(e => console.error(e));
