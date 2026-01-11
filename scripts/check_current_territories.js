require('dotenv').config();
const { MongoClient } = require('mongodb');

async function checkTerritories() {
    const client = new MongoClient(process.env.MONGO_URI);
    try {
        await client.connect();
        const db = client.db('realhistory');
        
        // 현재 territories 확인
        const territories = await db.collection('territories')
            .find({})
            .project({name: 1, name_en: 1, admin_level: 1, tags: 1})
            .sort({name: 1})
            .toArray();
        
        console.log(`📊 총 ${territories.length}개 영토\n`);
        
        // admin_level별 분포
        const byLevel = {};
        territories.forEach(t => {
            const level = t.admin_level || t.tags?.admin_level || 'unknown';
            byLevel[level] = (byLevel[level] || 0) + 1;
        });
        
        console.log('📈 Admin Level 분포:');
        Object.entries(byLevel).sort((a, b) => {
            if (a[0] === 'unknown') return 1;
            if (b[0] === 'unknown') return -1;
            return parseInt(a[0]) - parseInt(b[0]);
        }).forEach(([level, count]) => {
            console.log(`  Level ${level}: ${count}개`);
        });
        
        console.log('\n\n📋 영토 목록 (앞 50개):');
        territories.slice(0, 50).forEach(t => {
            const level = t.admin_level || t.tags?.admin_level || '?';
            console.log(`  [${level}] ${t.name || t.name_en}`);
        });
        
        if (territories.length > 50) {
            console.log(`\n... 외 ${territories.length - 50}개`);
        }
        
    } finally {
        await client.close();
    }
}

checkTerritories();
