// 역사 기록에 is_battle 필드가 저장되어 있는지 확인하는 스크립트
require('dotenv').config();
const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);

async function checkHistoryIsBattle() {
    try {
        await client.connect();
        console.log('MongoDB 연결 성공');
        
        const db = client.db('realhistory');
        const castlesCollection = db.collection('castle');
        
        // history 배열에 is_battle 필드가 있는 모든 성 찾기
        const castlesWithBattleHistory = await castlesCollection.find({
            'history.is_battle': { $exists: true }
        }).toArray();
        
        console.log(`\n역사 기록에 is_battle 필드가 있는 성: ${castlesWithBattleHistory.length}개\n`);
        
        // 각 성의 is_battle이 true인 역사 기록 출력
        for (const castle of castlesWithBattleHistory) {
            console.log(`\n성 이름: ${castle.name}`);
            console.log(`ID: ${castle._id}`);
            console.log(`역사 기록 개수: ${castle.history?.length || 0}`);
            
            if (castle.history && castle.history.length > 0) {
                castle.history.forEach((record, index) => {
                    if (record.is_battle !== undefined) {
                        console.log(`  - 기록 ${index + 1}: ${record.name}`);
                        console.log(`    is_battle: ${record.is_battle}`);
                        console.log(`    기간: ${record.start_year || '?'}년 ~ ${record.end_year || '?'}년`);
                    }
                });
            }
        }
        
        // is_battle이 true인 역사 기록만 출력
        console.log('\n\n=== is_battle=true인 역사 기록만 ===\n');
        for (const castle of castlesWithBattleHistory) {
            const battleRecords = castle.history?.filter(r => r.is_battle === true) || [];
            if (battleRecords.length > 0) {
                console.log(`\n성 이름: ${castle.name}`);
                battleRecords.forEach((record, index) => {
                    console.log(`  - ${record.name} (${record.start_year}년 ~ ${record.end_year}년)`);
                });
            }
        }
        
    } catch (error) {
        console.error('오류 발생:', error);
    } finally {
        await client.close();
        console.log('\n\nMongoDB 연결 종료');
    }
}

checkHistoryIsBattle();
