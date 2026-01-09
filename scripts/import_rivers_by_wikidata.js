// scripts/import_rivers_by_wikidata.js
// Wikidata ID를 사용한 정확한 강 데이터 import

require('dotenv').config();
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const mongoUri = process.env.MONGO_URI;
const client = new MongoClient(mongoUri);

const RIVERS_URL = 'https://naciscdn.org/naturalearth/50m/physical/ne_50m_rivers_lake_centerlines.zip';
const DATA_DIR = path.join(__dirname, '../data/natural_earth');

// Wikidata ID로 정확히 매칭할 주요 강 목록
const RIVERS_BY_WIKIDATA = {
    'Q3566': { name_ko: '황하', name_en: 'Huang He (Yellow River)' },
    'Q5413': { name_ko: '양자강', name_en: 'Yangtze (Chang Jiang)' },
    'Q41179': { name_ko: '메콩강', name_en: 'Mekong' },
    'Q5089': { name_ko: '갠지스강', name_en: 'Ganges' },
    'Q7348': { name_ko: '인더스강', name_en: 'Indus' },
    'Q43193': { name_ko: '브라흐마푸트라강', name_en: 'Brahmaputra' },
    'Q33871': { name_ko: '티그리스강', name_en: 'Tigris' },
    'Q34589': { name_ko: '유프라테스강', name_en: 'Euphrates' },
    'Q1653': { name_ko: '다뉴브강', name_en: 'Danube' },
    'Q626': { name_ko: '볼가강', name_en: 'Volga' },
    'Q584': { name_ko: '라인강', name_en: 'Rhine' },
    'Q1471': { name_ko: '세느강', name_en: 'Seine' },
    'Q19686': { name_ko: '템즈강', name_en: 'Thames' },
    'Q3392': { name_ko: '나일강', name_en: 'Nile' },
    'Q3503': { name_ko: '콩고강', name_en: 'Congo' },
    'Q3392': { name_ko: '니제르강', name_en: 'Niger' },
    'Q3783': { name_ko: '아마존강', name_en: 'Amazon' },
    'Q1497': { name_ko: '미시시피강', name_en: 'Mississippi' },
    'Q16562': { name_ko: '리오그란데강', name_en: 'Rio Grande' },
    'Q215652': { name_ko: '머레이강', name_en: 'Murray-Darling' },
    'Q41604': { name_ko: '아무르강', name_en: 'Amur' },
    'Q5409': { name_ko: '시르다리야강', name_en: 'Syr Darya' },
    'Q5568': { name_ko: '아무다리야강', name_en: 'Amu Darya' },
};

// 파일 다운로드
function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
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

function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

function convertToGeoJSON(shpPath, geoJsonPath) {
    try {
        console.log(`📐 Shapefile을 GeoJSON으로 변환 중...`);
        execSync(`ogr2ogr -f GeoJSON ${geoJsonPath} ${shpPath}`, { stdio: 'inherit' });
        console.log(`✅ GeoJSON 변환 완료`);
        return true;
    } catch (error) {
        console.error(`❌ ogr2ogr 변환 실패:`, error.message);
        return false;
    }
}

// Wikidata ID로 정확히 필터링
function filterRiversByWikidata(geoJson) {
    const features = geoJson.features || [];
    const filtered = [];
    const wikidataIds = Object.keys(RIVERS_BY_WIKIDATA);

    console.log(`\n🔍 Wikidata ID로 강 필터링 시작 (총 ${features.length}개 feature 검사)...`);

    for (const feature of features) {
        const wikidataid = feature.properties.wikidataid;
        
        if (wikidataid && RIVERS_BY_WIKIDATA[wikidataid]) {
            const riverInfo = RIVERS_BY_WIKIDATA[wikidataid];
            const transformed = {
                name: riverInfo.name_ko,
                name_en: riverInfo.name_en,
                type: 'river',
                wikidata_id: wikidataid,
                geometry: feature.geometry,
                properties: {
                    ...feature.properties
                }
            };
            filtered.push(transformed);
            console.log(`✅ ${riverInfo.name_ko} (${wikidataid})`);
        }
    }

    return filtered;
}

// MongoDB에 저장
async function importToMongoDB(features) {
    try {
        await client.connect();
        console.log("\n📦 MongoDB에 연결되었습니다!");
        
        const db = client.db("realhistory");
        const collection = db.collection("natural_features");

        // 기존 데이터 삭제
        const existingCount = await collection.countDocuments();
        if (existingCount > 0) {
            console.log(`🗑️ 기존 데이터 ${existingCount}개 삭제 중...`);
            await collection.deleteMany({});
        }

        // 데이터 삽입
        if (features.length > 0) {
            const result = await collection.insertMany(features);
            console.log(`✅ ${result.insertedCount}개의 강을 MongoDB에 저장했습니다!`);
        } else {
            console.log(`⚠️ 저장할 데이터가 없습니다.`);
        }

        // 인덱스 생성
        await collection.createIndex({ name: 1 });
        await collection.createIndex({ name_en: 1 });
        await collection.createIndex({ type: 1 });
        await collection.createIndex({ wikidata_id: 1 });
        console.log(`📇 인덱스 생성 완료`);

    } catch (error) {
        console.error("❌ MongoDB 작업 중 오류:", error);
        throw error;
    } finally {
        await client.close();
    }
}

// 메인 실행
async function main() {
    try {
        ensureDataDir();

        const zipPath = path.join(DATA_DIR, 'rivers.zip');
        const shpPath = path.join(DATA_DIR, 'ne_50m_rivers_lake_centerlines.shp');
        const geoJsonPath = path.join(DATA_DIR, 'rivers.geojson');

        // 1. 다운로드
        if (!fs.existsSync(shpPath)) {
            console.log(`📥 Natural Earth 강 데이터 다운로드 중...`);
            console.log(`   URL: ${RIVERS_URL}`);
            await downloadFile(RIVERS_URL, zipPath);
            console.log(`✅ 다운로드 완료`);

            // 압축 해제
            console.log(`📦 압축 해제 중...`);
            execSync(`unzip -o ${zipPath} -d ${DATA_DIR}`, { stdio: 'inherit' });
            console.log(`✅ 압축 해제 완료`);
        } else {
            console.log(`✅ Shapefile이 이미 존재합니다.`);
        }

        // 2. GeoJSON 변환
        if (!fs.existsSync(geoJsonPath)) {
            const converted = convertToGeoJSON(shpPath, geoJsonPath);
            if (!converted) {
                throw new Error('GeoJSON 변환 실패');
            }
        } else {
            console.log(`✅ GeoJSON 파일이 이미 존재합니다.`);
        }

        // 3. 데이터 읽기 및 필터링
        console.log(`📖 GeoJSON 파일 읽기...`);
        const geoJson = JSON.parse(fs.readFileSync(geoJsonPath, 'utf8'));
        console.log(`   총 ${geoJson.features.length}개의 강 feature`);

        const filteredRivers = filterRiversByWikidata(geoJson);
        console.log(`\n📊 필터링 결과: ${filteredRivers.length}개의 강 발견`);

        // 4. MongoDB에 저장
        await importToMongoDB(filteredRivers);

        console.log(`\n🎉 Import 완료!`);

    } catch (error) {
        console.error("❌ 오류 발생:", error);
        process.exit(1);
    }
}

main();
