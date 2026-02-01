#!/usr/bin/env node
const { MongoClient, ObjectId } = require('mongodb');
const fs = require('fs');

function isActiveHistory(record, totalMonths) {
  if (!record) return false;
  const sYear = record.start_year || record.start || -10000;
  const sMonth = record.start_month || record.start_month || 1;
  const eYear = record.end_year || record.end || 10000;
  const eMonth = record.end_month || record.end_month || 12;
  const startTotal = sYear * 12 + (sMonth - 1);
  const endTotal = eYear * 12 + (eMonth - 1);
  return totalMonths >= startTotal && totalMonths <= endTotal;
}

(async function(){
  try {
    const env = fs.readFileSync('.env','utf8');
    const m = env.match(/MONGO_URI\s*=\s*"(.+?)"/);
    const uri = m && m[1];
    if (!uri) throw new Error('MONGO_URI not found');

    const arg = process.argv[2];
    if (!arg) return console.error('Usage: node scripts/find_castles_in_bbox.js <minLat,minLng,maxLat,maxLng> <year>');

    const bbox = arg.split(',').map(Number);
    const year = parseInt(process.argv[3]||1562,10);
    const totalMonths = year * 12;

    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db('realhistory');
    const col = db.collection('castles');

    const [minLat, minLng, maxLat, maxLng] = bbox;
    const docs = await col.find({ lat: { $gte: minLat, $lte: maxLat }, lng: { $gte: minLng, $lte: maxLng } }).toArray();
    console.log('Found', docs.length, 'castles in bbox');
    for(const d of docs) {
      const active = (d.history||[]).filter(rec=>{
        const sYear = rec.start_year || rec.start || -10000;
        const sMonth = rec.start_month || rec.start_month || 1;
        const eYear = rec.end_year || rec.end || 10000;
        const eMonth = rec.end_month || rec.end_month || 12;
        const startTotal = sYear * 12 + (sMonth - 1);
        const endTotal = eYear * 12 + (eMonth - 1);
        return totalMonths >= startTotal && totalMonths <= endTotal;
      });
      console.log(d._id.toString(), d.name, d.lat, d.lng, 'activeHistoryCount:', active.length);
      active.forEach(a=>console.log('  ',a.name,a.country_id,a.start_year,a.end_year,a.start_month,a.end_month));
    }

    await client.close();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
