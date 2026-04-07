// migrate_territory_type.js
// DB의 모든 territories 중 type이 'territory'인 것을 'admin_area'로 일괄 변경

require('dotenv').config();
const { connectToDatabase } = require('./db');

async function main() {
    const { collections } = await connectToDatabase();

    // 1) 현재 타입 분포 확인
    const before = await collections.territories.aggregate([
        { $group: { _id: '$type', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
    ]).toArray();
    console.log('=== 변경 전 타입 분포 ===');
    before.forEach(r => console.log(`  ${r._id ?? '(null)'}: ${r.count}개`));

    // 2) type === 'territory' → 'admin_area' 일괄 변경
    const result = await collections.territories.updateMany(
        { type: 'territory' },
        { $set: { type: 'admin_area' } }
    );
    console.log(`\n✅ 변경 완료: ${result.matchedCount}개 매칭, ${result.modifiedCount}개 수정`);

    // 3) 변경 후 타입 분포 확인
    const after = await collections.territories.aggregate([
        { $group: { _id: '$type', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
    ]).toArray();
    console.log('\n=== 변경 후 타입 분포 ===');
    after.forEach(r => console.log(`  ${r._id ?? '(null)'}: ${r.count}개`));

    process.exit(0);
}

main().catch(e => { console.error('❌ 오류:', e.message); process.exit(1); });
