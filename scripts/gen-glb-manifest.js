// scripts/gen-glb-manifest.js
// 빌드 시점에 public/3d/ 를 스캔해 manifest.json 생성
// - 로컬: npm run gen:glb
// - Vercel: vercel-build 훅에서 자동 실행
const fs   = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'public', '3d');
let list = [];
try {
    list = fs.readdirSync(dir)
        .filter(f => f.toLowerCase().endsWith('.glb'))
        .sort()
        .map(f => ({
            key:   f.replace(/\.glb$/i, '').replace(/\s+/g, '_'),
            label: f.replace(/\.glb$/i, '').replace(/[_+]/g, ' '),
            path:  '/public/3d/' + encodeURIComponent(f),
        }));
} catch (e) {
    console.error('[gen-glb-manifest] 디렉터리 읽기 실패:', e.message);
}

fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(list, null, 2));
console.log('✅ public/3d/manifest.json 생성:', list.length + '개');
list.forEach(g => console.log(' -', g.key, '→', g.path));
