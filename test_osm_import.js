require('dotenv').config();
const { connectToDatabase } = require('./db');
const TerritoryDuplicateChecker = require('./scripts/territory_duplicate_checker');

/**
 * OSM ID로 영토 자동 import 테스트
 */
async function testOsmImport() {
  console.log('🧪 OSM ID 자동 import 테스트\n');

  const osmId = '49903'; // Laos
  console.log(`OSM ID: ${osmId} (Laos)\n`);

  try {
    // 1. OSM 데이터 가져오기
    console.log('1️⃣ OSM 데이터 조회 중...');
    const metaUrl = `https://nominatim.openstreetmap.org/lookup?osm_ids=R${osmId}&format=json`;
    const geoUrl = `https://nominatim.openstreetmap.org/lookup?osm_ids=R${osmId}&format=geojson&polygon_geojson=1`;

    const [metaResponse, geoResponse] = await Promise.all([
      fetch(metaUrl, { headers: { 'User-Agent': 'HistoryMap/1.0' } }),
      fetch(geoUrl, { headers: { 'User-Agent': 'HistoryMap/1.0' } })
    ]);

    const metaData = await metaResponse.json();
    const geoData = await geoResponse.json();

    if (!metaData || metaData.length === 0 || !geoData.features || geoData.features.length === 0) {
      throw new Error('OSM 데이터를 찾을 수 없습니다');
    }

    const meta = metaData[0];
    const feature = geoData.features[0];

    // 2. 데이터 구성
    console.log('2️⃣ 데이터 구성 중...');
    const territoryData = {
      name: meta.name || meta.display_name || 'Unknown',
      name_en: meta.display_name || meta.name || 'Unknown',
      name_ko: meta.name || meta.display_name || 'Unknown', // 한국어 이름이 없으므로 동일하게
      code: osmId,
      type: 'province',
      admin_level: 2, // 국가 레벨
      country: meta.address?.country || meta.name || 'Unknown',
      geometry: feature.geometry,
      bbox: calculateBBox(feature.geometry),
      start_year: -5000, // 사용자가 지정한 대로
      end_year: 3000,
      osm_id: `r${osmId}`,
      properties: {
        source: 'OSM Import',
        import_date: new Date().toISOString(),
        osm_meta: {
          place_id: meta.place_id,
          importance: meta.importance,
          place_rank: meta.place_rank
        }
      }
    };

    console.log('구성된 데이터:');
    console.log(`  이름: ${territoryData.name}`);
    console.log(`  영문: ${territoryData.name_en}`);
    console.log(`  국가: ${territoryData.country}`);
    console.log(`  OSM ID: ${territoryData.osm_id}`);
    console.log(`  Admin Level: ${territoryData.admin_level}`);

    // 3. 중복 체크
    console.log('\n3️⃣ 중복 체크 중...');
    const checker = new TerritoryDuplicateChecker();
    const duplicateCheck = await checker.checkDuplicate(territoryData);

    if (duplicateCheck.isDuplicate) {
      console.log('❌ 중복 발견:', duplicateCheck.reason);
      return;
    }

    console.log('✅ 중복 없음');

    // 4. 저장 (실제로는 웹 인터페이스에서 수행)
    console.log('\n4️⃣ 저장 준비 완료');
    console.log('💡 웹 인터페이스에서 "OSM에서 가져오기" 버튼을 클릭하여 테스트하세요');
    console.log('   - OSM ID: 49903 입력');
    console.log('   - "🌍 OSM에서 가져오기" 버튼 클릭');
    console.log('   - 자동으로 이름과 GeoJSON이 채워짐');
    console.log('   - "저장" 버튼으로 MongoDB에 저장');

  } catch (error) {
    console.log('❌ 오류:', error.message);
  }
}

// BBox 계산 함수 (territory_manager.html에서 복사)
function calculateBBox(geometry) {
  if (!geometry || !geometry.coordinates) return null;

  let minLat = Infinity, maxLat = -Infinity;
  let minLng = Infinity, maxLng = -Infinity;

  function processCoords(coords) {
    if (typeof coords[0] === 'number') {
      // [lng, lat] 형식
      const [lng, lat] = coords;
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
    } else {
      // 중첩 배열
      coords.forEach(processCoords);
    }
  }

  processCoords(geometry.coordinates);

  if (minLat === Infinity) return null;

  return {
    minLat, maxLat, minLng, maxLng
  };
}

testOsmImport();