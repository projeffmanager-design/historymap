
require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');

async function recalculateScores() {

    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
        throw new Error("MONGO_URI 환경 변수가 설정되지 않았습니다. .env 파일을 확인해주세요.");
    }
    const client = new MongoClient(mongoUri);
    await client.connect();
    const db = client.db('realhistory');

    console.log('🔄 점수 재계산 시작...');

    // 모든 사용자 조회
    const users = await db.collection('users').find({}).toArray();
    console.log(`👥 총 ${users.length}명의 사용자 확인`);

    let updatedCount = 0;

    for (const user of users) {
        try {
            // 실제 검토 횟수 계산 (승인된 기여물을 검토한 횟수)
            const actualReviewedCount = await db.collection('contributions').countDocuments({
                reviewerId: user._id,
                status: 'approved'
            });

            // 실제 승인 횟수 계산
            const actualApprovedCount = await db.collection('contributions').countDocuments({
                approverId: user._id,
                status: 'approved'
            });

            // 점수 계산
            const correctReviewScore = actualReviewedCount * 5;
            const correctApprovalScore = actualApprovedCount * 5;

            // 점수 업데이트
            await db.collection('users').updateOne(
                { _id: user._id },
                {
                    $set: {
                        reviewScore: correctReviewScore,
                        approvalScore: correctApprovalScore
                    }
                }
            );

            if (user.reviewScore !== correctReviewScore || user.approvalScore !== correctApprovalScore) {
                console.log(`✅ ${user.username}: 검토 ${user.reviewScore} → ${correctReviewScore}, 승인 ${user.approvalScore} → ${correctApprovalScore}`);
                updatedCount++;
            }

        } catch (error) {
            console.error(`❌ ${user.username} 처리 중 오류:`, error.message);
        }
    }

    console.log(`\n🎯 점수 재계산 완료: ${updatedCount}명의 점수 수정됨`);

    await client.close();
}

recalculateScores().catch(console.error);