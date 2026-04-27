const { MongoClient } = require('mongodb');

// Serverless-friendly MongoDB helper: cache the client across invocations
let cachedClient = null;
let cachedDb = null;

async function getDb() {
  if (cachedDb) return cachedDb;
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGO_IMPORT_URI;
  if (!uri) throw new Error('MONGODB_URI (or MONGO_URI/MONGO_IMPORT_URI) not set');
  const dbName = process.env.MONGODB_DB || 'historyperson';
  if (!cachedClient) {
    cachedClient = new MongoClient(uri, { maxPoolSize: 10 });
    await cachedClient.connect();
  }
  cachedDb = cachedClient.db(dbName);
  return cachedDb;
}

module.exports = async (req, res) => {
  try {
    const db = await getDb();
    const persons = await db.collection('persons').find({}).sort({ ID: 1 }).toArray();
    res.setHeader('Content-Type', 'text/tab-separated-values; charset=utf-8');
    const header = ['ID','이름','성별','생','졸','비고'];
    const lines = [header.join('\t')];
    for (const p of persons) {
      lines.push([p.ID||'', p['이름']||'', p['성별']||'', p['생']||'', p['졸']||'', p['비고']||''].join('\t'));
    }
    res.status(200).send(lines.join('\n'));
  } catch (err) {
    console.error('/api/persons error', err && err.message ? err.message : err);
    res.status(500).send('server error');
  }
};
