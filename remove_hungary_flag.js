require('dotenv').config();
require('dotenv').config({ path: '.env.local', override: false });

const { connectToDatabase } = require('./db');

const BLOCKED_FLAG_URL = [
  'https://png.pngtree.com',
  '/png-clipart/20250215/original/',
  'pngtree-hungary-flag-waving-with-pole-png-image_19645511.png'
].join('');

async function main() {
  const { collections } = await connectToDatabase();
  const result = await collections.countries.updateMany(
    { flag: BLOCKED_FLAG_URL },
    { $set: { flag: null } }
  );

  console.log(JSON.stringify({
    matchedCount: result.matchedCount,
    modifiedCount: result.modifiedCount,
    blockedFlagUrl: BLOCKED_FLAG_URL
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
