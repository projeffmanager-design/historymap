// 타일을 개별 JSON 파일로 export하여 CDN에서 서빙
require('dotenv').config();
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

async function exportTilesToFiles() {
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
        
        // 🚀 [수정] 한 번에 모두 로드 (Atlas 커서 타임아웃 방지)
        console.log('📥 타일 데이터 로딩 중...');
        const tiles = await db.collection('territory_tiles').find({}, {
            maxTimeMS: 300000 // 5분 타임아웃
        }).toArray();
        
        const tilesCount = tiles.length;
        console.log(`📊 총 ${tilesCount}개 타일 export 시작...\n`);
        
        // public/tiles 디렉토리 생성
        const tilesDir = path.join(__dirname, '..', 'public', 'tiles');
        if (!fs.existsSync(tilesDir)) {
            fs.mkdirSync(tilesDir, { recursive: true });
            console.log(`📁 디렉토리 생성: ${tilesDir}\n`);
        }
        
        let totalSize = 0;
        let savedCount = 0;
        const indexData = [];
        
        // 타일 파일 저장
        for (const tile of tiles) {
            const filename = `tile_${tile.tile_lat}_${tile.tile_lng}.json`;
            const filepath = path.join(tilesDir, filename);
            
            // 필요한 데이터만 저장 (MongoDB _id 제외)
            const exportData = {
                tile_lat: tile.tile_lat,
                tile_lng: tile.tile_lng,
                bounds: tile.bounds,
                data: tile.data,
                feature_count: tile.feature_count
            };
            
            const json = JSON.stringify(exportData);
            fs.writeFileSync(filepath, json, 'utf8');
            
            const fileSize = Buffer.byteLength(json, 'utf8');
            totalSize += fileSize;
            savedCount++;
            
            // 인덱스 데이터에 추가
            indexData.push({
                lat: tile.tile_lat,
                lng: tile.tile_lng,
                bounds: tile.bounds,
                filename: filename,
                feature_count: tile.feature_count
            });
            
            if (savedCount % 10 === 0) {
                console.log(`  💾 ${savedCount}/${tilesCount} 파일 저장됨...`);
            }
        }
        
        console.log(`\n✅ Export 완료!`);
        console.log(`📊 총 파일 수: ${savedCount}개`);
        console.log(`💾 총 크기: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`📏 평균 파일 크기: ${(totalSize / savedCount / 1024).toFixed(2)} KB`);
        console.log(`\n📁 저장 위치: ${tilesDir}`);
        
        // 인덱스 파일 생성
        const indexPath = path.join(tilesDir, 'index.json');
        fs.writeFileSync(indexPath, JSON.stringify(indexData, null, 2), 'utf8');
        console.log(`📋 인덱스 파일 생성: index.json`);
        
    } catch (error) {
        console.error('❌ 오류:', error);
    } finally {
        await client.close();
    }
}

exportTilesToFiles();
