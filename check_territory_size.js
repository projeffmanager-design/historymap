const { MongoClient } = require('mongodb');

async function check() {
    const client = new MongoClient('mongodb://localhost:27017');
    await client.connect();
    const db = client.db('realhistory');
    
    const sample = await db.collection('territories').findOne({});
    if (!sample) { console.log('No territories found'); await client.close(); return; }
    console.log('Sample keys:', Object.keys(sample));
    console.log('Has geometry:', !!sample.geometry);
    console.log('geometry.type:', sample.geometry ? sample.geometry.type : 'N/A');
    
    const count = await db.collection('territories').countDocuments({});
    console.log('Total count:', count);
    
    const territories = await db.collection('territories').find({}).toArray();
    
    let totalCoords = 0;
    let maxCoords = 0;
    let maxName = '';
    
    territories.forEach(t => {
        let coords = 0;
        const g = t.geometry || t;
        if (g && g.type === 'Polygon' && g.coordinates) {
            g.coordinates.forEach(ring => { if (Array.isArray(ring)) coords += ring.length; });
        } else if (g && g.type === 'MultiPolygon' && g.coordinates) {
            g.coordinates.forEach(poly => {
                if (Array.isArray(poly)) poly.forEach(ring => { if (Array.isArray(ring)) coords += ring.length; });
            });
        }
        totalCoords += coords;
        if (coords > maxCoords) { maxCoords = coords; maxName = t.name; }
    });
    
    console.log('\nTotal territories:', territories.length);
    console.log('Total coordinate points:', totalCoords);
    console.log('Avg coords per territory:', Math.round(totalCoords / territories.length));
    console.log('Max coords:', maxCoords, '->', maxName);
    
    // Size estimate
    const json = JSON.stringify(territories);
    console.log('JSON size (MB):', (json.length / 1024 / 1024).toFixed(2));
    
    // Top 15 heaviest
    const sorted = territories.map(t => {
        let coords = 0;
        const g = t.geometry || t;
        if (g && g.type === 'Polygon' && g.coordinates) {
            g.coordinates.forEach(ring => { if (Array.isArray(ring)) coords += ring.length; });
        } else if (g && g.type === 'MultiPolygon' && g.coordinates) {
            g.coordinates.forEach(poly => {
                if (Array.isArray(poly)) poly.forEach(ring => { if (Array.isArray(ring)) coords += ring.length; });
            });
        }
        return { name: t.name, coords };
    }).sort((a, b) => b.coords - a.coords).slice(0, 15);
    
    console.log('\nTop 15 heaviest territories:');
    sorted.forEach(s => console.log('  ', s.name, '->', s.coords, 'points'));
    
    // Castles size
    const castles = await db.collection('castles').find({}).toArray();
    const castlesJson = JSON.stringify(castles);
    console.log('\nCastles count:', castles.length);
    console.log('Castles JSON size (MB):', (castlesJson.length / 1024 / 1024).toFixed(2));
    
    await client.close();
}

check().catch(console.error);
