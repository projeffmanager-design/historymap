// 145729 Buryatia 영토 직접 추가 스크립트
const { MongoClient } = require('mongodb');
require('dotenv').config({ path: require('path').join(__dirname, '..', 'env') });

async function main() {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    const client = await MongoClient.connect(uri);
    const db = client.db('realhistory');
    const col = db.collection('territories');

    // 1. 기존 r145729 레코드 삭제
    const delResult = await col.deleteMany({ osm_id: { $in: ['145729', 'r145729'] } });
    console.log(`🗑️  기존 r145729 삭제: ${delResult.deletedCount}개`);

    // 2. Nominatim에서 GeoJSON 가져오기
    console.log('📡 Nominatim에서 GeoJSON 가져오는 중...');
    const resp = await fetch('https://nominatim.openstreetmap.org/lookup?osm_ids=R145729&format=geojson&polygon_geojson=1', {
        headers: { 'User-Agent': 'KoreaHistoryMap/1.0' }
    });
    const data = await resp.json();
    const feature = data.features[0];
    const geometry = feature.geometry;

    if (!geometry || !geometry.coordinates || geometry.coordinates.length === 0) {
        console.error('❌ GeoJSON coordinates가 비어있습니다!');
        await client.close();
        return;
    }

    console.log(`✓ Geometry: ${geometry.type}, ${geometry.coordinates[0].length} points`);

    // 3. bbox 계산
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    const processCoords = (coords) => {
        if (typeof coords[0] === 'number') {
            const [lng, lat] = coords;
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
        } else {
            coords.forEach(processCoords);
        }
    };
    processCoords(geometry.coordinates);
    const bbox = { minLat, maxLat, minLng, maxLng };

    console.log(`✓ BBox: lat ${minLat.toFixed(2)}~${maxLat.toFixed(2)}, lng ${minLng.toFixed(2)}~${maxLng.toFixed(2)}`);

    // 4. DB에 저장
    const territory = {
        name: 'Buryatia',
        name_en: 'Buryatia',
        name_ko: 'Республика Бурятия',
        code: '145729',
        type: 'admin_area',
        admin_level: 4,
        country: 'Russia',
        geometry,
        bbox,
        start_year: -3000,
        end_year: 3000,
        start: -3000,
        end: 3000,
        osm_id: 'r145729',
        properties: {
            source: 'OSM Import',
            import_date: new Date().toISOString()
        }
    };

    const result = await col.insertOne(territory);
    console.log(`✅ Buryatia 저장 완료! ID: ${result.insertedId}`);

    // 검증
    const saved = await col.findOne({ _id: result.insertedId }, { projection: { name: 1, 'geometry.type': 1, osm_id: 1, bbox: 1 } });
    console.log('📋 검증:', JSON.stringify(saved, null, 2));

    await client.close();
}

main().catch(console.error);
