const { MongoClient } = require('mongodb');

let cachedClient = null;
let cachedDb = null;

async function getDb() {
  if (cachedDb) return cachedDb;
  const uri = process.env.MONGO_URI || process.env.MONGO_IMPORT_URI;
  if (!uri) throw new Error('MONGO_URI not set');
  if (!cachedClient) {
    cachedClient = new MongoClient(uri, { maxPoolSize: 10 });
    await cachedClient.connect();
  }
  cachedDb = cachedClient.db('historyperson');
  return cachedDb;
}

module.exports = async (req, res) => {
  try {
    const db = await getDb();
    const persons = await db.collection('persons').find({}).project({ ID:1, 이름:1 }).toArray();
    const nameById = {};
    persons.forEach(p => { if (p.ID) nameById[p.ID] = p['이름'] || ''; });
    const spouses = await db.collection('spouses').find({}).toArray();
    res.setHeader('Content-Type', 'text/tab-separated-values; charset=utf-8');
    const header = ['관계ID','인물A_ID','인물A','인물B_ID','인물B','관계유형','비고'];
    const lines = [header.join('\t')];
    spouses.forEach((s, idx) => {
      const aId = s.personAId || '';
      const bId = s.personBId || '';
      const aName = s.personAName || nameById[aId] || '';
      const bName = s.personBName || nameById[bId] || '';
      lines.push([s.relationId || `R-${idx+1}`, aId, aName, bId, bName, s.relationType || '', s.note || ''].join('\t'));
    });
    res.status(200).send(lines.join('\n'));
  } catch (err) {
    console.error('/api/spouses error', err && err.message ? err.message : err);
    res.status(500).send('server error');
  }
};
