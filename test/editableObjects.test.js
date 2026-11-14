'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createEditableObjectHandlers } = require('../lib/editableObjects');
const client = fs.readFileSync(path.join(__dirname, '../public/assets/generated/map-scripts.2b9385b0203b.js'), 'utf8');
const searchCode = client.slice(client.indexOf('    // 통합 편집 검색:'), client.indexOf('      updateCountrySelect();', client.indexOf('    // 통합 편집 검색:')));
function response() {
    return { statusCode:200, status(code) { this.statusCode = code; return this; }, set() {}, json(body) { this.body = body; return this; } };
}
function values(object, parts) {
    if (Array.isArray(object)) return object.flatMap(item => values(item, parts));
    if (!parts.length) return [object];
    return values(object?.[parts[0]], parts.slice(1));
}
function matches(row, query) {
    return Object.entries(query).every(([key, condition]) => {
        if (key === '$and') return condition.every(item => matches(row, item));
        if (key === '$or') return condition.some(item => matches(row, item));
        const actual = values(row, key.split('.'));
        if (condition instanceof RegExp) return actual.some(value => typeof value === 'string' && condition.test(value));
        if (condition && typeof condition === 'object') {
            if ('$ne' in condition) return actual.every(value => value !== condition.$ne);
            if ('$in' in condition) return actual.some(value => condition.$in.includes(value));
            if ('$nin' in condition) return actual.every(value => !condition.$nin.includes(value));
        }
        return actual.includes(condition);
    });
}
function apiFixture() {
    const rows = {
        castle:[
            { _id:'same', name:'숨은 산', name_zh:'隱山', is_natural_feature:true, natural_feature_type:'mountain', hidden:true, built_year:2400 },
            { _id:'other', name:'숨은 기타', is_natural_feature:true, natural_feature_type:'other', lat:null, lng:null },
            { _id:'label', name:'새 지명', is_label:true, history:[{ name:'옛 지명' }] },
            { _id:'army', name:'숨은 군대', is_military_flag:true },
            { _id:'city', name:'숨은 도시', name_en:'Hidden City' },
            { _id:'literal', name:'지명 (가)' },
            { _id:'gone', name:'숨은 삭제', deleted:true }
        ],
        natural:[{ _id:'same', name:'숨은 강', type:'river', geometry:{ type:'LineString', coordinates:[[0,0],[1,1]] } }],
        drawing:[{ _id:'same', name:'숨은 도형', geojson:{ type:'FeatureCollection', features:[] } }],
        resources:[{ _id:'same', name:'숨은 금', resource_type:'gold', history:'기록' }],
        crops:[{ _id:'same', name:'숨은 작물' }],
        ads:[{ _id:'same', title:'숨은 광고', active:false }],
        contributions:[{ _id:'draft', name:'숨은 미승인 산', lat:null, lng:null, status:'pending', category:'geography' },
            { _id:'approved', name:'숨은 승인됨', status:'approved', category:'other' },
            { _id:'record', name:'숨은 기사', status:'pending', category:'historical_record' }]
    };
    const accesses = [];
    function collection(name) {
        return {
            find(query) {
                accesses.push({ name, query });
                let result = rows[name].filter(row => matches(row, query));
                return { sort() { return this; }, limit(limit) { result = result.slice(0, limit); return this; }, toArray:async () => result };
            },
            findOne:async query => rows[name].find(row => matches(row, query)) || null
        };
    }
    const collections = { castle:collection('castle'), naturalFeatures:collection('natural'), drawings:collection('drawing'),
        adMarkers:collection('ads'), contributions:collection('contributions'), countries:{ s:{ db:{ collection } } } };
    const handlers = createEditableObjectHandlers({ collections, toObjectId:id => id === 'invalid' ? null : id });
    const user = { role:'admin' };
    async function search(q, role = 'admin', limit) {
        const res = response(); await handlers.search({ user:{ role }, query:{ q, limit } }, res); return res;
    }
    async function detail(source, id, role = 'admin') {
        const res = response(); await handlers.detail({ user:{ role }, params:{ source, id } }, res); return res;
    }
    return { rows, accesses, search, detail, handlers, user, collections };
}
function browserFixture(fetchImpl) {
    const elements = new Map(), calls = [], tasks = [];
    function element(id) {
        if (!elements.has(id)) elements.set(id, { value:'', style:{}, textContent:'', children:[], handlers:{},
            set innerHTML(value) { this.children = []; }, setAttribute() {}, contains:target => target === elements.get(id),
            addEventListener(event, fn) { this.handlers[event] = fn; }, appendChild(row) { this.children.push(row); } });
        return elements.get(id);
    }
    const context = vm.createContext({
        document:{ getElementById:element, createElement:() => element('row-'+Math.random()), addEventListener() {} },
        localStorage:{ getItem:() => 'test-token' }, sessionStorage:{ getItem:() => null },
        canEditObjects:() => true, clearTimeout() {}, setTimeout:fn => tasks.push(fn), AbortController,
        fetch:fetchImpl, alert:message => calls.push(['alert', message]),
        castles:[], naturalFeatures:[], drawings:[], adMarkers:[], contributions:[],
        closeEditPanel:id => calls.push(['close', id]),
        openNaturalFeatureForm:record => calls.push(['natural', record]),
        openDrawingForm:(geometry, record) => calls.push(['drawing', record, geometry]),
        openAdMarkerForm:record => calls.push(['ad', record]),
        window:{ openCastleForm:id => calls.push(['castle', id]), rcOpenMarkerEdit:(id,record) => calls.push(['resource',id,record]),
            rcOpenCropEdit:(id,record) => calls.push(['crop',id,record]), openContribDetail:id => calls.push(['contribution',id]) }
    });
    vm.runInContext(searchCode+'\ninitCitySearchForEdit();', context);
    async function type(text) { element('citySearchInputForEdit').value = text; element('citySearchInputForEdit').handlers.input(); await tasks.at(-1)?.(); }
    return { context, element, calls, type, tasks, edit:() => context.openSelectedObjectForEdit() };
}

test('unified search includes hidden mountains, other natural markers, labels, military, separate natural geometry and all other supported collections', async () => {
    const f = apiFixture();
    const res = await f.search('숨은');
    assert.equal(res.statusCode, 200);
    const keys = res.body.map(row => `${row.source}:${row._id}`);
    for (const key of ['castle:same','castle:other','castle:army','castle:city','natural-feature:same','drawing:same','resource:same','crop:same','ad-marker:same','contribution:draft']) assert.ok(keys.includes(key), key);
    assert.equal(keys.includes('castle:gone'), false);
    assert.equal(keys.includes('contribution:approved'), true);
    assert.equal(keys.includes('contribution:record'), false);
    assert.match(res.body.find(row => row._id === 'other').typeLabel, /기타/);
    assert.match(res.body.find(row => row.source === 'castle' && row._id === 'same').typeLabel, /산/);
    assert.equal(res.body.some(row => 'geometry' in row || 'geojson' in row), false, 'search should not transfer full geometry');
});

test('labels match current, historical, Chinese and English names and regex metacharacters are literal', async () => {
    const f = apiFixture();
    for (const [query,id] of [['새 지명','label'],['옛 지명','label'],['隱山','same'],['Hidden City','city'],['(가)','literal']]) {
        const result = await f.search(query);
        assert.equal(result.body.length, 1, query);
        assert.equal(result.body[0]._id, id);
    }
    const label = (await f.search('옛 지명')).body[0];
    assert.equal(label.typeLabel, '지명');
    assert.equal(label.matchedName, '옛 지명');
    assert.equal((await f.search('.*')).body.length, 0);
    assert.equal((await f.search('')).body.length, 0);
    assert.equal((await f.search('숨은', 'admin', -1)).body.length, 1);
});

test('source identity selects the original full object, even when IDs collide, without permitting arbitrary collections or deleted records', async () => {
    const f = apiFixture();
    for (const source of ['castle','natural-feature','drawing','resource','crop','ad-marker']) {
        const result = await f.detail(source, 'same');
        assert.equal(result.statusCode, 200, source);
    }
    assert.ok((await f.detail('natural-feature','same')).body.geometry);
    assert.ok((await f.detail('drawing','same')).body.geojson);
    assert.equal((await f.detail('castle','gone')).statusCode,404);
    assert.equal((await f.detail('users','same')).statusCode,404);
    assert.equal((await f.detail('castle','invalid')).statusCode,400);
    assert.equal((await f.detail('contribution','approved')).body._editableMissingMarker,true);
});

test('search and details preserve existing editor permissions', async () => {
    const f = apiFixture();
    assert.equal((await f.search('숨은','user')).statusCode,403);
    assert.equal(f.accesses.length,0);
    const results = (await f.search('숨은','사관')).body;
    assert.ok(results.some(row => row.source === 'castle'));
    assert.ok(results.some(row => row.source === 'natural-feature'));
    assert.equal(results.some(row => row.source === 'ad-marker'),false);
    assert.equal((await f.detail('resource','same','사관')).statusCode,404);
});

test('browser searches the server, labels results safely, loads the full off-map object, and routes by source instead of ID alone', async () => {
    for (const [source,expected] of [['castle','castle'],['natural-feature','natural'],['drawing','drawing'],['resource','resource'],['crop','crop'],['ad-marker','ad'],['contribution','contribution']]) {
        const record = { _id:'same', name:'숨은 산', geojson:{ type:'FeatureCollection',features:[] } };
        const f = browserFixture(async (url, options) => {
            assert.equal(options.cache, 'no-store');
            assert.ok(options.headers.Authorization);
            return { ok:true, json:async () => url.includes('/search?') ? [{ ...record, source, typeLabel:'유형', matchedName:'옛 이름' }] : record };
        });
        await f.type('옛 이름');
        const row = f.element('citySearchResults').children[0];
        assert.match(row.textContent,/검색된 이름: 옛 이름/);
        row.onclick();
        await f.edit();
        const call = f.calls.find(call => call[0] === expected);
        assert.ok(call,source);
        if (source === 'natural-feature' || source === 'drawing') assert.equal(call[1],record);
        if (source === 'castle') assert.equal(f.context.castles[0],record,'off-map markers must be hydrated before the existing editor opens');
        if (source === 'drawing') assert.equal(call[2],record.geojson,'never edit simplified map geometry');
    }
});

test('changing a selected query invalidates the selection and stale responses cannot replace newer results', async () => {
    const pending = [];
    const f = browserFixture(url => new Promise(resolve => pending.push({url,resolve})));
    f.element('citySearchInputForEdit').value = '이전';
    f.element('citySearchInputForEdit').handlers.input();
    const first = f.tasks.at(-1)();
    f.element('citySearchInputForEdit').value = '새 검색';
    f.element('citySearchInputForEdit').handlers.input();
    const second = f.tasks.at(-1)();
    const newer = { _id:'new',source:'castle',name:'새 검색',matchedName:'새 검색',typeLabel:'지명' };
    pending[1].resolve({ok:true,json:async () => [newer]}); await second;
    pending[0].resolve({ok:true,json:async () => [{ ...newer,_id:'old',name:'이전' }]}); await first;
    assert.match(f.element('citySearchResults').children[0].textContent,/새 검색/);
    f.element('citySearchResults').children[0].onclick();
    f.element('citySearchInputForEdit').value = '다른 검색';
    f.element('citySearchInputForEdit').handlers.input();
    await f.edit();
    assert.ok(f.calls.some(call => call[0] === 'alert'));
    assert.equal(pending.length,2,'editing an invalidated selection must not fetch a detail');
});

test('empty results, server failures and deleted selections are visible instead of silently disappearing', async () => {
    const f = browserFixture(async () => ({ok:true,json:async () => []}));
    await f.type('없는 이름');
    assert.match(f.element('editableObjectSearchStatus').textContent,/결과가 없습니다/);
    f.context.fetch = async () => ({ok:false});
    await f.type('다시 검색');
    assert.match(f.element('editableObjectSearchStatus').textContent,/실패/);
});


test('approved contributions without a marker can be found, while linked ones reopen the existing map object', async () => {
    const f = apiFixture();
    const found = (await f.search('숨은 승인됨')).body[0];
    assert.equal(found.source, 'contribution');
    assert.match(found.typeLabel,/승인/);
    const orphan = (await f.detail('contribution','approved')).body;
    assert.equal(orphan._editableMissingMarker,true);
    f.rows.castle.push({_id:'linked',name:'등록된 산',originContributionId:'approved'});
    const linked = (await f.detail('contribution','approved')).body;
    assert.equal(linked._editableMissingMarker,false);
    assert.equal(linked._editableLinkedCastle._id,'linked');
});

test('approved orphan search opens location completion without reapproving and linked results edit the original marker', async () => {
    for (const linked of [false,true]) {
        const record = {_id:'approved',name:'백록파',status:'approved',_editableMissingMarker:!linked,
            _editableLinkedCastle:linked ? {_id:'existing',name:'백록파'} : null};
        const f = browserFixture(async url => ({ok:true,json:async () => url.includes('/search?')
            ? [{...record,source:'contribution',typeLabel:'승인 사료',matchedName:'백록파'}] : record}));
        f.context.window.approveContribution=id => f.calls.push(['complete',id]);
        f.context.showToast=() => {};
        await f.type('백록파');
        f.element('citySearchResults').children[0].onclick();
        await f.edit();
        assert.ok(f.calls.some(call => call[0] === (linked ? 'castle' : 'complete')));
        assert.equal(f.calls.some(call => call[0] === 'contribution'),false);
    }
    assert.match(client,/if \(contrib\.is_natural_feature \|\| contrib\.placeType\?\.startsWith\('natural_'\)/);
});

test('the API routes registered in server.js serve integrated search and detail over HTTP', async t => {
    const express = require('express');
    const app = express();
    const f = apiFixture();
    const source = fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
    const start = source.indexOf('        const editableObjectHandlers = createEditableObjectHandlers(');
    const end = source.indexOf('        // GET /api/castle/search?',start);
    assert.ok(start >= 0 && end > start);
    const verifyToken = (req,res,next) => {
        if(req.headers.authorization !== 'Bearer test-token') return res.status(401).json({message:'로그인 필요'});
        req.user={role:'admin'};next();
    };
    vm.runInNewContext(source.slice(start,end),{app,verifyToken,createEditableObjectHandlers,collections:f.collections,toObjectId:id=>id});
    const listener=await new Promise(resolve=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server));});
    t.after(()=>new Promise(resolve=>listener.close(resolve)));
    const base=`http://127.0.0.1:${listener.address().port}`;
    assert.equal((await fetch(base+'/api/editable-objects/search?q=hidden')).status,401);
    const browser=browserFixture((url,options)=>fetch(base+url,options));
    await browser.type('옛 지명');
    browser.element('citySearchResults').children[0].onclick();
    await browser.edit();
    assert.ok(browser.calls.some(call=>call[0]==='castle'&&call[1]==='label'));
    assert.equal(browser.context.castles[0].name,'새 지명');
});
