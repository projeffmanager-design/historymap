require('dotenv').config();
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

// MongoDB 연결
const mongoUri = process.env.MONGO_URI;
const client = new MongoClient(mongoUri);

// Natural Earth 데이터 URL
const RIVERS_URL = 'https://naciscdn.org/naturalearth/50m/physical/ne_50m_rivers_lake_centerlines.zip';
const DATA_DIR = path.join(__dirname, '../data/natural_earth');

// 강/산맥 선택 리스트
const FEATURES_TO_IMPORT = {
    rivers: [
        { name_en: 'Huang He', name_ko: '황하' },
        { name_en: 'Chang Jiang', name_ko: '양자강' },
        { name_en: 'Mekong', name_ko: '메콩강' },
        { name_en: 'Ganges', name_ko: '갠지스강' },
        { name_en: 'Indus', name_ko: '인더스강' },
        { name_en: 'Brahmaputra', name_ko: '브라흐마푸트라강' },
        { name_en: 'Tigris', name_ko: '티그리스강' },
        { name_en: 'Euphrates', name_ko: '유프라테스강' },
        { name_en: 'Danube', name_ko: '다뉴브강' },
        { name_en: 'Volga', name_ko: '볼가강' },
        { name_en: 'Rhine', name_ko: '라인강' },
        { name_en: 'Seine', name_ko: '세느강' },
        { name_en: 'Thames', name_ko: '템즈강' },
        { name_en: 'Nile', name_ko: '나일강' },
        { name_en: 'Congo', name_ko: '콩고강' },
        { name_en: 'Niger', name_ko: '니제르강' },
        { name_en: 'Amazon', name_ko: '아마존강' },
        { name_en: 'Mississippi', name_ko: '미시시피강' },
        { name_en: 'Rio Grande', name_ko: '리오그란데강' },
        { name_en: 'Murray', name_ko: '머레이강' }
    ]
    // 산맥은 별도 데이터셋이 필요하므로 일단 강만 처리
};

// 파일 다운로드 함수
function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
                // 리다이렉트 처리
                return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => {});
            reject(err);
        });
    });
}

// 데이터 디렉토리 생성
function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

// Shapefile을 GeoJSON으로 변환 (ogr2ogr 필요)
function convertToGeoJSON(shpPath, geoJsonPath) {
    try {
        console.log(`📐 Shapefile을 GeoJSON으로 변환 중...`);
        execSync(`ogr2ogr -f GeoJSON ${geoJsonPath} ${shpPath}`, { stdio: 'inherit' });
        console.log(`✅ GeoJSON 변환 완료: ${geoJsonPath}`);
        return true;
    } catch (error) {
        console.error(`❌ ogr2ogr 변환 실패:`, error.message);
        console.log(`\n💡 Tip: ogr2ogr 설치가 필요합니다:`);
        console.log(`   macOS: brew install gdal`);
        console.log(`   Linux: apt-get install gdal-bin`);
        return false;
    }
}

// 강 데이터 필터링 및 변환
function filterAndTransformRivers(geoJson, filterList) {
    const features = geoJson.features || [];
    const filtered = [];

    for (const feature of features) {
        const name = feature.properties.name || feature.properties.name_en || '';
        
        // 필터 리스트에서 매칭되는 강 찾기
        const match = filterList.find(item => {
            return name.toLowerCase().includes(item.name_en.toLowerCase()) ||
                   item.name_en.toLowerCase().includes(name.toLowerCase());
        });

        if (match) {
            // MongoDB용 데이터 구조로 변환
            const transformed = {
                name: match.name_ko,
                name_en: match.name_en,
                type: 'river',
                geometry: feature.geometry,
                properties: {
                    original_name: name,
                    ...feature.properties
                }
            };
            filtered.push(transformed);
            console.log(`✅ 발견: ${match.name_ko} (${match.name_en})`);
        }
    }

    return filtered;
}

// MongoDB에 저장
async function importToMongoDB(features) {
    try {
        await client.connect();
        console.log("MongoDB에 연결되었습니다!");
        
        const db = client.db("realhistory");
        const collection = db.collection("natural_features");

        // 기존 데이터 확인
        const existingCount = await collection.countDocuments();
        console.log(`\n📊 기존 자연 지형지물: ${existingCount}개`);

        if (existingCount > 0) {
            const answer = await promptUser(`기존 데이터를 삭제하고 새로 import 하시겠습니까? (y/n): `);
            if (answer.toLowerCase() === 'y') {
                await collection.deleteMany({});
                console.log(`🗑️ 기존 데이터 삭제 완료`);
            }
        }

        // 데이터 삽입
        if (features.length > 0) {
            const result = await collection.insertMany(features);
            console.log(`✅ ${result.insertedCount}개의 자연 지형지물을 MongoDB에 저장했습니다!`);
        } else {
            console.log(`⚠️ 저장할 데이터가 없습니다.`);
        }

        // 인덱스 생성
        await collection.createIndex({ name: 1 });
        await collection.createIndex({ name_en: 1 });
        await collection.createIndex({ type: 1 });
        console.log(`📑 인덱스 생성 완료`);

    } catch (error) {
        console.error("MongoDB 작업 중 오류:", error);
    } finally {
        await client.close();
    }
}

// 사용자 입력 받기
function promptUser(question) {
    return new Promise((resolve) => {
        const readline = require('readline').createInterface({
            input: process.stdin,
            output: process.stdout
        });
        readline.question(question, (answer) => {
            readline.close();
            resolve(answer);
        });
    });
}

// 메인 실행 함수
async function main() {
    console.log(`🌍 Natural Earth 자연 지형지물 Import 스크립트\n`);

    ensureDataDir();

    const zipPath = path.join(DATA_DIR, 'rivers.zip');
    const shpPath = path.join(DATA_DIR, 'ne_50m_rivers_lake_centerlines.shp');
    const geoJsonPath = path.join(DATA_DIR, 'rivers.geojson');

    // 1. 이미 GeoJSON이 있는지 확인
    if (!fs.existsSync(geoJsonPath)) {
        console.log(`📥 강 데이터 다운로드 시작...`);
        console.log(`URL: ${RIVERS_URL}`);
        
        try {
            await downloadFile(RIVERS_URL, zipPath);
            console.log(`✅ 다운로드 완료: ${zipPath}`);

            // 2. ZIP 압축 해제
            console.log(`📦 압축 해제 중...`);
            execSync(`unzip -o ${zipPath} -d ${DATA_DIR}`, { stdio: 'inherit' });
            console.log(`✅ 압축 해제 완료`);

            // 3. GeoJSON으로 변환
            if (!convertToGeoJSON(shpPath, geoJsonPath)) {
                console.error(`❌ GeoJSON 변환 실패. 스크립트를 종료합니다.`);
                process.exit(1);
            }

        } catch (error) {
            console.error(`❌ 다운로드 또는 변환 중 오류:`, error);
            process.exit(1);
        }
    } else {
        console.log(`✅ GeoJSON 파일이 이미 존재합니다: ${geoJsonPath}`);
    }

    // 4. GeoJSON 읽기 및 필터링
    console.log(`\n📖 GeoJSON 파일 읽는 중...`);
    const geoJsonData = JSON.parse(fs.readFileSync(geoJsonPath, 'utf8'));
    console.log(`✅ 전체 지형지물: ${geoJsonData.features.length}개`);

    console.log(`\n🔍 지정된 강 필터링 중...`);
    const filteredRivers = filterAndTransformRivers(geoJsonData, FEATURES_TO_IMPORT.rivers);
    
    console.log(`\n📊 필터링 결과: ${filteredRivers.length}/${FEATURES_TO_IMPORT.rivers.length}개 발견`);

    // 발견되지 않은 강 표시
    const foundNames = filteredRivers.map(r => r.name_en);
    const notFound = FEATURES_TO_IMPORT.rivers.filter(r => !foundNames.includes(r.name_en));
    if (notFound.length > 0) {
        console.log(`\n⚠️ 발견되지 않은 강:`);
        notFound.forEach(r => console.log(`   - ${r.name_ko} (${r.name_en})`));
    }

    // 5. MongoDB에 저장
    if (filteredRivers.length > 0) {
        console.log(`\n💾 MongoDB에 저장 중...`);
        await importToMongoDB(filteredRivers);
    }

    console.log(`\n✅ 작업 완료!`);
}

// 스크립트 실행
main().catch(console.error);
