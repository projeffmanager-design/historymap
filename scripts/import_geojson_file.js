// scripts/import_geojson_file.js
// 🚩 다운로드한 GeoJSON 파일을 MongoDB에 import하는 스크립트

require('dotenv').config();
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
    throw new Error("MONGO_URI 환경 변수가 설정되지 않았습니다.");
}

// 🚩 사용법 안내
function printUsage() {
    console.log(`
📖 사용법:
   node scripts/import_geojson_file.js <파일경로> [옵션]

📁 파일 형식:
   - GeoJSON (.geojson, .json)
   - 중국 행정구역: china.geojson
   - 한국 행정구역: korea.geojson

🔧 옵션:
   --name-field <필드명>    이름 필드 (기본: name)
   --start-year <연도>      시작 연도 (기본: -2000)
   --prefix <접두사>        이름 접두사 추가
   --append                 기존 데이터 유지하고 추가만 하기

📥 예제:
   node scripts/import_geojson_file.js data/china.geojson
   node scripts/import_geojson_file.js data/korea.geojson --start-year -2333
   node scripts/import_geojson_file.js data/provinces.geojson --name-field NAME --prefix "중국 "

💾 추천 다운로드 링크:
   중국: https://raw.githubusercontent.com/longwosion/geojson-map-china/master/geometryProvince/china.json
   한국: https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2013/json/skorea-provinces-2013-geo.json
`);
}

// 🚩 명령행 인자 파싱
function parseArgs() {
    const args = process.argv.slice(2);
    
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        printUsage();
        process.exit(0);
    }
    
    const options = {
        filePath: args[0],
        nameField: 'name',
        startYear: -2000,
        prefix: '',
        append: false
    };
    
    for (let i = 1; i < args.length; i++) {
        switch (args[i]) {
            case '--name-field':
                options.nameField = args[++i];
                break;
            case '--start-year':
                options.startYear = parseInt(args[++i]);
                break;
            case '--prefix':
                options.prefix = args[++i];
                break;
            case '--append':
                options.append = true;
                break;
        }
    }
    
    return options;
}

// 🚩 GeoJSON 파일 읽기
function readGeoJSONFile(filePath) {
    console.log(`📖 파일 읽는 중: ${filePath}`);
    
    if (!fs.existsSync(filePath)) {
        throw new Error(`파일을 찾을 수 없습니다: ${filePath}`);
    }
    
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(fileContent);
    
    console.log(`✅ 파일 읽기 완료`);
    return data;
}

// 🚩 GeoJSON을 territories 형식으로 변환
function convertToTerritories(geojson, options) {
    console.log('\n🔄 데이터 변환 중...');
    
    let features = [];
    
    // GeoJSON 형식 감지
    if (geojson.type === 'FeatureCollection') {
        features = geojson.features;
    } else if (geojson.type === 'Feature') {
        features = [geojson];
    } else if (geojson.features) {
        features = geojson.features;
    } else {
        throw new Error('지원하지 않는 GeoJSON 형식입니다');
    }
    
    console.log(`   ${features.length}개의 지형지물 발견`);
    
    const territories = [];
    let successCount = 0;
    let skipCount = 0;
    
    features.forEach((feature, index) => {
        try {
            // 이름 추출 (여러 필드 시도)
            const props = feature.properties || {};
            let name = props[options.nameField] 
                    || props.name 
                    || props.NAME 
                    || props.NAME_1
                    || props.name_local
                    || props.name_en
                    || `지역 ${index + 1}`;
            
            // 접두사 추가
            if (options.prefix) {
                name = options.prefix + name;
            }
            
            // Geometry 검증
            if (!feature.geometry || !feature.geometry.type) {
                console.log(`   ⚠️  건너뜀: ${name} (geometry 없음)`);
                skipCount++;
                return;
            }
            
            // Polygon이나 MultiPolygon만 허용
            if (feature.geometry.type !== 'Polygon' && feature.geometry.type !== 'MultiPolygon') {
                console.log(`   ⚠️  건너뜀: ${name} (Polygon 아님: ${feature.geometry.type})`);
                skipCount++;
                return;
            }
            
            territories.push({
                name: name,
                geojson: {
                    type: 'Feature',
                    geometry: feature.geometry,
                    properties: {
                        name: name,
                        description: props.description || props.desc || `${name} 행정구역`,
                        ...props
                    }
                },
                start_year: options.startYear,
                end_year: null,
                description: `${name} 행정구역`
            });
            
            successCount++;
            
        } catch (error) {
            console.error(`   ❌ 처리 실패 (${index + 1}번째):`, error.message);
            skipCount++;
        }
    });
    
    console.log(`   ✅ 변환 완료: ${successCount}개 성공, ${skipCount}개 건너뜀`);
    return territories;
}

// 🚩 MongoDB에 저장
async function importToMongoDB(territories, options) {
    const client = new MongoClient(mongoUri);
    
    try {
        await client.connect();
        console.log("\n✅ MongoDB에 연결되었습니다.");
        
        const db = client.db("realhistory");
        const territoriesCollection = db.collection("territories");
        
        // 기존 데이터 삭제 확인
        const existingCount = await territoriesCollection.countDocuments();
        if (existingCount > 0 && !options.append) {
            console.log(`\n⚠️  경고: ${existingCount}개의 기존 영토 데이터가 있습니다.`);
            console.log(`   모두 삭제하고 새 데이터를 추가합니다...`);
            
            const deleteResult = await territoriesCollection.deleteMany({});
            console.log(`   🗑️  ${deleteResult.deletedCount}개 삭제됨`);
        } else if (existingCount > 0 && options.append) {
            console.log(`\n📌 기존 데이터 ${existingCount}개 유지하고 새 데이터를 추가합니다...`);
        }
        
        // 새 데이터 저장
        console.log("\n📥 MongoDB에 저장 중...");
        const result = await territoriesCollection.insertMany(territories);
        
        console.log(`\n✅ ${result.insertedCount}개의 영토가 성공적으로 추가되었습니다!`);
        
        // 샘플 출력
        console.log("\n📋 추가된 영토 샘플 (처음 10개):");
        territories.slice(0, 10).forEach((territory, index) => {
            console.log(`   ${index + 1}. ${territory.name}`);
        });
        
        if (territories.length > 10) {
            console.log(`   ... 외 ${territories.length - 10}개`);
        }
        
    } finally {
        await client.close();
        console.log("\n✅ MongoDB 연결이 종료되었습니다.");
    }
}

// 🚩 메인 함수
async function main() {
    try {
        const options = parseArgs();
        
        console.log('\n🗺️  GeoJSON 파일 Import 시작\n');
        console.log('📋 설정:');
        console.log(`   파일: ${options.filePath}`);
        console.log(`   이름 필드: ${options.nameField}`);
        console.log(`   시작 연도: ${options.startYear}`);
        if (options.prefix) {
            console.log(`   접두사: "${options.prefix}"`);
        }
        console.log('');
        
        // 1. 파일 읽기
        const geojson = readGeoJSONFile(options.filePath);
        
        // 2. 데이터 변환
        const territories = convertToTerritories(geojson, options);
        
        if (territories.length === 0) {
            throw new Error('변환된 영토가 없습니다');
        }
        
        // 3. MongoDB에 저장
        await importToMongoDB(territories, options);
        
        console.log('\n✨ 완료!');
        console.log('\n💡 다음 단계:');
        console.log('   1. 서버를 재시작하세요: node server.js');
        console.log('   2. 브라우저에서 "영토" 버튼을 클릭하세요');
        console.log('   3. 연도를 이동하면서 영토 색상 변화를 확인하세요');
        
    } catch (error) {
        console.error('\n❌ 오류:', error.message);
        console.error('\n도움말을 보려면: node scripts/import_geojson_file.js --help');
        process.exit(1);
    }
}

// 스크립트 실행
if (require.main === module) {
    main();
}

module.exports = { convertToTerritories, importToMongoDB };
