/**
 * 대리국(大理國) 왕 데이터 삽입 스크립트
 * - 전대리국 (937–1094): 단사평·단사영·단소진·단정명
 * - 대중국 찬탈기 (1094–1096): 고승태
 * - 후대리국 (1096–1253): 단정순·단예·단지상·단흥지
 * 실행: node scripts/insert_kings_dali.js
 */

const { MongoClient, ObjectId } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = 'realhistory';

const COUNTRY_ID = new ObjectId('6902fe9e9ed47768042562a8'); // 대리국(大理國)

const NEW_KINGS = [
    // ── 전대리국 (937–1094) ──────────────────────────────────
    { name: '태조 단사평(段思平)', start: 937,  end: 944,  summary: '대리국 건국자. 백족(白族) 영웅. 불교를 국교로 삼고 운남 지역의 독립 왕국을 세움.' },
    { name: '문경제 단사영(段思英)', start: 944, end: 945,  summary: '내부 권력 투쟁으로 단명. 즉위 1년 만에 폐위됨.' },
    { name: '상명제 단소진(段素珍)', start: 1080, end: 1081, summary: '불교에 깊이 귀의하여 왕위를 양위하고 출가함. 대리 왕실의 독실한 불교 신앙의 상징.' },
    { name: '보안제 단정명(段正明)', start: 1081, end: 1094, summary: '무협 소설 《천룡팔부》의 실제 역사 모델. 고승태에게 왕위를 넘기며 전대리국 종식.' },
    // ── 대중국 찬탈기 (1094–1096) ───────────────────────────
    { name: '고승태(高昇泰)',        start: 1094, end: 1096, summary: '단씨 왕실을 대신해 2년간 통치한 재상 가문의 수장. 임종 유언으로 단씨에게 왕위를 돌려줌.' },
    // ── 후대리국 (1096–1253) ─────────────────────────────────
    { name: '문안제 단정순(段正淳)', start: 1096, end: 1108, summary: '고승태로부터 왕위를 돌려받아 후대리국을 시작. 《천룡팔부》 단정순의 실제 모델.' },
    { name: '선인제 단예(段譽)',     start: 1108, end: 1147, summary: '최장기 재위(39년). 대리국의 전성기이자 안정기. 《천룡팔부》의 주인공 단예의 실제 역사 모델.' },
    { name: '신성제 단지상(段智祥)', start: 1238, end: 1251, summary: '몽골 제국의 침입 직전 통치자. 외부 압박 속에서도 불교 문화를 유지하려 노력함.' },
    { name: '천정제 단흥지(段興智)', start: 1251, end: 1253, summary: '대리국의 마지막 황제. 1253년 쿠빌라이 칸의 공격으로 대리국이 완전히 멸망함.' },
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
        console.log(`✅ [대리국] ${toInsert.length}명 삽입:`);
        toInsert.forEach(k => console.log(`   - ${k.name} (${k.start} ~ ${k.end})`));
    }

    console.log(`\n🎉 완료: ${toInsert.length}명 삽입, ${skipped}명 스킵`);
    await client.close();
}

main().catch(err => {
    console.error('❌ 오류:', err);
    process.exit(1);
});
