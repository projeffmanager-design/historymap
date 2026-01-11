require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('MongoDB 연결 성공');
    
    const db = mongoose.connection.db;
    const territories = db.collection('territories');
    
    // 샘플 1개 가져오기
    const sample = await territories.findOne({});
    
    console.log('\n📋 샘플 territory 구조:');
    console.log(JSON.stringify(sample, null, 2));
    
    process.exit(0);
  })
  .catch(err => {
    console.error('MongoDB 연결 실패:', err);
    process.exit(1);
  });
