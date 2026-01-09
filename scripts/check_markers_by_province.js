// scripts/check_markers_by_province.js
// 각 시도별 마커 개수 확인

require('dotenv').config();
const { MongoClient } = require('mongodb');

const mongoUri = process.env.MONGO_URI;

// 각 시도의 대략적인 좌표 범위
const provinceRanges = {
    '서울특별시': { minLng: 126.76, maxLng: 127.18, minLat: 37.43, maxLat: 37.70 },
    '부산광역시': { minLng: 128.94, maxLng: 129.28, minLat: 35.00, maxLat: 35.40 },
    '대구광역시': { minLng: 128.30, maxLng: 128.80, minLat: 35.70, maxLat: 36.00 },
    '인천광역시': { minLng: 126.30, maxLng: 126.90, minLat: 37.30, maxLat: 37.65 },
    '광주광역시': { minLng: 126.70, maxLng: 127.00, minLat: 35.05, maxLat: 35.25 },
    '대전광역시': { minLng: 127.30, maxLng: 127.50, minLat: 36.25, maxLat: 36.45 },
    '울산광역시': { minLng: 129.10, maxLng: 129.50, minLat: 35.40, maxLat: 35.65 },
    '세종특별자치시': { minLng: 127.20, maxLng: 127.35, minLat: 36.45, maxLat: 36.60 },
    '경기도': { minLng: 126.50, maxLng: 127.80, minLat: 36.90, maxLat: 38.30 },
    '강원도': { minLng: 127.50, maxLng: 129.40, minLat: 37.00, maxLat: 38.60 },
    '충청북도': { minLng: 127.30, maxLng: 128.50, minLat: 36.20, maxLat: 37.20 },
    '충청남도': { minLng: 126.10, maxLng: 127.60, minLat: 36.00, maxLat: 37.00 },
    '전라북도': { minLng: 126.40, maxLng: 127.70, minLat: 35.40, maxLat: 36.20 },
    '전라남도': { minLng: 125.90, maxLng: 127.50, minLat: 34.20, maxLat: 35.50 },
    '경상북도': { minLng: 128.00, maxLng: 129.60, minLat: 35.90, maxLat: 37.50 },
    '경상남도': { minLng: 127.60, maxLng: 129.30, minLat: 34.60, maxLat: 35.80 },
    '제주특별자치도': { minLng: 126.10, maxLng: 126.95, minLat: 33.20, maxLat: 33.60 }
};

async function checkMarkersByProvince() {
    const client = new MongoClient(mongoUri);
    
    try {
        await client.connect();
        console.log('✅ MongoDB 연결 성공\n');
        
        const db = client.db('realhistory');
        const castleCollection = db.collection('castle');
        
        console.log('📊 각 시도별 마커 개수:\n');
        
        for (const [province, range] of Object.entries(provinceRanges)) {
            const markers = await castleCollection.find({
                lng: { $gte: range.minLng, $lte: range.maxLng },
                lat: { $gte: range.minLat, $lte: range.maxLat }
            }).toArray();
            
            const withHistory = markers.filter(m => m.history && m.history.length > 0).length;
            
            console.log(`${province.padEnd(15)} : ${markers.length}개 마커 (역사 있음: ${withHistory}개)`);
            
            if (markers.length > 0 && markers.length <= 3) {
                console.log('  샘플:');
                markers.forEach(m => {
                    console.log(`    - ${m.name} [${m.lng.toFixed(2)}, ${m.lat.toFixed(2)}] 역사: ${m.history ? m.history.length : 0}개`);
                });
            }
        }
        
    } catch (error) {
        console.error('❌ 오류:', error.message);
    } finally {
        await client.close();
        console.log('\n✅ MongoDB 연결 종료');
    }
}

checkMarkersByProvince();
