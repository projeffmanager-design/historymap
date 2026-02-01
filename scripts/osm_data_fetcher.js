require('dotenv').config();
const https = require('https');

/**
 * OSM ID로 지역 이름과 정보를 가져오는 유틸리티
 */
class OSMDataFetcher {
  constructor() {
    this.overpassUrl = 'https://overpass-api.de/api/interpreter';
    this.nominatimUrl = 'https://nominatim.openstreetmap.org';
  }

  /**
   * OSM ID 파싱 (n123, w456, r789 형식)
   * @param {string} osmId - OSM ID (n123, w456, r789)
   * @returns {Object} { type: 'node'|'way'|'relation', id: number }
   */
  parseOsmId(osmId) {
    if (!osmId || typeof osmId !== 'string') {
      throw new Error('Invalid OSM ID format');
    }

    const match = osmId.match(/^([nwr])(\d+)$/);
    if (!match) {
      throw new Error('OSM ID must be in format: n{id}, w{id}, or r{id}');
    }

    const [, typeChar, idStr] = match;
    const type = typeChar === 'n' ? 'node' : typeChar === 'w' ? 'way' : 'relation';
    const id = parseInt(idStr, 10);

    return { type, id };
  }

  /**
   * Nominatim 검색으로 OSM ID 찾기
   * @param {string} query - 검색어 (예: "서울특별시")
   * @returns {Promise<Object[]>} 검색 결과
   */
  async searchByName(query) {
    return new Promise((resolve, reject) => {
      const url = `${this.nominatimUrl}/search?format=json&q=${encodeURIComponent(query)}&countrycodes=kr&limit=5`;

      const options = {
        headers: {
          'User-Agent': 'KoreaHistoryMap/1.0 (https://github.com/projeffmanager-design/historymap)'
        }
      };

      https.get(url, options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const results = JSON.parse(data);
            resolve(results);
          } catch (error) {
            reject(new Error(`Failed to parse search response: ${error.message}`));
          }
        });
      }).on('error', (error) => {
        reject(new Error(`Search request failed: ${error.message}`));
      });
    });
  }

  /**
   * Overpass API 쿼리 실행
   * @param {string} query - Overpass QL 쿼리
   * @returns {Promise<Object>} API 응답 데이터
   */
  async queryOverpass(query) {
    return new Promise((resolve, reject) => {
      const postData = `data=${encodeURIComponent(query)}`;

      const options = {
        hostname: 'overpass-api.de',
        path: '/api/interpreter',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            resolve(result);
          } catch (error) {
            reject(new Error(`Failed to parse API response: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`API request failed: ${error.message}`));
      });

      req.write(postData);
      req.end();
    });
  }

  /**
   * OSM ID로 지역 정보 조회
   * @param {string} osmId - OSM ID (n123, w456, r789)
   * @returns {Promise<Object>} 지역 정보
   */
  async getTerritoryInfo(osmId) {
    try {
      const { type, id } = this.parseOsmId(osmId);

      // Overpass QL 쿼리 생성
      const query = `
        [out:json][timeout:25];
        ${type}(${id});
        out body;
      `;

      console.log(`🔍 OSM ${type} ${id} 조회 중...`);
      const result = await this.queryOverpass(query);

      if (!result.elements || result.elements.length === 0) {
        throw new Error(`OSM ${type} ${id}를 찾을 수 없습니다`);
      }

      const element = result.elements[0];
      const tags = element.tags || {};

      // 지역 정보 추출
      const info = {
        osm_id: osmId,
        osm_type: type,
        osm_id_num: id,
        name: tags.name || tags['name:en'] || tags['name:ko'] || null,
        name_en: tags['name:en'] || null,
        name_ko: tags['name:ko'] || null,
        admin_level: tags.admin_level ? parseInt(tags.admin_level) : null,
        place: tags.place || null,
        boundary: tags.boundary || null,
        type: tags.type || null,
        capital: tags.capital || null,
        population: tags.population ? parseInt(tags.population) : null,
        wikidata: tags.wikidata || null,
        wikipedia: tags.wikipedia || null,
        all_tags: tags
      };

      return info;

    } catch (error) {
      throw new Error(`OSM 데이터 조회 실패: ${error.message}`);
    }
  }

  /**
   * 여러 OSM ID로 일괄 조회
   * @param {string[]} osmIds - OSM ID 배열
   * @returns {Promise<Object[]>} 지역 정보 배열
   */
  async getMultipleTerritoryInfo(osmIds) {
    const results = [];

    for (const osmId of osmIds) {
      try {
        const info = await this.getTerritoryInfo(osmId);
        results.push({ success: true, osm_id: osmId, data: info });
      } catch (error) {
        results.push({ success: false, osm_id: osmId, error: error.message });
      }

      // API 부하 방지를 위한 딜레이
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return results;
  }

  /**
   * 지역명으로 OSM ID 검색 및 정보 조회
   * @param {string} name - 지역명
   * @returns {Promise<Object>} 지역 정보
   */
  async getTerritoryInfoByName(name) {
    try {
      console.log(`🔍 "${name}" 검색 중...`);
      const searchResults = await this.searchByName(name);

      if (searchResults.length === 0) {
        throw new Error(`"${name}"을 찾을 수 없습니다`);
      }

      // 가장 관련성 높은 결과 선택 (첫 번째)
      const bestResult = searchResults[0];
      const osmId = `${bestResult.osm_type.charAt(0)}${bestResult.osm_id}`;

      console.log(`✅ 찾음: ${bestResult.display_name.split(',')[0]} (OSM ID: ${osmId})`);

      // 해당 OSM ID로 상세 정보 조회
      return await this.getTerritoryInfo(osmId);

    } catch (error) {
      throw new Error(`지역명 검색 실패: ${error.message}`);
    }
  }
}

// 사용 예시
async function example() {
  const fetcher = new OSMDataFetcher();

  try {
    // 지역명으로 검색
    console.log('📍 지역명으로 검색:');
    const seoulInfo = await fetcher.getTerritoryInfoByName('서울특별시');
    console.log('이름:', seoulInfo.name);
    console.log('영문:', seoulInfo.name_en);
    console.log('행정단계:', seoulInfo.admin_level);
    console.log('OSM ID:', seoulInfo.osm_id);
    console.log('');

    // 직접 OSM ID로 조회
    console.log('📍 OSM ID로 직접 조회:');
    const directInfo = await fetcher.getTerritoryInfo(seoulInfo.osm_id);
    console.log('직접 조회 결과:', directInfo.name);

  } catch (error) {
    console.error('❌ 오류:', error.message);
  }
}

// CLI 실행 시 예시
if (require.main === module) {
  example().then(() => process.exit(0));
}

module.exports = OSMDataFetcher;