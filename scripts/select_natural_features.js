require('dotenv').config();
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// MongoDB 연결
const mongoUri = process.env.MONGO_URI;
const client = new MongoClient(mongoUri);

const DATA_DIR = path.join(__dirname, '../data/natural_earth');
const geoJsonPath = path.join(DATA_DIR, 'rivers.geojson');

// 사용자 입력 인터페이스
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(prompt) {
    return new Promise((resolve) => {
        rl.question(prompt, resolve);
    });
}

// 사용 가능한 강 목록 표시
function displayAvailableRivers(geoJsonData) {
    console.log(`\n📋 사용 가능한 강 목록:\n`);
    
    const features = geoJsonData.features || [];
    const rivers = features
        .map(f => f.properties.name || f.properties.name_en || '이름 없음')
        .filter(name => name !== '이름 없음')
        .sort();

    // 중복 제거
    const uniqueRivers = [...new Set(rivers)];
    
    uniqueRivers.forEach((name, index) => {
        console.log(`${(index + 1).toString().padStart(3)}.  ${name}`);
    });

    console.log(`\n총 ${uniqueRivers.length}개의 강`);
    return uniqueRivers;
}

// 강 선택 인터페이스
async function selectRivers(availableRivers) {
    console.log(`\n🎯 import할 강을 선택하세요:`);
    console.log(`   - 번호 입력 (예: 1,5,10-15,20)`);
    console.log(`   - 이름 검색 (예: yellow, ganges)`);
    console.log(`   - 'all' 입력 시 전체 선택`);
    console.log(`   - 'quit' 입력 시 종료\n`);

    const input = await question('선택: ');

    if (input.toLowerCase() === 'quit') {
        return null;
    }

    if (input.toLowerCase() === 'all') {
        return availableRivers;
    }

    const selected = [];

    // 번호 범위 처리 (예: 1,5,10-15,20)
    if (/^[\d,\-\s]+$/.test(input)) {
        const parts = input.split(',');
        for (const part of parts) {
            if (part.includes('-')) {
                const [start, end] = part.split('-').map(s => parseInt(s.trim()));
                for (let i = start; i <= end; i++) {
                    if (i >= 1 && i <= availableRivers.length) {
                        selected.push(availableRivers[i - 1]);
                    }
                }
            } else {
                const num = parseInt(part.trim());
                if (num >= 1 && num <= availableRivers.length) {
                    selected.push(availableRivers[num - 1]);
                }
            }
        }
    }
    // 이름 검색 (예: yellow, ganges)
    else {
        const searchTerms = input.toLowerCase().split(',').map(s => s.trim());
        for (const term of searchTerms) {
            const matches = availableRivers.filter(name => 
                name.toLowerCase().includes(term)
            );
            selected.push(...matches);
        }
    }

    // 중복 제거
    return [...new Set(selected)];
}

// 선택된 강에 한국어 이름 추가
async function addKoreanNames(selectedRivers) {
    console.log(`\n📝 한국어 이름을 입력하세요 (Enter 키로 건너뛰기):\n`);

    const result = [];
    for (const riverName of selectedRivers) {
        const koreanName = await question(`${riverName} -> `);
        result.push({
            name_en: riverName,
            name_ko: koreanName.trim() || riverName
        });
    }

    return result;
}

// 강 데이터 추출
function extractRiverData(geoJson, selectedList) {
    const features = geoJson.features || [];
    const extracted = [];

    for (const feature of features) {
        const name = feature.properties.name || feature.properties.name_en || '';
        
        const match = selectedList.find(item => 
            name === item.name_en || 
            name.toLowerCase() === item.name_en.toLowerCase()
        );

        if (match) {
            extracted.push({
                name: match.name_ko,
                name_en: match.name_en,
                type: 'river',
                geometry: feature.geometry,
                properties: {
                    original_name: name,
                    ...feature.properties
                }
            });
        }
    }

    return extracted;
}

// MongoDB에 저장
async function importToMongoDB(features) {
    try {
        await client.connect();
        console.log("\n💾 MongoDB에 연결되었습니다!");
        
        const db = client.db("realhistory");
        const collection = db.collection("natural_features");

        // 기존 데이터 확인
        const existingCount = await collection.countDocuments();
        if (existingCount > 0) {
            console.log(`\n📊 기존 자연 지형지물: ${existingCount}개`);
            const answer = await question(`기존 데이터를 삭제하고 새로 import 하시겠습니까? (y/n): `);
            if (answer.toLowerCase() === 'y') {
                await collection.deleteMany({});
                console.log(`🗑️ 기존 데이터 삭제 완료`);
            }
        }

        // 데이터 삽입
        if (features.length > 0) {
            const result = await collection.insertMany(features);
            console.log(`✅ ${result.insertedCount}개의 자연 지형지물을 MongoDB에 저장했습니다!`);
            
            // 저장된 항목 표시
            console.log(`\n📋 저장된 강 목록:`);
            features.forEach(f => console.log(`   - ${f.name} (${f.name_en})`));
        } else {
            console.log(`⚠️ 저장할 데이터가 없습니다.`);
        }

        // 인덱스 생성
        await collection.createIndex({ name: 1 });
        await collection.createIndex({ name_en: 1 });
        await collection.createIndex({ type: 1 });
        console.log(`\n📑 인덱스 생성 완료`);

    } catch (error) {
        console.error("MongoDB 작업 중 오류:", error);
    } finally {
        await client.close();
    }
}

// 메인 실행
async function main() {
    console.log(`🌍 자연 지형지물 선택 Import 도구\n`);

    // GeoJSON 파일 확인
    if (!fs.existsSync(geoJsonPath)) {
        console.error(`❌ GeoJSON 파일이 없습니다: ${geoJsonPath}`);
        console.log(`\n먼저 'node scripts/import_natural_features.js'를 실행하여 데이터를 다운로드하세요.`);
        process.exit(1);
    }

    // GeoJSON 읽기
    console.log(`📖 GeoJSON 파일 읽는 중...`);
    const geoJsonData = JSON.parse(fs.readFileSync(geoJsonPath, 'utf8'));
    console.log(`✅ 전체 지형지물: ${geoJsonData.features.length}개`);

    // 사용 가능한 강 표시
    const availableRivers = displayAvailableRivers(geoJsonData);

    // 강 선택
    const selectedRiverNames = await selectRivers(availableRivers);
    
    if (!selectedRiverNames || selectedRiverNames.length === 0) {
        console.log(`\n👋 작업을 취소했습니다.`);
        rl.close();
        return;
    }

    console.log(`\n✅ ${selectedRiverNames.length}개의 강 선택됨`);

    // 한국어 이름 입력
    const selectedList = await addKoreanNames(selectedRiverNames);

    // 데이터 추출
    console.log(`\n🔍 선택된 강 데이터 추출 중...`);
    const riverData = extractRiverData(geoJsonData, selectedList);
    console.log(`✅ ${riverData.length}개의 강 데이터 추출 완료`);

    // MongoDB에 저장
    if (riverData.length > 0) {
        await importToMongoDB(riverData);
    }

    console.log(`\n✅ 작업 완료!`);
    rl.close();
}

main().catch(error => {
    console.error('오류:', error);
    rl.close();
});
