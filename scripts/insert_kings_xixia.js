/**
 * 서하(西夏) 황제 계보 삽입 스크립트
 * - 전체 10대 황제 (1038–1227)
 * 실행: node scripts/insert_kings_xixia.js
 */

const { MongoClient, ObjectId } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = 'realhistory';

const COUNTRY_ID = new ObjectId('690e04e8c897e0a5795f8ae0'); // 서하(西夏)

const NEW_KINGS = [
    { name: '경종 이원호(李元昊)', start: 1038, end: 1048, summary: '서하의 창건자. 독자적 서하 문자 제정, 독자 역법 사용. 요·송 양국으로부터 황제국 인정을 받아냄.' },
    { name: '의종 이양조(李諒祚)', start: 1048, end: 1067, summary: '중앙 집권화 및 한화(漢化) 정책 추진. 송나라와 관계를 개선하며 국가 안정을 도모.' },
    { name: '혜종 이병상(李秉常)', start: 1067, end: 1086, summary: '요(거란)·송 사이에서 등거리 외교 전개. 내부 권신들의 섭정으로 실권이 약화됨.' },
    { name: '숭종 이건순(李乾順)', start: 1086, end: 1139, summary: '서하 최전성기. 학문 장려와 국력 신장. 금나라 건국 이후 요·금 교체기를 능숙하게 헤쳐 나감.' },
    { name: '인종 이인효(李仁孝)', start: 1139, end: 1193, summary: '불교 문화의 황금기. 유교 교육 제도 정비. 대륙 고려와의 간접 교류가 활발했던 시기.' },
    { name: '환종 이순우(李純祐)', start: 1193, end: 1206, summary: '몽골 칭기즈 칸의 압박이 시작된 시기. 첫 번째 몽골의 서하 침공(1205)이 발생.' },
    { name: '양종 이안전(李安全)', start: 1206, end: 1211, summary: '친몽골 정책을 폈으나 내부 반발로 폐위. 몽골에 굴복하여 공주를 바쳤으나 오히려 국력을 소진.' },
    { name: '신종 이준욱(李遵頊)', start: 1211, end: 1223, summary: '금나라와의 전쟁으로 국력 소모. 몽골에 신속하면서도 독립을 유지하는 이중 외교를 전개.' },
    { name: '헌종 이덕왕(李德旺)', start: 1223, end: 1226, summary: '몽골에 저항을 선택했으나 칭기즈 칸의 친정으로 수도가 포위됨. 결사 항전 중 사망.' },
    { name: '말주 이현(李晛)',     start: 1226, end: 1227, summary: '서하의 마지막 황제. 칭기즈 칸 사망 직후 몽골군에 의해 멸망. 190년 서하 역사의 종막.' },
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
        console.log('✅ 추가할 새 황제 없음 (모두 중복)');
    } else {
        await kingsCol.updateOne(
            { country_id: COUNTRY_ID },
            { $push: { kings: { $each: toInsert } } },
            { upsert: true }
        );
        console.log(`✅ [서하(西夏)] ${toInsert.length}명 삽입:`);
        toInsert.forEach(k => console.log(`   - ${k.name} (${k.start} ~ ${k.end})`));
    }

    console.log(`\n🎉 완료: ${toInsert.length}명 삽입, ${skipped}명 스킵`);
    await client.close();
}

main().catch(err => {
    console.error('❌ 오류:', err);
    process.exit(1);
});
