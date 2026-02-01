#!/usr/bin/env node
// Finds territories active at a given year and optionally containing a string in name/description
const { MongoClient } = require('mongodb');
const fs = require('fs');

async function main() {
  try {
    let uri = process.env.MONGO_URI;
    if (!uri) {
      const env = fs.readFileSync('.env', 'utf8');
      const m = env.match(/MONGO_URI\s*=\s*"(.+?)"/);
      if (m) uri = m[1];
    }
    if (!uri) throw new Error('MONGO_URI not found');

    const year = parseInt(process.argv[2], 10);
    if (isNaN(year)) {
      console.error('Usage: node scripts/find_territories_by_year.js <year> [searchText]');
      process.exit(1);
    }
    const searchText = process.argv[3];

    const client = new MongoClient(uri, { useUnifiedTopology: true });
    await client.connect();
    const db = client.db('realhistory');
    const col = db.collection('territories');

    const query = { start_year: { $lte: year }, end_year: { $gte: year } };
    if (searchText) {
      query.$or = [
        { name: { $regex: searchText, $options: 'i' } },
        { description: { $regex: searchText, $options: 'i' } },
      ];
    }

    const docs = await col.find(query).project({ name:1, osm_id:1, start_year:1, end_year:1, country:1, bbox:1, _id:1 }).toArray();
    console.log('Found', docs.length, 'territories active in', year);
    docs.forEach(d => console.log(d._id.toString(), d.name, d.osm_id, `${d.start_year}~${d.end_year}`, d.country));

    await client.close();
  } catch (err) {
    console.error('Error:', err.message || err);
    process.exit(1);
  }
}

main();
