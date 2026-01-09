// 영토(territories) 컬렉션의 중복 확인
require('dotenv').config();
const { connectToDatabase } = require('../db');

async function checkDuplicates() {
    const { collections } = await connectToDatabase();
    
    try {
        console.log('🔍 영토 중복 분석 시작...\n');
        
        // 전체 영토 수
        const totalCount = await collections.territories.countDocuments({});
        console.log(`📊 총 영토 개수: ${totalCount}개\n`);
        
        // 1. name 기준 중복 확인
        console.log('🔍 1. name 필드 중복 확인...');
        const duplicatesByName = await collections.territories.aggregate([
            {
                $group: {
                    _id: '$name',
                    count: { $sum: 1 },
                    ids: { $push: '$_id' },
                    time_ranges: { $push: { start_year: '$start_year', end_year: '$end_year' } }
                }
            },
            {
                $match: { count: { $gt: 1 } }
            },
            {
                $sort: { count: -1 }
            }
        ]).toArray();
        
        console.log(`   ⚠️  중복된 이름: ${duplicatesByName.length}개\n`);
        
        if (duplicatesByName.length > 0) {
            console.log('   중복 상위 10개:');
            duplicatesByName.slice(0, 10).forEach((item, index) => {
                console.log(`   ${index + 1}. "${item._id}" - ${item.count}개`);
                item.time_ranges.forEach((tr, i) => {
                    console.log(`      [${i + 1}] ${tr.start_year || '?'}년 ~ ${tr.end_year || '현재'}년`);
                });
            });
            console.log();
        }
        
        // 2. name + time_range 기준 완전 중복 확인
        console.log('🔍 2. name + 시간범위 완전 중복 확인...');
        const exactDuplicates = await collections.territories.aggregate([
            {
                $group: {
                    _id: {
                        name: '$name',
                        start_year: '$start_year',
                        end_year: '$end_year'
                    },
                    count: { $sum: 1 },
                    ids: { $push: '$_id' }
                }
            },
            {
                $match: { count: { $gt: 1 } }
            },
            {
                $sort: { count: -1 }
            }
        ]).toArray();
        
        console.log(`   ⚠️  완전 중복: ${exactDuplicates.length}개\n`);
        
        if (exactDuplicates.length > 0) {
            console.log('   완전 중복 목록 (상위 10개):');
            exactDuplicates.slice(0, 10).forEach((item, index) => {
                console.log(`   ${index + 1}. "${item._id.name}" (${item._id.start_year || '?'}~${item._id.end_year || '현재'}) - ${item.count}개 중복`);
                console.log(`      IDs: ${item.ids.join(', ')}`);
            });
            console.log();
        }
        
        // 3. country_id별 분포
        console.log('🔍 3. country_id별 영토 분포...');
        const byCountry = await collections.territories.aggregate([
            {
                $group: {
                    _id: '$country_id',
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { count: -1 }
            },
            {
                $limit: 10
            }
        ]).toArray();
        
        console.log('   상위 10개 국가:');
        for (const item of byCountry) {
            const country = await collections.countries.findOne({ _id: item._id });
            const countryName = country ? country.name : item._id;
            console.log(`   - ${countryName}: ${item.count}개`);
        }
        console.log();
        
        // 4. 시간대별 분포
        console.log('🔍 4. 시간대별 영토 분포...');
        const byTimePeriod = await collections.territories.aggregate([
            {
                $group: {
                    _id: {
                        start_year: '$start_year',
                        end_year: '$end_year'
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { count: -1 }
            },
            {
                $limit: 10
            }
        ]).toArray();
        
        console.log('   상위 10개 시간범위:');
        byTimePeriod.forEach((item, index) => {
            console.log(`   ${index + 1}. ${item._id.start_year || '?'}년 ~ ${item._id.end_year || '현재'}년: ${item.count}개`);
        });
        console.log();
        
        // 5. GeoJSON 타입별 분포
        console.log('🔍 5. GeoJSON 타입별 분포...');
        const byGeoType = await collections.territories.aggregate([
            {
                $group: {
                    _id: '$geojson.type',
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { count: -1 }
            }
        ]).toArray();
        
        byGeoType.forEach(item => {
            console.log(`   - ${item._id}: ${item.count}개`);
        });
        console.log();
        
        // 요약
        console.log('📋 요약:');
        console.log(`   - 전체 영토: ${totalCount}개`);
        console.log(`   - 중복된 이름: ${duplicatesByName.length}개`);
        console.log(`   - 완전 중복 (이름+시간): ${exactDuplicates.length}개`);
        
        if (exactDuplicates.length > 0) {
            const totalDuplicateRecords = exactDuplicates.reduce((sum, item) => sum + (item.count - 1), 0);
            console.log(`   - 삭제 가능한 중복 레코드: ${totalDuplicateRecords}개`);
            console.log(`\n💡 완전 중복 제거 시 예상 개수: ${totalCount - totalDuplicateRecords}개`);
        }
        
    } catch (error) {
        console.error('❌ 오류 발생:', error);
    } finally {
        process.exit(0);
    }
}

checkDuplicates();
