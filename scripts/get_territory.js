#!/usr/bin/env node
const { MongoClient, ObjectId } = require('mongodb');
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

    const arg = process.argv[2];
    if (!arg) {
      console.error('Usage: node scripts/get_territory.js <osm_id|_id>');
      process.exit(1);
    }

    const client = new MongoClient(uri, { useUnifiedTopology: true });
    await client.connect();
    const db = client.db('realhistory');
    const col = db.collection('territories');

    let doc;
    if (arg.match(/^[0-9a-fA-F]{24}$/)) {
      doc = await col.findOne({ _id: ObjectId(arg) });
    } else {
      const variants = [arg];
      if (arg.startsWith('r')) variants.push(arg.slice(1)); else variants.push('r' + arg);
      doc = await col.findOne({ osm_id: { $in: variants } });
    }

    if (!doc) return console.log('Not found');
    console.log(JSON.stringify(doc, null, 2));
    await client.close();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
