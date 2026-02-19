require('dotenv').config({ path: './env' });
const { MongoClient } = require('mongodb');
const client = new MongoClient(process.env.MONGO_URI);

client.connect().then(async () => {
    const db = client.db('realhistory');
    
    // 아유타 관련 contributions 검색
    const contrib = await db.collection('contributions').find({
        $or: [
            { 'data.name': { $regex: '아유타', $options: 'i' } },
            { 'data.country_name': { $regex: '아유타|코살라', $options: 'i' } },
            { country_name: { $regex: '아유타|코살라', $options: 'i' } }
        ]
    }).toArray();
    console.log('contributions (아유타):', contrib.length);
    contrib.forEach(x => console.log(JSON.stringify({
        _id: x._id,
        status: x.status,
        type: x.type || x.data_type,
        data_name: x.data && x.data.name,
        country_name: x.data && x.data.country_name,
        created_at: x.created_at
    })));
    
    // 최근 contributions (승인된 것들)
    const recent = await db.collection('contributions').find({ status: 'approved' }).sort({ _id: -1 }).limit(10).toArray();
    console.log('\n최근 승인된 contributions:');
    recent.forEach(x => console.log(JSON.stringify({
        _id: x._id,
        status: x.status,
        type: x.type || x.data_type,
        data_name: x.data && x.data.name,
        country_name: x.data && x.data.country_name,
        created_at: x.created_at
    })));
    
    await client.close();
}).catch(e => console.error(e));
