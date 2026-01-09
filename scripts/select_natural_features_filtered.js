// scripts/select_natural_features_filtered.js
// 황하와 양자강을 제외한 강 선택 import

require('dotenv').config();
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const mongoUri = process.env.MONGO_URI;
const client = new MongoClient(mongoUri);

const DATA_DIR = path.join(__dirname, '../data/natural_earth');
const geoJsonPath = path.join(DATA_DIR, 'rivers.geojson');

// 🚫 제외할 강 목록 (영어 이름)
const EXCLUDED_RIVERS = [
    'Huang',           // 황하
    'Chang Jiang',     // 양자강
    'Yangtze',         // 양자강 (다른 이름)
    'Yellow',          // 황하 (다른 이름)
];

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function promptUser(question) {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer.trim());
        });
    });
}

// 강 목록 추출 (중복 제거 + 제외 필터)
function getUniqueRiverNames(geoJson) {
    const names = new Set();
    for (const feature of geoJson.features) {
        const name = feature.properties.name || feature.properties.name_en;
        if (name) {
            // 제외 목록에 없는 경우만 추가
            const isExcluded = EXCLUDED_RIVERS.some(excluded => 
                name.toLowerCase().includes(excluded.toLowerCase())
            );
            if (!isExcluded) {
                names.add(name);
            }
        }
    }
    return Array.from(names).sort();
}

// 번호나 이름으로 강 선택
function parseSelection(input, riverNames) {
    const selected = new Set();
    const parts = input.split(',').map(s => s.trim());

    for (const part of parts) {
        // 범위 입력 (예: 10-15)
        if (part.includes('-')) {
            const [start, end] = part.split('-').map(n => parseInt(n.trim()));
            if (!isNaN(start) && !isNaN(end)) {
                for (let i = start; i <= end; i++) {
                    if (i >= 1 && i <= riverNames.length) {
                        selected.add(riverNames[i - 1]);
                    }
                }
            }
        }
        // 숫자 입력
        else if (!isNaN(parseInt(part))) {
            const index = parseInt(part);
            if (index >= 1 && index <= riverNames.length) {
                selected.add(riverNames[index - 1]);
            }
        }
        // 이름 입력 (부분 매칭)
        else {
            const matching = riverNames.filter(name => 
                name.toLowerCase().includes(part.toLowerCase())
            );
            matching.forEach(name => selected.add(name));
        }
    }

    return Array.from(selected);
}

// 선택된 강의 features 추출
function extractSelectedFeatures(geoJson, selectedNames) {
    const features = [];
    for (const feature of geoJson.features) {
        const name = feature.properties.name || feature.properties.name_en;
        if (selectedNames.includes(name)) {
            features.push(feature);
        }
    }
    return features;
}

// MongoDB에 저장
async function saveToMongoDB(features, namesMapping) {
    try {
        await client.connect();
        console.log('\n📦 MongoDB에 연결되었습니다!');

        const db = client.db('realhistory');
        const collection = db.collection('natural_features');

        // 기존 데이터 확인
        const existingCount = await collection.countDocuments();
        if (existingCount > 0) {
            console.log(`⚠️  기존 데이터 ${existingCount}개가 있습니다.`);
            const answer = await promptUser('기존 데이터를 삭제하고 새로 import하시겠습니까? (y/n): ');
            if (answer.toLowerCase() !== 'y') {
                console.log('❌ Import를 취소했습니다.');
                return;
            }
            await collection.deleteMany({});
            console.log('🗑️  기존 데이터 삭제 완료');
        }

        // 변환 및 저장
        const documents = [];
        for (const feature of features) {
            const originalName = feature.properties.name || feature.properties.name_en;
            const koreanName = namesMapping[originalName];

            const doc = {
                name: koreanName,
                name_en: originalName,
                type: 'river',
                geometry: feature.geometry,
                properties: feature.properties
            };
            documents.push(doc);
        }

        if (documents.length > 0) {
            const result = await collection.insertMany(documents);
            console.log(`✅ ${result.insertedCount}개의 강을 MongoDB에 저장했습니다!`);

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

// 메인 함수
async function main() {
    try {
        console.log('🌍 자연 지형지물 선택 Import 도구 (황하/양자강 제외)\n');

        // GeoJSON 파일 읽기
        if (!fs.existsSync(geoJsonPath)) {
            console.error(`❌ GeoJSON 파일이 없습니다: ${geoJsonPath}`);
            console.log('먼저 import_natural_features.js를 실행하여 데이터를 다운로드하세요.');
            process.exit(1);
        }

        console.log('📖 GeoJSON 파일 읽는 중...');
        const geoJson = JSON.parse(fs.readFileSync(geoJsonPath, 'utf8'));
        console.log(`✅ 전체 지형지물: ${geoJson.features.length}개`);

        const riverNames = getUniqueRiverNames(geoJson);
        console.log(`\n📋 사용 가능한 강 목록 (황하/양자강 제외):\n`);

        riverNames.forEach((name, index) => {
            console.log(`${String(index + 1).padStart(3, ' ')}.  ${name}`);
        });

        console.log(`\n총 ${riverNames.length}개의 강`);
        console.log(`\n🎯 import할 강을 선택하세요:`);
        console.log(`   - 번호 입력 (예: 1,5,10-15,20)`);
        console.log(`   - 이름 검색 (예: ganges, mekong)`);
        console.log(`   - 'all' 입력 시 전체 선택`);
        console.log(`   - 'quit' 입력 시 종료\n`);

        const selection = await promptUser('선택: ');

        if (selection.toLowerCase() === 'quit') {
            console.log('👋 작업을 취소했습니다.');
            rl.close();
            return;
        }

        let selectedNames;
        if (selection.toLowerCase() === 'all') {
            selectedNames = riverNames;
        } else {
            selectedNames = parseSelection(selection, riverNames);
        }

        if (selectedNames.length === 0) {
            console.log('❌ 선택된 강이 없습니다.');
            rl.close();
            return;
        }

        console.log(`\n✅ ${selectedNames.length}개의 강이 선택되었습니다.`);

        // 한국어 이름 입력
        const namesMapping = {};
        for (const name of selectedNames) {
            const koreanName = await promptUser(`"${name}"의 한국어 이름 입력: `);
            namesMapping[name] = koreanName || name;
        }

        // Features 추출
        const selectedFeatures = extractSelectedFeatures(geoJson, selectedNames);
        console.log(`\n📊 추출된 feature: ${selectedFeatures.length}개`);

        // MongoDB에 저장
        await saveToMongoDB(selectedFeatures, namesMapping);

        console.log('\n🎉 Import 완료!');
        rl.close();

    } catch (error) {
        console.error('❌ 오류 발생:', error);
        rl.close();
        process.exit(1);
    }
}

main();
