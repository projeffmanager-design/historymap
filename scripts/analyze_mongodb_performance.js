// MongoDB 성능 분석 및 인덱스 체크
require('dotenv').config();
const { MongoClient } = require('mongodb');

async function analyzePerformance() {
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
        
        // 1. 컬렉션 통계
        console.log('📊 === 컬렉션 통계 ===');
        const territoriesCount = await db.collection('territories').countDocuments();
        const territories = await db.collection('territories').find({}).toArray();
        const territoriesSize = territories.reduce((sum, t) => sum + JSON.stringify(t).length, 0);
        console.log(`territories 컬렉션:`);
        console.log(`  - 문서 수: ${territoriesCount}개`);
        console.log(`  - 평균 문서 크기: ${(territoriesSize / territoriesCount / 1024).toFixed(2)} KB`);
        console.log(`  - 총 크기: ${(territoriesSize / 1024 / 1024).toFixed(2)} MB`);
        
        const tilesCount = await db.collection('territory_tiles').countDocuments();
        const tiles = await db.collection('territory_tiles').find({}).toArray();
        const tilesSize = tiles.reduce((sum, t) => sum + JSON.stringify(t).length, 0);
        console.log(`\nterritory_tiles 컬렉션:`);
        console.log(`  - 문서 수: ${tilesCount}개`);
        console.log(`  - 평균 문서 크기: ${(tilesSize / tilesCount / 1024).toFixed(2)} KB`);
        console.log(`  - 총 크기: ${(tilesSize / 1024 / 1024).toFixed(2)} MB`);
        
        // 2. 현재 인덱스 확인
        console.log('\n🔍 === 현재 인덱스 목록 ===');
        const territoriesIndexes = await db.collection('territories').indexes();
        console.log('territories 인덱스:');
        territoriesIndexes.forEach(idx => {
            console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
        });
        
        const tilesIndexes = await db.collection('territory_tiles').indexes();
        console.log('\nterritory_tiles 인덱스:');
        tilesIndexes.forEach(idx => {
            console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
        });
        
        // 3. 쿼리 성능 테스트
        console.log('\n⏱️  === 쿼리 성능 테스트 ===');
        
        // territories 조회 테스트
        const t1Start = Date.now();
        await db.collection('territories').find({}).toArray();
        const t1Time = Date.now() - t1Start;
        console.log(`territories.find({}) 실행 시간: ${t1Time}ms`);
        
        // territory_tiles 조회 테스트 (bbox 포함)
        const t2Start = Date.now();
        await db.collection('territory_tiles').find({
            'bounds.minLat': { $lte: 40 },
            'bounds.maxLat': { $gte: 30 },
            'bounds.minLng': { $lte: 130 },
            'bounds.maxLng': { $gte: 120 }
        }).toArray();
        const t2Time = Date.now() - t2Start;
        console.log(`territory_tiles.find(bbox) 실행 시간: ${t2Time}ms`);
        
        // 4. 샘플 데이터 크기 확인
        console.log('\n📏 === 샘플 데이터 크기 ===');
        const sampleTerritory = await db.collection('territories').findOne({});
        if (sampleTerritory) {
            const territorySize = JSON.stringify(sampleTerritory).length;
            console.log(`단일 territory 문서 크기: ${(territorySize / 1024).toFixed(2)} KB`);
            console.log(`좌표 배열 길이: ${JSON.stringify(sampleTerritory.coordinates).length} bytes`);
        }
        
        const sampleTile = await db.collection('territory_tiles').findOne({});
        if (sampleTile) {
            const tileSize = JSON.stringify(sampleTile).length;
            console.log(`단일 tile 문서 크기: ${(tileSize / 1024).toFixed(2)} KB`);
            console.log(`features 수: ${sampleTile.feature_count || sampleTile.data?.features?.length || 0}개`);
        }
        
        // 5. 권장사항
        console.log('\n💡 === 최적화 권장사항 ===');
        
        const hasGeoIndex = territoriesIndexes.some(idx => 
            idx.name.includes('2dsphere') || JSON.stringify(idx.key).includes('2dsphere')
        );
        
        if (!hasGeoIndex) {
            console.log('⚠️  territories 컬렉션에 2dsphere 인덱스가 없습니다!');
            console.log('   권장: db.territories.createIndex({ "coordinates": "2dsphere" })');
        } else {
            console.log('✅ 2dsphere 인덱스가 설정되어 있습니다.');
        }
        
        
        if (!hasBoundsIndex) {
            console.log('⚠️  territory_tiles 컬렉션에 bounds 인덱스가 없습니다!');
            console.log('   권장: db.territory_tiles.createIndex({ "bounds.minLat": 1, "bounds.maxLat": 1, "bounds.minLng": 1, "bounds.maxLng": 1 })');
        } else {
            console.log('✅ bounds 인덱스가 설정되어 있습니다.');
        }
        
        const avgTileSize = tilesSize / tilesCount / 1024;
        if (avgTileSize > 500) {
            console.log(`⚠️  타일 평균 크기가 ${avgTileSize.toFixed(2)}KB로 500KB를 초과합니다. 타일 크기를 줄이는 것을 권장합니다.`);
        }
        
    } catch (error) {
        console.error('❌ 오류:', error);
    } finally {
        await client.close();
    }
}

analyzePerformance();
