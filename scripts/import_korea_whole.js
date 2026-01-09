// scripts/import_korea_whole.js
// 한반도 전체를 커버하는 단일 폴리곤 추가

require('dotenv').config();
const { MongoClient } = require('mongodb');

const mongoUri = process.env.MONGO_URI;

// 한반도 전체를 실제 모양에 가깝게 커버하는 폴리곤
// (남한 + 북한, 실제 해안선 근사)
const koreaWhole = {
    name: "한반도",
    geojson: {
        type: "Feature",
        properties: {
            name: "한반도",
            description: "한반도 전체 영역"
        },
        geometry: {
            type: "Polygon",
            coordinates: [[
                // 서해안 남쪽부터 시계방향
                [125.0, 34.5],   // 목포 근처
                [126.5, 33.2],   // 제주도
                [127.0, 34.0],   // 남해안
                [129.5, 35.0],   // 부산 근처
                [129.5, 37.0],   // 동해안 중부
                [128.5, 38.5],   // 속초 근처
                [129.0, 40.0],   // 원산 근처
                [130.0, 42.0],   // 나진 근처
                [130.5, 42.5],   // 함경북도 끝
                [129.0, 43.0],   // 두만강 상류
                [127.5, 43.0],   // 백두산 근처
                [125.0, 42.5],   // 압록강 상류
                [124.5, 40.5],   // 신의주 근처
                [124.5, 38.0],   // 황해도
                [125.5, 37.5],   // 인천 근처
                [125.0, 36.0],   // 서해안 중부
                [125.0, 34.5]    // 닫기
            ]]
        }
    },
    start_year: -2333,  // 고조선부터
    end_year: null,
    description: "한반도 전체 영역 (고조선~현대)"
};

async function importKoreaWhole() {
    const client = new MongoClient(mongoUri);
    
    try {
        await client.connect();
        console.log('✅ MongoDB 연결 성공\n');
        
        const db = client.db('realhistory');
        const territoriesCollection = db.collection('territories');
        
        // 기존 "한반도" 삭제
        const deleteResult = await territoriesCollection.deleteMany({ name: "한반도" });
        if (deleteResult.deletedCount > 0) {
            console.log(`🗑️  기존 "한반도" 데이터 ${deleteResult.deletedCount}개 삭제\n`);
        }
        
        // 새로 추가
        await territoriesCollection.insertOne(koreaWhole);
        console.log('✅ 한반도 전체 폴리곤 추가 완료!\n');
        
        console.log('📋 추가된 데이터:');
        console.log('   이름:', koreaWhole.name);
        console.log('   시작 연도:', koreaWhole.start_year);
        console.log('   좌표:', koreaWhole.geojson.geometry.coordinates[0]);
        
    } catch (error) {
        console.error('❌ 오류:', error.message);
    } finally {
        await client.close();
        console.log('\n✅ MongoDB 연결 종료');
    }
}

importKoreaWhole();
