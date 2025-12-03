require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');

const uri = process.env.MONGO_URI;
if (!uri) {
  console.error("MONGO_URI not set in environment (.env)");
  process.exit(1);
}

/**
 * 마이그레이션 롤백: history에서 is_battle 레코드를 제거하고 
 * 최상위 is_battle을 true로 되돌립니다.
 */
(async () => {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    console.log("Connected to MongoDB");
    
    const db = client.db('realhistory');
    const castles = db.collection('castle');

    // history에 is_battle=true인 레코드가 있는 모든 문서 찾기
    const battleDocs = await castles.find({ 
      'history.is_battle': true 
    }).toArray();
    
    console.log(`\n전장 레코드가 있는 문서 ${battleDocs.length}개를 찾았습니다.`);

    if (battleDocs.length === 0) {
      console.log("롤백할 문서가 없습니다.");
      await client.close();
      return;
    }

    let rolledBack = 0;
    let failed = 0;

    for (const doc of battleDocs) {
      try {
        console.log(`\n처리 중: ${doc.name}`);

        // history에서 is_battle=true인 레코드 찾기
        const battleRecords = doc.history.filter(h => h.is_battle === true);
        
        if (battleRecords.length > 0) {
          const battleRecord = battleRecords[0]; // 첫 번째 전장 레코드
          
          console.log(`  전장 레코드 발견: ${battleRecord.name}`);
          console.log(`  기간: ${battleRecord.start_year}년 ${battleRecord.start_month}월 ~ ${battleRecord.end_year}년 ${battleRecord.end_month}월`);
          
          // history에서 전장 레코드 제거
          const newHistory = doc.history.filter(h => h.is_battle !== true);
          
          // 최상위 필드를 전장 데이터로 복원
          const updateResult = await castles.updateOne(
            { _id: doc._id },
            {
              $set: {
                is_battle: true,  // 최상위 is_battle 플래그 복원
                built_year: battleRecord.start_year,
                built_month: battleRecord.start_month,
                destroyed_year: battleRecord.end_year,
                destroyed_month: battleRecord.end_month,
                history: newHistory.length > 0 ? newHistory : []  // 빈 배열이면 제거
              }
            }
          );

          if (updateResult.modifiedCount > 0) {
            console.log(`  ✓ ${doc.name} 롤백 완료`);
            rolledBack++;
          } else {
            console.log(`  ⚠ ${doc.name} 롤백 실패`);
            failed++;
          }
        }

      } catch (err) {
        console.error(`  ✗ ${doc.name} 처리 중 오류:`, err.message);
        failed++;
      }
    }

    console.log(`\n\n=== 롤백 완료 ===`);
    console.log(`성공: ${rolledBack}개`);
    console.log(`실패: ${failed}개`);
    console.log(`총계: ${battleDocs.length}개`);

  } catch (err) {
    console.error("오류 발생:", err);
  } finally {
    await client.close();
    console.log("\nMongoDB 연결 종료");
  }
})();
