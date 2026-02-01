#!/usr/bin/env node
const { MongoClient } = require('mongodb');
const fs = require('fs');
(async function(){
  try {
    const env = fs.readFileSync('.env','utf8');
    const m = env.match(/MONGO_URI\s*=\s*"(.+?)"/);
    const uri = m && m[1];
    if (!uri) throw new Error('MONGO_URI not found');
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db('realhistory');
    const col = db.collection('countries');
    const docs = await col.find({ $or: [{ name: /신라/ }, { name_en: /Silla/i }] }).toArray();
    console.log('Found', docs.length);
    docs.forEach(d => console.log(d._id.toString(), d.name, d.name_en));
    await client.close();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
