require('dotenv').config();
const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);

// 간단한 사각형 bbox로 Buryatia 추가
async function addBuryatia() {
    try {
        await client.connect();
        const db = client.db('realhistory');
        const territories = db.collection('territories');
        
        // 이미 존재하는지 확인
        const existing = await territories.findOne({ name: 'Buryatia' });
        if (existing) {
            console.log('✅ Buryatia 이미 존재함');
            return;
        }
        
        // 간단한 사각형 경계 (실제 경계는 아니지만 placeholder로)
        const territory = {
            name: 'Buryatia',
            name_en: 'Republic of Buryatia',
            name_ko: '부랴티야 공화국 (울란우데)',
            code: 'BU',
            admin_level: 4,
            type: 'admin_area',
            country: 'Russia',
            geometry: {
                type: 'Polygon',
                coordinates: [[
                    [98.0, 51.0],
                    [116.0, 51.0],
                    [116.0, 56.0],
                    [98.0, 56.0],
                    [98.0, 51.0]
                ]]
            },
            bbox: {
                minLat: 51.0,
                maxLat: 56.0,
                minLng: 98.0,
                maxLng: 116.0
            },
            properties: {
                source: 'Manual',
                note: 'Simplified bbox placeholder',
                import_date: new Date().toISOString()
            }
        };
        
        const result = await territories.insertOne(territory);
        console.log(`✅ Buryatia 추가 완료! ID: ${result.insertedId}`);
        
    } finally {
        await client.close();
    }
}

addBuryatia().catch(console.error);
