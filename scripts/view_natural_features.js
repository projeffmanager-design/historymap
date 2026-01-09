require('dotenv').config();
const { MongoClient } = require('mongodb');

const mongoUri = process.env.MONGO_URI;
const client = new MongoClient(mongoUri);

async function viewNaturalFeatures() {
    try {
        await client.connect();
        console.log("MongoDB에 연결되었습니다!\n");
        
        const db = client.db("realhistory");
        const collection = db.collection("natural_features");

        // 전체 개수
        const count = await collection.countDocuments();
        console.log(`📊 전체 자연 지형지물: ${count}개\n`);

        // 타입별 개수
        const typeStats = await collection.aggregate([
            { $group: { _id: "$type", count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]).toArray();

        console.log(`📋 타입별 통계:`);
        typeStats.forEach(stat => {
            console.log(`   ${stat._id}: ${stat.count}개`);
        });

        // 모든 강 목록
        const features = await collection.find({}).sort({ name_en: 1 }).toArray();
        
        console.log(`\n🌊 저장된 강 목록:\n`);
        
        // 영어 이름으로 그룹화 (중복 제거)
        const grouped = {};
        features.forEach(f => {
            const key = f.name_en;
            if (!grouped[key]) {
                grouped[key] = {
                    name_ko: f.name,
                    name_en: f.name_en,
                    count: 0,
                    ids: []
                };
            }
            grouped[key].count++;
            grouped[key].ids.push(f._id);
        });

        const sortedGroups = Object.values(grouped).sort((a, b) => 
            a.name_en.localeCompare(b.name_en)
        );

        sortedGroups.forEach((group, index) => {
            const segments = group.count > 1 ? ` (${group.count}개 구간)` : '';
            console.log(`${(index + 1).toString().padStart(3)}. ${group.name_ko.padEnd(20)} ${group.name_en}${segments}`);
        });

        console.log(`\n📈 고유 강: ${sortedGroups.length}개`);
        console.log(`📈 전체 구간: ${features.length}개`);

        // 샘플 데이터 상세 보기
        if (features.length > 0) {
            console.log(`\n📄 샘플 데이터 (첫 번째):\n`);
            const sample = features[0];
            console.log(JSON.stringify(sample, null, 2));
        }

    } catch (error) {
        console.error("오류:", error);
    } finally {
        await client.close();
    }
}

viewNaturalFeatures();
