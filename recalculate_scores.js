
require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');

// 헬퍼 함수: 점수에 따른 직급 결정 (새로운 품계 체계 적용)
const getPosition = (score) => {
    // 상급~하급 사관: 점수 기반 자동 진급제
    if (score >= 2600) return '수찬관';        // 정3품
    if (score >= 2100) return '직수찬관';      // 종3품
    if (score >= 1700) return '사관수찬';      // 정4품
    if (score >= 1400) return '시강학사';      // 종4품
    if (score >= 1100) return '기거주';        // 정5품
    if (score >= 850) return '기거사';         // 종5품
    if (score >= 650) return '기거랑';         // 정6품
    if (score >= 450) return '기거도위';       // 종6품
    if (score >= 300) return '수찬';           // 정7품
    if (score >= 200) return '직문한';         // 종7품
    if (score >= 120) return '주서';           // 정8품
    if (score >= 60) return '검열';            // 종8품
    if (score >= 30) return '정자';            // 정9품
    return '수분권지';                         // 종9품 (입문)
};

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
            const totalScore = correctReviewScore + correctApprovalScore;

            // 직급 계산 (점수 기반)
            const correctPosition = getPosition(totalScore);

            // 점수 및 직급 업데이트
            await db.collection('users').updateOne(
                { _id: user._id },
                {
                    $set: {
                        reviewScore: correctReviewScore,
                        approvalScore: correctApprovalScore,
                        position: correctPosition
                    }
                }
            );

            if (user.reviewScore !== correctReviewScore || user.approvalScore !== correctApprovalScore || user.position !== correctPosition) {
                console.log(`✅ ${user.username}: 검토 ${user.reviewScore} → ${correctReviewScore}, 승인 ${user.approvalScore} → ${correctApprovalScore}, 직급 ${user.position || '없음'} → ${correctPosition}`);
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