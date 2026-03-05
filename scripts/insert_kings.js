
require('dotenv').config({ path: require('path').resolve(__dirname, '../env') });

const { MongoClient, ObjectId } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = 'realhistory';

const COUNTRY_ID = new ObjectId('690c22f78817969a0eb6940a'); // 일본(日本)

const NEW_KINGS = [

{ name: '1대 문후(文侯)',    start: -403, end: -396, summary: '전국시대 최초의 패자. 서문표·오기 등을 등용하여 예맥계 기술과 법치를 완성함.' },
    { name: '2대 무후(武侯)',    start: -395, end: -370, summary: '부친의 패업을 이어 영토를 확장. 산서성(맥족 거점)과 하남성(예족 거점)을 완벽히 장악.' },
    { name: '3대 혜왕(惠王)',    start: -369, end: -319, summary: '수도를 대량(개봉)으로 천도. 귀하가 비정한 진(陳)·송(宋) 등 예족 소국들을 압박하며 세력 확장.' },
    { name: '6대 안희왕(安釐王)', start: -276, end: -243, summary: '진(秦)나라의 압박 속에서 신릉군을 통해 조·한(예맥 연합)과 합종하여 저항.' },
    { name: '말대 왕 가(王 假)',  start: -227, end: -225, summary: 'BC 225년 진나라 왕전의 수공(水攻)으로 수도 대량이 함몰되며 멸망. 기술자들이 동쪽으로 이동.' },


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
            end_month: k.end != null ? 12 : null,
            summary: k.summary,
        }));

    const skipped = NEW_KINGS.length - toInsert.length;
    if (skipped > 0) {
        const skippedNames = NEW_KINGS.filter(k => existingNames.includes(normalize(k.name))).map(k => k.name);
        console.log(`  ⏭  중복 스킵: ${skippedNames.join(', ')}`);
    }

    if (toInsert.length === 0) {
        console.log('✅ 추가할 새 천황 없음 (모두 중복)');
    } else {
        await kingsCol.updateOne(
            { country_id: COUNTRY_ID },
            { $push: { kings: { $each: toInsert } } },
            { upsert: true }
        );
        console.log(`✅  ${toInsert.length}명 삽입:`);
        toInsert.forEach(k => console.log(`   - ${k.name} (${k.start} ~ ${k.end ?? '현재'})`));
    }

    console.log(`\n🎉 완료: ${toInsert.length}명 삽입, ${skipped}명 스킵`);
    await client.close();
}

main().catch(err => {
    console.error('❌ 오류:', err);
    process.exit(1);
});
