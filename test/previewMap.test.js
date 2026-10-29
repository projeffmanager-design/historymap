'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const server = require('../scripts/preview-map');
function request(port, pathname, method = 'GET') {
    return new Promise((resolve, reject) => {
        const req = http.request({ host:'127.0.0.1', port, path:pathname, method }, res => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', chunk => { body += chunk; });
            res.on('end', () => resolve({ status:res.statusCode, body }));
        });
        req.on('error', reject);
        req.end();
    });
}
test('local preview serves the changed UI and blocks writes and private files', async t => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const port = server.address().port;
    const page = await request(port, '/?basemap=night');
    assert.equal(page.status, 200);
    assert.match(page.body, /data-tile="야간모드"/);
    assert.equal((await request(port, '/.env')).status, 404);
    assert.equal((await request(port, '/public/../.env')).status, 404);
    const blocked = await request(port, '/api/source-records/article', 'PUT');
    assert.equal(blocked.status, 403);
    assert.match(blocked.body, /저장하지 않습니다/);
    const guest = await request(port, '/api/auth/guest-login', 'POST');
    assert.equal(guest.status, 200);
    assert.equal(JSON.parse(guest.body).isGuest, true);
});
