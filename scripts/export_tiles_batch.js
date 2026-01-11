// 타일을 배치로 나눠서 export (MongoDB Atlas 타임아웃 방지)
require('dotenv').config();
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

async function exportTilesBatch() {
    const MONGODB_URI = process.env.MONGO_URI;
    if (!MONGODB_URI) {
        console.error('MONGO_URI 환경 변수가 설정되지 않았습니다.');
        return;
    }
    
    const client = new MongoClient(MONGODB_URI, {
        maxIdleTimeMS: 600000, // 10분
        serverSelectionTimeoutMS: 60000,
        socketTimeoutMS: 600000,
        connectTimeoutMS: 60000
    });
    
    try {
        await client.connect();
        console.log('✅ MongoDB 연결 성공\n');
        
        const db = client.db('realhistory');
        const tilesDir = path.join(__dirname, '..', 'public', 'tiles');
        
        if (!fs.existsSync(tilesDir)) {
            fs.mkdirSync(tilesDir, { recursive: true });
        }
        
        // 총 개수 확인
        const totalCount = await db.collection('territory_tiles').countDocuments();
        console.log(`📊 총 ${totalCount}개 타일\n`);
        
        const batchSize = 5;  // 더 작은 배치로 변경
        const indexData = [];
        let totalSize = 0;
        let savedCount = 0;
        
        // 배치별로 처리
        for (let skip = 0; skip < totalCount; skip += batchSize) {
            console.log(`\n📦 배치 ${Math.floor(skip / batchSize) + 1}/${Math.ceil(totalCount / batchSize)} 처리 중...`);
            
            const batch = await db.collection('territory_tiles')
                .find({})
                .skip(skip)
                .limit(batchSize)
                .maxTimeMS(120000)  // 2분으로 증가
                .toArray();
            
            for (const tile of batch) {
                const filename = `tile_${tile.tile_lat}_${tile.tile_lng}.json`;
                const filepath = path.join(tilesDir, filename);
                
                // GeoJSON FeatureCollection 형식으로 변환
                const features = tile.data.map(territory => ({
                    type: 'Feature',
                    geometry: territory.geometry,
                    properties: {
                        _id: territory._id,
                        name: territory.name,
                        name_ko: territory.name_ko,
                        name_type: territory.name_type,
                        type: territory.type,
                        level: territory.level,
                        start: territory.start,
                        end: territory.end
                    }
                }));
                
                const exportData = {
                    tile_lat: tile.tile_lat,
                    tile_lng: tile.tile_lng,
                    bounds: tile.bounds,
                    data: {
                        type: 'FeatureCollection',
                        features: features
                    },
                    feature_count: tile.feature_count
                };
                
                const json = JSON.stringify(exportData);
                fs.writeFileSync(filepath, json, 'utf8');
                
                const fileSize = Buffer.byteLength(json, 'utf8');
                totalSize += fileSize;
                savedCount++;
                
                indexData.push({
                    lat: tile.tile_lat,
                    lng: tile.tile_lng,
                    bounds: tile.bounds,
                    filename: filename,
                    feature_count: tile.feature_count
                });
            }
            
            console.log(`  ✅ ${savedCount}/${totalCount} 파일 저장됨`);
            
            // 더 긴 대기 시간 (연결 안정화)
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        console.log(`\n✅ Export 완료!`);
        console.log(`📊 총 파일 수: ${savedCount}개`);
        console.log(`💾 총 크기: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`📏 평균 파일 크기: ${(totalSize / savedCount / 1024).toFixed(2)} KB`);
        
        // 인덱스 파일 생성
        const indexPath = path.join(tilesDir, 'index.json');
        fs.writeFileSync(indexPath, JSON.stringify(indexData, null, 2), 'utf8');
        console.log(`📋 인덱스 파일 생성: index.json`);
        console.log(`\n📁 저장 위치: ${tilesDir}`);
        
    } catch (error) {
        console.error('❌ 오류:', error);
    } finally {
        await client.close();
        console.log('\n✅ MongoDB 연결 종료');
    }
}

exportTilesBatch();
