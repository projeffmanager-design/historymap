/**
 * 북원(北元) 왕 데이터 삽입 스크립트
 * - 초기 정통성 고수기 (1333–1388): 순제·소종·평황제
 * - 분열·부족 연맹기 (1388–1454): 조리그투·엘베크·군 테무르·올제이 테무르·에센 타이시
 * - 다얀 칸 중흥 및 최후 (1479–1635): 다얀 칸·에제이 칸
 * 실행: node scripts/insert_kings_bukwon.js
 */

const { MongoClient, ObjectId } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = 'realhistory';

const COUNTRY_ID = new ObjectId('690c4a258817969a0eb69419'); // 북원(北元)

const NEW_KINGS = [
    // ── 초기: 대원 정통성 고수기 (1333–1388) ─────────────────
    { name: '순제 토곤 테무르(妥懽帖睦爾)', start: 1333, end: 1370, summary: '원의 마지막 통합 황제. 명나라에 밀려 대도를 떠나 북방으로 후퇴, 응창부에서 사망.' },
    { name: '소종 아유르시리다라(愛猷識理達臘)', start: 1370, end: 1378, summary: '기황후의 아들. 고려와 가장 긴밀히 교류하며 중원 수복을 도모.' },
    { name: '평황제 토구스 테무르(脫古思帖木兒)', start: 1378, end: 1388, summary: '부이르 노르 전투에서 명나라 람옥에게 대패한 후 살해되며 북원 초기가 막을 내림.' },
    // ── 분열·부족 연맹체 시기 (1388–1454) ──────────────────
    { name: '조리그투 가한',    start: 1388, end: 1392, summary: '원나라 국호 폐지설이 있으나 정통성은 유지. 내부 권력 투쟁 시작.' },
    { name: '엘베크 가한',      start: 1392, end: 1399, summary: '내부 권력 투쟁 격화. 오이라트 세력의 간섭이 본격화됨.' },
    { name: '군 테무르 가한',   start: 1400, end: 1402, summary: '오이라트의 영향력 아래 놓이며 자주성 약화.' },
    { name: '올제이 테무르 가한', start: 1403, end: 1412, summary: '아리크부카 계열의 부활 시도. 제국 재통합을 꾀했으나 실패.' },
    { name: '에센 타이시(也先)', start: 1453, end: 1454, summary: '칭기즈 칸 혈통이 아니면서 가한을 참칭. 토목의 변으로 명 정통제를 사로잡은 오이라트의 실권자.' },
    // ── 다얀 칸 중흥 및 최후 (1479–1635) ───────────────────
    { name: '다얀 칸(達延汗)',  start: 1479, end: 1517, summary: '쿠빌라이 가문 혈통. 몽골 부족들을 재통합하여 북원의 마지막 전성기를 이끔.' },
    { name: '에제이 칸(額哲)',  start: 1634, end: 1635, summary: '북원의 마지막 가한. 청나라 홍타이지에게 대원전국지보(옥새)를 바치며 북원 완전 멸망.' },
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
        console.log(`✅ [북원(北元)] ${toInsert.length}명 삽입:`);
        toInsert.forEach(k => console.log(`   - ${k.name} (${k.start} ~ ${k.end})`));
    }

    console.log(`\n🎉 완료: ${toInsert.length}명 삽입, ${skipped}명 스킵`);
    await client.close();
}

main().catch(err => {
    console.error('❌ 오류:', err);
    process.exit(1);
});
