// 성의 history 레코드 이름 끝 글자 기준으로 place_type 자동 설정
// 규칙: 끝글자 城/성→seong, 州/주→ju, 郡/군→gun, 縣/현→hyeon, 鎭/진→jin, 關/관→gateway
// 제외: place_type이 이미 'capital' 또는 'battle'인 레코드는 건드리지 않음
// 실행: node scripts/migrate_name_to_place_type.js

require('dotenv').config();
const { MongoClient } = require('mongodb');

const mongoUri = process.env.MONGO_URI;
if (!mongoUri) throw new Error('MONGO_URI 환경 변수가 없습니다.');

// 이름 끝 글자 → place_type 매핑
const SUFFIX_MAP = {
    // 한자
    '城': 'seong', '州': 'ju', '郡': 'gun', '縣': 'hyeon', '鎭': 'jin',
    // 한글
    '성': 'seong', '주': 'ju', '군': 'gun', '현': 'hyeon', '진': 'jin',
    // '관'은 제외 — 기념관/대사관 등 오분류 위험
};

// 보호 타입 (덮어쓰지 않음)
const PROTECTED = new Set(['capital', 'battle']);

function inferPlaceType(name) {
    if (!name || typeof name !== 'string') return null;
    const trimmed = name.trim();
    if (!trimmed) return null;
    const last = trimmed.slice(-1);
    return SUFFIX_MAP[last] || null;
}

async function main() {
    const client = new MongoClient(mongoUri);
    await client.connect();
    const db = client.db('realhistory');
    const castles = db.collection('castle');

    // place_type이 없거나 'normal'인 history를 가진 성 전체 조회
    const allCastles = await castles.find({}).toArray();
    console.log(`🔍 전체 성 개수: ${allCastles.length}`);

    let updatedCastles = 0;
    let updatedRecords = 0;
    let skippedProtected = 0;
    let skippedNoMatch = 0;

    const stats = {};

    for (const castle of allCastles) {
        const history = castle.history;
        if (!Array.isArray(history) || history.length === 0) continue;

        let changed = false;
        const newHistory = history.map(h => {
            // 보호 타입은 건드리지 않음
            if (h.place_type && PROTECTED.has(h.place_type)) {
                skippedProtected++;
                return h;
            }
            // 이미 명시적 place_type이 있으면 건드리지 않음 (normal 제외)
            if (h.place_type && h.place_type !== 'normal') {
                skippedProtected++;
                return h;
            }

            // 이름: history 레코드의 name → 없으면 castle.name 사용
            const name = h.name || castle.name || '';
            const inferred = inferPlaceType(name);

            if (!inferred) {
                skippedNoMatch++;
                return h;
            }

            // 변경
            changed = true;
            updatedRecords++;
            stats[inferred] = (stats[inferred] || 0) + 1;
            console.log(`  ✅ [${inferred}] ${name} (castle: ${castle.name || castle._id})`);
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

    console.log('\n📊 마이그레이션 결과:');
    console.log(`  - 전체 성: ${allCastles.length}`);
    console.log(`  - 업데이트된 성: ${updatedCastles}`);
    console.log(`  - 업데이트된 history 레코드: ${updatedRecords}`);
    console.log(`  - 보호(capital/battle/기존타입) 스킵: ${skippedProtected}`);
    console.log(`  - 이름 미매칭 스킵: ${skippedNoMatch}`);
    console.log('\n  타입별:');
    for (const [type, count] of Object.entries(stats)) {
        console.log(`    ${type}: ${count}건`);
    }

    await client.close();
    console.log('\n✅ 완료');
}

main().catch(e => { console.error(e); process.exit(1); });
