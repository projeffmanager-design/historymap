require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');

const uri = process.env.MONGO_URI;
if (!uri) {
  console.error("MONGO_URI not set in environment (.env)");
  process.exit(1);
}

async function normalizeLegacyToHistory(doc, countriesColl) {
  // Build a history entry from legacy fields if possible
  const entry = {};
  entry.name = doc.name || '';

  // Preserve existing country_id if ObjectId-like, otherwise try to resolve by name
  if (doc.country_id) {
    entry.country_id = doc.country_id;
  } else if (doc.country) {
    // try to find country by name
    const countryDoc = await countriesColl.findOne({ name: doc.country });
    if (countryDoc) entry.country_id = countryDoc._id;
    else entry.country_name = doc.country;
  } else {
    entry.country_id = null;
  }

  // start/built
  entry.start_year = doc.built_year ?? doc.built ?? doc.start ?? null;
  entry.start_month = doc.built_month ?? doc.start_month ?? 1;

  // end/destroyed
  entry.end_year = doc.destroyed_year ?? doc.destroyed ?? doc.end ?? null;
  entry.end_month = doc.destroyed_month ?? doc.end_month ?? 12;

  entry.is_capital = !!doc.is_capital;

  // Only return a meaningful entry if at least start_year exists or name/country present
  if (entry.start_year === null && !entry.name && !entry.country_name) return null;
  return entry;
}

(async () => {
  const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
  try {
    await client.connect();
    const db = client.db('realhistory');
    const castles = db.collection('castle');
    const countries = db.collection('countries');

    // Find documents that likely still have legacy fields and no history
    const cursor = castles.find({ $or: [ { history: { $exists: false } }, { history: { $size: 0 } } ] });

    let count = 0;
    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      const entry = await normalizeLegacyToHistory(doc, countries);
      if (!entry) continue;

      // Only set history; do NOT remove legacy fields to preserve backward compatibility
      const updateOps = { $set: { history: [ entry ] } };

      await castles.updateOne({ _id: doc._id }, updateOps);
      console.log(`Migrated castle _id=${doc._id}`);
      count++;
    }

    console.log(`Migration finished. Documents updated: ${count}`);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
})();
