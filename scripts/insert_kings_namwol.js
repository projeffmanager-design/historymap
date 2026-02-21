/**
 * 남월(南越) 왕 데이터 삽입 스크립트
 * 실행: node scripts/insert_kings_namwol.js
 */

const { MongoClient, ObjectId } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = 'realhistory';

const COUNTRY_ID = new ObjectId('696506a39c71be5e58f2678a'); // 남월(南越)

const NEW_KINGS = [
    { name: '무왕 조타(趙佗)',   start: -204, end: -137, summary: '진나라 혼란기 건국. 고조선 준왕과 동시대 인물.' },
    { name: '문왕 조할(趙眜)',   start: -137, end: -122, summary: '조타의 손자. 화려한 금인(金印)과 옥의(玉衣) 출토.' },
    { name: '명왕 조영제(趙嬰齊)', start: -122, end: -113, summary: '한나라와의 외교적 마찰 시작.' },
    { name: '애왕 조흥(趙興)',   start: -113, end: -112, summary: '어린 나이에 즉위, 내부 분열 발생.' },
    { name: '술왕 조건덕(趙建德)', start: -112, end: -111, summary: '남월의 마지막 왕. 한 무제의 침공으로 멸망.' },
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
        console.log(`✅ [남월(南越)] ${toInsert.length}명 삽입: ${toInsert.map(k => k.name).join(', ')}`);
    }

    console.log(`\n🎉 완료: ${toInsert.length}명 삽입, ${skipped}명 스킵`);
    await client.close();
}

main().catch(err => {
    console.error('❌ 오류:', err);
    process.exit(1);
});
