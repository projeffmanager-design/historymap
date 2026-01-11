require('dotenv').config();
const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);

// 타일 크기 설정 (최적화 - 10도)
const TILE_SIZE = 10; // 10x10도 타일

// 전 세계 영역을 커버하는 경계
const MIN_LAT = -90;
const MAX_LAT = 90;
const MIN_LNG = -180;
const MAX_LNG = 180;

// 좌표 배열에서 bbox 계산
function calculateBBox(coordinates) {
  let minLng = Infinity, minLat = Infinity;
  let maxLng = -Infinity, maxLat = -Infinity;
  
  function processCoords(coords) {
    if (Array.isArray(coords[0])) {
      coords.forEach(c => processCoords(c));
    } else {
      const [lng, lat] = coords;
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }
  }
  
  processCoords(coordinates);
  return { minLng, minLat, maxLng, maxLat };
}

// 바운딩 박스가 타일과 겹치는지 확인
function bboxOverlapsTile(bbox, tileBounds) {
  // bbox가 객체 형태인 경우 처리
  const west = bbox.minLng || bbox[0];
  const south = bbox.minLat || bbox[1];
  const east = bbox.maxLng || bbox[2];
  const north = bbox.maxLat || bbox[3];
  
  const { minLng, minLat, maxLng, maxLat } = tileBounds;
  
  return !(
    east < minLng ||
    west > maxLng ||
    north < minLat ||
    south > maxLat
  );
}

// 특정 영토가 속하는 타일들을 찾기
function findOverlappingTiles(bbox) {
  // bbox가 객체 형태인 경우 처리
  const west = bbox.minLng || bbox[0];
  const south = bbox.minLat || bbox[1];
  const east = bbox.maxLng || bbox[2];
  const north = bbox.maxLat || bbox[3];
  
  const tiles = [];
  
  for (let lat = MIN_LAT; lat < MAX_LAT; lat += TILE_SIZE) {
    for (let lng = MIN_LNG; lng < MAX_LNG; lng += TILE_SIZE) {
      const tileBounds = {
        minLat: lat,
        maxLat: Math.min(lat + TILE_SIZE, MAX_LAT),
        minLng: lng,
        maxLng: Math.min(lng + TILE_SIZE, MAX_LNG)
      };
      
      if (bboxOverlapsTile(bbox, tileBounds)) {
        tiles.push({
          lat,
          lng,
          bounds: tileBounds
        });
      }
    }
  }
  
  return tiles;
}

async function simpleTileTerritoriesData() {
  try {
    await client.connect();
    console.log('✅ MongoDB 연결 성공');
    
    const db = client.db('realhistory');
    const territoriesCollection = db.collection('territories');
    const tilesCollection = db.collection('territory_tiles');
    
    // 기존 타일 컬렉션 초기화
    await tilesCollection.deleteMany({});
    console.log('🗑️ 기존 territory_tiles 컬렉션 초기화');
    
    // 모든 영토 데이터 가져오기
    const territories = await territoriesCollection.find({}).toArray();
    console.log(`📊 총 ${territories.length}개의 영토 데이터 로드`);
    
    if (territories.length === 0) {
      console.log('⚠️ territories 컬렉션에 데이터가 없습니다.');
      return;
    }
    
    // 타일별로 영토 그룹화
    const tileMap = new Map();
    
    for (const territory of territories) {
      // bbox가 없으면 계산
      if (!territory.bbox) {
        const geometry = territory.geometry || {
          type: territory.type,
          coordinates: territory.coordinates
        };
        territory.bbox = calculateBBox(geometry.coordinates);
      }
      
      if (!territory.bbox || (!territory.geometry && !territory.coordinates)) {
        continue;
      }
      
      // geometry 또는 coordinates 사용
      const geometry = territory.geometry || {
        type: territory.type,
        coordinates: territory.coordinates
      };
      
      const overlappingTiles = findOverlappingTiles(territory.bbox);
      
      for (const tile of overlappingTiles) {
        const tileKey = `${tile.lat},${tile.lng}`;
        
        if (!tileMap.has(tileKey)) {
          tileMap.set(tileKey, {
            tile_lat: tile.lat,
            tile_lng: tile.lng,
            bounds: tile.bounds,
            features: []
          });
        }
        
        // GeoJSON Feature 형식으로 저장
        tileMap.get(tileKey).features.push({
          type: 'Feature',
          properties: {
            name: territory.name,
            country_id: territory.country_id,
            start_year: territory.start_year,
            end_year: territory.end_year
          },
          geometry: geometry
        });
      }
    }
    
    console.log(`🗺️ 총 ${tileMap.size}개의 타일 생성`);
    
    // MongoDB에 타일 저장
    const tiles = Array.from(tileMap.values()).map(tile => {
      const featureCollection = {
        type: 'FeatureCollection',
        features: tile.features
      };
      
      const originalSize = JSON.stringify(featureCollection).length;
      
      return {
        tile_lat: tile.tile_lat,
        tile_lng: tile.tile_lng,
        bounds: tile.bounds,
        data: featureCollection,
        feature_count: tile.features.length,
        size_bytes: originalSize,
        created_at: new Date()
      };
    });
    
    // 배치로 나눠서 저장 (메모리 효율)
    const BATCH_SIZE = 50;
    let insertedCount = 0;
    
    for (let i = 0; i < tiles.length; i += BATCH_SIZE) {
      const batch = tiles.slice(i, i + BATCH_SIZE);
      await tilesCollection.insertMany(batch);
      insertedCount += batch.length;
      console.log(`💾 진행: ${insertedCount}/${tiles.length} 타일 저장됨`);
    }
    
    // 인덱스 생성
    await tilesCollection.createIndex({ tile_lat: 1, tile_lng: 1 });
    await tilesCollection.createIndex({ 
      'bounds.minLat': 1, 
      'bounds.maxLat': 1, 
      'bounds.minLng': 1, 
      'bounds.maxLng': 1 
    });
    
    // 통계 계산
    const totalSize = tiles.reduce((sum, tile) => sum + tile.size_bytes, 0);
    const avgSize = totalSize / tiles.length;
    
    console.log('\n✅ 타일 생성 완료!');
    console.log(`📊 총 타일 수: ${tiles.length}개`);
    console.log(`📏 타일 크기: ${TILE_SIZE}° x ${TILE_SIZE}°`);
    console.log(`💾 총 데이터 크기: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`📊 평균 타일 크기: ${(avgSize / 1024).toFixed(2)} KB`);
    console.log(`🎯 타일당 평균 feature 수: ${(tiles.reduce((sum, t) => sum + t.feature_count, 0) / tiles.length).toFixed(1)}개`);
    
  } catch (error) {
    console.error('❌ 오류 발생:', error);
  } finally {
    await client.close();
    console.log('🔌 MongoDB 연결 종료');
  }
}

simpleTileTerritoriesData();
