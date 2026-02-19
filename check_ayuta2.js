require('dotenv').config({ path: './env' });
const { MongoClient, ObjectId } = require('mongodb');
const client = new MongoClient(process.env.MONGO_URI);

client.connect().then(async () => {
    const db = client.db('realhistory');
    
    const c = await db.collection('countries').findOne({ 
        name: { $regex: '아유타', $options: 'i' }
    });
    console.log('country full data:');
    console.log(JSON.stringify(c, null, 2));
    
    // 이 country_id로 territories 검색
    if (c && c._id) {
        const t = await db.collection('territories').find({
            $or: [
                { country_id: c._id.toString() },
                { country_name: c.name }
            ]
        }).toArray();
        console.log('\nterritories by this country:', t.length);
        t.forEach(x => console.log(JSON.stringify({ 
            _id: x._id, name: x.name, country_name: x.country_name, start_year: x.start_year, end_year: x.end_year 
        })));
    }
    
    await client.close();
}).catch(e => console.error(e));
