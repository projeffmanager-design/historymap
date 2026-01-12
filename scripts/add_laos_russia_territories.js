// scripts/add_laos_russia_territories.js
// 라오스, 치타, 울란우데 영토 추가 스크립트

require('dotenv').config();
const { MongoClient } = require('mongodb');
const https = require('https');

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);

// Nominatim API로 GeoJSON 가져오기 (더 빠름)
function fetchGeoJSON(osmType, osmId) {
    return new Promise((resolve, reject) => {
        const url = `https://nominatim.openstreetmap.org/lookup?osm_ids=${osmType}${osmId}&format=geojson&polygon_geojson=1`;
        
        https.get(url, {
            headers: {
                'User-Agent': 'HistoryMap/1.0'
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

// 바운딩 박스 계산
function calculateBoundingBox(geometry) {
    if (!geometry || !geometry.coordinates) return null;
    
    let minLat = Infinity, maxLat = -Infinity;
    let minLng = Infinity, maxLng = -Infinity;
    
    const coords = geometry.coordinates;
    const rings = geometry.type === 'MultiPolygon' ? coords.flat() : coords;
    
    rings.forEach(ring => {
        ring.forEach(([lng, lat]) => {
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
        });
    });
    
    return { minLat, maxLat, minLng, maxLng };
}

async function addTerritories() {
    try {
        await client.connect();
        console.log('✅ MongoDB 연결 성공\n');
        
        const db = client.db('realhistory');
        const territories = db.collection('territories');
        
        // 추가할 영토 목록 (OSM Relation ID 사용)
        const territoriesToAdd = [
            {
                name: 'Laos',
                name_en: 'Laos',
                name_ko: '라오스',
                code: 'LA',
                admin_level: 2,
                type: 'country',
                country: 'Laos',
                osmType: 'R',
                osmId: 49903  // Laos OSM Relation ID
            },
            {
                name: 'Zabaykalsky Krai',
                name_en: 'Zabaykalsky Krai',
                name_ko: '자바이칼스키 변경주 (치타)',
                code: 'ZAB',
                admin_level: 4,
                type: 'admin_area',
                country: 'Russia',
                osmType: 'R',
                osmId: 145730  // Zabaykalsky Krai OSM Relation ID
            },
            {
                name: 'Buryatia',
                name_en: 'Republic of Buryatia',
                name_ko: '부랴티야 공화국 (울란우데)',
                code: 'BU',
                admin_level: 4,
                type: 'admin_area',
                country: 'Russia',
                osmType: 'R',
                osmId: 145729  // Buryatia OSM Relation ID
            }
        ];
        
        console.log(`📋 추가할 영토: ${territoriesToAdd.length}개\n`);
        
        for (const territoryInfo of territoriesToAdd) {
            console.log(`🌍 처리 중: ${territoryInfo.name} (${territoryInfo.name_ko})`);
            
            // 이미 존재하는지 확인
            const existing = await territories.findOne({ name: territoryInfo.name });
            if (existing) {
                console.log(`  ⏭️  이미 존재함, 스킵\n`);
                continue;
            }
            
            try {
                // Nominatim API로 GeoJSON 가져오기
                console.log(`  📡 Nominatim API 호출 중... (${territoryInfo.osmType}${territoryInfo.osmId})`);
                
                const geoJsonData = await fetchGeoJSON(territoryInfo.osmType, territoryInfo.osmId);
                
                // 1초 대기 (API rate limit)
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                if (!geoJsonData.features || geoJsonData.features.length === 0) {
                    console.log(`  ❌ 데이터를 찾을 수 없음\n`);
                    continue;
                }
                
                // GeoJSON Feature에서 geometry 추출
                const feature = geoJsonData.features[0];
                const geometry = feature.geometry;
                
                if (!geometry || !geometry.coordinates) {
                    console.log(`  ❌ 유효한 geometry를 찾을 수 없음\n`);
                    continue;
                }
                
                console.log(`  ✅ GeoJSON 로드 완료 (Type: ${geometry.type})`);
                
                // Bounding box 계산
                const bbox = calculateBoundingBox(geometry);
                
                // MongoDB 문서 생성
                const territory = {
                    name: territoryInfo.name,
                    name_en: territoryInfo.name_en,
                    name_ko: territoryInfo.name_ko,
                    code: territoryInfo.code,
                    admin_level: territoryInfo.admin_level,
                    type: territoryInfo.type,
                    country: territoryInfo.country,
                    geometry: geometry,
                    bbox: bbox,
                    properties: {
                        source: 'OpenStreetMap',
                        osm_type: territoryInfo.osmType,
                        osm_id: territoryInfo.osmId,
                        import_date: new Date().toISOString()
                    }
                };
                
                // DB에 삽입
                const result = await territories.insertOne(territory);
                console.log(`  ✅ 추가 완료! ID: ${result.insertedId}`);
                console.log(`  � BBox: [${bbox.minLat.toFixed(2)}, ${bbox.minLng.toFixed(2)}] → [${bbox.maxLat.toFixed(2)}, ${bbox.maxLng.toFixed(2)}]\n`);
                
            } catch (error) {
                console.error(`  ❌ 오류: ${error.message}\n`);
            }
        }
        
        // 최종 확인
        const finalCount = await territories.countDocuments();
        console.log(`\n🎉 완료! 전체 영토: ${finalCount}개`);
        
    } catch (error) {
        console.error('❌ 스크립트 실행 중 오류:', error);
    } finally {
        await client.close();
        console.log('MongoDB 연결 종료');
    }
}

addTerritories();
