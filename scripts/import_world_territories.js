// 전 세계 국가별 영토를 마커 기반으로 임포트
require('dotenv').config();
const { MongoClient } = require('mongodb');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Point in Polygon 알고리즘 (Ray Casting)
function pointInPolygon(point, polygon) {
    const [x, y] = point;
    let inside = false;
    
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [xi, yi] = polygon[i];
        const [xj, yj] = polygon[j];
        
        const intersect = ((yi > y) !== (yj > y)) && 
                         (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    
    return inside;
}

// 좌표가 geometry 내에 있는지 확인
function isPointInGeometry(lng, lat, geometry) {
    const point = [lng, lat];
    
    if (geometry.type === 'Polygon') {
        return pointInPolygon(point, geometry.coordinates[0]);
    } else if (geometry.type === 'MultiPolygon') {
        return geometry.coordinates.some(polygon => pointInPolygon(point, polygon[0]));
    }
    
    return false;
}

// Natural Earth 데이터 다운로드
async function downloadNaturalEarthData() {
    const url = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson';
    const filePath = path.join(__dirname, '..', 'world-countries.json');
    
    if (fs.existsSync(filePath)) {
        console.log('✅ world-countries.json 파일이 이미 존재합니다.');
        return filePath;
    }
    
    console.log('📥 Natural Earth 데이터 다운로드 중...');
    
    return new Promise((resolve, reject) => {
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`다운로드 실패: ${response.statusCode}`));
                return;
            }
            
            const fileStream = fs.createWriteStream(filePath);
            response.pipe(fileStream);
            
            fileStream.on('finish', () => {
                fileStream.close();
                console.log('✅ 다운로드 완료!');
                resolve(filePath);
            });
        }).on('error', reject);
    });
}

async function importWorldTerritories() {
    const MONGO_URI = process.env.MONGO_URI;
    if (!MONGO_URI) {
        console.error('MONGO_URI 환경 변수가 설정되지 않았습니다.');
        return;
    }
    
    const client = new MongoClient(MONGO_URI);
    
    try {
        await client.connect();
        console.log('✅ MongoDB 연결 성공\n');
        
        const db = client.db('realhistory');
        const castleCollection = db.collection('castle');
        const territoryCollection = db.collection('territories');
        
        // 1. 마커 데이터 로딩
        console.log('📍 마커 데이터 로딩 중...');
        const castles = await castleCollection.find({}).toArray();
        console.log(`   총 ${castles.length}개 마커 발견\n`);
        
        // 2. Natural Earth 데이터 다운로드
        const worldFilePath = await downloadNaturalEarthData();
        
        // 3. 세계 국가 데이터 로드
        console.log('\n🌍 세계 국가 데이터 로딩 중...');
        const worldData = JSON.parse(fs.readFileSync(worldFilePath, 'utf8'));
        console.log(`   총 ${worldData.features.length}개 국가 발견\n`);
        
        // 4. 마커가 있는 국가만 필터링
        const territoriesToImport = [];
        const countryStats = {};
        
        console.log('🔍 마커가 있는 국가 찾기...\n');
        
        for (const feature of worldData.features) {
            const countryName = feature.properties.NAME || feature.properties.ADMIN || 'Unknown';
            const iso3 = feature.properties.ISO_A3;
            let markerCount = 0;
            
            // 이 국가 내에 마커가 있는지 확인
            for (const castle of castles) {
                if (castle.lat && castle.lng) {
                    if (isPointInGeometry(castle.lng, castle.lat, feature.geometry)) {
                        markerCount++;
                    }
                }
            }
            
            if (markerCount > 0) {
                console.log(`   ✅ ${countryName}: ${markerCount}개 마커`);
                
                territoriesToImport.push({
                    name: countryName,
                    name_eng: countryName,
                    iso3: iso3,
                    country_id: '전세계',
                    start_year: -3000,
                    start_month: 1,
                    end_year: null,
                    end_month: 12,
                    type: feature.geometry.type,
                    coordinates: feature.geometry.coordinates
                });
                
                countryStats[countryName] = markerCount;
            }
        }
        
        console.log(`\n\n📥 ${territoriesToImport.length}개 국가 영토 임포트 중...`);
        
        if (territoriesToImport.length > 0) {
            // 기존 데이터 삭제
            console.log('🗑️  기존 territories 데이터 삭제 중...');
            await territoryCollection.deleteMany({});
            
            // 새 데이터 삽입
            await territoryCollection.insertMany(territoriesToImport);
            console.log(`✅ ${territoriesToImport.length}개 임포트 완료!\n`);
            
            // 통계
            console.log('📊 국가별 마커 수 (상위 30개):');
            Object.entries(countryStats)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 30)
                .forEach(([name, count]) => {
                    console.log(`   ${name}: ${count}개`);
                });
        } else {
            console.log('⚠️  마커가 있는 국가를 찾을 수 없습니다.');
        }
        
    } catch (error) {
        console.error('❌ 오류 발생:', error);
    } finally {
        await client.close();
        console.log('\n✅ MongoDB 연결 종료');
    }
}

importWorldTerritories();
