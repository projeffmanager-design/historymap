const { MongoClient } = require('mongodb');

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
    const persons = await db.collection('persons').find({}).project({ ID:1, 이름:1 }).toArray();
    const nameById = {};
    persons.forEach(p => { if (p.ID) nameById[p.ID] = p['이름'] || ''; });
    const parents = await db.collection('parents').find({}).toArray();
    res.setHeader('Content-Type', 'text/tab-separated-values; charset=utf-8');
    const header = ['관계ID','자식_ID','자식_이름','부_ID','부_이름','모_ID','모_이름','관계유형','비고'];
    const lines = [header.join('\t')];
    parents.forEach((r, idx) => {
      const childId = r.childId || '';
      const fatherId = r.fatherId || '';
      const motherId = r.motherId || '';
      const childName = r.childName || nameById[childId] || '';
      const fatherName = r.fatherName || nameById[fatherId] || '';
      const motherName = r.motherName || nameById[motherId] || '';
      lines.push([r.relationId || `P-${idx+1}`, childId, childName, fatherId, fatherName, motherId, motherName, r.relationType || '', r.note || ''].join('\t'));
    });
    res.status(200).send(lines.join('\n'));
  } catch (err) {
    console.error('/api/parents error', err && err.message ? err.message : err);
    res.status(500).send('server error');
  }
};
