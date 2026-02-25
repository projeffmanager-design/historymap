/**
 * check_empty_territories.js - geometry가 비어있는 영토 확인
 */
const { MongoClient } = require('mongodb');

async function main() {
    const client = new MongoClient('mongodb://localhost:27017');
    await client.connect();
    const db = client.db('koreahistory');
    
    const allT = await db.collection('territories').find({}).toArray();
    
    console.log('=== geometry가 비어있거나 비정상인 영토 ===');
    for (const t of allT) {
        let issue = null;
        
        if (!t.geometry) {
            issue = 'geometry 없음';
        } else if (!t.geometry.coordinates) {
            issue = 'coordinates 없음';
        } else if (t.geometry.coordinates.length === 0) {
            issue = 'coordinates 비어있음';
        } else if (t.bbox && t.bbox.minLat === 0 && t.bbox.maxLat === 0) {
            issue = 'bbox가 [0,0~0,0]';
        }
        
        if (issue) {
            console.log(`  ⚠️ ${t.name}: ${issue} | level: ${t.level}`);
        }
    }
    
    // bbox 면적 확인 (비정상)
    console.log('\n=== bbox 면적이 비정상(0 이하)인 영토 ===');
    for (const t of allT) {
        if (t.bbox) {
            const area = (t.bbox.maxLng - t.bbox.minLng) * (t.bbox.maxLat - t.bbox.minLat);
            if (area <= 0) {
                console.log(`  ⚠️ ${t.name}: area=${area.toFixed(4)} | level: ${t.level}`);
            }
        }
    }
    
    await client.close();
}

main().catch(console.error);
