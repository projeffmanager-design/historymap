const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

// 환경변수 로드
require('dotenv').config({ path: path.join(__dirname, '..', 'env') });

// MongoDB 연결 설정
const uri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017';
const dbName = 'realhistory';

async function migrateApprovedContributionsToCastles() {
    let client;

    try {
        client = new MongoClient(uri);
        await client.connect();
        console.log('✅ MongoDB 연결 성공');

        const db = client.db(dbName);
        const contributions = db.collection('contributions');
        const castles = db.collection('castle');

        // 승인된 기여 중 좌표가 있고 historical_record가 아닌 것들 찾기
        const approvedContributions = await contributions.find({
            status: 'approved',
            lat: { $exists: true, $ne: null },
            lng: { $exists: true, $ne: null },
            category: { $ne: 'historical_record' }
        }).toArray();

        console.log(`📊 마이그레이션할 승인된 기여: ${approvedContributions.length}개`);

        let migratedCount = 0;
        let skippedCount = 0;

        for (const contribution of approvedContributions) {
            try {
                // 이미 Castle로 변환되었는지 확인
                const existingCastle = await castles.findOne({
                    created_from_contribution: contribution._id
                });

                if (existingCastle) {
                    console.log(`⏭️  이미 변환됨: ${contribution.name} (Castle ID: ${existingCastle._id})`);
                    skippedCount++;
                    continue;
                }

                // Castle 문서 생성
                const newCastle = {
                    name: contribution.name,
                    lat: contribution.lat,
                    lng: contribution.lng,
                    description: contribution.description || '',
                    built_year: contribution.year || null,
                    country_id: contribution.countryId || null,
                    is_label: contribution.category === 'place_label' || false,
                    label_type: contribution.category === 'place_label' ? 'place' : null,
                    created_by: contribution.username || 'unknown',
                    created_from_contribution: contribution._id,
                    created_at: new Date(),
                    migrated_at: new Date() // 마이그레이션 표시
                };

                const result = await castles.insertOne(newCastle);
                console.log(`✅ Castle 생성: ${contribution.name} (ID: ${result.insertedId})`);
                migratedCount++;

            } catch (error) {
                console.error(`❌ Castle 생성 실패: ${contribution.name}`, error);
            }
        }

        console.log(`\n📈 마이그레이션 완료:`);
        console.log(`   - 변환된 Castle: ${migratedCount}개`);
        console.log(`   - 건너뛴 항목: ${skippedCount}개`);
        console.log(`   - 총 처리: ${approvedContributions.length}개`);

    } catch (error) {
        console.error('❌ 마이그레이션 중 오류:', error);
    } finally {
        if (client) {
            await client.close();
            console.log('🔌 MongoDB 연결 종료');
        }
    }
}

// 스크립트 실행
if (require.main === module) {
    migrateApprovedContributionsToCastles();
}

module.exports = { migrateApprovedContributionsToCastles };