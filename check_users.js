const { MongoClient } = require('mongodb');

async function checkUsers() {
  try {
    const client = new MongoClient('mongodb://localhost:27017');
    await client.connect();
    const db = client.db('realhistory');
    const users = await db.collection('users').find({}).toArray();
    console.log('사용자 목록:');
    users.forEach(u => {
      console.log(`${u.username}: password=${!!u.password}, role=${u.role}`);
    });
    await client.close();
  } catch(e) {
    console.error('Error:', e.message);
  }
}

checkUsers();