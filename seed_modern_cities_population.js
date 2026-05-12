/**
 * seed_modern_cities_population.js
 *
 * 핵심 원칙: 역사 인구 = 현대 도시 인구 × ERA_SCALE
 * - 농경지·강 유역·교통 요충지는 수천 년째 사람이 사는 곳
 * - 현대 인구 분포가 곧 역사적 거주 밀도의 대리변수
 * - pop_by_year[year] = modern_pop × ERA_SCALE[year]
 *
 * 실행: node seed_modern_cities_population.js
 */

const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME   = 'realhistory';

// ════════════════════════════════════════════════════════
// 시대별 동아시아 전체 인구 지수 (현대=1.0 기준)
// ════════════════════════════════════════════════════════
const ERA_SCALE = {
  '-200': 0.055,  // 한 제국 초기     ~3,000만
     '0': 0.065,  // 기원전후 漢 전성기 ~6,000만
   '200': 0.018,  // 삼국 분열 급감    ~600~800만
   '400': 0.030,  // 남북조 부분 회복  ~2,000만
   '500': 0.045,  // 남북조 후기       ~3,000만
   '600': 0.080,  // 수 통일기         ~4,600만
   '650': 0.100,  // 당 전성기 초       ~5,000만
   '700': 0.110,  // 당 중기
   '750': 0.130,  // 당 개원성세        ~7,000만
   '800': 0.095,  // 안사의 난 이후
   '900': 0.100,  // 오대십국
  '1000': 0.115,  // 북송 초기
  '1050': 0.145,
  '1100': 0.185,  // 북송 전성기        ~1억
  '1127': 0.180,  // 북송 멸망
  '1150': 0.165,
  '1200': 0.195,  // 남송 전성기        ~1.2억
  '1231': 0.165,  // 몽골 침입
  '1250': 0.130,  // 전쟁기
  '1280': 0.110,  // 원 통일            ~7,000만
  '1300': 0.115,
  '1350': 0.105,  // 원 말기
  '1400': 0.125,  // 명 초기
  '1450': 0.140,
  '1500': 0.160,
  '1600': 0.200,
  '1700': 0.240,
  '1800': 0.350,
};

// ════════════════════════════════════════════════════════
// 도시 목록 (현대 광역 인구 기준, 단위: 명)
// era_start/era_end: 이 도시가 의미 있게 존재한 시대 범위
//   null = 모든 시대 표시
// ════════════════════════════════════════════════════════
const CITIES = [

  // ── 화북 / 황하 유역 ──────────────────────────────────
  { name: '장안(長安) · 시안(西安)',    lat: 34.27, lng: 108.93, modern_pop: 13000000, era_start: -300 },
  { name: '낙양(洛陽)',                  lat: 34.62, lng: 112.45, modern_pop:  7200000, era_start: -500 },
  { name: '개봉(開封) · 변경(汴京)',     lat: 34.80, lng: 114.31, modern_pop:  5400000, era_start:  200 },
  { name: '정저우(鄭州)',               lat: 34.75, lng: 113.65, modern_pop: 12600000, era_start: -500 },
  { name: '안양(安陽) · 은허(殷墟)',     lat: 36.10, lng: 114.39, modern_pop:  5500000, era_start: -1500 },
  { name: '타이위안(太原)',              lat: 37.87, lng: 112.55, modern_pop:  5300000, era_start: -300 },
  { name: '다퉁(大同)',                  lat: 40.08, lng: 113.30, modern_pop:  3400000, era_start:  200 },
  { name: '베이징(北京) · 연경(燕京)',   lat: 39.91, lng: 116.39, modern_pop: 21700000, era_start: -500 },
  { name: '톈진(天津)',                  lat: 39.08, lng: 117.20, modern_pop: 13900000, era_start:  600 },
  { name: '스자좡(石家莊)',              lat: 38.05, lng: 114.47, modern_pop: 11200000, era_start: -200 },
  { name: '바오딩(保定)',                lat: 38.87, lng: 115.47, modern_pop: 11000000, era_start:  200 },
  { name: '한단(邯鄲)',                  lat: 36.62, lng: 114.49, modern_pop:  9400000, era_start: -500 },
  { name: '린이(臨沂)',                  lat: 35.10, lng: 118.35, modern_pop: 11200000, era_start: -300 },
  { name: '지난(濟南)',                  lat: 36.67, lng: 117.00, modern_pop:  9200000, era_start: -300 },
  { name: '칭다오(靑島)',               lat: 36.07, lng: 120.38, modern_pop:  9400000, era_start:  200 },
  { name: '쉬저우(徐州)',               lat: 34.27, lng: 117.18, modern_pop:  9000000, era_start: -500 },
  { name: '웨이팡(濰坊)',               lat: 36.71, lng: 119.10, modern_pop:  9400000, era_start:  200 },
  { name: '더저우(德州)',               lat: 37.44, lng: 116.36, modern_pop:  5700000, era_start: -200 },
  { name: '창저우(滄州)',               lat: 38.30, lng: 116.84, modern_pop:  7500000, era_start:  200 },
  { name: '위안(濮陽) · 복양',          lat: 35.76, lng: 115.02, modern_pop:  3900000, era_start: -500 },
  { name: '뤄허(漯河)',                  lat: 33.58, lng: 114.02, modern_pop:  2800000, era_start: -200 },
  { name: '주마뎬(駐馬店)',              lat: 33.00, lng: 114.01, modern_pop:  7200000, era_start: -200 },
  { name: '신양(信陽)',                  lat: 32.13, lng: 114.09, modern_pop:  6600000, era_start: -200 },
  { name: '카이펑(開封) 인근 상추(商丘)', lat: 34.41, lng: 115.65, modern_pop:  7200000, era_start: -500 },

  // ── 서북 / 실크로드 ──────────────────────────────────
  { name: '란저우(蘭州)',               lat: 36.06, lng: 103.83, modern_pop:  4000000, era_start: -200 },
  { name: '시닝(西寧)',                  lat: 36.62, lng: 101.77, modern_pop:  2400000, era_start:  200 },
  { name: '인촨(銀川)',                  lat: 38.47, lng: 106.27, modern_pop:  2860000, era_start:  200 },
  { name: '우루무치(烏魯木齊)',          lat: 43.80, lng:  87.60, modern_pop:  3500000, era_start:  200 },
  { name: '둔황(敦煌)',                  lat: 40.14, lng:  94.66, modern_pop:   200000, era_start: -200 },
  { name: '투루판(吐魯番)',              lat: 42.95, lng:  89.19, modern_pop:   700000, era_start: -200 },
  { name: '카스(喀什)',                  lat: 39.47, lng:  75.98, modern_pop:   700000, era_start: -200 },
  { name: '한중(漢中)',                  lat: 33.07, lng: 107.02, modern_pop:  3400000, era_start: -300 },

  // ── 화동 / 강남 ──────────────────────────────────────
  { name: '상하이(上海)',               lat: 31.23, lng: 121.47, modern_pop: 24900000, era_start:  800 },
  { name: '난징(南京) · 건업(建業)',     lat: 32.06, lng: 118.78, modern_pop:  9300000, era_start: -300 },
  { name: '항저우(杭州) · 임안(臨安)',   lat: 30.25, lng: 120.15, modern_pop: 12200000, era_start:  200 },
  { name: '쑤저우(蘇州)',               lat: 31.30, lng: 120.62, modern_pop: 10700000, era_start: -500 },
  { name: '닝보(寧波) · 명주(明州)',     lat: 29.87, lng: 121.55, modern_pop:  9400000, era_start:  200 },
  { name: '양저우(揚州)',               lat: 32.39, lng: 119.42, modern_pop:  4600000, era_start: -300 },
  { name: '전장(鎭江)',                  lat: 32.19, lng: 119.45, modern_pop:  3200000, era_start: -300 },
  { name: '우시(無錫)',                  lat: 31.57, lng: 120.30, modern_pop:  7400000, era_start: -300 },
  { name: '원저우(溫州)',               lat: 28.00, lng: 120.67, modern_pop:  9300000, era_start:  200 },
  { name: '샤오싱(紹興)',               lat: 30.00, lng: 120.57, modern_pop:  5500000, era_start: -500 },
  { name: '허페이(合肥)',               lat: 31.86, lng: 117.28, modern_pop:  9400000, era_start:  200 },
  { name: '우후(蕪湖)',                  lat: 31.34, lng: 118.36, modern_pop:  3800000, era_start:  200 },
  { name: '회안(淮安)',                  lat: 33.56, lng: 119.02, modern_pop:  4900000, era_start: -200 },
  { name: '난퉁(南通)',                  lat: 31.98, lng: 120.89, modern_pop:  7300000, era_start:  600 },
  { name: '화이난(淮南)',               lat: 32.63, lng: 116.99, modern_pop:  3400000, era_start: -300 },
  { name: '벙부(蚌埠)',                  lat: 32.92, lng: 117.36, modern_pop:  3400000, era_start: -200 },

  // ── 화중 ──────────────────────────────────────────────
  { name: '우한(武漢) · 강하(江夏)',     lat: 30.59, lng: 114.30, modern_pop: 12300000, era_start: -300 },
  { name: '창사(長沙)',                  lat: 28.23, lng: 112.94, modern_pop:  8000000, era_start: -300 },
  { name: '난창(南昌)',                  lat: 28.68, lng: 115.86, modern_pop:  6400000, era_start: -200 },
  { name: '징저우(荊州)',               lat: 30.33, lng: 112.24, modern_pop:  5700000, era_start: -500 },
  { name: '이창(宜昌)',                  lat: 30.69, lng: 111.29, modern_pop:  4000000, era_start: -200 },
  { name: '샹양(襄陽)',                  lat: 32.01, lng: 112.12, modern_pop:  5700000, era_start: -300 },
  { name: '헝양(衡陽)',                  lat: 26.89, lng: 112.57, modern_pop:  8000000, era_start:  200 },
  { name: '웨양(岳陽)',                  lat: 29.37, lng: 113.13, modern_pop:  5600000, era_start: -200 },
  { name: '상더(常德)',                  lat: 29.04, lng: 111.69, modern_pop:  5800000, era_start: -200 },
  { name: '주저우(株洲)',               lat: 27.83, lng: 113.13, modern_pop:  3900000, era_start:  400 },
  { name: '장시 주저우(吉安)',           lat: 27.11, lng: 114.97, modern_pop:  4800000, era_start:  200 },
  { name: '간저우(贛州)',               lat: 25.83, lng: 114.93, modern_pop:  9800000, era_start:  200 },

  // ── 화남 ──────────────────────────────────────────────
  { name: '광저우(廣州) · 번우(番禺)',   lat: 23.13, lng: 113.26, modern_pop: 16900000, era_start: -300 },
  { name: '선전(深圳)',                  lat: 22.54, lng: 114.06, modern_pop: 17500000, era_start:  800 },
  { name: '동관(東莞)',                  lat: 23.02, lng: 113.75, modern_pop: 10500000, era_start:  400 },
  { name: '포산(佛山)',                  lat: 23.02, lng: 113.12, modern_pop:  9500000, era_start:  400 },
  { name: '샤먼(廈門) · 천주(泉州)',     lat: 24.48, lng: 118.08, modern_pop:  5200000, era_start:  400 },
  { name: '푸저우(福州)',               lat: 26.07, lng: 119.30, modern_pop:  8300000, era_start:  200 },
  { name: '취안저우(泉州)',              lat: 24.90, lng: 118.68, modern_pop:  8900000, era_start:  400 },
  { name: '난닝(南寧)',                  lat: 22.82, lng: 108.37, modern_pop:  7100000, era_start:  200 },
  { name: '구이린(桂林)',               lat: 25.27, lng: 110.29, modern_pop:  3200000, era_start: -300 },
  { name: '류저우(柳州)',               lat: 24.33, lng: 109.42, modern_pop:  4100000, era_start:  200 },
  { name: '산터우(汕頭)',               lat: 23.35, lng: 116.68, modern_pop:  5600000, era_start:  400 },
  { name: '잔장(湛江)',                  lat: 21.27, lng: 110.36, modern_pop:  7300000, era_start:  200 },
  { name: '하이커우(海口)',              lat: 20.04, lng: 110.35, modern_pop:  2900000, era_start:  200 },
  { name: '메이저우(梅州)',              lat: 24.29, lng: 116.12, modern_pop:  3900000, era_start:  400 },

  // ── 서남 ──────────────────────────────────────────────
  { name: '청두(成都)',                  lat: 30.57, lng: 104.07, modern_pop: 20900000, era_start: -300 },
  { name: '충칭(重慶)',                  lat: 29.56, lng: 106.55, modern_pop: 10000000, era_start: -300 },
  { name: '쿤밍(昆明)',                  lat: 25.04, lng: 102.71, modern_pop:  8800000, era_start:  200 },
  { name: '구이양(貴陽)',               lat: 26.65, lng: 106.63, modern_pop:  5000000, era_start:  400 },
  { name: '다리(大理)',                  lat: 25.60, lng: 100.27, modern_pop:  3700000, era_start:  200 },
  { name: '이빈(宜賓)',                  lat: 28.77, lng: 104.64, modern_pop:  5500000, era_start: -200 },
  { name: '루저우(瀘州)',               lat: 28.87, lng: 105.44, modern_pop:  5100000, era_start: -200 },
  { name: '난충(南充)',                  lat: 30.83, lng: 106.11, modern_pop:  6300000, era_start: -200 },
  { name: '다저우(達州)',               lat: 31.21, lng: 107.50, modern_pop:  5500000, era_start:  200 },
  { name: '몐양(綿陽)',                  lat: 31.47, lng: 104.74, modern_pop:  5400000, era_start: -200 },

  // ── 동북 ──────────────────────────────────────────────
  { name: '선양(瀋陽)',                  lat: 41.80, lng: 123.43, modern_pop:  9100000, era_start:  200 },
  { name: '다롄(大連)',                  lat: 38.91, lng: 121.61, modern_pop:  7400000, era_start:  200 },
  { name: '창춘(長春)',                  lat: 43.82, lng: 125.32, modern_pop:  9000000, era_start:  600 },
  { name: '하얼빈(哈爾濱)',              lat: 45.75, lng: 126.63, modern_pop: 10900000, era_start:  900 },
  { name: '지린(吉林)',                  lat: 43.84, lng: 126.55, modern_pop:  4400000, era_start:  600 },
  { name: '단둥(丹東)',                  lat: 40.13, lng: 124.39, modern_pop:  2400000, era_start: -200 },
  { name: '안산(鞍山)',                  lat: 41.11, lng: 122.99, modern_pop:  3400000, era_start:  200 },
  { name: '무단장(牡丹江)',              lat: 44.58, lng: 129.60, modern_pop:  2600000, era_start:  600 },
  { name: '치치하얼(齊齊哈爾)',          lat: 47.35, lng: 123.92, modern_pop:  5600000, era_start:  600 },
  { name: '집안(集安) · 국내성(國內城)', lat: 41.12, lng: 126.18, modern_pop:   230000, era_start: -100 },

  // ── 내몽골 / 몽골 ─────────────────────────────────────
  { name: '후허하오터(呼和浩特)',        lat: 40.84, lng: 111.75, modern_pop:  3400000, era_start:  200 },
  { name: '바오터우(包頭)',              lat: 40.65, lng: 109.84, modern_pop:  2800000, era_start:  200 },
  { name: '울란바토르',                  lat: 47.91, lng: 106.88, modern_pop:  1500000, era_start:  600 },
  { name: '카라코룸(哈剌和林)',          lat: 47.21, lng: 102.85, modern_pop:    15000, era_start: 1200, era_end: 1400 },

  // ── 한반도 ───────────────────────────────────────────
  { name: '한양(漢陽) · 서울',          lat: 37.57, lng: 126.98, modern_pop:  9700000, era_start: -100 },
  { name: '평양(平壤)',                  lat: 39.03, lng: 125.75, modern_pop:  3100000, era_start: -200 },
  { name: '개성(開京)',                  lat: 37.97, lng: 126.55, modern_pop:   350000, era_start:  400 },
  { name: '경주(慶州) · 금성(金城)',     lat: 35.84, lng: 129.21, modern_pop:   260000, era_start: -100 },
  { name: '전주(全州)',                  lat: 35.82, lng: 127.15, modern_pop:   650000, era_start:  400 },
  { name: '공주(熊津)',                  lat: 36.45, lng: 127.12, modern_pop:   115000, era_start: -100 },
  { name: '부여(泗沘)',                  lat: 36.27, lng: 126.91, modern_pop:    65000, era_start: -100, era_end: 700 },
  { name: '광주(光州)',                  lat: 35.16, lng: 126.85, modern_pop:  1450000, era_start:  200 },
  { name: '대구(大邱)',                  lat: 35.87, lng: 128.60, modern_pop:  2430000, era_start:  200 },
  { name: '부산(釜山)',                  lat: 35.18, lng: 129.08, modern_pop:  3360000, era_start:  400 },
  { name: '함흥(咸興)',                  lat: 39.74, lng: 127.54, modern_pop:   770000, era_start:  400 },
  { name: '의주(義州)',                  lat: 40.20, lng: 124.44, modern_pop:   130000, era_start:  400 },
  { name: '청주(淸州)',                  lat: 36.64, lng: 127.49, modern_pop:   850000, era_start:  400 },

  // ── 베트남 / 동남아 ──────────────────────────────────
  { name: '하노이(昇龍) · 교지(交趾)',   lat: 21.03, lng: 105.83, modern_pop:  8200000, era_start: -200 },
  { name: '호치민(사이공)',              lat: 10.82, lng: 106.63, modern_pop:  8900000, era_start:  800 },
  { name: '후에(順化)',                  lat: 16.46, lng: 107.59, modern_pop:  1200000, era_start:  400 },

  // ── 기타 주변 ─────────────────────────────────────────
  { name: '오키나와(琉球)',              lat: 26.21, lng: 127.68, modern_pop:  1400000, era_start:  800 },
];

// ════════════════════════════════════════════════════════
// 메인 실행
// ════════════════════════════════════════════════════════
async function main() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  console.log('✅ MongoDB 연결');

  const db = client.db(DB_NAME);
  const col = db.collection('resources');

  // 1. 기존 인구 데이터 전체 삭제
  const del = await col.deleteMany({ resource_type: 'population' });
  console.log(`🗑️  기존 인구 포인트 ${del.deletedCount}개 삭제`);

  // 2. 새 도시 데이터 생성
  const ERA_YEARS = Object.keys(ERA_SCALE).map(Number).sort((a, b) => a - b);

  const docs = CITIES.map(city => {
    const pop_by_year = {};
    for (const y of ERA_YEARS) {
      // era_start/era_end 범위 밖이면 0
      if (city.era_start !== undefined && y < city.era_start) {
        pop_by_year[String(y)] = 0;
        continue;
      }
      if (city.era_end !== undefined && y > city.era_end) {
        pop_by_year[String(y)] = 0;
        continue;
      }
      pop_by_year[String(y)] = Math.round(city.modern_pop * ERA_SCALE[String(y)]);
    }

    return {
      name: city.name,
      resource_type: 'population',
      location: {
        type: 'Point',
        coordinates: [city.lng, city.lat],  // GeoJSON: [lng, lat]
      },
      modern_pop: city.modern_pop,
      pop_by_year,
      era_start: city.era_start ?? -9999,
      era_end:   city.era_end   ??  9999,
    };
  });

  // 3. 삽입
  const ins = await col.insertMany(docs);
  console.log(`✅ 새 인구 포인트 ${ins.insertedCount}개 삽입`);

  // 4. 요약 출력
  console.log('\n── 주요 도시 인구 샘플 (0년 기준) ──');
  docs.slice(0, 10).forEach(d => {
    const p0 = (d.pop_by_year['0'] || 0).toLocaleString();
    console.log(`  ${d.name.padEnd(24)} | 현대 ${(d.modern_pop/10000).toFixed(0)}만 | 0년 ${p0}명`);
  });

  await client.close();
  console.log('\n🎉 완료');
}

main().catch(err => { console.error(err); process.exit(1); });
