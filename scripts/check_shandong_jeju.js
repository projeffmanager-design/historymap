/**
 * check_shandong_jeju.js - 산동/제주 영토 상태 확인
 */
const { MongoClient } = require('mongodb');

async function main() {
    const client = new MongoClient('mongodb://localhost:27017');
    await client.connect();
    const db = client.db('koreahistory');
    
    // 1. 산동/제주 관련 영토 이름 검색
    const keywords = ['Shandong','Qingdao','Weifang','Yantai','Weihai','Rizhao',
        'Linyi','Zaozhuang','Jining','Heze','Zibo','Jeju','제주','Xingtai','Dongying'];
    
    console.log('=== 영토 존재 확인 ===');
    for (const kw of keywords) {
        const t = await db.collection('territories').findOne({ name: new RegExp(kw, 'i') });
        if (t) {
            const hasGeo = !!(t.geometry && t.geometry.coordinates);
            const bboxStr = t.bbox ? `[${t.bbox.minLat?.toFixed(1)},${t.bbox.minLng?.toFixed(1)} ~ ${t.bbox.maxLat?.toFixed(1)},${t.bbox.maxLng?.toFixed(1)}]` : 'no bbox';
            console.log(`  ✅ ${kw} → ${t.name} | level: ${t.level} | geo: ${hasGeo} | bbox: ${bboxStr}`);
        } else {
            console.log(`  ❌ ${kw} → NOT FOUND`);
        }
    }
    
    // 2. 산동반도 좌표 범위 (대략 lat 34-38, lng 115-123) 내 영토 전체
    console.log('\n=== 산동반도 좌표범위(lat 34-38, lng 115-123) 내 영토 ===');
    const allT = await db.collection('territories').find({}).toArray();
    const shandongArea = allT.filter(t => {
        if (!t.bbox) return false;
        const lat = (t.bbox.minLat + t.bbox.maxLat) / 2;
        const lng = (t.bbox.minLng + t.bbox.maxLng) / 2;
        return lat >= 34 && lat <= 38 && lng >= 115 && lng <= 123;
    });
    shandongArea.forEach(t => {
        console.log(`  ${t.name} | level: ${t.level} | bbox: [${t.bbox.minLat?.toFixed(2)},${t.bbox.minLng?.toFixed(2)} ~ ${t.bbox.maxLat?.toFixed(2)},${t.bbox.maxLng?.toFixed(2)}]`);
    });
    
    // 3. 제주 좌표범위 (lat 33-34, lng 126-127) 내 영토
    console.log('\n=== 제주 좌표범위(lat 33-34, lng 126-127) 내 영토 ===');
    const jejuArea = allT.filter(t => {
        if (!t.bbox) return false;
        const lat = (t.bbox.minLat + t.bbox.maxLat) / 2;
        const lng = (t.bbox.minLng + t.bbox.maxLng) / 2;
        return lat >= 33 && lat <= 34.5 && lng >= 126 && lng <= 127.5;
    });
    jejuArea.forEach(t => {
        console.log(`  ${t.name} | level: ${t.level} | bbox: [${t.bbox.minLat?.toFixed(2)},${t.bbox.minLng?.toFixed(2)} ~ ${t.bbox.maxLat?.toFixed(2)},${t.bbox.maxLng?.toFixed(2)}]`);
    });
    
    // 4. 이 영토들에 성(castle)이 배정되어 있는지 확인
    console.log('\n=== 산동/제주 영토의 성 배정 현황 ===');
    const castles = await db.collection('castle').find({}).toArray();
    const allRelevant = [...shandongArea, ...jejuArea];
    for (const t of allRelevant) {
        // 영토 bbox 안의 성 찾기
        const inCastles = castles.filter(c => {
            if (!c.lat || !c.lng) return false;
            return c.lat >= t.bbox.minLat && c.lat <= t.bbox.maxLat &&
                   c.lng >= t.bbox.minLng && c.lng <= t.bbox.maxLng;
        });
        if (inCastles.length > 0) {
            const countries = [...new Set(inCastles.map(c => c.country_id))];
            console.log(`  ${t.name}: ${inCastles.length}개 성 → 국가: [${countries.join(', ')}]`);
        } else {
            console.log(`  ${t.name}: 성 없음 (색칠 불가)`);
        }
    }
    
    // 5. 총 영토 수
    const total = await db.collection('territories').countDocuments();
    const levels = await db.collection('territories').aggregate([
        { $group: { _id: '$level', count: { $sum: 1 } } }
    ]).toArray();
    console.log(`\n총 영토: ${total}개, 분포:`, levels.map(l => `${l._id}:${l.count}`).join(', '));
    
    await client.close();
}

main().catch(console.error);
