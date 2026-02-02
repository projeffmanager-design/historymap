// 영토 데이터를 직접 정적 타일 파일로 export (MongoDB 타일 컬렉션 거치지 않음)
require('dotenv').config();
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

async function exportTerritoriesToTiles() {
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
        const territoriesCollection = db.collection('territories');
        
        // 🔍 모든 영토 조회
        console.log('📥 영토 데이터 로딩 중... (약 10분 소요)');
        const startTime = Date.now();
        const allTerritories = await territoriesCollection.find({}).toArray();
        const loadTime = ((Date.now() - startTime) / 1000).toFixed(1);
        
        console.log(`📍 전체 영토: ${allTerritories.length}개 (${loadTime}초)\n`);
        
        if (allTerritories.length === 0) {
            console.log('⚠️ 영토가 없습니다.');
            return;
        }
        
        // 타일 크기 설정 (10도 x 10도)
        const TILE_SIZE = 10;
        const tiles = new Map(); // key: "lat_lng", value: tile data
        
        // 각 영토를 타일로 분할
        let processedCount = 0;
        for (const territory of allTerritories) {
            processedCount++;
            if (processedCount % 50 === 0) {
                console.log(`🗺️  처리 중: ${processedCount}/${allTerritories.length}...`);
            }
            
            // geometry 추출
            let geometry;
            if (territory.geometry) {
                geometry = territory.geometry;
            } else if (territory.type && territory.coordinates) {
                geometry = { type: territory.type, coordinates: territory.coordinates };
            } else {
                console.log(`  ⚠️ ${territory.name || 'unknown'} - geometry 없음, 건너뜀`);
                continue;
            }
            
            // Bounding box 계산 (이미 있으면 사용)
            let minLat, maxLat, minLng, maxLng;
            
            if (territory.bbox) {
                minLat = territory.bbox.minLat;
                maxLat = territory.bbox.maxLat;
                minLng = territory.bbox.minLng;
                maxLng = territory.bbox.maxLng;
            } else {
                minLat = 90; maxLat = -90; minLng = 180; maxLng = -180;
                
                const processCoordinates = (coords) => {
                    if (!Array.isArray(coords)) return;
                    
                    coords.forEach(coord => {
                        if (!coord) return;
                        
                        if (Array.isArray(coord[0])) {
                            processCoordinates(coord);
                        } else if (typeof coord[0] === 'number' && typeof coord[1] === 'number') {
                            const [lng, lat] = coord;
                            if (lat < minLat) minLat = lat;
                            if (lat > maxLat) maxLat = lat;
                            if (lng < minLng) minLng = lng;
                            if (lng > maxLng) maxLng = lng;
                        }
                    });
                };
                
                processCoordinates(geometry.coordinates);
            }
            
            // 영토가 걸치는 타일 범위 계산
            const startLat = Math.floor(minLat / TILE_SIZE) * TILE_SIZE;
            const endLat = Math.ceil(maxLat / TILE_SIZE) * TILE_SIZE;
            const startLng = Math.floor(minLng / TILE_SIZE) * TILE_SIZE;
            const endLng = Math.ceil(maxLng / TILE_SIZE) * TILE_SIZE;
            
            // 각 타일에 영토 데이터 추가
            for (let lat = startLat; lat < endLat; lat += TILE_SIZE) {
                for (let lng = startLng; lng < endLng; lng += TILE_SIZE) {
                    const tileKey = `${lat}_${lng}`;
                    
                    if (!tiles.has(tileKey)) {
                        tiles.set(tileKey, {
                            tile_lat: lat,
                            tile_lng: lng,
                            bounds: {
                                north: lat + TILE_SIZE,
                                south: lat,
                                west: lng,
                                east: lng + TILE_SIZE
                            },
                            data: [],
                            feature_count: 0
                        });
                    }
                    
                    const tile = tiles.get(tileKey);
                    
                    // 영토 데이터를 GeoJSON Feature 형식으로 추가
                    tile.data.push({
                        type: 'Feature',
                        geometry: geometry,
                        properties: {
                            _id: territory._id.toString(),
                            name: territory.name,
                            name_ko: territory.name_ko,
                            name_type: territory.name_type,
                            type: territory.type,
                            level: territory.level,
                            start: territory.start,
                            end: territory.end
                        }
                    });
                    
                    tile.feature_count++;
                }
            }
        }
        
        console.log(`\n📦 생성된 타일: ${tiles.size}개\n`);
        
        // public/tiles 디렉토리 생성
        const tilesDir = path.join(__dirname, '..', 'public', 'tiles');
        if (!fs.existsSync(tilesDir)) {
            fs.mkdirSync(tilesDir, { recursive: true });
            console.log(`📁 디렉토리 생성: ${tilesDir}\n`);
        }
        
        // 기존 파일 삭제 (옵션)
        const existingFiles = fs.readdirSync(tilesDir).filter(f => f.endsWith('.json'));
        if (existingFiles.length > 0) {
            console.log(`🗑️  기존 파일 ${existingFiles.length}개 삭제 중...`);
            for (const file of existingFiles) {
                fs.unlinkSync(path.join(tilesDir, file));
            }
        }
        
        // 타일 파일 저장
        let totalSize = 0;
        let savedCount = 0;
        const indexData = [];
        
        for (const [tileKey, tileData] of tiles.entries()) {
            const filename = `tile_${tileData.tile_lat}_${tileData.tile_lng}.json`;
            const filepath = path.join(tilesDir, filename);
            
            // FeatureCollection 형식으로 저장
            const exportData = {
                type: 'FeatureCollection',
                tile_lat: tileData.tile_lat,
                tile_lng: tileData.tile_lng,
                bounds: tileData.bounds,
                features: tileData.data,
                feature_count: tileData.feature_count
            };
            
            const json = JSON.stringify(exportData);
            fs.writeFileSync(filepath, json, 'utf8');
            
            const fileSize = Buffer.byteLength(json, 'utf8');
            totalSize += fileSize;
            
            // 인덱스 데이터 추가
            indexData.push({
                lat: tileData.tile_lat,
                lng: tileData.tile_lng,
                bounds: tileData.bounds,
                filename: filename,
                feature_count: tileData.feature_count
            });
            
            savedCount++;
            if (savedCount % 50 === 0) {
                console.log(`💾 저장 중: ${savedCount}/${tiles.size}...`);
            }
        }
        
        // 인덱스 파일 저장
        const indexPath = path.join(tilesDir, 'index.json');
        fs.writeFileSync(indexPath, JSON.stringify(indexData, null, 2), 'utf8');
        
        console.log(`\n✅ Export 완료!`);
        console.log(`  📁 디렉토리: ${tilesDir}`);
        console.log(`  📦 타일 파일: ${savedCount}개`);
        console.log(`  📊 총 크기: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`  📋 인덱스: index.json`);
        
    } catch (error) {
        console.error('❌ 오류:', error);
    } finally {
        await client.close();
        console.log('\n✅ MongoDB 연결 종료');
    }
}

exportTerritoriesToTiles();
