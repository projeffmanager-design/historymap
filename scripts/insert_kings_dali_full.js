/**
 * 전대리국(前大理國) 전체 왕 계보 보완 삽입 스크립트
 * 기존에 없는 3~12대 왕 10명을 추가
 * 실행: node scripts/insert_kings_dali_full.js
 */

const { MongoClient, ObjectId } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = 'realhistory';

const COUNTRY_ID = new ObjectId('6902fe9e9ed47768042562a8'); // 대리국(大理國)

const NEW_KINGS = [
    { name: '성숙제 단사중(段思良)', start: 945,  end: 951,  summary: '단사평의 동생. 조카 단사영을 폐위하고 왕위를 찬탈하여 즉위.' },
    { name: '광자제 단사총(段思聰)', start: 951,  end: 968,  summary: '국가의 기틀을 다진 시기. 남방 안정과 내치 정비에 힘씀.' },
    { name: '응도제 단소순(段素順)', start: 968,  end: 985,  summary: '불교를 장려하며 내치를 다짐. 대리 왕실의 불교 귀의 전통을 이어감.' },
    { name: '소명제 단소영(段素英)', start: 985,  end: 1009, summary: '문화와 예술이 융성하기 시작한 시기. 대리국의 문화적 기반 확립.' },
    { name: '선숙제 단소렴(段素廉)', start: 1009, end: 1022, summary: '대륙 고려 현종 시기와 겹치는 안정기. 운남 지역의 평화를 유지.' },
    { name: '병의제 단소륭(段素隆)', start: 1022, end: 1026, summary: '재위 중 출가하여 승려가 됨. 대리국 왕실의 출가 전통을 확립.' },
    { name: '성덕제 단소진(段素眞)', start: 1026, end: 1041, summary: '선왕의 뒤를 이어 즉위 후 역시 출가함. 왕실 불교 신앙의 절정기.' },
    { name: '천명제 단소흥(段素興)', start: 1041, end: 1044, summary: '실정을 저질러 고씨(高氏) 가문에 의해 폐위됨. 왕권과 신권의 갈등이 표면화.' },
    { name: '상명제 단사렴(段思廉)', start: 1044, end: 1075, summary: '고씨 가문의 추대로 즉위. 국력을 회복하며 고씨 가문의 실권이 강화되는 계기.' },
    { name: '상덕제 단연정(段連義)', start: 1075, end: 1080, summary: '권신 양의정에게 살해당하며 왕조의 위기. 이후 단소진이 양의정을 제거하고 왕위 계승.' },
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
        console.log(`✅ [대리국 - 전대리국 보완] ${toInsert.length}명 삽입:`);
        toInsert.forEach(k => console.log(`   - ${k.name} (${k.start} ~ ${k.end})`));
    }

    console.log(`\n🎉 완료: ${toInsert.length}명 삽입, ${skipped}명 스킵`);
    await client.close();
}

main().catch(err => {
    console.error('❌ 오류:', err);
    process.exit(1);
});
