// Local map preview: local UI/assets, public GET data, no production writes.
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const upstream = 'https://www.koreamanri.com';
const user = { userId:'000000000000000000000000', username:'로컬 미리보기', role:'user', isGuest:true };
const token = ['local', { ...user, exp:Math.floor(Date.now() / 1000) + 86400 }]
    .map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.') + '.local-preview';
const mime = {
    '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
    '.json':'application/json', '.geojson':'application/geo+json', '.png':'image/png', '.jpg':'image/jpeg',
    '.jpeg':'image/jpeg', '.svg':'image/svg+xml', '.webp':'image/webp', '.gif':'image/gif', '.ico':'image/x-icon',
    '.woff':'font/woff', '.woff2':'font/woff2', '.glb':'model/gltf-binary', '.mp3':'audio/mpeg', '.m4a':'audio/mp4'
};
const json = (res, status, value) => {
    res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' });
    res.end(JSON.stringify(value));
};
const cache = new Map();
async function publicData(req, res, url) {
    const key = url.pathname + url.search;
    try {
        let entry = cache.get(key);
        if (!entry || Date.now() - entry.time > 60000) {
            const response = await fetch(upstream + key, { signal:AbortSignal.timeout(30000) });
            entry = { status:response.status, type:response.headers.get('content-type') || 'application/json',
                body:Buffer.from(await response.arrayBuffer()), time:Date.now() };
            if (response.ok) {
                if (cache.size >= 100) cache.delete(cache.keys().next().value);
                cache.set(key, entry);
            }
        }
        res.writeHead(entry.status, { 'Content-Type':entry.type, 'Cache-Control':'no-store' });
        res.end(req.method === 'HEAD' ? undefined : entry.body);
    } catch (error) {
        console.warn(`[preview] ${url.pathname}: ${error.message}`);
        json(res, 502, { message:'공개 지도 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.' });
    }
}
const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/api/auth/guest-login' && req.method === 'POST') {
        return json(res, 200, { token, username:user.username, isGuest:true });
    }
    if (!['GET', 'HEAD'].includes(req.method)) {
        return json(res, 403, { message:'이 로컬 지도 미리보기에서는 변경사항을 저장하지 않습니다.' });
    }
    if (url.pathname === '/api/user/me') return json(res, 200, user);
    if (url.pathname.startsWith('/api/')) return publicData(req, res, url);
    let name;
    try { name = decodeURIComponent(url.pathname); }
    catch { return json(res, 400, { message:'잘못된 경로입니다.' }); }
    if (name === '/') name = '/index.html';
    if (name.startsWith('/tiles/')) name = '/public' + name;
    const parts = name.split('/');
    const allowed = name.startsWith('/public/') || name.startsWith('/src/')
        || /^\/[\w.-]+\.(html|css|png|ico|json)$/.test(name);
    const filename = path.resolve(root, '.' + name);
    if (!allowed || parts.some(part => part.startsWith('.')) || !filename.startsWith(root + path.sep)) {
        return json(res, 404, { message:'파일을 찾을 수 없습니다.' });
    }
    try {
        const stat = await fs.promises.stat(filename);
        if (!stat.isFile()) throw new Error('not a file');
        res.writeHead(200, { 'Content-Type':mime[path.extname(filename)] || 'application/octet-stream', 'Cache-Control':'no-store' });
        if (req.method === 'HEAD') return res.end();
        fs.createReadStream(filename).pipe(res);
    } catch { json(res, 404, { message:'파일을 찾을 수 없습니다.' }); }
});
if (require.main === module) {
    const port = Number(process.env.PREVIEW_PORT) || 3001;
    server.listen(port, '127.0.0.1', () => {
        console.log(`Local map preview: http://127.0.0.1:${port}/?basemap=night`);
        console.log('Local files + public map data. Production writes disabled.');
    });
}
module.exports = server;
