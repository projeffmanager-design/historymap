const { MongoClient } = require('mongodb');
const fs = require('fs');
const uri = 'mongodb+srv://projeffmanager_db_user:Bv3Lres9O0L3Nrrz@realhistory.6vfgerd.mongodb.net/realhistory';

function calcBbox(g) {
    let minLat=Infinity, maxLat=-Infinity, minLng=Infinity, maxLng=-Infinity;
    function pr(ring) {
        for (const coord of ring) {
            const lng = coord[0], lat = coord[1];
            if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
            if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng;
        }
    }
    if (g.type === 'Polygon') g.coordinates.forEach(pr);
    else if (g.type === 'MultiPolygon') g.coordinates.forEach(p => p.forEach(pr));
    return { minLat, maxLat, minLng, maxLng };
}

async function main() {
    const client = await MongoClient.connect(uri, { serverSelectionTimeoutMS: 15000 });
    const db = client.db('realhistory');
    const col = db.collection('territories');
    
    const data = JSON.parse(fs.readFileSync('./world-countries.json', 'utf8'));
    
    // UAE 추가
    const uaeFeature = data.features.find(f => (f.properties.ADMIN || f.properties.NAME) === 'United Arab Emirates');
    if (uaeFeature) {
        const existing = await col.findOne({ name: 'United Arab Emirates' });
        if (!existing) {
            const geo = uaeFeature.geometry;
            await col.insertOne({
                name: 'United Arab Emirates', name_en: 'United Arab Emirates', name_ko: '아랍에미리트',
                geometry: { type: geo.type, coordinates: geo.coordinates },
                type: geo.type, bbox: calcBbox(geo), level: 'province',
                start_year: -5000, end_year: 3000, start: -5000, end: 3000,
                properties: { source: 'world-countries.json', import_date: new Date().toISOString() }
            });
            console.log('✅ UAE 삽입 완료');
        } else {
            console.log('⏭️  UAE 이미 존재');
        }
    }
    
    // Serbia 확인 (Republic of Serbia → name 필드에 Serbia 추가)
    const serbiaDoc = await col.findOne({ name: 'Republic of Serbia' });
    if (serbiaDoc) {
        console.log('ℹ️  Serbia는 "Republic of Serbia"로 존재합니다. _id:', serbiaDoc._id.toString());
        // 검색 편의를 위해 name_en에 Serbia 추가
        await col.updateOne({ _id: serbiaDoc._id }, { $set: { name_en: 'Serbia' } });
        console.log('✅ Republic of Serbia → name_en: "Serbia" 업데이트');
    }
    
    const total = await col.countDocuments();
    console.log('최종 총 territories:', total);
    await client.close();
}

main().catch(e => { console.error(e.message); process.exit(1); });
