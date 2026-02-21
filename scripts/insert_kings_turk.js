/**
 * 돌궐 제국(突厥, Gök-Türk) 왕 데이터 삽입 스크립트
 * - 제1돌궐 (552–581): 이리·을이·무한·타발·사발략 가한
 * - 동돌궐 분열기 (599–630): 계민·시필·힐리 가한
 * - 제2돌궐 부활기 (682–734): 엘테리쉬·카파간·빌게 가한
 * 실행: node scripts/insert_kings_turk.js
 */

const { MongoClient, ObjectId } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = 'realhistory';

const COUNTRY_ID = new ObjectId('694d422e07f1d71fd5845418'); // 돌궐 제국(突厥, Gök-Türk)

const NEW_KINGS = [
    // ── 제1돌궐 제국 (552–603) ──────────────────────────────
    { name: '이리 가한 투멘(土門)', start: 552, end: 553, summary: '돌궐 건국자. 유연(柔然)을 타파하고 아사나(阿史那) 씨족의 대제국을 세움.' },
    { name: '을이 가한',           start: 553, end: 554, summary: '제국의 기반 확충. 건국 직후 내부 체제 정비.' },
    { name: '무한 가한',           start: 554, end: 572, summary: '제1돌궐의 전성기. 거란과 유연을 완전히 병합하며 대륙 북방 제패.' },
    { name: '타발 가한',           start: 572, end: 581, summary: '불교 장려. 북제·북주와 외교 관계 형성하며 중원 세력과 균형 유지.' },
    { name: '사발략 가한',         start: 581, end: 587, summary: '수나라와의 갈등 시작. 제국 분열의 조짐이 나타남.' },
    // ── 동돌궐 분열기 (599–630) ─────────────────────────────
    { name: '계민 가한',           start: 599, end: 609, summary: '동돌궐 성립기. 수나라와 일시적으로 협력하며 세력 유지.' },
    { name: '시필 가한',           start: 609, end: 619, summary: '수 양제를 포위 공격. 고구려와 연합 전선을 구축하여 당나라 압박.' },
    { name: '힐리 가한',           start: 620, end: 630, summary: '당나라 수도 장안을 위협했으나 결국 당 태종에게 패배하며 동돌궐 일시 멸망.' },
    // ── 제2돌궐 제국 부활기 (682–734) ──────────────────────
    { name: '엘테리쉬 가한(골돌록)', start: 682, end: 691, summary: '당나라 지배를 뚫고 돌궐 제국 부활. 대륙 신라·발해와 복잡한 외교 관계 시작.' },
    { name: '카파간 가한(묵철)',    start: 691, end: 716, summary: '최대 강역 확보. 당나라를 압도하고 고구려 유민을 적극 포섭.' },
    { name: '빌게 가한',           start: 716, end: 734, summary: '명재상 톤유쿠크, 동생 쿨테긴과 함께 내치 안정. 제2돌궐의 마지막 전성기.' },
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
        console.log(`✅ [돌궐 제국] ${toInsert.length}명 삽입:`);
        toInsert.forEach(k => console.log(`   - ${k.name} (${k.start} ~ ${k.end})`));
    }

    console.log(`\n🎉 완료: ${toInsert.length}명 삽입, ${skipped}명 스킵`);
    await client.close();
}

main().catch(err => {
    console.error('❌ 오류:', err);
    process.exit(1);
});
