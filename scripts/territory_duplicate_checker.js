require('dotenv').config();
const { connectToDatabase } = require('../db');

/**
 * 영토 중복 방지 유틸리티
 *
 * 데이터 표준화 정책:
 * - type: 'territory' (모든 영토 통일)
 * - start_year: -5000 (모든 영토 통일)
 * - end_year: null (현재까지 존재하는 영토)
 *
 * 중복 방지: OSM ID 또는 name+country+admin_level 조합으로 체크
 */
class TerritoryDuplicateChecker {
  constructor() {
    this.db = null;
    this.collections = null;
  }

  async connect() {
    const { collections } = await connectToDatabase();
    this.collections = collections;
  }

  /**
   * 영토 데이터의 중복 여부 확인
   * 데이터 표준화 후: OSM ID 또는 name+country+admin_level 조합으로 중복 체크
   * @param {Object} territory - 영토 데이터
   * @returns {Object} { isDuplicate: boolean, existingId: ObjectId|null, reason: string }
   */
  async checkDuplicate(territory) {
    if (!this.collections) await this.connect();

    // 1. OSM ID로 우선 체크 (가장 신뢰성 높음)
    if (territory.osm_id) {
      const existing = await this.collections.territories.findOne({
        osm_id: territory.osm_id
      });
      if (existing) {
        return {
          isDuplicate: true,
          existingId: existing._id,
          reason: `OSM ID 중복: ${territory.osm_id}`
        };
      }
    }

    // 2. 기본 속성으로 체크 (모든 데이터가 표준화됨)
    // 타입: 'territory', 시작연도: -5000, 종료연도: null로 고정
    const existing = await this.collections.territories.findOne({
      name: territory.name,
      country: territory.country,
      admin_level: territory.admin_level
    });

    if (existing) {
      return {
        isDuplicate: true,
        existingId: existing._id,
        reason: `동일한 영토 데이터 존재: ${territory.name} (${territory.country}, level:${territory.admin_level})`
      };
    }

    return {
      isDuplicate: false,
      existingId: null,
      reason: '중복 없음'
    };
  }

  /**
   * 영토 데이터 삽입 (중복 체크 후, 데이터 표준화 자동 적용)
   * @param {Object} territory - 영토 데이터
   * @returns {Object} { success: boolean, insertedId: ObjectId|null, error: string|null }
   */
  async insertTerritory(territory) {
    // 데이터 표준화 적용
    const standardizedData = {
      ...territory,
      type: 'territory',        // 타입 통일
      start_year: -5000,        // 시작연도 통일
      end_year: null            // 종료연도 통일 (현재까지 존재)
    };

    const duplicateCheck = await this.checkDuplicate(standardizedData);

    if (duplicateCheck.isDuplicate) {
      return {
        success: false,
        insertedId: null,
        error: duplicateCheck.reason
      };
    }

    try {
      const result = await this.collections.territories.insertOne(standardizedData);
      return {
        success: true,
        insertedId: result.insertedId,
        error: null
      };
    } catch (error) {
      return {
        success: false,
        insertedId: null,
        error: `삽입 실패: ${error.message}`
      };
    }
  }

  /**
   * 영토 데이터 업데이트 (중복 체크 후)
   * @param {ObjectId} id - 업데이트할 문서 ID
   * @param {Object} updateData - 업데이트 데이터
   * @returns {Object} { success: boolean, error: string|null }
   */
  async updateTerritory(id, updateData) {
    // 업데이트 데이터로 중복 체크 (자기 자신 제외)
    const duplicateCheck = await this.checkDuplicate(updateData);

    if (duplicateCheck.isDuplicate && duplicateCheck.existingId.toString() !== id.toString()) {
      return {
        success: false,
        error: duplicateCheck.reason
      };
    }

    try {
      await this.collections.territories.updateOne(
        { _id: id },
        { $set: updateData }
      );
      return {
        success: true,
        error: null
      };
    } catch (error) {
      return {
        success: false,
        error: `업데이트 실패: ${error.message}`
      };
    }
  }
}

// 사용 예시
async function example() {
  const checker = new TerritoryDuplicateChecker();

  // 새로운 영토 데이터 (표준화 전)
  const newTerritory = {
    name: '수원시',
    country: 'South Korea',
    admin_level: 6,  // 시 단위
    osm_id: '12345678', // 있으면 가장 좋음
    geometry: { /* GeoJSON */ }
    // type, start_year, end_year은 자동으로 표준화됨
  };

  // 삽입 시 자동 표준화 적용
  const result = await checker.insertTerritory(newTerritory);

  if (result.success) {
    console.log('✅ 삽입 성공:', result.insertedId);
    // 실제 저장되는 데이터:
    // {
    //   name: '수원시',
    //   country: 'South Korea',
    //   admin_level: 6,
    //   osm_id: '12345678',
    //   type: 'territory',    // 자동 적용
    //   start_year: -5000,    // 자동 적용
    //   end_year: null,       // 자동 적용
    //   geometry: { /* ... */ }
    // }
  } else {
    console.log('❌ 중복으로 인한 삽입 실패:', result.error);
  }
}

module.exports = TerritoryDuplicateChecker;

// CLI 실행 시 예시
if (require.main === module) {
  example().then(() => process.exit(0));
}