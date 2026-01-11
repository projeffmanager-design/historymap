// 🚀 특정 타일만 선택적으로 export (전체 재생성 없이)
require('dotenv').config();
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

async function exportSpecificTiles(tileKeys) {
    const MONGODB_URI = process.env.MONGO_URI;
    if (!MONGODB_URI) {
        console.error('❌ MONGO_URI 환경 변수가 설정되지 않았습니다.');
        return;
    }

    const client = new MongoClient(MONGODB_URI);

    try {
        await client.connect();
        console.log('✅ MongoDB 연결 성공\n');

        const db = client.db('realhistory');
        const tilesCollection = db.collection('territory_tiles');

        // 타일 조회
        let query = {};
        if (tileKeys && tileKeys.length > 0) {
            query = { tile_key: { $in: tileKeys } };
            console.log(`📦 지정된 타일만 export: ${tileKeys.length}개`);
        } else {
            console.log(`📦 전체 타일 export`);
        }

        const tiles = await tilesCollection.find(query).toArray();

        if (tiles.length === 0) {
            console.error('❌ export할 타일이 없습니다.');
            return;
        }

        console.log(`📊 export할 타일: ${tiles.length}개\n`);

        const outputDir = path.join(__dirname, '../public/tiles');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        let totalSize = 0;
        let exportedCount = 0;

        for (const tile of tiles) {
            const filename = `${tile.tile_key}.json`;
            const filepath = path.join(outputDir, filename);

            // GeoJSON FeatureCollection 형식으로 변환
            const features = tile.data.map(territory => ({
                type: 'Feature',
                geometry: territory.geometry,
                properties: {
                    _id: territory._id,
                    name: territory.name,
                    name_ko: territory.name_ko,
                    name_type: territory.name_type,
                    level: territory.level,
                    type: territory.type,
                    start: territory.start || territory.start_year,
                    end: territory.end || territory.end_year,
                    start_year: territory.start || territory.start_year,
                    end_year: territory.end || territory.end_year
                }
            }));

            const exportData = {
                tile_key: tile.tile_key,
                bounds: tile.bounds,
                data: {
                    type: 'FeatureCollection',
                    features: features
                }
            };

            const jsonContent = JSON.stringify(exportData);
            fs.writeFileSync(filepath, jsonContent, 'utf-8');

            totalSize += Buffer.byteLength(jsonContent);
            exportedCount++;

            if (exportedCount % 10 === 0) {
                console.log(`  ✅ ${exportedCount}/${tiles.length} 파일 저장됨`);
            }
        }

        console.log(`\n✅ Export 완료!`);
        console.log(`📊 총 파일 수: ${exportedCount}개`);
        console.log(`💾 총 크기: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`📏 평균 파일 크기: ${(totalSize / exportedCount / 1024).toFixed(2)} KB`);

        // index.json 업데이트 (전체 타일 목록)
        console.log('\n📋 index.json 업데이트 중...');
        const allTiles = await tilesCollection.find({}).toArray();
        const index = allTiles.map(tile => ({
            filename: `${tile.tile_key}.json`,
            bounds: tile.bounds,
            territory_count: tile.data ? tile.data.length : 0
        }));

        const indexPath = path.join(outputDir, 'index.json');
        fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
        console.log('✅ index.json 업데이트 완료');

        console.log(`\n📁 저장 위치: ${outputDir}`);

    } catch (error) {
        console.error('❌ 오류:', error);
    } finally {
        await client.close();
        console.log('✅ MongoDB 연결 종료');
    }
}

// 사용 예시
const tileKeysToExport = process.argv.slice(2);

if (tileKeysToExport.length === 0) {
    console.log('💡 사용법:');
    console.log('  전체 export: node scripts/export_specific_tiles.js');
    console.log('  특정 타일: node scripts/export_specific_tiles.js tile_30_120 tile_40_130');
    console.log('\n📦 전체 export를 실행합니다...\n');
}

exportSpecificTiles(tileKeysToExport.length > 0 ? tileKeysToExport : null);
