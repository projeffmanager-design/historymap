/**
 * fix_missing_bbox.js - bbox가 없는 영토에 bbox 재계산
 */
const { MongoClient } = require('mongodb');

const LOCAL_URI = 'mongodb://localhost:27017';
const ATLAS_URI = 'mongodb+srv://projeffmanager_db_user:Bv3Lres9O0L3Nrrz@realhistory.6vfgerd.mongodb.net/';

function calcBbox(geometry) {
    let minLng = 180, maxLng = -180, minLat = 90, maxLat = -90;
    function processCoords(coords) {
        if (typeof coords[0] === 'number') {
            minLng = Math.min(minLng, coords[0]);
            maxLng = Math.max(maxLng, coords[0]);
            minLat = Math.min(minLat, coords[1]);
            maxLat = Math.max(maxLat, coords[1]);
        } else {
            coords.forEach(c => processCoords(c));
        }
    }
    processCoords(geometry.coordinates);
    return {
        minLat, maxLat, minLng, maxLng
    };
}

async function fixDb(uri, dbName) {
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db(dbName);
    
    // bbox가 없거나 undefined인 영토 찾기
    const allT = await db.collection('territories').find({}).toArray();
    let fixed = 0;
    
    for (const t of allT) {
        const hasBbox = t.bbox && typeof t.bbox.minLat === 'number' && !isNaN(t.bbox.minLat);
        
        if (!hasBbox && t.geometry && t.geometry.coordinates) {
            const bbox = calcBbox(t.geometry);
            const area = (bbox.maxLng - bbox.minLng) * (bbox.maxLat - bbox.minLat);
            let level = 'city';
            if (area >= 100) level = 'country';
            else if (area >= 5) level = 'province';
            
            await db.collection('territories').updateOne(
                { _id: t._id },
                { $set: { bbox, area, level } }
            );
            console.log(`  ✅ ${t.name}: bbox=[${bbox.minLat.toFixed(2)},${bbox.minLng.toFixed(2)} ~ ${bbox.maxLat.toFixed(2)},${bbox.maxLng.toFixed(2)}] area=${area.toFixed(1)} level=${level}`);
            fixed++;
        }
    }
    
    console.log(`${dbName}: ${fixed}개 수정됨\n`);
    await client.close();
    return fixed;
}

async function main() {
    console.log('=== 로컬 DB ===');
    await fixDb(LOCAL_URI, 'koreahistory');
    
    console.log('=== Atlas DB ===');
    await fixDb(ATLAS_URI, 'realhistory');
}

main().catch(console.error);
