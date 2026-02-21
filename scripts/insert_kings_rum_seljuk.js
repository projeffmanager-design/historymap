/**
 * 룸 셀주크 술탄국(Sultanate of Rum) 왕 데이터 삽입 스크립트
 * - 건국기 (1077–1116): 술레이만 샤 1세, 킬리치 아르슬란 1세
 * - 전성기 (1116–1237): 메수드 1세, 킬리치 아르슬란 2세, 카이쿠스로 1세, 카이카우스 1세, 카이쿠바드 1세
 * - 쇠퇴·말기 (1237–1308): 카이쿠스로 2세, 메수드 2세/카이쿠바드 3세
 * 실행: node scripts/insert_kings_rum_seljuk.js
 */

const { MongoClient, ObjectId } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = 'realhistory';

const COUNTRY_ID = new ObjectId('694d39bf07f1d71fd5845411'); // 룸 셀주크(Sultanate of Rum)

const NEW_KINGS = [
    // ── 건국기 ───────────────────────────────────────────────
    { name: '술레이만 샤 1세(Suleyman Shah I)',    start: 1077, end: 1086, summary: '룸 셀주크 건국자. 셀주크 가문의 일원으로 아나톨리아에 독립 세력을 구축하고 니케아를 수도로 삼음.' },
    { name: '킬리치 아르슬란 1세(Kılıç Arslan I)', start: 1092, end: 1107, summary: '제1차 십자군과 격돌. 도릴라이온 전투에서 패배했으나 동부 아나톨리아 방어에 성공.' },
    // ── 전성기 ───────────────────────────────────────────────
    { name: '메수드 1세(Mesud I)',                  start: 1116, end: 1156, summary: '제2차 십자군을 격파하며 국가 기틀을 확립. 비잔틴·아르메니아와 복잡한 외교 균형 유지.' },
    { name: '킬리치 아르슬란 2세(Kılıç Arslan II)', start: 1156, end: 1192, summary: '1176년 미리오케팔론 전투에서 비잔틴 제국에 결정적 승리. 아나톨리아의 주도권을 완전히 장악.' },
    { name: '카이쿠스로 1세(Keyhüsrev I)',          start: 1192, end: 1211, summary: '지중해 해안 도시들을 점령하며 해상 무역권 장악. 십자군 국가들과 경쟁하며 교역로 확보.' },
    { name: '카이카우스 1세(Keykavus I)',            start: 1211, end: 1220, summary: '무역로 정비 및 상업 전성기. 시노프 항구를 점령하며 흑해 교역권까지 장악.' },
    { name: '카이쿠바드 1세(Keykubad I)',           start: 1220, end: 1237, summary: '룸 셀주크 최전성기. 수도 코냐를 건축과 예술의 황금도시로 만들고 영토를 최대로 확장.' },
    // ── 쇠퇴·말기 ────────────────────────────────────────────
    { name: '카이쿠스로 2세(Keyhüsrev II)',         start: 1237, end: 1246, summary: '1243년 코세다그 전투에서 몽골군에 대패. 이후 일한국의 속국으로 전락하며 쇠퇴 시작.' },
    { name: '메수드 2세 & 카이쿠바드 3세',          start: 1284, end: 1308, summary: '몽골(일한국)의 간섭을 받으며 명목상 술탄으로 존속. 오스만 공국에 패권을 넘기며 룸 셀주크 소멸.' },
];

async function main() {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    const db = client.db(DB_NAME);
    const kingsCol = db.collection('kings');

    const existingDoc = await kingsCol.findOne({ country_id: COUNTRY_ID });
    const normalize = str => str.replace(/[\s\(\)\（\）\/\\&]/g, '');
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
        console.log(`✅ [룸 셀주크] ${toInsert.length}명 삽입:`);
        toInsert.forEach(k => console.log(`   - ${k.name} (${k.start} ~ ${k.end})`));
    }

    console.log(`\n🎉 완료: ${toInsert.length}명 삽입, ${skipped}명 스킵`);
    await client.close();
}

main().catch(err => {
    console.error('❌ 오류:', err);
    process.exit(1);
});
