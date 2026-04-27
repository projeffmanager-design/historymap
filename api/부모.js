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
    const persons = await db.collection('persons').find({}).project({ ID:1, 이름:1 }).toArray();
    const nameById = {};
    persons.forEach(p => { if (p.ID) nameById[p.ID] = p['이름']||''; });
    const parents = await db.collection('parents').find({}).toArray();
    const header = '관계ID\t자식_ID\t자식_이름\t부_ID\t부_이름\t모_ID\t모_이름\t관계유형\t비고';
    const rows = parents.map((r, idx) => {
      const childId = r.childId||''; const fatherId = r.fatherId||''; const motherId = r.motherId||'';
      const childName = r.childName || nameById[childId] || '';
      const fatherName = r.fatherName || nameById[fatherId] || '';
      const motherName = r.motherName || nameById[motherId] || '';
      return [r.relationId||`P-${idx+1}`, childId, childName, fatherId, fatherName, motherId, motherName, r.relationType||'', r.note||''].join('\t');
    });
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.status(200).send([header, ...rows].join('\n'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
