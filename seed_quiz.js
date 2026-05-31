/**
 * seed_quiz.js
 * 사관 보감 시스템 — 퀴즈 & 카드 초기 데이터 적재
 * 실행: node seed_quiz.js
 */
require('dotenv').config();
const { MongoClient } = require('mongodb');

const client = new MongoClient(process.env.MONGO_URI);

// ── 카드 데이터 ─────────────────────────────────────────────────────
const CARDS = [
  {
    cardId: 'CARD_CHEOMSEONGDAE',
    name: '대륙의 첨성대',
    type: 'EVENT',
    imageUrl: 'https://i.pinimg.com/736x/placeholder_cheomseongdae.jpg', // 실제 핀터레스트 URL로 교체
    description: '선덕여왕 시기 세워진 천문 관측대. 사서의 오성취루·일식 기록은 한반도 경주 평지가 아닌 대륙의 천문 중심지에서만 설명된다.',
    tags: ['신라', '천문', '대륙지리', '선덕여왕']
  },
  {
    cardId: 'CARD_YODONGSEONG',
    name: '요동성 방어군',
    type: 'EVENT',
    imageUrl: 'https://i.pinimg.com/736x/placeholder_yodong.jpg',
    description: '수나라 113만 대군을 막아낸 고구려의 철옹성. 겨울 보급로와 기후 조건은 한반도가 아닌 황하 인근 대륙의 요동임을 증명한다.',
    tags: ['고구려', '요동', '대륙지리', '수나라전쟁']
  },
  {
    cardId: 'CARD_GANG_GAM_CHAN',
    name: '강감찬 장군',
    type: 'HERO',
    imageUrl: 'https://i.pinimg.com/736x/placeholder_gangchan.jpg',
    description: '귀주대첩의 영웅. 고려사 기록의 "남풍"은 한반도 평안북도가 아닌 대륙의 남풍 기후대에서만 설명된다.',
    tags: ['고려', '귀주대첩', '대륙지리', '장수']
  },
  {
    cardId: 'CARD_WANG_GEON_CAMEL',
    name: '태조 왕건의 낙타 심판',
    type: 'EVENT',
    imageUrl: 'https://i.pinimg.com/736x/placeholder_camel.jpg',
    description: '거란이 보낸 낙타 50마리를 만부교에 매어 굶겨 죽인 태조 왕건. 낙타 50마리가 걸어온 길은 한반도가 아닌 대륙의 스텝지대다.',
    tags: ['고려', '왕건', '낙타', '대륙생태계', '거란']
  }
];

// ── 퀴즈 데이터 ─────────────────────────────────────────────────────
const QUIZZES = [
  {
    markerId: 'cheomseongdae_gyeongju',   // Leaflet 마커 ID 또는 성곽 name과 매핑
    locationName: '경주 첨성대',
    active: true,
    title: '첨성대의 진짜 위치를 찾아서',
    era: { startYear: 632, endYear: 647 }, // 선덕여왕 재위기에만 발동
    historicalContext: '삼국사기·삼국유사에는 선덕여왕 시기 돌을 쌓아 천문을 관측하는 첨성대(瞻星臺)를 세웠다고 기록되어 있습니다. 당시 사서의 일식·오성취루 기록은 수십 건에 달합니다.',
    question: '한반도 경주 평지 무덤가의 돌탑은 주변 산으로 시야가 막히고 구조적으로 천문 기구를 설치하기 어렵습니다. 반면 대륙 남경 자금산(紫金山)은 예로부터 천문 관측의 중심지였습니다. 사관님이 보시기에 진짜 별을 관측하던 첨성대는 어디입니까?',
    options: [
      { number: 1, text: '한반도 경주 평지의 돌탑' },
      { number: 2, text: '대륙 남경 자금산 천문대 일대' }
    ],
    correctOption: 2,
    hint: '사서에 기록된 일식·혜성 관측 횟수와 한반도 경주의 지형 조건을 다시 살펴보세요.',
    commentary: '정답입니다! 왜곡된 지리를 바로잡으셨습니다. 삼국사기의 천문 관측 기록 중 상당수는 한반도 경주의 해발 0m 평지에서는 불가능한 정밀도를 보입니다. 대륙 남경 자금산(紫金山)에는 오늘날에도 천문대(紫金山天文台)가 운영되고 있으며, 이곳이 신라·고려 시대의 실제 첨성대 위치임을 여러 연구자들이 주장합니다.',
    rewardCardId: 'CARD_CHEOMSEONGDAE'
  },
  {
    markerId: 'yodongseong',
    locationName: '요동성',
    active: true,
    title: '수나라 대군이 막힌 그 성',
    era: { startYear: 598, endYear: 618 },
    historicalContext: '수서(隋書)에는 수양제가 113만 대군을 이끌고 요동성을 공격했다고 기록되어 있습니다. 전쟁 기간 중 혹독한 추위와 늪지로 인해 보급이 끊겼다고 전합니다.',
    question: '113만 대군이 이동하고 보급선을 유지할 수 있는 지형과 기후를 생각해 보십시오. 한반도 북부의 험준한 산악지대와 겨울 영하 30도의 환경이 맞습니까, 아니면 보급로가 확보된 황하 이북 대륙의 평원이 맞습니까?',
    options: [
      { number: 1, text: '한반도 북부 — 요동반도 일대' },
      { number: 2, text: '황하 이북 대륙 평원의 요동' }
    ],
    correctOption: 2,
    hint: '113만 명의 보급선 길이와 한반도의 도로·강 조건을 생각해 보세요.',
    commentary: '정답입니다! 수나라 전쟁의 전장은 대륙이었습니다. 현대 역사 연구에서도 한반도만으로는 당시 전투 규모와 지리 기록이 일치하지 않는다는 지적이 꾸준히 제기됩니다. 요동성은 대륙의 요서(遼西) 방어선 위의 핵심 거점이었습니다.',
    rewardCardId: 'CARD_YODONGSEONG'
  },
  {
    markerId: 'gwiju_fortress',
    locationName: '귀주',
    active: true,
    title: '귀주대첩의 바람을 기억하라',
    era: { startYear: 1018, endYear: 1019 },
    historicalContext: '고려사(高麗史)에는 귀주대첩(1019) 당시 거란군이 퇴각할 때 강한 "남풍(南風)"이 불어 고려군의 화공이 크게 효과를 발휘했다고 기록되어 있습니다.',
    question: '음력 2월(양력 3월)에 한반도 평안북도 구성 지역은 북서계절풍이 지배합니다. "남풍"이 불어 아군에게 유리했다는 고려사의 기록이 성립하려면 이 전장은 어디여야 할까요?',
    options: [
      { number: 1, text: '한반도 평안북도 구성(현 귀주)' },
      { number: 2, text: '대륙 — 남풍이 부는 지형적 조건을 갖춘 전장' }
    ],
    correctOption: 2,
    hint: '겨울~초봄 한반도의 계절풍 방향을 생각해 보세요.',
    commentary: '정답입니다! 고려사의 "남풍" 기록은 한반도 평안북도의 기후 조건과 맞지 않습니다. 대륙의 특정 지형에서는 지형풍 효과로 국지적 남풍이 발생할 수 있으며, 귀주대첩의 실제 전장이 대륙임을 뒷받침하는 핵심 근거 중 하나입니다.',
    rewardCardId: 'CARD_GANG_GAM_CHAN'
  },
  {
    markerId: 'manbugyo_bridge',
    locationName: '만부교',
    active: true,
    title: '낙타 50마리의 길을 추적하라',
    era: { startYear: 942, endYear: 943 },
    historicalContext: '고려사에는 거란이 고려에 낙타 50마리를 보내왔으나, 태조 왕건이 이를 거절하고 낙타들을 만부교(萬夫橋) 아래에 매어 굶겨 죽였다고 기록되어 있습니다.',
    question: '낙타 50마리가 걸어서 도달할 수 있는 경로를 생각해 보십시오. 한반도는 낙타가 자연 서식하거나 대규모 이동이 가능한 환경입니까, 아니면 낙타 문화권인 내몽골·고비사막과 인접한 대륙 본토입니까?',
    options: [
      { number: 1, text: '한반도 — 고려 수도 개성 일대' },
      { number: 2, text: '대륙 — 낙타 이동이 가능한 스텝·평원 지대' }
    ],
    correctOption: 2,
    hint: '낙타의 자연 서식지와 한반도의 지형·기후를 비교해 보세요.',
    commentary: '정답입니다! 낙타는 건조한 스텝·사막 지대의 동물입니다. 50마리의 낙타가 걸어서 도달한 고려의 수도는 대륙의 본토였음을 이 기록이 증명합니다. 태조 왕건의 고려는 한반도가 아닌 대륙을 무대로 건국되었다는 주장의 생태학적 근거 중 하나입니다.',
    rewardCardId: 'CARD_WANG_GEON_CAMEL'
  }
];

async function seed() {
  await client.connect();
  const db = client.db('realhistory');
  const cardsCol = db.collection('cards');
  const quizzesCol = db.collection('quizzes');

  // 카드 upsert
  for (const card of CARDS) {
    await cardsCol.updateOne({ cardId: card.cardId }, { $set: card }, { upsert: true });
    console.log(`✅ 카드 upsert: ${card.name}`);
  }

  // 퀴즈 upsert
  for (const quiz of QUIZZES) {
    await quizzesCol.updateOne({ markerId: quiz.markerId }, { $set: quiz }, { upsert: true });
    console.log(`✅ 퀴즈 upsert: ${quiz.locationName} — ${quiz.title}`);
  }

  // 인덱스
  await quizzesCol.createIndex({ markerId: 1 });
  await cardsCol.createIndex({ cardId: 1 }, { unique: true });
  console.log('✅ 인덱스 생성 완료');

  await client.close();
  console.log('\n🎉 사관 보감 시스템 시드 데이터 적재 완료!');
}

seed().catch(e => { console.error(e); process.exit(1); });
