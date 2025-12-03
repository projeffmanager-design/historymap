require('dotenv').config();
const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_URI;
if (!uri) {
  console.error("MONGO_URI not set in environment (.env)");
  process.exit(1);
}

(async () => {
  const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
  try {
    await client.connect();
    console.log('Connected to MongoDB\n');
    
    const db = client.db('realhistory');
    const castles = db.collection('castle');

    // 1. is_battle이 최상위에 있는 것들 확인
    const topLevelBattles = await castles.find({ is_battle: true }).toArray();
    console.log(`🔍 최상위 is_battle=true인 성: ${topLevelBattles.length}개`);
    if (topLevelBattles.length > 0) {
      console.log('예시:', topLevelBattles.slice(0, 3).map(c => ({
        name: c.name,
        is_battle: c.is_battle,
        has_history: Array.isArray(c.history) && c.history.length > 0
      })));
    }
    console.log('');

    // 2. history 배열 안에 is_battle이 있는 것들 확인
    const historyBattles = await castles.find({ 
      'history.is_battle': true 
    }).toArray();
    console.log(`💥 역사 레코드에 is_battle=true인 성: ${historyBattles.length}개`);
    if (historyBattles.length > 0) {
      console.log('예시:');
      historyBattles.slice(0, 5).forEach(c => {
        const battleRecords = c.history.filter(h => h.is_battle);
        console.log(`  - ${c.name}: ${battleRecords.length}개 전장 기록`);
        battleRecords.forEach(h => {
          console.log(`    ✓ ${h.name} (${h.start_year}년 ~ ${h.end_year || '현재'})`);
        });
      });
    }
    console.log('');

    // 3. 전체 히스토리 레코드 중 is_battle이 있는지 확인
    const allWithHistory = await castles.find({ 
      history: { $exists: true, $ne: [] } 
    }).toArray();
    
    let totalBattleRecords = 0;
    allWithHistory.forEach(c => {
      if (Array.isArray(c.history)) {
        const battleCount = c.history.filter(h => h.is_battle === true).length;
        totalBattleRecords += battleCount;
      }
    });
    
    console.log(`📊 통계:`);
    console.log(`  - 역사 기록이 있는 성: ${allWithHistory.length}개`);
    console.log(`  - 전체 전장 역사 레코드: ${totalBattleRecords}개`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
    console.log('\nMongoDB 연결 종료');
  }
})();
