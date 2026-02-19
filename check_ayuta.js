require('dotenv').config({ path: './env' });
const { MongoClient } = require('mongodb');
const client = new MongoClient(process.env.MONGO_URI);

client.connect().then(async () => {
    const db = client.db('realhistory');
    
    // territories에서 아유타 country_name으로 검색
    const t = await db.collection('territories').find({ 
        country_name: { $regex: '코살라|아유타|Ayutthaya|Ayodhya', $options: 'i' }
    }).toArray();
    console.log('territories by country_name:', t.length);
    t.forEach(x => console.log(JSON.stringify({ 
        _id: x._id, 
        name: x.name, 
        country_name: x.country_name,
        start_year: x.start_year, 
        end_year: x.end_year,
        bbox: x.bbox,
        hasGeometry: !!x.geometry
    })));
    
    // 최근 추가된 territories 5개
    const recentT = await db.collection('territories').find({}).sort({ _id: -1 }).limit(5).toArray();
    console.log('\n최근 추가된 territories:');
    recentT.forEach(x => console.log(JSON.stringify({ 
        _id: x._id, 
        name: x.name, 
        country_name: x.country_name,
        start_year: x.start_year, 
        end_year: x.end_year,
        bbox: x.bbox,
        hasGeometry: !!x.geometry
    })));
    
    // 최근 추가된 castles 5개
    const recentC = await db.collection('castles').find({}).sort({ _id: -1 }).limit(5).toArray();
    console.log('\n최근 추가된 castles:');
    recentC.forEach(x => console.log(JSON.stringify({ 
        _id: x._id, 
        name: x.name, 
        country_name: x.country_name,
        lat: x.lat, lng: x.lng,
        built: x.built, destroyed: x.destroyed
    })));
    
    await client.close();
}).catch(e => console.error(e));
