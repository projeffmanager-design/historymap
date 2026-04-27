import { MongoClient } from 'mongodb';

let cached = global._mongo;
if (!cached) cached = global._mongo = { client: null };

async function getDb() {
  if (!cached.client) {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) throw new Error('MONGODB_URI not set');
    cached.client = new MongoClient(uri);
    await cached.client.connect();
  }
  return cached.client.db(process.env.MONGODB_DB || 'historyperson');
}

export default async function handler(req, res) {
  try {
    const db = await getDb();
    const persons = await db.collection('persons').find({}).sort({ ID: 1 }).toArray();
    const header = 'ID\t이름\t성별\t생\t졸\t비고';
    const rows = persons.map(p => [p.ID||'', p['이름']||'', p['성별']||'', p['생']||'', p['졸']||'', p['비고']||''].join('\t'));
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.status(200).send([header, ...rows].join('\n'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
