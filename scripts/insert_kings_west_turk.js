/**
 * 서돌궐(西突厥, West Turkic Khaganate) 왕 데이터 삽입 스크립트
 * - 형성기 (575–603): 달두 가한
 * - 전성기 (603–630): 처라·사궤·통엽호·막하돌 가한
 * - 쇠퇴·분열기 (630–657): 섭구·돌륙·을비돌륙·사발라 가한
 * 실행: node scripts/insert_kings_west_turk.js
 */

const { MongoClient, ObjectId } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = 'realhistory';

const COUNTRY_ID = new ObjectId('69988a56fd7a20d4d8b7f775'); // 서돌궐(西突厥)

const NEW_KINGS = [
    // ── 형성기 (575–603) ─────────────────────────────────────
    { name: '달두 가한(Tardush)',   start: 575, end: 603, summary: '서돌궐의 실질적 창시자. 동돌궐과 대립하며 독자 세력을 구축하고 중앙아시아 일대를 장악.' },
    // ── 전성기 (603–630) ─────────────────────────────────────
    { name: '처라 가한',            start: 603, end: 611, summary: '내부 분열로 잠시 당나라에 의존하며 세력 유지. 비잔틴 제국과의 교류 시작.' },
    { name: '사궤 가한',            start: 611, end: 618, summary: '서돌궐의 영역을 서쪽으로 크게 확장. 실크로드 서단까지 통제.' },
    { name: '통엽호 가한',          start: 618, end: 628, summary: '서돌궐 최전성기. 실크로드 완전 장악. 당나라 태종조차 두려워한 최강의 가한.' },
    { name: '막하돌 가한',          start: 628, end: 630, summary: '통엽호 가한을 살해하고 즉위했으나 내부 반발이 거세져 쇠퇴 시작.' },
    // ── 쇠퇴·분열기 (630–657) ───────────────────────────────
    { name: '섭구 가한',            start: 630, end: 632, summary: '내부 혼란 수습 실패. 당나라의 이간책으로 부족 간 갈등 심화.' },
    { name: '돌륙 가한',            start: 633, end: 634, summary: '부족 연맹체 분열 가속화. 노능·돌륙 두 부족 연맹의 갈등 극대화.' },
    { name: '을비돌륙 가한',        start: 638, end: 653, summary: '마지막 중흥을 꾀했으나 당나라의 침공을 받으며 제국의 통제력 상실.' },
    { name: '사발라 가한 아사나하로(阿史那賀魯)', start: 651, end: 657, summary: '서돌궐의 마지막 가한. 당나라 소정방의 공격으로 서돌궐 제국 완전 멸망.' },
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
        console.log(`✅ [서돌궐] ${toInsert.length}명 삽입:`);
        toInsert.forEach(k => console.log(`   - ${k.name} (${k.start} ~ ${k.end})`));
    }

    console.log(`\n🎉 완료: ${toInsert.length}명 삽입, ${skipped}명 스킵`);
    await client.close();
}

main().catch(err => {
    console.error('❌ 오류:', err);
    process.exit(1);
});
