require('dotenv').config();
const { MongoClient } = require('mongodb');

(async () => {
    const client = new MongoClient(process.env.MONGO_URI);
    await client.connect();
    const db = client.db('realhistory');
    
    const sample = await db.collection('territories').findOne({});
    console.log('샘플 영토 필드:', Object.keys(sample).join(', '));
    console.log('\n샘플 데이터:');
    console.log(JSON.stringify(sample, null, 2).substring(0, 1000));
    
    await client.close();
})();
