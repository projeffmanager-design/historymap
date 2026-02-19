require('dotenv').config({ path: './env' });
const { MongoClient } = require('mongodb');
const client = new MongoClient(process.env.MONGO_URI);

client.connect().then(async () => {
    const db = client.db('realhistory');
    
    // 최근 승인된 contributions 전체 데이터 확인
    const recent = await db.collection('contributions').find({ status: 'approved' }).sort({ _id: -1 }).limit(5).toArray();
    console.log('최근 승인된 contributions 전체:');
    recent.forEach(x => {
        const out = { _id: x._id, status: x.status, type: x.type, data_type: x.data_type };
        if (x.data) out.data_keys = Object.keys(x.data);
        if (x.data && x.data.name) out.data_name = x.data.name;
        if (x.data && x.data.country_name) out.data_country = x.data.country_name;
        console.log(JSON.stringify(out));
    });
    
    // 오늘 만들어진 모든 contributions
    const today = new Date();
    today.setHours(0,0,0,0);
    const todayContrib = await db.collection('contributions').find({
        created_at: { $gte: today }
    }).sort({ _id: -1 }).toArray();
    console.log('\n오늘 생성된 contributions:', todayContrib.length);
    todayContrib.forEach(x => {
        console.log(JSON.stringify({
            _id: x._id, status: x.status, type: x.type, data_type: x.data_type,
            name: x.data && x.data.name,
            country: x.data && x.data.country_name,
            created_at: x.created_at
        }));
    });
    
    await client.close();
}).catch(e => console.error(e));
