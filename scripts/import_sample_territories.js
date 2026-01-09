// scripts/import_sample_territories.js
// 🚩 테스트용 샘플 영토 폴리곤 데이터 import 스크립트

require('dotenv').config();
const { MongoClient } = require('mongodb');

const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
    throw new Error("MONGO_URI 환경 변수가 설정되지 않았습니다.");
}

// 🚩 샘플 영토 데이터 - 한반도 주요 지역
// 주의: GeoJSON 좌표는 [경도(lng), 위도(lat)] 순서입니다!
const sampleTerritories = [
    {
        name: "한강 유역",
        geojson: {
            type: "Feature",
            geometry: {
                type: "Polygon",
                coordinates: [[
                    [126.5, 37.8],  // 서북 (경도, 위도)
                    [127.8, 37.8],  // 동북
                    [127.8, 37.2],  // 동남
                    [126.5, 37.2],  // 서남
                    [126.5, 37.8]   // 닫기
                ]]
            },
            properties: {
                name: "한강 유역",
                description: "한반도 중부의 핵심 지역"
            }
        },
        start_year: -2333,
        end_year: null,
        description: "한반도 중부 지역으로 고조선, 백제, 고구려, 신라, 고려, 조선의 각축지"
    },
    {
        name: "경상도 (영남)",
        geojson: {
            type: "Feature",
            geometry: {
                type: "Polygon",
                coordinates: [[
                    [127.8, 36.8],  // 서북
                    [129.5, 36.8],  // 동북
                    [129.5, 34.8],  // 동남
                    [127.8, 34.8],  // 서남
                    [127.8, 36.8]   // 닫기
                ]]
            },
            properties: {
                name: "경상도 (영남)",
                description: "신라와 가야의 본거지"
            }
        },
        start_year: -57,
        end_year: null,
        description: "신라와 가야 연맹의 중심 지역"
    },
    {
        name: "전라도 (호남)",
        geojson: {
            type: "Feature",
            geometry: {
                type: "Polygon",
                coordinates: [[
                    [125.5, 36.2],  // 서북
                    [127.5, 36.2],  // 동북
                    [127.5, 34.3],  // 동남
                    [125.5, 34.3],  // 서남
                    [125.5, 36.2]   // 닫기
                ]]
            },
            properties: {
                name: "전라도 (호남)",
                description: "백제의 후기 중심지"
            }
        },
        start_year: -18,
        end_year: null,
        description: "백제가 웅진으로 천도한 이후 중심이 된 지역"
    },
    {
        name: "평안도",
        geojson: {
            type: "Feature",
            geometry: {
                type: "Polygon",
                coordinates: [[
                    [124.0, 40.5],  // 서북
                    [126.5, 40.5],  // 동북
                    [126.5, 38.5],  // 동남
                    [124.0, 38.5],  // 서남
                    [124.0, 40.5]   // 닫기
                ]]
            },
            properties: {
                name: "평안도",
                description: "고구려와 고조선의 중심지"
            }
        },
        start_year: -2333,
        end_year: null,
        description: "고조선과 고구려의 주요 영토"
    },
    {
        name: "요동반도",
        geojson: {
            type: "Feature",
            geometry: {
                type: "Polygon",
                coordinates: [[
                    [120.5, 41.5],  // 서북
                    [124.0, 41.5],  // 동북
                    [124.0, 38.8],  // 동남
                    [120.5, 38.8],  // 서남
                    [120.5, 41.5]   // 닫기
                ]]
            },
            properties: {
                name: "요동반도",
                description: "고구려와 중국 왕조의 각축지"
            }
        },
        start_year: -37,
        end_year: null,
        description: "고구려의 초기 영토이자 후기 고구려의 핵심 영토"
    },
    {
        name: "만주 남부",
        geojson: {
            type: "Feature",
            geometry: {
                type: "Polygon",
                coordinates: [[
                    [123.0, 44.0],  // 서북
                    [128.0, 44.0],  // 동북
                    [128.0, 41.5],  // 동남
                    [123.0, 41.5],  // 서남
                    [123.0, 44.0]   // 닫기
                ]]
            },
            properties: {
                name: "만주 남부",
                description: "고구려와 발해의 중심 영토"
            }
        },
        start_year: -37,
        end_year: null,
        description: "고구려 최대 판도 시기와 발해의 핵심 영토"
    },
    {
        name: "산동반도",
        geojson: {
            type: "Feature",
            geometry: {
                type: "Polygon",
                coordinates: [[
                    [118.0, 38.5],  // 서북
                    [122.5, 38.5],  // 동북
                    [122.5, 35.5],  // 동남
                    [118.0, 35.5],  // 서남
                    [118.0, 38.5]   // 닫기
                ]]
            },
            properties: {
                name: "산동반도",
                description: "중국 동부 해안 지역"
            }
        },
        start_year: -2000,
        end_year: null,
        description: "중국 역대 왕조의 동부 거점"
    },
    {
        name: "하북성 (연경 일대)",
        geojson: {
            type: "Feature",
            geometry: {
                type: "Polygon",
                coordinates: [[
                    [114.0, 41.0],  // 서북
                    [118.0, 41.0],  // 동북
                    [118.0, 36.5],  // 동남
                    [114.0, 36.5],  // 서남
                    [114.0, 41.0]   // 닫기
                ]]
            },
            properties: {
                name: "하북성 (연경 일대)",
                description: "중국 역대 왕조의 핵심 지역"
            }
        },
        start_year: -2000,
        end_year: null,
        description: "중국 황하 문명의 중심지, 수많은 왕조의 수도 위치"
    }
];

async function importSampleTerritories() {
    const client = new MongoClient(mongoUri);
    
    try {
        await client.connect();
        console.log("✅ MongoDB에 연결되었습니다.");
        
        const db = client.db("realhistory");
        const territoriesCollection = db.collection("territories");
        
        // 🚩 [수정] 기존 샘플 데이터 모두 삭제
        console.log("\n🗑️  기존 샘플 데이터 삭제 중...");
        const deleteResult = await territoriesCollection.deleteMany({});
        console.log(`   ${deleteResult.deletedCount}개의 기존 데이터가 삭제되었습니다.`);
        
        // 샘플 데이터 삽입
        console.log("\n📥 새로운 샘플 영토 데이터 삽입 중...");
        const result = await territoriesCollection.insertMany(sampleTerritories);
        
        console.log(`\n✅ ${result.insertedCount}개의 샘플 영토가 성공적으로 추가되었습니다!`);
        console.log("\n📋 추가된 영토 목록:");
        sampleTerritories.forEach((territory, index) => {
            console.log(`   ${index + 1}. ${territory.name} (${territory.start_year}년~)`);
        });
        
        console.log("\n💡 사용 방법:");
        console.log("   1. 서버를 실행하세요: node server.js");
        console.log("   2. 브라우저에서 지도를 엽니다");
        console.log("   3. '강역' 토글 버튼을 켜세요");
        console.log("   4. 연도를 이동하면 각 지역이 자동으로 해당 시점의 지배 국가 색상으로 표시됩니다");
        
        console.log("\n🎨 영토 색상:");
        console.log("   - 각 영토는 해당 시점에 그 지역에 가장 많은 성/도시를 가진 국가의 색상으로 표시됩니다");
        console.log("   - 수도는 일반 도시보다 3배의 가중치를 가집니다");
        
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
    importSampleTerritories()
        .then(() => {
            console.log("\n✨ 완료!");
            process.exit(0);
        })
        .catch(error => {
            console.error("\n❌ 실패:", error);
            process.exit(1);
        });
}

module.exports = { importSampleTerritories, sampleTerritories };
