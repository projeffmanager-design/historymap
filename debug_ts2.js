const { MongoClient, ObjectId } = require('mongodb');
async function main() {
    const client = new MongoClient(process.env.MONGO_URI);
    await client.connect();
    const db = client.db('realhistory');

    const marker = await db.collection('castles').findOne({ name: '대마도(對馬島)' });
    console.log('lat:', marker.lat, 'lng:', marker.lng, 'deleted:', marker.deleted);
    for (const h of (marker.history || [])) {
        console.log(h.start_year + '~' + h.end_year + ': ' + h.country_id);
    }

    const countryIds = [...new Set((marker.history || []).map(h => h.country_id).filter(Boolean))];
    for (const cid of countryIds) {
        let c;
        try { c = await db.collection('countries').findOne({ _id: new ObjectId(cid) }); } catch(e) {}
        if (!c) c = await db.collection('countries').findOne({ _id: cid });
        console.log(cid, '->', c ? c.name : 'NOT FOUND');
    }

    await client.close();
}
main().catch(console.error);
