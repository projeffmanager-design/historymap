// 기존 is_capital:true 인 성들의 history 레코드에 place_type:'capital' 설정
// 실행: node scripts/migrate_capital_to_place_type.js

require('dotenv').config();
const { MongoClient } = require('mongodb');

const mongoUri = process.env.MONGO_URI;
if (!mongoUri) throw new Error('MONGO_URI 환경 변수가 없습니다.');

async function main() {
    const client = new MongoClient(mongoUri);
    await client.connect();
    const db = client.db('realhistory');
    const castles = db.collection('castle');

    // 1) is_capital:true 인 성 전체 조회
    const capitalCastles = await castles.find({ is_capital: true }).toArray();
    console.log(`🔍 is_capital:true 성 개수: ${capitalCastles.length}`);

    let updatedCastles = 0;
    let updatedHistoryRecords = 0;
    let alreadyDone = 0;

    for (const castle of capitalCastles) {
        const history = castle.history || [];
        let changed = false;

        const newHistory = history.map(h => {
            // 이미 place_type이 있으면 건드리지 않음
            if (h.place_type) {
                alreadyDone++;
                return h;
            }
            // is_capital 플래그가 있거나, history가 1개뿐인 경우 capital로 설정
            if (h.is_capital || history.length === 1) {
                changed = true;
                updatedHistoryRecords++;
                return { ...h, place_type: 'capital' };
            }
            return h;
        });

        // history가 비어있거나 모두 place_type 없는 경우: 첫 번째 레코드에 capital 설정
        if (!changed && newHistory.length > 0 && !newHistory[0].place_type) {
            newHistory[0] = { ...newHistory[0], place_type: 'capital' };
            changed = true;
            updatedHistoryRecords++;
        }

        if (changed) {
            await castles.updateOne(
                { _id: castle._id },
                { $set: { history: newHistory } }
            );
            updatedCastles++;
            console.log(`  ✅ 업데이트: ${castle.name || castle._id} (history ${history.length}건)`);
        }
    }

    console.log('\n📊 마이그레이션 결과:');
    console.log(`  - 대상 성 총계: ${capitalCastles.length}`);
    console.log(`  - 업데이트된 성: ${updatedCastles}`);
    console.log(`  - 업데이트된 history 레코드: ${updatedHistoryRecords}`);
    console.log(`  - 이미 place_type 있던 레코드: ${alreadyDone}`);

    await client.close();
    console.log('\n✅ 완료');
}

main().catch(e => { console.error(e); process.exit(1); });
