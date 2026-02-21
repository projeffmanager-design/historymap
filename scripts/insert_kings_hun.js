/**
 * 훈 제국 (Hunnic Empire) 왕 데이터 삽입 스크립트
 * - 흉노 초기 선우 3명 (BC)
 * - 유럽 훈제국 왕계보 7명 (AD)
 * 실행: node scripts/insert_kings_hun.js
 */

const { MongoClient, ObjectId } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = 'realhistory';

const COUNTRY_ID = new ObjectId('68dc7f9ade5169a850293fda'); // 훈 제국 (Hunnic Empire)

const NEW_KINGS = [
    // ── 흉노 초기 선우 (BC) ──────────────────────────────────
    { name: '두만 선우(頭曼)',   start: -220, end: -209, summary: '흉노의 초대 선우. 유목 부족들을 통합하여 대제국의 기반을 세움.' },
    { name: '묵특 선우(冒頓)',   start: -209, end: -174, summary: '흉노의 전성기를 이끈 대왕. 고조선과 국경을 맞대며 대륙 북방을 제패. 한 고조를 백등산에서 포위함.' },
    { name: '군신 선우(軍臣)',   start: -161, end: -126, summary: '한나라와의 본격적인 대결기. 한 무제의 대반격 이전 마지막 강성기.' },
    // ── 유럽 훈제국 (AD) ────────────────────────────────────
    { name: '발라미르(Balamber)',   start: 370,  end: 390,  summary: '서쪽으로 이동한 훈족의 초기 지도자. 동고트족을 격파하며 유럽 훈족의 전성기를 엶.' },
    { name: '울딘(Uldin)',         start: 390,  end: 412,  summary: '도나우강 유역 점령, 로마 제국 압박. 서훈제국의 실질적 첫 번째 왕.' },
    { name: '옥타르 & 루아(Octar & Ruga)', start: 412, end: 434, summary: '아틸라의 숙부들. 공동 통치로 제국의 강역을 크게 확장.' },
    { name: '블레다 & 아틸라(Bleda & Attila)', start: 434, end: 445, summary: '형제 공동 통치기. 동로마로부터 막대한 공물을 받아내며 최전성기 준비.' },
    { name: '아틸라(Attila)',      start: 445,  end: 453,  summary: '\'신의 채찍\'. 서로마·동로마를 모두 공포에 떨게 한 훈 제국의 절정기 대왕.' },
    { name: '엘락(Ellac)',         start: 453,  end: 454,  summary: '아틸라의 장남. 네다오 전투에서 전사하며 훈 제국이 급격히 쇠퇴함.' },
];

async function main() {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    const db = client.db(DB_NAME);
    const kingsCol = db.collection('kings');

    const existingDoc = await kingsCol.findOne({ country_id: COUNTRY_ID });
    const normalize = str => str.replace(/[\s\(\)\（\）\/\\]/g, '');
    const existingNames = existingDoc ? existingDoc.kings.map(k => normalize(k.name)) : [];

    const toInsert = NEW_KINGS
        .filter(k => !existingNames.includes(normalize(k.name)))
        .map(k => ({
            _id: new ObjectId(),
            name: k.name,
            start: k.start,
            start_month: 1,
            end: k.end,
            end_month: 12,
            summary: k.summary,
        }));

    const skipped = NEW_KINGS.length - toInsert.length;
    if (skipped > 0) {
        const skippedNames = NEW_KINGS.filter(k => existingNames.includes(normalize(k.name))).map(k => k.name);
        console.log(`  ⏭  중복 스킵: ${skippedNames.join(', ')}`);
    }

    if (toInsert.length === 0) {
        console.log('✅ 추가할 새 왕 없음 (모두 중복)');
    } else {
        await kingsCol.updateOne(
            { country_id: COUNTRY_ID },
            { $push: { kings: { $each: toInsert } } },
            { upsert: true }
        );
        console.log(`✅ [훈 제국] ${toInsert.length}명 삽입:`);
        toInsert.forEach(k => console.log(`   - ${k.name} (${k.start} ~ ${k.end})`));
    }

    console.log(`\n🎉 완료: ${toInsert.length}명 삽입, ${skipped}명 스킵`);
    await client.close();
}

main().catch(err => {
    console.error('❌ 오류:', err);
    process.exit(1);
});
