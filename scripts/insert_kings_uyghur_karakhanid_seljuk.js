/**
 * 위구르 제국 / 카라한 왕조 / 셀주크 투르크 왕 데이터 삽입 스크립트
 * 실행: node scripts/insert_kings_uyghur_karakhanid_seljuk.js
 */

const { MongoClient, ObjectId } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = 'realhistory';

const GROUPS = [
    // ── 위구르 제국 (744–840) ────────────────────────────────
    {
        label: '위구르 제국(Uyghur Khaganate)',
        countryId: new ObjectId('694d539c07f1d71fd5845431'),
        kings: [
            { name: '쿠틀루그 빌게 쿨 가한', start: 744, end: 747, summary: '위구르 제국의 창건자. 돌궐 제국을 무너뜨리고 몽골 초원의 새 패자로 등장.' },
            { name: '모얀초르 가한',          start: 747, end: 759, summary: '당나라의 안사의 난(755)을 진압해 주며 막대한 정치적·경제적 영향력을 행사. 비단과 말의 교역 독점.' },
            { name: '뵈귀 가한',              start: 759, end: 779, summary: '마니교를 국교로 수용. 유목 문화에 정주·상업 문화를 결합하는 독자적 위구르 문명을 창출.' },
            { name: '합살 가한',              start: 824, end: 832, summary: '내부 분열과 기근, 키르기스족의 침입이 겹치며 제국 붕괴. 위구르 유민들이 서쪽으로 이동하여 카라한·서위구르를 세움.' },
        ]
    },
    // ── 카라한 왕조 (840–1212) ───────────────────────────────
    {
        label: '카라한 왕조(Kara-Khanid)',
        countryId: new ObjectId('694d58a207f1d71fd5845436'),
        kings: [
            { name: '빌게 쿨 카드르 칸',    start: 840,  end: 893,  summary: '위구르 멸망 후 카라한 왕조를 창건. 투르크계 유목민의 중앙아시아 재편을 이끔.' },
            { name: '사투크 부그라 칸',      start: 920,  end: 955,  summary: '투르크 민족 최초의 이슬람 개종. 카라한의 종교적 정체성을 확립하고 중앙아시아 이슬람화의 서막을 엶.' },
            { name: '나스르 1세(Nasr I)',    start: 992,  end: 1012, summary: '부하라를 점령하고 사만 왕조를 멸망시키며 마와라안나흐르(중앙아시아 핵심부) 장악.' },
            { name: '유수프 카디르 칸',      start: 1026, end: 1032, summary: '가즈나 왕조와 대립하며 전성기를 구가. 대륙 고려와 동시대의 중앙아시아 패권자.' },
        ]
    },
    // ── 셀주크 투르크 대제국 (1037–1194) ────────────────────
    {
        label: '셀주크 투르크(Seljuk Turks)',
        countryId: new ObjectId('694d35a907f1d71fd584540c'),
        kings: [
            { name: '투그릴 베그(Tughril Beg)', start: 1037, end: 1063, summary: '셀주크 제국 창건자. 바그다드에 입성하여 압바스 칼리프로부터 술탄 칭호를 획득. 오구즈 투르크족의 첫 대제국.' },
            { name: '알프 아르슬란(Alp Arslan)', start: 1063, end: 1072, summary: '1071년 만지케르트 전투에서 비잔틴 황제 로마노스 4세를 사로잡는 대승. 아나톨리아(룸 셀주크의 기반) 개척.' },
            { name: '말리크 샤 1세(Malik Shah I)', start: 1072, end: 1092, summary: '셀주크 대제국 최전성기. 재상 니잠 알 물크와 함께 행정·교육 체계를 확립. 중동 전역 장악.' },
            { name: '아흐마드 산자르(Ahmad Sanjar)', start: 1118, end: 1157, summary: '대셀주크 제국의 마지막 위대한 통치자. 호라산을 중심으로 동방 강역을 유지.' },
            { name: '토그룰 3세(Toghrul III)',      start: 1176, end: 1194, summary: '셀주크 대제국의 마지막 술탄. 화레즘 제국에 의해 멸망하며 대셀주크 제국 종식.' },
        ]
    },
];

async function main() {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    const db = client.db(DB_NAME);
    const kingsCol = db.collection('kings');

    const normalize = str => str.replace(/[\s\(\)\（\）\/\\&]/g, '');

    let totalInserted = 0;
    let totalSkipped = 0;

    for (const group of GROUPS) {
        const existingDoc = await kingsCol.findOne({ country_id: group.countryId });
        const existingNames = existingDoc ? existingDoc.kings.map(k => normalize(k.name)) : [];

        const toInsert = group.kings
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

        const skipped = group.kings.length - toInsert.length;
        totalSkipped += skipped;

        if (skipped > 0) {
            const skippedNames = group.kings.filter(k => existingNames.includes(normalize(k.name))).map(k => k.name);
            console.log(`  ⏭  [${group.label}] 중복 스킵: ${skippedNames.join(', ')}`);
        }

        if (toInsert.length === 0) {
            console.log(`  ✅ [${group.label}] 추가할 새 왕 없음`);
            continue;
        }

        await kingsCol.updateOne(
            { country_id: group.countryId },
            { $push: { kings: { $each: toInsert } } },
            { upsert: true }
        );

        console.log(`  ✅ [${group.label}] ${toInsert.length}명 삽입:`);
        toInsert.forEach(k => console.log(`     - ${k.name} (${k.start} ~ ${k.end})`));
        totalInserted += toInsert.length;
    }

    console.log(`\n🎉 완료: 총 ${totalInserted}명 삽입, ${totalSkipped}명 스킵`);
    await client.close();
}

main().catch(err => {
    console.error('❌ 오류:', err);
    process.exit(1);
});
