const { connectToDatabase } = require('../db');

async function checkQuery() {
    try {
        const { db, collections } = await connectToDatabase();
        const territories = collections.territories;
        
        // 샘플 데이터 확인
        console.log('📋 샘플 영토 데이터:');
        const sample = await territories.findOne({});
        console.log('  - name:', sample.name);
        console.log('  - bbox:', sample.bbox);
        console.log('  - start:', sample.start, 'start_year:', sample.start_year);
        console.log('  - end:', sample.end, 'end_year:', sample.end_year);
        
        // bbox 통계
        const total = await territories.countDocuments({});
        const withBbox = await territories.countDocuments({ bbox: { $exists: true } });
        console.log('\n📊 bbox 통계:');
        console.log(`  - 전체: ${total}개, bbox 있음: ${withBbox}개, 없음: ${total - withBbox}개`);
        
        // 쿼리 성능 테스트
        console.log('\n⏱️  쿼리 성능 테스트:');
        const start = Date.now();
        const results = await territories.find({
            'bbox.minLat': { $lte: 50 },
            'bbox.maxLat': { $gte: 30 },
            'bbox.minLng': { $lte: 140 },
            'bbox.maxLng': { $gte: 120 }
        }).toArray();
        const elapsed = Date.now() - start;
        console.log(`  - 결과: ${results.length}개, 시간: ${elapsed}ms`);
        
    } catch (error) {
        console.error('❌ 오류:', error);
    } finally {
        process.exit(0);
    }
}

checkQuery();
