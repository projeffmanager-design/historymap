// MongoDB 인덱스 생성으로 성능 최적화
require('dotenv').config();
const { MongoClient } = require('mongodb');

async function createIndexes() {
    const MONGODB_URI = process.env.MONGO_URI;
    if (!MONGODB_URI) {
        console.error('MONGO_URI 환경 변수가 설정되지 않았습니다.');
        return;
    }
    
    const client = new MongoClient(MONGODB_URI);
    
    try {
        await client.connect();
        console.log('✅ MongoDB 연결 성공\n');
        
        const db = client.db('realhistory');
        
        console.log('📍 인덱스 생성 중...\n');
        
        // 1. territory_tiles 컬렉션에 bounds 인덱스 생성 (가장 중요!)
        try {
            await db.collection('territory_tiles').createIndex({
                'bounds.minLat': 1,
                'bounds.maxLat': 1,
                'bounds.minLng': 1,
                'bounds.maxLng': 1
            }, { name: 'bounds_geo_index' });
            console.log('✅ territory_tiles.bounds 인덱스 생성 완료');
        } catch (e) {
            console.log('⚠️  territory_tiles.bounds 인덱스:', e.message);
        }
        
        // 2. territory_tiles에 tile 좌표 인덱스
        try {
            await db.collection('territory_tiles').createIndex({
                'tile_lat': 1,
                'tile_lng': 1
            }, { name: 'tile_coords_index' });
            console.log('✅ territory_tiles.tile_coords 인덱스 생성 완료');
        } catch (e) {
            console.log('⚠️  territory_tiles.tile_coords 인덱스:', e.message);
        }
        
        // 3. territories 컬렉션에 country_id 인덱스
        try {
            await db.collection('territories').createIndex({
                'country_id': 1
            }, { name: 'country_id_index' });
            console.log('✅ territories.country_id 인덱스 생성 완료');
        } catch (e) {
            console.log('⚠️  territories.country_id 인덱스:', e.message);
        }
        
        // 4. territories 컬렉션에 연도 인덱스
        try {
            await db.collection('territories').createIndex({
                'start_year': 1,
                'end_year': 1
            }, { name: 'year_range_index' });
            console.log('✅ territories.year_range 인덱스 생성 완료');
        } catch (e) {
            console.log('⚠️  territories.year_range 인덱스:', e.message);
        }
        
        console.log('\n📊 현재 인덱스 목록:');
        const indexes = await db.collection('territory_tiles').indexes();
        indexes.forEach(idx => {
            console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
        });
        
        console.log('\n🎉 인덱스 생성 완료!');
        console.log('💡 이제 쿼리 속도가 대폭 향상됩니다.');
        
    } catch (error) {
        console.error('❌ 오류:', error);
    } finally {
        await client.close();
    }
}

createIndexes();
