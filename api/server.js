const express = require('express');
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

const DEFAULT_PORT = process.env.PORT || 8000;
// Prefer env var, fallback to dbusers file if present
let MONGO_URI = process.env.MONGO_IMPORT_URI || process.env.MONGO_URI || '';
if (!MONGO_URI) {
  // try to read dbusers file
  try {
    const dbusers = fs.readFileSync(path.join(__dirname, '..', 'dbusers'), 'utf8');
    const m = dbusers.match(/mongodb\+srv:\/\/[^\s"']+/);
    if (m) MONGO_URI = m[0];
  } catch (e) {}
}
if (!MONGO_URI) {
  console.error('No MongoDB URI provided. Set MONGO_IMPORT_URI or put URI in ../dbusers file.');
  process.exit(1);
}

const app = express();
let client;
let db;

async function ensureDb() {
  if (db) return db;
  client = new MongoClient(MONGO_URI, { maxPoolSize: 10 });
  await client.connect();
  db = client.db('historyperson');
  return db;
}

function toTSV(rows, header) {
  const lines = [header.join('\t')];
  for (const r of rows) {
    const escaped = r.map(c => (c === undefined || c === null) ? '' : String(c).replace(/\t/g, ' '));
    lines.push(escaped.join('\t'));
  }
  return lines.join('\n');
}

app.get('/api/인물', async (req, res) => {
  try {
    const db = await ensureDb();
    const persons = await db.collection('persons').find({}).sort({ ID: 1 }).toArray();
    const header = ['ID','이름','성별','생','졸','비고'];
    const rows = persons.map(p => [p.ID || '', p['이름'] || '', p['성별'] || '', p['생'] || '', p['졸'] || '', p['비고'] || '']);
    res.set('Content-Type', 'text/tab-separated-values; charset=utf-8');
    res.send(toTSV(rows, header));
  } catch (err) {
    console.error('/api/인물 error', err && err.message ? err.message : err);
    res.status(500).send('server error');
  }
});

app.get('/api/배우자', async (req, res) => {
  try {
    const db = await ensureDb();
    const persons = await db.collection('persons').find({}).project({ ID:1, 이름:1 }).toArray();
    const nameById = {};
    persons.forEach(p => { if (p.ID) nameById[p.ID] = p['이름'] || ''; });
    const spouses = await db.collection('spouses').find({}).toArray();
    const header = ['관계ID','인물A_ID','인물A','인물B_ID','인물B','관계유형','비고'];
    const rows = spouses.map((s, idx) => {
      const aId = s.personAId || '';
      const bId = s.personBId || '';
      const aName = s.personAName || nameById[aId] || '';
      const bName = s.personBName || nameById[bId] || '';
      return [s.relationId || (`R-${idx+1}`), aId, aName, bId, bName, s.relationType || '', s.note || ''];
    });
    res.set('Content-Type', 'text/tab-separated-values; charset=utf-8');
    res.send(toTSV(rows, header));
  } catch (err) {
    console.error('/api/배우자 error', err && err.message ? err.message : err);
    res.status(500).send('server error');
  }
});

app.get('/api/부모', async (req, res) => {
  try {
    const db = await ensureDb();
    const persons = await db.collection('persons').find({}).project({ ID:1, 이름:1 }).toArray();
    const nameById = {};
    persons.forEach(p => { if (p.ID) nameById[p.ID] = p['이름'] || ''; });
    const parents = await db.collection('parents').find({}).toArray();
    const header = ['관계ID','자식_ID','자식_이름','부_ID','부_이름','모_ID','모_이름','관계유형','비고'];
    const rows = parents.map((r, idx) => {
      const childId = r.childId || '';
      const fatherId = r.fatherId || '';
      const motherId = r.motherId || '';
      const childName = r.childName || nameById[childId] || '';
      const fatherName = r.fatherName || nameById[fatherId] || '';
      const motherName = r.motherName || nameById[motherId] || '';
      return [r.relationId || (`P-${idx+1}`), childId, childName, fatherId, fatherName, motherId, motherName, r.relationType || '', r.note || ''];
    });
    res.set('Content-Type', 'text/tab-separated-values; charset=utf-8');
    res.send(toTSV(rows, header));
  } catch (err) {
    console.error('/api/부모 error', err && err.message ? err.message : err);
    res.status(500).send('server error');
  }
});

app.use('/', express.static(path.join(__dirname, '..')));

app.listen(DEFAULT_PORT, () => {
  console.log(`API server listening on http://localhost:${DEFAULT_PORT}`);
});
