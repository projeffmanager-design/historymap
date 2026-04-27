// Quick verifier: connect to MongoDB and print collections, counts, and a sample doc
// Usage: node playground-2.mongodb.js --uri="<MONGO_URI>"

const { MongoClient } = require('mongodb');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  args.forEach(a => {
    if (a.startsWith('--')) {
      const kv = a.slice(2).split('=');
      out[kv[0]] = kv.slice(1).join('=') || true;
    }
  });
  return out;
}

async function main() {
  const argv = parseArgs();
  const uri = argv.uri || process.env.MONGO_IMPORT_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error('Provide --uri or MONGO_IMPORT_URI / MONGO_URI in env');
    process.exit(2);
  }

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('historyperson');
    const cols = await db.listCollections().toArray();
    console.log('listCollections ->', cols.map(c => c.name));

    const spousesCount = await db.collection('spouses').countDocuments().catch(() => null);
    const parentsCount = await db.collection('parents').countDocuments().catch(() => null);
    const personsCount = await db.collection('persons').countDocuments().catch(() => null);

    console.log('counts -> spouses:', spousesCount, 'parents:', parentsCount, 'persons:', personsCount);

    const sample = await db.collection('persons').findOne({}, { projection: { ID:1, 이름:1, 성별:1 } });
    console.log('sample persons doc ->', sample);
  } catch (err) {
    console.error('Error:', err && err.message ? err.message : err);
  } finally {
    await client.close();
  }
}

main();
