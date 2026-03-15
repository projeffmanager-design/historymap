// place_type이 normal(또는 없음)인 history 레코드 중
// 이름에 '郡' 포함 → gun, '州' 포함 → ju 로 변환
// 실행: node scripts/migrate_hanja_in_name.js

require('dotenv').config();
const { MongoClient } = require('mongodb');

const mongoUri = process.env.MONGO_URI;
if (!mongoUri) throw new Error('MONGO_URI 환경 변수가 없습니다.');

// 보호 타입 — 절대 덮어쓰지 않음
const PROTECTED = new Set(['capital', 'battle', 'ju', 'gun', 'hyeon', 'seong', 'jin', 'gateway']);

function inferFromHanja(name) {
    if (!name) return null;
    if (name.includes('郡')) return 'gun';
    if (name.includes('州')) return 'ju';
    if (name.includes('城')) return 'seong';
    return null;
}

async function main() {
    const client = new MongoClient(mongoUri);
    await client.connect();
    const castles = client.db('realhistory').collection('castle');

    const allCastles = await castles.find({}).toArray();
    console.log(`🔍 전체 성 개수: ${allCastles.length}`);

    let updatedCastles = 0;
    let updatedRecords = 0;
    const stats = { gun: 0, ju: 0 };

    for (const castle of allCastles) {
        const history = castle.history;
        if (!Array.isArray(history) || history.length === 0) continue;

        let changed = false;
        const newHistory = history.map(h => {
            // 보호 타입은 건드리지 않음
            if (h.place_type && PROTECTED.has(h.place_type)) return h;

            const name = h.name || castle.name || '';
            const inferred = inferFromHanja(name);
            if (!inferred) return h;

            changed = true;
            updatedRecords++;
            stats[inferred]++;
            console.log(`  ✅ [${inferred}] "${name}" (castle: ${castle.name || castle._id})`);
            return { ...h, place_type: inferred };
        });

        if (changed) {
            await castles.updateOne(
                { _id: castle._id },
                { $set: { history: newHistory } }
            );
            updatedCastles++;
        }
    }

    console.log('\n📊 결과:');
    console.log(`  - 업데이트된 성: ${updatedCastles}`);
    console.log(`  - 업데이트된 레코드: ${updatedRecords}`);
    console.log(`  - 군(gun): ${stats.gun}건`);
    console.log(`  - 주(ju): ${stats.ju}건`);

    await client.close();
    console.log('\n✅ 완료');
}

main().catch(e => { console.error(e); process.exit(1); });
