/**
 * 왕 업데이트 스크립트
 * 1. 동진(東晉)   - summary 추가 + 폐제 재위 연도 수정 (372→371)
 * 2. 대가야(大伽倻) - 이진아시왕 중복 제거, 가실왕 추가, 순서/연도 정리, summary 추가
 * 3. 남중(南中)   - 신규 삽입 (지도자 4명)
 * 4. 산월(山越)   - 신규 삽입 (지도자 4명)
 */

const { MongoClient, ObjectId } = require('mongodb');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = 'realhistory';

// ─── 국가 ID ───────────────────────────────────────────
const ID_DONGJIN  = new ObjectId('68dc7f9ade5169a850293fe0');
const ID_DAGAYA   = new ObjectId('68f24d4fd8aa9cde555924c0');
const ID_NAMJUNG  = new ObjectId('69663c529c71be5e58f2679e');
const ID_SANYOL   = new ObjectId('696636199c71be5e58f2679c');

// ─── 1. 동진 summary 맵 (이름 → summary) ────────────────
const DONGJIN_SUMMARY = {
    '원제 (元帝) / 사마예':   '동진의 창건자. 강남(건강)으로 천도하여 대륙 동부의 통치를 재건.',
    '명제 (明帝) / 사마소':   '왕돈의 난을 진압하고 황제권을 안정시킴.',
    '성제 (成帝) / 사마연':   '대륙 동부의 백제·신라계 세력과 교류하며 강남 질서를 유지.',
    '강제 (康帝) / 사마악':   '성제의 동생. 짧은 재위 동안 내부 안정을 도모.',
    '목제 (穆帝) / 사마담':   '환온의 북벌 시기. 대륙 중원 회복을 시도했으나 좌절.',
    '애제 (哀帝) / 사마비':   '도교에 심취하여 정치를 소홀히 함. 황권 약화.',
    '폐제 (廢帝) / 사마혁':   '환온에 의해 폐위. 동진 황권의 한계를 상징.',
    '간문제 (簡文帝) / 사마욱': '환온의 허수아비 황제. 재위 2개월 만에 사망.',
    '효무제 (孝武帝) / 사마요': '비수대전 승리(383)로 강남을 수호. 전진의 남하를 막음.',
    '안제 (安帝) / 사마덕종':  '환현의 찬탈과 유유의 등장. 동진 말기의 혼란기.',
    '공제 (恭帝) / 사마덕문':  '마지막 황제. 유유에게 선양하며 동진 왕조 종결.',
};
// 폐제 연도 수정 (DB: end=372 → 제공: 371)
const DONGJIN_END_FIX = {
    '폐제 (廢帝) / 사마혁': { end: 371, end_month: 11 },
};

// ─── 2. 대가야 최종 왕 목록 (전면 교체) ─────────────────
const DAGAYA_KINGS = [
    { name: '이진아시왕 (伊珍阿豉王)', start: 42,  start_month: 1,  end: 199, end_month: 12,
      summary: '대가야 건국 시조. 대륙 동부 해상 세력을 결집하여 가야 연맹의 기반을 마련.' },
    { name: '하지왕 (荷知王)',          start: 479, start_month: 1,  end: 490, end_month: 12,
      summary: '남제(南齊)에 사신을 파견하고 보국장군호를 수명하며 대외 위상을 높임.' },
    { name: '이뇌왕 (異腦王)',          start: 491, start_month: 1,  end: 521, end_month: 12,
      summary: '신라와 혼인 동맹을 맺으며 대륙 내 세력 균형을 유지.' },
    { name: '가실왕 (嘉悉王)',          start: 522, start_month: 1,  end: 554, end_month: 12,
      summary: '가야금을 제작하여 음악 문화를 집대성. 대가야 문화적 전성기.' },
    { name: '도설지왕 (道設智王)',       start: 555, start_month: 1,  end: 562, end_month: 12,
      summary: '마지막 왕. 대륙 신라의 진출에 의해 562년 대가야 멸망.' },
];

// ─── 3. 남중 지도자 ──────────────────────────────────────
const NAMJUNG_KINGS = [
    { name: '옹개 (雍闓)',    start: 220, start_month: 1, end: 225, end_month: 12,
      summary: '건녕(운남)의 호족. 촉한에 반기를 들며 남중 독립 세력을 이끎.' },
    { name: '고정 (高定)',    start: 220, start_month: 1, end: 225, end_month: 12,
      summary: '월수(사천 남부)의 대성 세력. 남중 저항 연대의 중심.' },
    { name: '맹획 (孟獲)',    start: 225, start_month: 1, end: 235, end_month: 12,
      summary: '남중 세력의 최고 수장. 제갈량에게 일곱 번 사로잡혔다 풀려남(칠종칠금).' },
    { name: '찬씨 가문 (爨氏)', start: 300, start_month: 1, end: 748, end_month: 12,
      summary: '4~8세기 운남 일대를 실질적으로 지배. 대리국 이전 남중의 실질 지배 가문.' },
];

// ─── 4. 산월 지도자 ──────────────────────────────────────
const SANYOL_KINGS = [
    { name: '홍명 (洪明)',  start: 195, start_month: 1, end: 205, end_month: 12,
      summary: '단양(강소/절강) 산악 지대에서 수만 명의 무리를 이끌고 손책에 저항.' },
    { name: '반림 (潘臨)',  start: 200, start_month: 1, end: 215, end_month: 12,
      summary: '회계(절강)를 거점으로 수년간 오나라를 괴롭힌 산월의 강성 수장.' },
    { name: '비잔 (費棧)',  start: 210, start_month: 1, end: 220, end_month: 12,
      summary: '단양에서 조조와 내통하여 오나라 후방을 위협한 산월 지도자.' },
    { name: '팽기 (彭綺)',  start: 220, start_month: 1, end: 230, end_month: 12,
      summary: '파양(강서)에서 수만 명을 모아 스스로 장군이라 칭하며 오나라에 저항.' },
];

// ─────────────────────────────────────────────────────────
async function main() {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    const db = client.db(DB_NAME);
    const col = db.collection('kings');

    // ══════════ 1. 동진 summary + 폐제 연도 수정 ══════════
    console.log('\n■ 동진 업데이트');
    const dongjinDoc = await col.findOne({ country_id: ID_DONGJIN });
    let djUpdated = 0, djFixed = 0;
    for (const king of dongjinDoc.kings) {
        const updateFields = {};
        if (DONGJIN_SUMMARY[king.name]) {
            updateFields['kings.$.summary'] = DONGJIN_SUMMARY[king.name];
        }
        if (DONGJIN_END_FIX[king.name]) {
            const fix = DONGJIN_END_FIX[king.name];
            if (fix.end !== undefined)       updateFields['kings.$.end']       = fix.end;
            if (fix.end_month !== undefined) updateFields['kings.$.end_month'] = fix.end_month;
            djFixed++;
        }
        if (Object.keys(updateFields).length > 0) {
            await col.updateOne(
                { country_id: ID_DONGJIN, 'kings._id': king._id },
                { $set: updateFields }
            );
            djUpdated++;
            const fixNote = DONGJIN_END_FIX[king.name] ? ' [연도수정]' : '';
            console.log(`  ✅ ${king.name}${fixNote}`);
        }
    }
    console.log(`  → ${djUpdated}명 업데이트 (연도 수정 ${djFixed}건)`);

    // ══════════ 2. 대가야 전면 교체 ══════════
    console.log('\n■ 대가야 업데이트 (전면 교체)');
    const dagayaKings = DAGAYA_KINGS.map(k => ({ _id: new ObjectId(), ...k }));
    await col.updateOne(
        { country_id: ID_DAGAYA },
        { $set: { kings: dagayaKings } }
    );
    console.log(`  ✅ ${dagayaKings.length}명으로 교체 완료`);
    dagayaKings.forEach(k => console.log(`     - ${k.name} (${k.start}~${k.end})`));

    // ══════════ 3. 남중 신규 삽입 ══════════
    console.log('\n■ 남중 신규 삽입');
    const namjungExists = await col.findOne({ country_id: ID_NAMJUNG });
    if (namjungExists) {
        const kings = NAMJUNG_KINGS.map(k => ({ _id: new ObjectId(), ...k }));
        await col.updateOne({ country_id: ID_NAMJUNG }, { $set: { kings } });
        console.log(`  ✅ ${kings.length}명으로 교체`);
    } else {
        await col.insertOne({
            country_id: ID_NAMJUNG,
            kings: NAMJUNG_KINGS.map(k => ({ _id: new ObjectId(), ...k })),
        });
        console.log(`  ✅ ${NAMJUNG_KINGS.length}명 신규 삽입`);
    }
    NAMJUNG_KINGS.forEach(k => console.log(`     - ${k.name}`));

    // ══════════ 4. 산월 신규 삽입 ══════════
    console.log('\n■ 산월 신규 삽입');
    const sanyolExists = await col.findOne({ country_id: ID_SANYOL });
    if (sanyolExists) {
        const kings = SANYOL_KINGS.map(k => ({ _id: new ObjectId(), ...k }));
        await col.updateOne({ country_id: ID_SANYOL }, { $set: { kings } });
        console.log(`  ✅ ${kings.length}명으로 교체`);
    } else {
        await col.insertOne({
            country_id: ID_SANYOL,
            kings: SANYOL_KINGS.map(k => ({ _id: new ObjectId(), ...k })),
        });
        console.log(`  ✅ ${SANYOL_KINGS.length}명 신규 삽입`);
    }
    SANYOL_KINGS.forEach(k => console.log(`     - ${k.name}`));

    console.log('\n🎉 모든 작업 완료');
    await client.close();
}

main().catch(err => { console.error('❌', err); process.exit(1); });
