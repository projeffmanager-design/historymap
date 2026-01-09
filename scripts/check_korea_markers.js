// scripts/check_korea_markers.js
// 한반도 지역 마커 확인 스크립트

require('dotenv').config();
const { MongoClient } = require('mongodb');

const mongoUri = process.env.MONGO_URI;

async function checkKoreaMarkers() {
    const client = new MongoClient(mongoUri);
    
    try {
        await client.connect();
        console.log('✅ MongoDB 연결 성공\n');
        
        const db = client.db('realhistory');
        const castleCollection = db.collection('castle');
        
        // 한반도 좌표 범위 (대략)
        // 경도: 124.5 ~ 131.9
        // 위도: 33.0 ~ 43.0
        
        const koreaMarkers = await castleCollection.find({
            lng: { $gte: 124.5, $lte: 131.9 },
            lat: { $gte: 33.0, $lte: 43.0 }
        }).toArray();
        
        console.log(`🇰🇷 한반도 지역 마커: ${koreaMarkers.length}개\n`);
        
        if (koreaMarkers.length > 0) {
            // 샘플 출력
            console.log('📍 샘플 마커 (처음 10개):');
            koreaMarkers.slice(0, 10).forEach((marker, index) => {
                console.log(`   ${index + 1}. ${marker.name} [${marker.lng.toFixed(4)}, ${marker.lat.toFixed(4)}]`);
                if (marker.history && marker.history.length > 0) {
                    console.log(`      역사: ${marker.history.length}개 기록`);
                }
            });
            
            // 좌표 범위 계산
            const lngs = koreaMarkers.map(m => m.lng);
            const lats = koreaMarkers.map(m => m.lat);
            console.log('\n📊 마커 좌표 범위:');
            console.log(`   경도: ${Math.min(...lngs).toFixed(4)} ~ ${Math.max(...lngs).toFixed(4)}`);
            console.log(`   위도: ${Math.min(...lats).toFixed(4)} ~ ${Math.max(...lats).toFixed(4)}`);
            
            // 역사 기록이 있는 마커
            const markersWithHistory = koreaMarkers.filter(m => m.history && m.history.length > 0);
            console.log(`\n📜 역사 기록이 있는 마커: ${markersWithHistory.length}개`);
            
            if (markersWithHistory.length > 0) {
                console.log('\n📍 역사가 있는 마커 샘플:');
                markersWithHistory.slice(0, 5).forEach((marker, index) => {
                    console.log(`   ${index + 1}. ${marker.name}`);
                    marker.history.slice(0, 2).forEach(h => {
                        console.log(`      - ${h.start_year || '?'}년 ~ ${h.end_year || '현재'}: 국가 ID ${h.country_id || '?'}`);
                    });
                });
            }
        } else {
            console.log('❌ 한반도 지역 마커를 찾을 수 없습니다!');
        }
        
    } catch (error) {
        console.error('❌ 오류:', error.message);
    } finally {
        await client.close();
        console.log('\n✅ MongoDB 연결 종료');
    }
}

checkKoreaMarkers();
