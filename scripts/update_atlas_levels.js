/**
 * update_atlas_levels.js
 * Atlas DB의 복원된 영토에 level 필드 부여
 */
const { MongoClient } = require('mongodb');

const ATLAS_URI = 'mongodb+srv://projeffmanager_db_user:Bv3Lres9O0L3Nrrz@realhistory.6vfgerd.mongodb.net/';

async function main() {
    const client = new MongoClient(ATLAS_URI);
    await client.connect();
    const db = client.db('realhistory');
    
    const noLevel = await db.collection('territories').find({ level: { $exists: false } }).toArray();
    console.log('Atlas level 없는 영토:', noLevel.length);
    
    for (const t of noLevel) {
        let level = 'city';
        let bbox = t.bbox;
        let area = t.area;
        
        if (!bbox && t.geometry) {
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
            processCoords(t.geometry.coordinates);
            bbox = [minLng, minLat, maxLng, maxLat];
            area = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1]);
        }
        
        if (bbox) {
            if (!area) area = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1]);
            if (area >= 100) level = 'country';
            else if (area >= 5) level = 'province';
        }
        
        await db.collection('territories').updateOne(
            { _id: t._id },
            { $set: { level, bbox: bbox || [], area: area || 0 } }
        );
        console.log(`  ${t.name} → ${level}`);
    }
    
    const finalCount = await db.collection('territories').countDocuments();
    const levels = await db.collection('territories').aggregate([
        { $group: { _id: '$level', count: { $sum: 1 } } }
    ]).toArray();
    console.log('\nAtlas 총:', finalCount);
    console.log('레벨 분포:', levels);
    
    await client.close();
}

main().catch(console.error);
