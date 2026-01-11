require('dotenv').config();
const { MongoClient } = require('mongodb');

async function checkTerritoryFields() {
    const client = new MongoClient(process.env.MONGO_URI);
    try {
        await client.connect();
        const db = client.db('realhistory');
        
        // 영토 샘플 확인
        const territorySample = await db.collection('territories').findOne({});
        
        console.log('📋 영토 데이터 샘플:');
        console.log(JSON.stringify(territorySample, null, 2).substring(0, 1000));
        
        // 모든 영토의 필드 확인
        const allFields = await db.collection('territories')
            .findOne({}, { projection: { _id: 0 } });
        
        console.log('\n\n🔑 영토 데이터의 키들:');
        if (allFields) {
            Object.keys(allFields).forEach(key => {
                console.log(`  - ${key}`);
            });
        }
        
    } finally {
        await client.close();
    }
}

checkTerritoryFields();
