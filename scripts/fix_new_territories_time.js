require('dotenv').config();
const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);

async function fixTimes() {
  try {
    await client.connect();
    const db = client.db('realhistory');
    const territories = db.collection('territories');
    
    console.log('🔧 새 영토에 시간 필드 추가 중...\n');
    
    // 3개 영토에 start_year, end_year 추가 (항상 표시되도록)
    const updates = [
      {
        name: 'Laos',
        start_year: -3000,
        end_year: 3000
      },
      {
        name: 'Zabaykalsky Krai',
        start_year: -3000,
        end_year: 3000
      },
      {
        name: 'Buryatia',
        start_year: -3000,
        end_year: 3000
      }
    ];
    
    for (const update of updates) {
      const result = await territories.updateOne(
        { name: update.name },
        { 
          $set: { 
            start_year: update.start_year,
            end_year: update.end_year,
            start: update.start_year,
            end: update.end_year
          } 
        }
      );
      console.log(`✅ ${update.name}: ${result.modifiedCount}개 업데이트`);
    }
    
    console.log('\n🎉 완료!');
    
  } finally {
    await client.close();
  }
}

fixTimes().catch(console.error);
