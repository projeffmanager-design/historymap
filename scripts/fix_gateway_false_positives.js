// 관으로 끝나지만 실제 관문이 아닌 항목(기념관, 대사관 등) place_type 되돌리기
// 산해관은 실제 관문이므로 유지
require('dotenv').config();
const { MongoClient } = require('mongodb');

const mongoUri = process.env.MONGO_URI;

// 잘못 분류된 이름 목록 (gateway → normal로 복원)
const FALSE_POSITIVES = ['최치원 기념관', '고려관'];

async function main() {
    const client = new MongoClient(mongoUri);
    await client.connect();
    const castles = client.db('realhistory').collection('castle');

    for (const name of FALSE_POSITIVES) {
        const castle = await castles.findOne({ name });
        if (!castle) { console.log('⚠️ 못찾음:', name); continue; }

        const newHistory = castle.history.map(h => {
            if (h.place_type === 'gateway') {
                console.log(`  🔄 복원: [${name}] gateway → normal`);
                return { ...h, place_type: 'normal' };
            }
            return h;
        });

        await castles.updateOne({ _id: castle._id }, { $set: { history: newHistory } });
        console.log(`  ✅ ${name} 완료`);
    }

    await client.close();
    console.log('\n✅ 정리 완료');
}

main().catch(e => { console.error(e); process.exit(1); });
