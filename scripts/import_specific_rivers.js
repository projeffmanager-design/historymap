// scripts/import_specific_rivers.js
// 지정된 강만 정확히 import

require('dotenv').config();
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

const mongoUri = process.env.MONGO_URI;
const client = new MongoClient(mongoUri);

const DATA_DIR = path.join(__dirname, '../data/natural_earth');
const geoJsonPath = path.join(DATA_DIR, 'rivers.geojson');

// 원하는 강 목록 (영어 이름 매칭 패턴과 한국어 이름)
const DESIRED_RIVERS = [
    { patterns: ['Huang', 'Yellow'], name_ko: '황하', name_en: 'Huang He' },
    { patterns: ['Chang Jiang', 'Yangtze'], name_ko: '양자강', name_en: 'Yangtze' },
    { patterns: ['Liao'], name_ko: '요하', name_en: 'Liao River' },
    { patterns: ['Yongding'], name_ko: '영정하', name_en: 'Yongding River' },
    { patterns: ['Han River', 'Han Shui'], name_ko: '한수', name_en: 'Han River' },
    { patterns: ['Huai', 'Hwai'], name_ko: '회수', name_en: 'Huai River' },
    { patterns: ['Gan Jiang', 'Gan River'], name_ko: '간강', name_en: 'Gan Jiang' },
    { patterns: ['Amur', 'Heilong'], name_ko: '사하(아무르강)', name_en: 'Amur River' },
    { patterns: ['Sungari', 'Songhua'], name_ko: '송화강', name_en: 'Songhua River' },
    { patterns: ['Xin Jiang', 'Xinjiang'], name_ko: '신강', name_en: 'Xin Jiang' },
    { patterns: ['Pearl', 'Zhu Jiang', 'Xi River', 'Xi Jiang'], name_ko: '주강', name_en: 'Pearl River' },
    { patterns: ['Amu Darya', 'Amu-Darya'], name_ko: '아무다리야강', name_en: 'Amu Darya' },
    { patterns: ['Volga'], name_ko: '볼가강', name_en: 'Volga' },
    { patterns: ['Don'], name_ko: '돈강', name_en: 'Don' },
    { patterns: ['Tumen', 'Tuman', 'Tumen River'], name_ko: '토문강', name_en: 'Tumen River' },
];

// 강 이름 매칭 함수
function matchRiver(featureName, patterns) {
    const lowerName = featureName.toLowerCase();
    return patterns.some(pattern => {
        const lowerPattern = pattern.toLowerCase();
        return lowerName === lowerPattern || 
               lowerName.includes(lowerPattern) ||
               lowerPattern.includes(lowerName);
    });
}

// 강 찾기 및 변환
function findAndTransformRivers(geoJson) {
    const found = {};
    const features = geoJson.features || [];

    console.log('🔍 강 검색 시작...\n');

    for (const desired of DESIRED_RIVERS) {
        found[desired.name_ko] = [];
    }

    for (const feature of features) {
        const featureName = feature.properties.name || feature.properties.name_en || '';
        
        for (const desired of DESIRED_RIVERS) {
            if (matchRiver(featureName, desired.patterns)) {
                const transformed = {
                    name: desired.name_ko,
                    name_en: desired.name_en,
                    type: 'river',
                    geometry: feature.geometry,
                    properties: {
                        original_name: featureName,
                        ...feature.properties
                    }
                };
                found[desired.name_ko].push(transformed);
            }
        }
    }

    return found;
}

// MongoDB에 저장
async function saveToMongoDB(riversData) {
    try {
        await client.connect();
        console.log('\n📦 MongoDB에 연결되었습니다!');

        const db = client.db('realhistory');
        const collection = db.collection('natural_features');

        // 기존 데이터 삭제
        const existingCount = await collection.countDocuments();
        if (existingCount > 0) {
            await collection.deleteMany({});
            console.log(`🗑️  기존 데이터 ${existingCount}개 삭제`);
        }

        // 모든 강 데이터를 하나의 배열로 합치기
        const allFeatures = [];
        for (const [riverName, features] of Object.entries(riversData)) {
            if (features.length > 0) {
                allFeatures.push(...features);
            }
        }

        if (allFeatures.length > 0) {
            const result = await collection.insertMany(allFeatures);
            console.log(`✅ ${result.insertedCount}개의 강 segment를 MongoDB에 저장했습니다!`);

            // 인덱스 생성
            await collection.createIndex({ name: 1 });
            await collection.createIndex({ name_en: 1 });
            await collection.createIndex({ type: 1 });
            console.log('📇 인덱스 생성 완료');
        } else {
            console.log('⚠️  저장할 데이터가 없습니다.');
        }

    } catch (error) {
        console.error('❌ MongoDB 작업 중 오류:', error);
        throw error;
    } finally {
        await client.close();
    }
}

// 메인 실행
async function main() {
    try {
        console.log('🌊 지정된 강 Import 시작\n');

        // GeoJSON 파일 확인
        if (!fs.existsSync(geoJsonPath)) {
            console.error(`❌ GeoJSON 파일이 없습니다: ${geoJsonPath}`);
            console.log('먼저 import_natural_features.js를 실행하여 데이터를 다운로드하세요.');
            process.exit(1);
        }

        // 데이터 읽기
        console.log('📖 GeoJSON 파일 읽는 중...');
        const geoJson = JSON.parse(fs.readFileSync(geoJsonPath, 'utf8'));
        console.log(`✅ 총 ${geoJson.features.length}개의 feature\n`);

        // 강 검색
        const foundRivers = findAndTransformRivers(geoJson);

        // 결과 출력
        console.log('\n📊 검색 결과:\n');
        let totalFound = 0;
        for (const [riverName, features] of Object.entries(foundRivers)) {
            const status = features.length > 0 ? '✅' : '❌';
            const count = features.length > 0 ? `(${features.length}개 segment)` : '(찾을 수 없음)';
            console.log(`${status} ${riverName} ${count}`);
            totalFound += features.length;
        }

        console.log(`\n총 ${totalFound}개의 강 segment 발견`);

        // MongoDB에 저장
        if (totalFound > 0) {
            await saveToMongoDB(foundRivers);
            console.log('\n🎉 Import 완료!');
        } else {
            console.log('\n⚠️  저장할 데이터가 없습니다.');
        }

    } catch (error) {
        console.error('❌ 오류 발생:', error);
        process.exit(1);
    }
}

main();
