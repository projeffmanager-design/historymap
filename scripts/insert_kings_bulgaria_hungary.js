/**
 * 불가리아 제1제국 / 헝가리 아르파드 왕조 왕 데이터 삽입 스크립트
 * - 제1차 불가리아 제국 (681–927): 아스파루흐·테르벨·크룸·보리스·시메온
 * - 헝가리 아르파드 왕조 (895–1301): 아르파드·게저·이슈트반·벨라3세·벨라4세·안드라슈3세
 * 실행: node scripts/insert_kings_bulgaria_hungary.js
 */

const { MongoClient, ObjectId } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = 'realhistory';

const GROUPS = [
    // ── 제1차 불가리아 제국 (681–1018) ─────────────────────
    {
        label: '불가리아 공화국(Bulgaria)',
        countryId: new ObjectId('694dd14207f1d71fd584543b'),
        kings: [
            { name: '아스파루흐 칸(Asparuh)', start: 681,  end: 701,  summary: '불가리아 제국의 창건자. 훈-돌궐계 불가르족을 이끌고 도나우강을 건너 비잔틴에 맞서 독립 국가를 세움.' },
            { name: '테르벨 칸(Tervel)',       start: 701,  end: 721,  summary: '711년 비잔틴 제국을 도와 이슬람 우마이야 군대를 격퇴. \'유럽의 구원자\'로 불림.' },
            { name: '크룸 칸(Krum)',           start: 803,  end: 814,  summary: '최초의 불가리아 법전 편찬. 811년 아드리아노플 전투에서 비잔틴 황제 니케포로스 1세를 전사시킴.' },
            { name: '보리스 1세(Boris I)',     start: 852,  end: 889,  summary: '기독교 공식 수용(864년). 이후 차르(Tsar) 칭호 기틀을 마련하며 슬라브-불가르 문화 통합.' },
            { name: '시메온 1세(Simeon I)',    start: 893,  end: 927,  summary: '불가리아 황금기. 차르 칭호 공식 사용. 비잔틴 제국에 버금가는 제국 문화를 완성하고 영토를 최대로 확장.' },
        ]
    },
    // ── 헝가리 아르파드 왕조 (895–1301) ────────────────────
    {
        label: '헝가리(Hungary)',
        countryId: new ObjectId('694d31f907f1d71fd5845409'),
        kings: [
            { name: '아르파드(Árpád)',         start: 895,  end: 907,  summary: '헝가리 건국 시조. 훈족의 후예 마자르 7개 부족을 이끌고 판노니아 평원을 정복하여 정착.' },
            { name: '게저(Géza)',              start: 972,  end: 997,  summary: '중앙 집권화 추진 및 기독교 포교 기반 마련. 신성 로마 제국과의 외교 관계 수립.' },
            { name: '이슈트반 1세(István I)',  start: 997,  end: 1038, summary: '헝가리 초대 국왕(1000년 즉위). 가톨릭 왕국으로 공식 승격. 교황 실베스테르 2세로부터 성 왕관 수여.' },
            { name: '벨라 3세(Béla III)',      start: 1172, end: 1196, summary: '비잔틴 문화를 적극 수용하고 행정 체계를 정비하며 헝가리의 국제적 위상을 높임.' },
            { name: '벨라 4세(Béla IV)',       start: 1235, end: 1270, summary: '바투 칸의 몽골 침입(1241 무히 전투) 이후 국가를 재건. 성채 건설과 이민 장려로 왕국 복구에 전념.' },
            { name: '안드라슈 3세(András III)', start: 1290, end: 1301, summary: '아르파드 왕조의 마지막 왕. 후계자 없이 사망하며 헝가리 왕위가 외래 왕조(앙주)로 넘어감.' },
        ]
    },
];

async function main() {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    const db = client.db(DB_NAME);
    const kingsCol = db.collection('kings');

    const normalize = str => str.replace(/[\s\(\)\（\）\/\\]/g, '');

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
