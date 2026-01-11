require('dotenv').config();
const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'realhistory';

async function checkPerformance() {
    const client = new MongoClient(uri);
    
    try {
        await client.connect();
        console.log('✅ MongoDB 연결 성공');
        
        const db = client.db(dbName);
        const collection = db.collection('territories');
        
        // 1. 인덱스 확인
        console.log('\n📋 현재 인덱스:');
        const indexes = await collection.indexes();
        indexes.forEach(idx => {
            console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
        });
        
        // 2. 문서 개수 및 크기
        const stats = await db.command({ collStats: 'territories' });
        console.log('\n📊 컬렉션 통계:');
        console.log(`  - 문서 개수: ${stats.count}`);
        console.log(`  - 총 크기: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
        console.log(`  - 평균 문서 크기: ${(stats.avgObjSize / 1024).toFixed(2)} KB`);
        
        // 3. 쿼리 성능 테스트
        console.log('\n⏱️ 쿼리 성능 테스트:');
        
        const start1 = Date.now();
        const territories = await collection.find({}).toArray();
        const elapsed1 = Date.now() - start1;
        console.log(`  - find({}).toArray(): ${elapsed1}ms (${territories.length}개)`);
        
        // 4. 샘플 문서 크기
        if (territories.length > 0) {
            const sampleDoc = territories[0];
            const docSize = JSON.stringify(sampleDoc).length;
            console.log(`\n📄 샘플 문서 크기: ${(docSize / 1024).toFixed(2)} KB`);
            console.log(`  - 필드: ${Object.keys(sampleDoc).join(', ')}`);
        }
        
    } catch (error) {
        console.error('❌ 오류:', error);
    } finally {
        await client.close();
    }
}

checkPerformance();
