// scripts/download_geojson.js
// 🚩 실제 행정구역 GeoJSON 데이터 다운로드 및 import

require('dotenv').config();
const { MongoClient } = require('mongodb');
const https = require('https');
const fs = require('fs');
const path = require('path');

const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
    throw new Error("MONGO_URI 환경 변수가 설정되지 않았습니다.");
}

// 🚩 Natural Earth Data의 저해상도 국가 경계선 (10m 해상도)
const NATURAL_EARTH_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson';

// 🚩 중국 성급 행정구역 (간소화된 버전)
const CHINA_PROVINCES_URL = 'https://raw.githubusercontent.com/lyhmyd1211/china-geojson/master/china.json';

// 🚩 한국 시도 경계
const KOREA_PROVINCES_URL = 'https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2013/json/skorea-provinces-2013-topo.json';

function downloadFile(url) {
    return new Promise((resolve, reject) => {
        console.log(`📥 다운로드 중: ${url}`);
        https.get(url, (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
                // 리다이렉트 처리
                return downloadFile(response.headers.location).then(resolve).catch(reject);
            }
            
            if (response.statusCode !== 200) {
                reject(new Error(`다운로드 실패: ${response.statusCode}`));
                return;
            }
            
            let data = '';
            response.on('data', (chunk) => {
                data += chunk;
            });
            
            response.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    console.log(`✅ 다운로드 완료`);
                    resolve(json);
                } catch (e) {
                    reject(new Error('JSON 파싱 실패: ' + e.message));
                }
            });
        }).on('error', reject);
    });
}

// 🚩 중국 성급 행정구역 처리
function processChineseProvinces(geojson) {
    console.log('\n🇨🇳 중국 행정구역 처리 중...');
    
    if (!geojson.features) {
        console.error('❌ features가 없습니다');
        return [];
    }
    
    const territories = [];
    
    geojson.features.forEach(feature => {
        const name = feature.properties.name || feature.properties.NAME || '미상';
        
        territories.push({
            name: name,
            geojson: {
                type: 'Feature',
                geometry: feature.geometry,
                properties: {
                    name: name,
                    description: `중국 ${name} 성`
                }
            },
            start_year: -2000,
            end_year: null,
            description: `중국 ${name} 성 행정구역`
        });
    });
    
    console.log(`✅ ${territories.length}개 중국 행정구역 처리 완료`);
    return territories;
}

// 🚩 TopoJSON을 GeoJSON으로 변환 (한국 데이터용)
function topojsonToGeojson(topojson) {
    // 간단한 TopoJSON → GeoJSON 변환
    // 실제로는 topojson 라이브러리 사용 권장
    console.log('⚠️  TopoJSON 감지 - GeoJSON 변환 필요');
    console.log('   npm install topojson-client 실행 후 다시 시도해주세요');
    return null;
}

// 🚩 대안: 더 간단한 중국 행정구역 데이터 사용
const SIMPLE_CHINA_PROVINCES = [
    {
        name: "하북성 (河北省)",
        coordinates: [[114.5, 41.0], [119.5, 41.0], [119.5, 36.0], [114.5, 36.0], [114.5, 41.0]]
    },
    {
        name: "산동성 (山東省)",  
        coordinates: [[114.5, 38.5], [122.5, 38.5], [122.5, 34.5], [114.5, 34.5], [114.5, 38.5]]
    },
    {
        name: "요녕성 (遼寧省)",
        coordinates: [[118.5, 43.5], [125.5, 43.5], [125.5, 38.5], [118.5, 38.5], [118.5, 43.5]]
    },
    {
        name: "길림성 (吉林省)",
        coordinates: [[121.5, 46.0], [131.0, 46.0], [131.0, 41.0], [121.5, 41.0], [121.5, 46.0]]
    },
    {
        name: "흑룡강성 (黑龍江省)",
        coordinates: [[121.5, 53.5], [135.0, 53.5], [135.0, 43.5], [121.5, 43.5], [121.5, 53.5]]
    },
    {
        name: "강소성 (江蘇省)",
        coordinates: [[116.5, 35.0], [121.5, 35.0], [121.5, 30.5], [116.5, 30.5], [116.5, 35.0]]
    },
    {
        name: "절강성 (浙江省)",
        coordinates: [[118.0, 31.0], [123.0, 31.0], [123.0, 27.0], [118.0, 27.0], [118.0, 31.0]]
    }
];

function createSimpleChinaTerritories() {
    console.log('\n🇨🇳 간소화된 중국 행정구역 생성 중...');
    
    return SIMPLE_CHINA_PROVINCES.map(province => ({
        name: province.name,
        geojson: {
            type: 'Feature',
            geometry: {
                type: 'Polygon',
                coordinates: [province.coordinates]
            },
            properties: {
                name: province.name,
                description: `중국 ${province.name}`
            }
        },
        start_year: -2000,
        end_year: null,
        description: `중국 ${province.name} 행정구역`
    }));
}

async function importRealTerritories() {
    const client = new MongoClient(mongoUri);
    
    try {
        await client.connect();
        console.log("✅ MongoDB에 연결되었습니다.");
        
        const db = client.db("realhistory");
        const territoriesCollection = db.collection("territories");
        
        // 기존 데이터 삭제
        console.log("\n🗑️  기존 영토 데이터 삭제 중...");
        const deleteResult = await territoriesCollection.deleteMany({});
        console.log(`   ${deleteResult.deletedCount}개의 기존 데이터가 삭제되었습니다.`);
        
        // 간소화된 중국 행정구역 데이터 사용
        console.log("\n📦 영토 데이터 생성 중...");
        const territories = createSimpleChinaTerritories();
        
        // 한반도 지역 추가 (기존 샘플에서 일부 유지)
        territories.push(
            {
                name: "한강 유역",
                geojson: {
                    type: "Feature",
                    geometry: {
                        type: "Polygon",
                        coordinates: [[
                            [126.5, 37.8],
                            [127.8, 37.8],
                            [127.8, 37.2],
                            [126.5, 37.2],
                            [126.5, 37.8]
                        ]]
                    },
                    properties: { name: "한강 유역" }
                },
                start_year: -2333,
                end_year: null,
                description: "한반도 중부 핵심 지역"
            },
            {
                name: "경상도",
                geojson: {
                    type: "Feature",
                    geometry: {
                        type: "Polygon",
                        coordinates: [[
                            [127.8, 36.8],
                            [129.5, 36.8],
                            [129.5, 34.8],
                            [127.8, 34.8],
                            [127.8, 36.8]
                        ]]
                    },
                    properties: { name: "경상도" }
                },
                start_year: -57,
                end_year: null,
                description: "신라의 본거지"
            },
            {
                name: "전라도",
                geojson: {
                    type: "Feature",
                    geometry: {
                        type: "Polygon",
                        coordinates: [[
                            [125.5, 36.2],
                            [127.5, 36.2],
                            [127.5, 34.3],
                            [125.5, 34.3],
                            [125.5, 36.2]
                        ]]
                    },
                    properties: { name: "전라도" }
                },
                start_year: -18,
                end_year: null,
                description: "백제의 중심지"
            },
            {
                name: "평안도",
                geojson: {
                    type: "Feature",
                    geometry: {
                        type: "Polygon",
                        coordinates: [[
                            [124.0, 40.5],
                            [126.5, 40.5],
                            [126.5, 38.5],
                            [124.0, 38.5],
                            [124.0, 40.5]
                        ]]
                    },
                    properties: { name: "평안도" }
                },
                start_year: -2333,
                end_year: null,
                description: "고조선과 고구려의 중심지"
            }
        );
        
        // MongoDB에 저장
        console.log("\n📥 MongoDB에 저장 중...");
        const result = await territoriesCollection.insertMany(territories);
        
        console.log(`\n✅ ${result.insertedCount}개의 영토가 성공적으로 추가되었습니다!`);
        console.log("\n📋 추가된 영토 목록:");
        territories.forEach((territory, index) => {
            console.log(`   ${index + 1}. ${territory.name}`);
        });
        
        console.log("\n💡 참고:");
        console.log("   - 현재는 간소화된 사각형 경계를 사용합니다");
        console.log("   - 더 정확한 경계가 필요하면 다음 옵션을 고려하세요:");
        console.log("     1. Natural Earth Data (https://www.naturalearthdata.com/)");
        console.log("     2. GADM (https://gadm.org/)");
        console.log("     3. DataV GeoAtlas (중국 행정구역)");
        
    } catch (error) {
        console.error("❌ 오류 발생:", error);
        throw error;
    } finally {
        await client.close();
        console.log("\n✅ MongoDB 연결이 종료되었습니다.");
    }
}

// 스크립트 실행
if (require.main === module) {
    importRealTerritories()
        .then(() => {
            console.log("\n✨ 완료!");
            process.exit(0);
        })
        .catch(error => {
            console.error("\n❌ 실패:", error);
            process.exit(1);
        });
}

module.exports = { importRealTerritories };
