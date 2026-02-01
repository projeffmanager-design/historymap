require('dotenv').config();
const { connectToDatabase } = require('../db');
const OSMDataFetcher = require('./osm_data_fetcher');
const TerritoryDuplicateChecker = require('./territory_duplicate_checker');

/**
 * OSM ID로 영토를 자동으로 import하는 시스템
 */
class OSMTerritoryImporter {
  constructor() {
    this.db = null;
    this.collections = null;
    this.fetcher = new OSMDataFetcher();
    this.checker = new TerritoryDuplicateChecker();
  }

  async connect() {
    const { collections } = await connectToDatabase();
    this.collections = collections;
  }

  /**
   * OSM ID로 영토 정보 조회 및 변환
   * @param {string} osmId - OSM ID (r2297418, w123456, n789)
   * @returns {Promise<Object>} 변환된 영토 데이터
   */
  async fetchTerritoryData(osmId) {
    try {
      console.log(`🔍 OSM ID ${osmId}로 영토 정보 조회 중...`);

      // OSM 데이터 조회
      const osmData = await this.fetcher.getTerritoryInfo(osmId);

      if (!osmData.name) {
        throw new Error(`OSM ID ${osmId}에서 이름을 찾을 수 없습니다`);
      }

      // 영토 데이터로 변환
      const territoryData = {
        name: osmData.name,
        name_en: osmData.name_en || osmData.name, // 영문이 없으면 기본 이름 사용
        code: osmData.osm_id_num.toString(), // OSM ID 숫자를 코드로 사용
        admin_level: osmData.admin_level || 6, // 기본값 6 (시/군/구 레벨)
        type: 'province', // 기본값
        country: this.inferCountry(osmData.name, osmData.name_en),
        osm_id: osmId,
        start_year: -5000, // 사용자가 지정한 대로
        end_year: null, // 현재까지
        geometry: null, // GeoJSON은 별도로 처리
        properties: {
          source: 'OSM',
          osm_type: osmData.osm_type,
          wikidata: osmData.wikidata,
          wikipedia: osmData.wikipedia,
          population: osmData.population,
          capital: osmData.capital
        }
      };

      return territoryData;

    } catch (error) {
      throw new Error(`영토 데이터 조회 실패: ${error.message}`);
    }
  }

  /**
   * 지역명으로 국가 추론
   * @param {string} name - 한국어 이름
   * @param {string} nameEn - 영문 이름
   * @returns {string} 국가명
   */
  inferCountry(name, nameEn) {
    // 한국어 이름으로 한국 확인
    if (name.includes('시') || name.includes('도') || name.includes('군') || name.includes('구')) {
      return 'South Korea';
    }

    // 영문 이름으로 국가 추론
    if (nameEn) {
      if (nameEn.includes('Seoul') || nameEn.includes('Busan') || nameEn.includes('Daegu')) {
        return 'South Korea';
      }
      if (nameEn.includes('Beijing') || nameEn.includes('Shanghai')) {
        return 'China';
      }
    }

    // 기본값
    return 'South Korea';
  }

  /**
   * OSM ID로 영토 import (중복 체크 후 삽입)
   * @param {string} osmId - OSM ID
   * @returns {Promise<Object>} import 결과
   */
  async importTerritory(osmId) {
    if (!this.collections) await this.connect();

    try {
      console.log(`📥 OSM ID ${osmId} 영토 import 시작...`);

      // 1. OSM 데이터 조회
      const territoryData = await this.fetchTerritoryData(osmId);

      console.log(`✅ OSM 데이터 조회 완료: ${territoryData.name} (${territoryData.name_en})`);

      // 2. 중복 체크
      const duplicateCheck = await this.checker.checkDuplicate(territoryData);

      if (duplicateCheck.isDuplicate) {
        return {
          success: false,
          error: `중복된 영토: ${duplicateCheck.reason}`,
          existingId: duplicateCheck.existingId
        };
      }

      // 3. 데이터베이스에 삽입
      const result = await this.collections.territories.insertOne(territoryData);

      console.log(`✅ 영토 import 완료: ${territoryData.name} (ID: ${result.insertedId})`);

      return {
        success: true,
        insertedId: result.insertedId,
        data: territoryData
      };

    } catch (error) {
      console.error(`❌ Import 실패: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 여러 OSM ID로 일괄 import
   * @param {string[]} osmIds - OSM ID 배열
   * @returns {Promise<Object[]>} import 결과 배열
   */
  async importMultipleTerritories(osmIds) {
    const results = [];

    for (const osmId of osmIds) {
      const result = await this.importTerritory(osmId);
      results.push({ osm_id: osmId, ...result });

      // API 부하 방지
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    return results;
  }

  /**
   * 지역명으로 검색 후 import
   * @param {string} name - 지역명
   * @returns {Promise<Object>} import 결과
   */
  async importByName(name) {
    try {
      console.log(`🔍 "${name}" 검색 후 import...`);

      // 지역명으로 OSM 데이터 조회
      const osmData = await this.fetcher.getTerritoryInfoByName(name);

      // 해당 OSM ID로 import
      return await this.importTerritory(osmData.osm_id);

    } catch (error) {
      return {
        success: false,
        error: `지역명 검색 실패: ${error.message}`
      };
    }
  }
}

// 사용 예시
async function example() {
  const importer = new OSMTerritoryImporter();

  try {
    // OSM ID로 직접 import
    console.log('📍 OSM ID로 import:');
    const result1 = await importer.importTerritory('r2297418'); // 서울특별시
    console.log('결과:', result1.success ? '성공' : '실패 - ' + result1.error);

    // 지역명으로 검색 후 import
    console.log('\n📍 지역명으로 import:');
    const result2 = await importer.importByName('부산광역시');
    console.log('결과:', result2.success ? '성공' : '실패 - ' + result2.error);

  } catch (error) {
    console.error('❌ 오류:', error.message);
  }
}

// CLI 실행 시 예시
if (require.main === module) {
  example().then(() => process.exit(0));
}

module.exports = OSMTerritoryImporter;
