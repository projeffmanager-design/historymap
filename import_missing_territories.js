// import_missing_territories.js
// DB에 없는 territories를 JSON 파일에서 임포트하고, geometry 없는 것들도 보완
const { connectToDatabase, collections } = require('./db');
const fs = require('fs');

// china-provinces.json 한자 → 영문/한국어 매핑
const chinaProvinceMap = {
  '新疆维吾尔自治区': { name: 'Xinjiang', name_ko: '신장', level: 'province' },
  '西藏自治区': { name: 'Xizang', name_ko: '티벳', level: 'province' },
  '内蒙古自治区': { name: 'Inner Mongolia', name_ko: '내몽골', level: 'province' },
  '青海省': { name: 'Qinghai', name_ko: '청해', level: 'province' },
  '四川省': { name: 'Sichuan', name_ko: '사천', level: 'province' },
  '黑龙江省': { name: 'Heilongjiang', name_ko: '흑룡강', level: 'province' },
  '甘肃省': { name: 'Gansu', name_ko: '감숙', level: 'province' },
  '云南省': { name: 'Yunnan', name_ko: '운남', level: 'province' },
  '广西壮族自治区': { name: 'Guangxi', name_ko: '광서', level: 'province' },
  '湖南省': { name: 'Hunan', name_ko: '호남', level: 'province' },
  '陕西省': { name: 'Shaanxi', name_ko: '섬서', level: 'province' },
  '广东省': { name: 'Guangdong', name_ko: '광동', level: 'province' },
  '吉林省': { name: 'Jilin', name_ko: '길림', level: 'province' },
  '河北省': { name: 'Hebei', name_ko: '하북', level: 'province' },
  '湖北省': { name: 'Hubei', name_ko: '호북', level: 'province' },
  '贵州省': { name: 'Guizhou', name_ko: '귀주', level: 'province' },
  '山东省': { name: 'Shandong', name_ko: '산동', level: 'province' },
  '江西省': { name: 'Jiangxi', name_ko: '강서', level: 'province' },
  '河南省': { name: 'Henan', name_ko: '하남', level: 'province' },
  '辽宁省': { name: 'Liaoning', name_ko: '요녕', level: 'province' },
  '山西省': { name: 'Shanxi', name_ko: '산서', level: 'province' },
  '安徽省': { name: 'Anhui', name_ko: '안휘', level: 'province' },
  '福建省': { name: 'Fujian', name_ko: '복건', level: 'province' },
  '浙江省': { name: 'Zhejiang', name_ko: '절강', level: 'province' },
  '江苏省': { name: 'Jiangsu', name_ko: '강소', level: 'province' },
  '重庆市': { name: 'Chongqing', name_ko: '충칭', level: 'city' },
  '宁夏回族自治区': { name: 'Ningxia', name_ko: '녕하', level: 'province' },
  '海南省': { name: 'Hainan', name_ko: '해남', level: 'province' },
  '台湾省': { name: 'Taiwan', name_ko: '대만', level: 'province' },
  '北京市': { name: 'Beijing', name_ko: '북경', level: 'city' },
  '天津市': { name: 'Tianjin', name_ko: '천진', level: 'city' },
  '上海市': { name: 'Shanghai', name_ko: '상해', level: 'city' },
  '香港特别行政区': { name: 'Hong Kong S.A.R.', name_ko: '홍콩', level: 'city' },
  '澳门特别行政区': { name: 'Macao', name_ko: '마카오', level: 'city' },
};

// russia-regions.json name_latin → DB name 매핑 (name_latin 값 그대로 사용)
// name_latin 있으면 그대로 사용하고, DB에 이미 있는지 확인

// korea-provinces.json 한글명 → 영문/level 매핑
const koreaProvinceMap = {
  '서울특별시': { name: 'Seoul', name_ko: '서울특별시', level: 'city' },
  '부산광역시': { name: 'Busan', name_ko: '부산광역시', level: 'city' },
  '대구광역시': { name: 'Daegu', name_ko: '대구광역시', level: 'city' },
  '인천광역시': { name: 'Incheon', name_ko: '인천광역시', level: 'city' },
  '광주광역시': { name: 'Gwangju', name_ko: '광주광역시', level: 'city' },
  '대전광역시': { name: 'Daejeon', name_ko: '대전광역시', level: 'city' },
  '울산광역시': { name: 'Ulsan', name_ko: '울산광역시', level: 'city' },
  '세종특별자치시': { name: 'Sejong', name_ko: '세종특별자치시', level: 'city' },
  '경기도': { name: 'Gyeonggi', name_ko: '경기도', level: 'province' },
  '강원도': { name: 'Gangwon', name_ko: '강원도', level: 'province' },
  '충청북도': { name: 'North Chungcheong', name_ko: '충청북도', level: 'province' },
  '충청남도': { name: 'South Chungcheong', name_ko: '충청남도', level: 'province' },
  '전라북도': { name: 'North Jeolla', name_ko: '전라북도', level: 'province' },
  '전라남도': { name: 'South Jeolla', name_ko: '전라남도', level: 'province' },
  '경상북도': { name: 'North Gyeongsang', name_ko: '경상북도', level: 'province' },
  '경상남도': { name: 'South Gyeongsang', name_ko: '경상남도', level: 'province' },
  '제주특별자치도': { name: 'Jeju', name_ko: '제주특별자치도', level: 'province' },
};

function getBboxFromGeometry(geometry) {
  if (!geometry) return null;
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  
  function processCoords(coords) {
    if (typeof coords[0] === 'number') {
      if (coords[0] < minLng) minLng = coords[0];
      if (coords[0] > maxLng) maxLng = coords[0];
      if (coords[1] < minLat) minLat = coords[1];
      if (coords[1] > maxLat) maxLat = coords[1];
    } else {
      coords.forEach(processCoords);
    }
  }
  
  if (geometry.type === 'Polygon') processCoords(geometry.coordinates);
  else if (geometry.type === 'MultiPolygon') geometry.coordinates.forEach(p => processCoords(p));
  
  if (!isFinite(minLat)) return null;
  return { minLat, maxLat, minLng, maxLng };
}

connectToDatabase().then(async () => {
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  // ── 1. china-provinces.json 처리 ──────────────────────────────────
  console.log('\n=== 1. china-provinces.json 처리 ===');
  const chinaData = JSON.parse(fs.readFileSync('./china-provinces.json', 'utf8'));
  
  for (const feature of chinaData.features) {
    const chineseName = feature.properties.name;
    const mapping = chinaProvinceMap[chineseName];
    if (!mapping) {
      console.log('  매핑 없음:', chineseName);
      skipped++;
      continue;
    }
    
    // DB에 이미 있는지 확인 (name으로)
    const existing = await collections.territories.findOne({ name: mapping.name });
    
    const geometry = feature.geometry;
    const bbox = getBboxFromGeometry(geometry);
    
    if (existing) {
      // geometry 없으면 업데이트
      if (!existing.geometry) {
        await collections.territories.updateOne(
          { _id: existing._id },
          { $set: { geometry, bbox } }
        );
        console.log('  geometry 업데이트:', mapping.name);
        updated++;
      } else {
        skipped++;
      }
    } else {
      // 새로 삽입
      await collections.territories.insertOne({
        name: mapping.name,
        name_ko: mapping.name_ko,
        level: mapping.level,
        geometry,
        bbox,
        start_year: -5000,
        end_year: 3000,
        start: -5000,
        end: 3000,
        properties: { source: 'china-provinces.json', import_date: new Date().toISOString() }
      });
      console.log('  삽입:', mapping.name, `(${mapping.name_ko})`);
      inserted++;
    }
  }

  // ── 2. russia-regions.json 처리 ──────────────────────────────────
  console.log('\n=== 2. russia-regions.json 처리 ===');
  const russiaData = JSON.parse(fs.readFileSync('./russia-regions.json', 'utf8'));
  
  for (const feature of russiaData.features) {
    const nameLatin = feature.properties.name_latin;
    const nameRus = feature.properties.name;
    if (!nameLatin) { skipped++; continue; }
    
    // DB에 이미 있는지 확인
    const existing = await collections.territories.findOne({ 
      $or: [
        { name: nameLatin },
        { name: nameRus }
      ]
    });
    
    const geometry = feature.geometry;
    const bbox = getBboxFromGeometry(geometry);
    
    if (existing) {
      if (!existing.geometry) {
        await collections.territories.updateOne(
          { _id: existing._id },
          { $set: { geometry, bbox } }
        );
        console.log('  geometry 업데이트:', nameLatin);
        updated++;
      } else {
        skipped++;
      }
    } else {
      await collections.territories.insertOne({
        name: nameLatin,
        name_ko: null,
        level: 'province',
        geometry,
        bbox,
        start_year: -5000,
        end_year: 3000,
        start: -5000,
        end: 3000,
        properties: { source: 'russia-regions.json', nameRussian: nameRus, import_date: new Date().toISOString() }
      });
      console.log('  삽입:', nameLatin);
      inserted++;
    }
  }

  // ── 3. korea-provinces.json 처리 ──────────────────────────────────
  console.log('\n=== 3. korea-provinces.json 처리 ===');
  const koreaData = JSON.parse(fs.readFileSync('./korea-provinces.json', 'utf8'));
  
  for (const feature of koreaData.features) {
    // 이름 찾기: korea-provinces.json에는 name(한글), name_eng(영문) 필드 있음
    const props = feature.properties;
    const koName = props.name || props.CTP_KOR_NM || props['name:ko'] || props.SIG_KOR_NM;
    const mapping = koreaProvinceMap[koName];
    
    if (!mapping) {
      console.log('  매핑 없음:', JSON.stringify(props).slice(0, 100));
      skipped++;
      continue;
    }
    
    const existing = await collections.territories.findOne({ 
      $or: [{ name: mapping.name }, { name_ko: mapping.name_ko }]
    });
    
    const geometry = feature.geometry;
    const bbox = getBboxFromGeometry(geometry);
    
    if (existing) {
      if (!existing.geometry) {
        await collections.territories.updateOne(
          { _id: existing._id },
          { $set: { geometry, bbox } }
        );
        console.log('  geometry 업데이트:', mapping.name);
        updated++;
      } else {
        skipped++;
      }
    } else {
      await collections.territories.insertOne({
        name: mapping.name,
        name_ko: mapping.name_ko,
        level: mapping.level,
        geometry,
        bbox,
        start_year: -5000,
        end_year: 3000,
        start: -5000,
        end: 3000,
        properties: { source: 'korea-provinces.json', import_date: new Date().toISOString() }
      });
      console.log('  삽입:', mapping.name, `(${mapping.name_ko})`);
      inserted++;
    }
  }

  console.log(`\n✅ 완료: 삽입 ${inserted}개, 업데이트 ${updated}개, 스킵 ${skipped}개`);
  
  const totalCount = await collections.territories.countDocuments({});
  console.log('총 territories 수:', totalCount);
  
  process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
