require('dotenv').config();
const { MongoClient } = require('mongodb');

(async () => {
    const client = new MongoClient(process.env.MONGO_URI);
    await client.connect();
    const db = client.db('realhistory');
    
    const tile = await db.collection('territory_tiles').findOne({});
    
    console.log('Tile structure:');
    console.log('- tile_lat:', tile.tile_lat);
    console.log('- tile_lng:', tile.tile_lng);
    console.log('- bounds:', tile.bounds);
    console.log('- feature_count:', tile.feature_count);
    console.log('- size_bytes:', tile.size_bytes, '(', Math.round(tile.size_bytes/1024), 'KB)');
    console.log('- has data:', !!tile.data);
    console.log('- data type:', tile.data ? tile.data.type : 'N/A');
    console.log('- features count:', tile.data && tile.data.features ? tile.data.features.length : 0);
    
    if (tile.data && tile.data.features && tile.data.features[0]) {
        const f = tile.data.features[0];
        console.log('\nFirst feature:');
        console.log('- type:', f.type);
        console.log('- properties:', f.properties);
        console.log('- geometry type:', f.geometry ? f.geometry.type : 'N/A');
        console.log('- has coordinates:', !!(f.geometry && f.geometry.coordinates));
    }
    
    await client.close();
})();
