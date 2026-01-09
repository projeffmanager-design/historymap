// scripts/import_korea_detailed.js
// 남한+북한 실제 행정구역 경계로 "한반도" 데이터 교체

require('dotenv').config();
const { MongoClient } = require('mongodb');
const fs = require('fs');

const mongoUri = process.env.MONGO_URI;

async function importKoreaDetailed() {
    const client = new MongoClient(mongoUri);
    
    try {
        await client.connect();
        console.log('✅ MongoDB 연결 성공\n');
        
        const db = client.db('realhistory');
        const territoriesCollection = db.collection('territories');
        
        // 1. 기존 "한반도" 삭제
        const deleteResult = await territoriesCollection.deleteMany({ name: "한반도" });
        if (deleteResult.deletedCount > 0) {
            console.log(`🗑️  기존 "한반도" 데이터 ${deleteResult.deletedCount}개 삭제\n`);
        }
        
        // 2. 남한 데이터 읽기
        const southKorea = JSON.parse(fs.readFileSync('south-korea-outline.json', 'utf-8'));
        const southFeature = southKorea.features[0];
        
        // 3. 북한 데이터 읽기
        const northKorea = JSON.parse(fs.readFileSync('north-korea-only.json', 'utf-8'));
        const northFeature = northKorea.features[0];
        
        // 4. 남한 territory 생성
        const southTerritory = {
            name: "남한",
            geojson: {
                type: "Feature",
                properties: {
                    name: "남한",
                    name_eng: "South Korea"
                },
                geometry: southFeature.geometry
            },
            start_year: -2333,
            end_year: null,
            description: "남한 행정구역 (고조선~현대)"
        };
        
        // 5. 북한 territory 생성
        const northTerritory = {
            name: "북한",
            geojson: {
                type: "Feature",
                properties: {
                    name: "북한",
                    name_eng: "North Korea"
                },
                geometry: northFeature.geometry
            },
            start_year: -2333,
            end_year: null,
            description: "북한 행정구역 (고조선~현대)"
        };
        
        // 6. 저장
        await territoriesCollection.insertMany([southTerritory, northTerritory]);
        
        console.log('✅ 한반도 상세 경계 추가 완료!\n');
        console.log('📋 추가된 데이터:');
        console.log('   1. 남한');
        console.log('      - 좌표 개수:', southFeature.geometry.coordinates[0].length);
        console.log('   2. 북한');
        console.log('      - 좌표 개수:', northFeature.geometry.coordinates[0].length);
        
    } catch (error) {
        console.error('❌ 오류:', error.message);
    } finally {
        await client.close();
        console.log('\n✅ MongoDB 연결 종료');
    }
}

importKoreaDetailed();
