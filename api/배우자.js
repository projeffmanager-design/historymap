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
    const spouses = await db.collection('spouses').find({}).toArray();
    const header = '관계ID\t인물A_ID\t인물A\t인물B_ID\t인물B\t관계유형\t비고';
    const rows = spouses.map((s, idx) => {
      const aId = s.personAId||''; const bId = s.personBId||'';
      const aName = s.personAName || nameById[aId] || '';
      const bName = s.personBName || nameById[bId] || '';
      return [s.relationId||`R-${idx+1}`, aId, aName, bId, bName, s.relationType||'', s.note||''].join('\t');
    });
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.status(200).send([header, ...rows].join('\n'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
