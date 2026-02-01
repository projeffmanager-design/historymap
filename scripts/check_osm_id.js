#!/usr/bin/env node
// Checks territories by OSM id(s)
const { MongoClient } = require('mongodb');
const fs = require('fs');

async function main() {
  try {
    let uri = process.env.MONGO_URI;
    if (!uri) {
      const env = fs.readFileSync('.env', 'utf8');
      const m = env.match(/MONGO_URI\s*=\s*\"(.+?)\"/);
      if (m) uri = m[1];
    }
    if (!uri) throw new Error('MONGO_URI not found in environment or .env');

    const client = new MongoClient(uri, { useUnifiedTopology: true });
    await client.connect();
    const db = client.db('realhistory');
    const col = db.collection('territories');

    const osmIds = process.argv.slice(2);
    if (osmIds.length === 0) {
      console.error('Usage: node scripts/check_osm_id.js <osmId1> [osmId2 ...]');
      process.exit(1);
    }

    const variants = [];
    osmIds.forEach(o => {
      variants.push(o);
      if (o.startsWith('r')) variants.push(o.slice(1)); else variants.push('r' + o);
    });

    const docs = await col.find({ osm_id: { $in: variants } }).toArray();
    console.log('Found', docs.length, 'matching territories');
    docs.forEach(d => console.log(d._id.toString(), d.name, d.osm_id));

    await client.close();
  } catch (err) {
    console.error('Error:', err.message || err);
    process.exit(1);
  }
}

main();
