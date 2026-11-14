'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const root = path.resolve(__dirname, '..');
const client = fs.readFileSync(path.join(root, 'public/assets/generated/map-scripts.2b9385b0203b.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
function section(source, start, end) {
    const a = source.indexOf(start), b = source.indexOf(end, a);
    assert.ok(a >= 0 && b > a, start);
    return source.slice(a, b);
}
function apiFixture() {
    const saved = [], calls = [];
    let handler;
    const context = vm.createContext({
        app: { post(url, auth, fn) { assert.equal(url, '/api/contributions'); handler = fn; } },
        verifyToken() {}, TRANSLATION_CATEGORY: 'history_translation',
        toObjectId: value => value,
        RANK_CONFIG: { roles: { assignable: [] } },
        logActivity: async () => {},
        collections: {
            users: { find() { calls.push('users'); return { toArray: async () => [] }; } },
            contributions: { async insertOne(record) { saved.push(record); return { insertedId: 'saved-id' }; } }
        }
    });
    vm.runInContext(section(server, "        app.post('/api/contributions',", '        // PUT: 기여 추천'), context);
    async function submit(body) {
        const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { this.body = data; return this; } };
        await handler({ body, user: { userId: 'test-user', username: '테스트 사관' } }, res);
        return res;
    }
    return { submit, saved, calls };
}
function browserFixture() {
    const elements = new Map();
    function element(id) {
        if (!elements.has(id)) elements.set(id, {
            _value: '', get value() { return this._value; }, set value(value) { this._value = String(value); },
            style: {}, textContent: '', handlers: {},
            classList: { remove() {} },
            addEventListener(event, fn) { this.handlers[event] = fn; }
        });
        return elements.get(id);
    }
    const calls = [], cursor = { style: {} };
    const context = vm.createContext({
        document: { getElementById: element },
        window: {}, console,
        closeEditPanel: id => calls.push(['close', id]),
        showToast: (...args) => calls.push(['toast', ...args]),
        openUnifiedContributionForm(mode) { calls.push(['open', mode]); },
        map: { getContainer: () => cursor, removeLayer() {} },
        L: { marker: point => ({ addTo() { calls.push(['marker', point]); return this; } }) },
        contributionMarker: null,
        addContributionForm: element('addContributionForm'), contribSubmissionType: element('contribSubmissionType'),
        alert: message => calls.push(['alert', message]),
        API_BASE_URL: '/api', token: 'test-token',
        fetch: async (url, options) => {
            calls.push(['fetch', JSON.parse(options.body)]);
            return { ok: false, json: async () => ({ message: 'captured' }) };
        }
    });
    vm.runInContext(section(client, '        function readContributionCoordinates()', '        function syncUnifiedContributionForm()'), context);
    vm.runInContext(section(client, '        if (addContributionForm) {', '        window.voteContribution ='), context);
    element('contribSubmissionType').value = 'map_marker';
    element('contribPlaceType').value = 'natural_mountain';
    element('contribName').value = '테스트 사료';
    element('contribDesc').value = '입력한 설명';
    element('contribCategory').value = 'geography';
    element('contribIsCapital').checked = false;
    const submit = () => element('addContributionForm').handlers.submit({ preventDefault() {} });
    return { context, element, calls, cursor, submit };
}
const mapRecord = { name: '테스트', category: 'geography', is_natural_feature: true };

test('API rejects missing, empty, nonnumeric, nonfinite and out-of-range coordinates before database access', async () => {
    const f = apiFixture();
    const invalid = [undefined, null, '', ' ', '20', '20abc', false, [], {}, NaN, Infinity, -Infinity];
    for (const value of invalid) {
        for (const field of ['lat', 'lng']) {
            const res = await f.submit({ ...mapRecord, lat: 20, lng: 110, [field]: value });
            assert.equal(res.statusCode, 400, `${field}: ${String(value)}`);
            assert.match(res.body.message, /지도에서 위치/);
        }
    }
    for (const point of [{ lat: 90.01, lng: 0 }, { lat: -90.01, lng: 0 }, { lat: 0, lng: 180.01 }, { lat: 0, lng: -180.01 }]) {
        assert.equal((await f.submit({ ...mapRecord, ...point })).statusCode, 400);
    }
    assert.equal((await f.submit({ category: 'literature', start_year: 100, country_id: 'country' })).statusCode, 400);
    assert.equal(f.saved.length, 0);
    assert.equal(f.calls.length, 0);
});

test('API accepts selected coordinates including zero and boundaries, preserving city requirements and coordinate-free record research', async () => {
    const f = apiFixture();
    for (const point of [{ lat: 20.1, lng: 110.2 }, { lat: 0, lng: 0 }, { lat: 90, lng: 180 }, { lat: -90, lng: -180 }]) {
        assert.equal((await f.submit({ ...mapRecord, ...point })).statusCode, 201);
        assert.equal(f.saved.at(-1).lat, point.lat);
        assert.equal(f.saved.at(-1).lng, point.lng);
    }
    assert.equal((await f.submit({ category: 'other', lat: 20, lng: 110 })).statusCode, 400);
    assert.equal((await f.submit({ category: 'other', lat: 20, lng: 110, start_year: 0, country_id: 'country' })).statusCode, 201);
    for (const category of ['historical_record', 'hero_research']) {
        assert.equal((await f.submit({ name: '연구', category })).statusCode, 201);
    }
});

test('browser blocks invalid positions without any request and starts map picking while preserving fields', async () => {
    for (const values of [['', ''], [' ', '110'], ['20', 'NaN'], ['20oops', '110'], ['91', '110'], ['20', '181']]) {
        const f = browserFixture();
        f.element('contribLat').value = values[0];
        f.element('contribLng').value = values[1];
        await f.submit();
        assert.equal(f.calls.some(call => call[0] === 'fetch'), false);
        assert.equal(f.context.window._contributionLocationPickActive, true);
        assert.equal(f.cursor.style.cursor, 'crosshair');
        assert.equal(f.element('contribDesc').value, '입력한 설명');
    }
});

test('2D and 3D selections fill coordinates and status, reopen the form, and submit the selected numeric point', async () => {
    for (const is3d of [false, true]) {
        const f = browserFixture();
        const globeCursor = { style: {} };
        f.context.window._is3dMode = is3d;
        f.context.window.mlMap3d = { getCanvas: () => globeCursor };
        f.element('contribPickLocation').handlers.click();
        f.context.e = { latlng: { lat: 20.5, lng: 470.25 } };
        f.context.event = { lngLat: { lat: 20.5, lng: 470.25 } };
        f.context.pickerMode = 'contribution-coordinate';
        const code = is3d
            ? section(client, "                            if (pickerMode === 'contribution-coordinate')", "                            if (pickerMode === 'form-coordinate')")
            : section(client, '      if (window._contributionLocationPickActive)', '      // 🛡️ 마커 클릭이 map click으로');
        vm.runInContext('(function () { ' + code + ' })()', f.context);
        assert.match(f.element('contribLocationStatus').textContent, /20\.500000.*110\.250000/);
        assert.equal(f.element('contribDesc').value, '입력한 설명');
        assert.equal(f.calls.some(call => call[0] === 'open'), true);
        await f.submit();
        const data = f.calls.find(call => call[0] === 'fetch')[1];
        assert.equal(data.lat, 20.5);
        assert.equal(data.lng, 110.25);
    }
});

test('historical and hero research still submit without coordinates from the browser', async () => {
    for (const category of ['historical_record', 'hero_research']) {
        const f = browserFixture();
        f.element('contribSubmissionType').value = category;
        f.element('recordYear').value = '100';
        await f.submit();
        assert.equal(f.calls.find(call => call[0] === 'fetch')[1].category, category);
        assert.equal(f.calls.some(call => call[0] === 'alert' && /位置|位置指定|위치 지정/.test(call[1])), false);
    }
});

test('HTTP submission rejects a JSON null coordinate and saves the map-selected point through the real handler', async t => {
    const f = apiFixture();
    const listener = http.createServer(async (req, res) => {
        let body = '';
        for await (const chunk of req) body += chunk;
        const result = await f.submit(JSON.parse(body));
        res.writeHead(result.statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result.body));
    });
    await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => listener.close(resolve)));
    const url = `http://127.0.0.1:${listener.address().port}/api/contributions`;
    const invalid = await fetch(url, { method: 'POST', body: JSON.stringify({ ...mapRecord, lat: null, lng: null }) });
    assert.equal(invalid.status, 400);
    assert.equal(f.saved.length, 0);
    const browser = browserFixture();
    browser.context.window._setContributionCoordinates(20.5, 110.25);
    browser.context.fetch = async (_url, options) => {
        const response = await fetch(url, options);
        // Stop before success UI effects; the handler and persisted document are verified below.
        return { ok: false, json: () => response.json() };
    };
    await browser.submit();
    assert.equal(f.saved.length, 1);
    assert.equal(f.saved[0].lat, 20.5);
    assert.equal(f.saved[0].lng, 110.25);
});
