require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');

const uri = process.env.MONGO_URI;
if (!uri) {
  console.error("MONGO_URI not set in environment (.env)");
  process.exit(1);
}

/**
 * 이 스크립트는 기존의 독립된 전장 마커(is_battle=true)를 
 * 성/도시 마커로 변환하고, history 레코드에 is_battle 플래그를 추가합니다.
 */
(async () => {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    console.log("Connected to MongoDB");
    
    const db = client.db('realhistory');
    const castles = db.collection('castle');

    // 1. is_battle=true인 모든 마커 찾기
    const battleMarkers = await castles.find({ is_battle: true }).toArray();
    console.log(`\n전장 마커 ${battleMarkers.length}개를 찾았습니다.`);

    if (battleMarkers.length === 0) {
      console.log("변환할 전장 마커가 없습니다.");
      await client.close();
      return;
    }

    let converted = 0;
    let failed = 0;

    for (const battle of battleMarkers) {
      try {
        console.log(`\n처리 중: ${battle.name}`);

        // 2. history 배열 생성 또는 업데이트
        let history = battle.history || [];
        
        // 기존 history가 있으면 전장 전용 레코드를 추가
        // 없으면 새로 생성
        if (history.length === 0) {
          // history가 없는 경우: 새 전장 레코드 생성
          history.push({
            name: battle.name,
            country_id: battle.country_id || null,
            start_year: battle.built_year || battle.start_year || null,
            start_month: battle.built_month || battle.start_month || 1,
            end_year: battle.destroyed_year || battle.end_year || null,
            end_month: battle.destroyed_month || battle.end_month || 12,
            is_capital: false,
            is_battle: true
          });
        } else {
          // history가 이미 있는 경우: 전장 전용 레코드를 새로 추가
          // (기존 레코드는 성의 역사, 전장은 별도 레코드로)
          history.push({
            name: battle.name,
            country_id: battle.country_id || null,
            start_year: battle.built_year || battle.start_year || null,
            start_month: battle.built_month || battle.start_month || 1,
            end_year: battle.destroyed_year || battle.end_year || null,
            end_month: battle.destroyed_month || battle.end_month || 12,
            is_capital: false,
            is_battle: true
          });
        }

        // 3. 문서 업데이트: is_battle 제거, history 업데이트
        const updateResult = await castles.updateOne(
          { _id: battle._id },
          {
            $set: {
              history: history,
              // 최상위 필드도 호환성을 위해 유지하되 is_battle은 제거
              is_battle: false  // 최상위 is_battle 플래그 제거
            }
          }
        );

        if (updateResult.modifiedCount > 0) {
          console.log(`  ✓ ${battle.name} 변환 완료`);
          converted++;
        } else {
          console.log(`  ⚠ ${battle.name} 변환 실패 (업데이트되지 않음)`);
          failed++;
        }

      } catch (err) {
        console.error(`  ✗ ${battle.name} 처리 중 오류:`, err.message);
        failed++;
      }
    }

    console.log(`\n\n=== 마이그레이션 완료 ===`);
    console.log(`성공: ${converted}개`);
    console.log(`실패: ${failed}개`);
    console.log(`총계: ${battleMarkers.length}개`);

  } catch (err) {
    console.error("오류 발생:", err);
  } finally {
    await client.close();
    console.log("\nMongoDB 연결 종료");
  }
})();
