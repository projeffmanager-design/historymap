// scripts/add_missing_countries.js
// 북한, 몽골 국가 데이터 복원

require('dotenv').config();
const { MongoClient } = require('mongodb');
const fs = require('fs');

const mongoUri = process.env.MONGO_URI;

async function addMissingCountries() {
    const client = new MongoClient(mongoUri);
    
    try {
        await client.connect();
        console.log('✅ MongoDB 연결 성공\n');
        
        const db = client.db('realhistory');
        const territoriesCollection = db.collection('territories');
        
        // 1. 전체 국가 파일에서 북한, 몽골, 일본 찾기
        console.log('📖 china.json 파일 읽는 중...\n');
        const allCountries = JSON.parse(fs.readFileSync('china.json', 'utf-8'));
        
        const northKorea = allCountries.features.find(f => 
            (f.properties.SOVEREIGNT || f.properties.NAME || '').includes('North Korea')
        );
        
        const mongolia = allCountries.features.find(f => 
            (f.properties.SOVEREIGNT || f.properties.NAME || '').toLowerCase().includes('mongolia')
        );
        
        const toAdd = [];
        
        // 2. 북한 추가
        if (northKorea) {
            toAdd.push({
                name: "North Korea",
                geojson: {
                    type: "Feature",
                    properties: northKorea.properties,
                    geometry: northKorea.geometry
                },
                start_year: -2333,
                end_year: null,
                description: "북한 국가 경계"
            });
            console.log('✅ 북한 데이터 준비 완료');
        } else {
            console.log('❌ 북한 데이터를 찾을 수 없음');
        }
        
        // 3. 몽골 추가
        if (mongolia) {
            // 기존 몽골 삭제
            await territoriesCollection.deleteMany({ 
                name: { $regex: '^Mongolia$' } 
            });
            
            toAdd.push({
                name: "Mongolia",
                geojson: {
                    type: "Feature",
                    properties: mongolia.properties,
                    geometry: mongolia.geometry
                },
                start_year: -2000,
                end_year: null,
                description: "몽골 국가 경계"
            });
            console.log('✅ 몽골 데이터 준비 완료');
        } else {
            console.log('❌ 몽골 데이터를 찾을 수 없음');
        }
        
        // 4. 저장
        if (toAdd.length > 0) {
            console.log(`\n📥 ${toAdd.length}개 국가 추가 중...\n`);
            await territoriesCollection.insertMany(toAdd);
            
            toAdd.forEach((country, i) => {
                console.log(`   ${i + 1}. ${country.name} (${country.start_year}년부터)`);
            });
            
            console.log('\n✅ 추가 완료!');
        }
        
        // 5. 최종 확인
        const totalCount = await territoriesCollection.countDocuments();
        console.log(`\n📊 전체 영토 개수: ${totalCount}개`);
        
    } catch (error) {
        console.error('❌ 오류:', error.message);
        console.error(error.stack);
    } finally {
        await client.close();
        console.log('\n✅ MongoDB 연결 종료');
    }
}

addMissingCountries();
