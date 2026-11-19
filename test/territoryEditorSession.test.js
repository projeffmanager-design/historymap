'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../public/assets/generated/map-scripts.844fdec57596.js'), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
const polygon = () => ({ type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] });

function fixture(is3d = true) {
    const elements = new Map();
    function element() {
        const classes = new Set(), handlers = new Map();
        return {
            style: {}, disabled: false, textContent: '', className: '',
            classList: {
                contains: name => classes.has(name),
                remove: name => classes.delete(name),
                toggle(name, enabled) { if (enabled ?? !classes.has(name)) classes.add(name); else classes.delete(name); }
            },
            addEventListener(name, handler) { handlers.set(name, handler); },
            click() { if (!this.disabled) return handlers.get('click')?.(); }
        };
    }
    for (const match of source.matchAll(/getElementById\('([^']+)'\)/g)) elements.set(match[1], element());
    elements.get('territory-geom-floating').hidden = true;
    const body = { appendChild(el) { el.parentNode = this; } };
    const handlers = new Map(), layers = new Map(), sources = new Map(), markers = new Set();
    const canvas = { style: {}, clientWidth: 1000, clientHeight: 700 };
    const map = {
        selectedId: 'A',
        on(name, handler) { if (!handlers.has(name)) handlers.set(name, new Set()); handlers.get(name).add(handler); },
        off(name, handler) { handlers.get(name)?.delete(handler); },
        fire(name, event) { for (const handler of [...(handlers.get(name) || [])]) handler(event); },
        listenerCount: name => handlers.get(name)?.size || 0,
        getCanvas: () => canvas, getContainer: () => canvas, getPane: () => ({ style: {} }),
        dragging: { enable() {}, disable() {} }, dragPan: { enable() {}, disable() {} },
        getLayer: id => id.startsWith('territory-fill-') || layers.get(id),
        addLayer: layer => layers.set(layer.id, layer), removeLayer: id => layers.delete(id),
        getSource: id => sources.get(id),
        addSource(id, data) { sources.set(id, { data: data.data, setData(value) { this.data = value; } }); },
        removeSource: id => sources.delete(id),
        queryRenderedFeatures: () => [{ properties: { _id: map.selectedId, name: map.selectedId, level: 'city' } }],
        getZoom: () => 8, project: coord => ({ x: 100 + coord[0] * 100, y: 100 + coord[1] * 100 }), fitBounds() {}
    };
    const records = new Map(['A', 'B'].map(id => [id, { _id: id, name: id, geometry: polygon(), bbox: { minLat: 0, minLng: 0, maxLat: 1, maxLng: 1 } }]));
    const requests = [], confirmations = [];
    const control = { confirm: true, fetch: null };
    const context = vm.createContext({
        document: {
            body,
            readyState: 'complete', getElementById: id => elements.get(id) || null,
            createElement: element, addEventListener() {},
            querySelectorAll: () => [...elements].filter(([id]) => id.startsWith('territory-geom-')).map(([, el]) => el)
        },
        window: { _is3dMode: is3d, mlMap3d: map, territories: [...records.values()], territoryEditLayerGroup: { clearLayers() {} } },
        map,
        L: {
            PM: {}, DomEvent: { disableClickPropagation() {}, disableScrollPropagation() {} },
            geoJSON: feature => ({
                addTo() { return this; }, toGeoJSON: () => feature,
                getBounds: () => ({ isValid: () => true }),
                eachLayer: callback => callback({ pm: { enable() {} }, on() {}, off() {} })
            })
        },
        localStorage: { getItem: () => 'test-token' }, sessionStorage: { getItem: () => null },
        location: { hostname: 'test.invalid' },
        confirm: message => { confirmations.push(message); return control.confirm; },
        fetch: async (url, options = {}) => {
            requests.push({ url, ...options });
            if (control.fetch) return control.fetch(url, options);
            if (url === '/api/territories/intersect') return { ok: true, json: async () => ({ territories: [{ _id: 'A', name: 'A', level: 'city' }] }) };
            return { ok: true, json: async () => structuredClone(records.get(url.split('/').pop()) || { message: 'saved' }) };
        },
        console, setTimeout, clearTimeout
    });
    context.window.maplibregl = context.maplibregl = { Marker: class {
        constructor(options) { this.events = {}; this.options = options; }
        setLngLat(coord) { this.position = coord; return this; }
        getLngLat() { return { lng: this.position[0], lat: this.position[1] }; }
        addTo() { markers.add(this); return this; }
        on(name, handler) { this.events[name] = handler; return this; }
        remove() { markers.delete(this); }
    } };
    vm.runInContext(source, context);
    const get = id => elements.get('territory-geom-' + id);
    return {
        context, map, markers, requests, confirmations, control, get, sources,
        open: () => context.window.openTerritoryGeomEdit(),
        async choose(id) { map.selectedId = id; map.fire('click', { point: { x: 150, y: 150 }, lngLat: { lng: .5, lat: .5 }, latlng: { lng: .5, lat: .5 } }); await flush(); },
        move() { const marker = [...markers][0]; marker.setLngLat([.1, .1]); marker.events.dragend(); }
    };
}

test('save keeps floating tools open and supports selecting and saving the next territory', async () => {
    const f = fixture();
    await f.open();
    assert.equal(f.get('edit-bar').classList.contains('open'), true);
    await f.choose('A');
    f.move();
    await f.get('save-btn').click();
    assert.equal(f.get('edit-bar').classList.contains('open'), true);
    assert.match(f.get('edit-msg').textContent, /다음 영토를 선택/);
    assert.equal(f.sources.has('territory-3d-edit'), false);
    assert.equal(f.get('save-btn').style.display, 'none');
    assert.equal(f.markers.size, 0);
    await f.choose('B');
    assert.match(f.get('edit-title').textContent, /Object ID: B/);
    await f.get('save-btn').click();
    assert.deepEqual(f.requests.filter(req => req.method === 'PUT').map(req => req.url), ['/api/territories/A', '/api/territories/B']);
    assert.deepEqual(JSON.parse(f.requests.find(req => req.method === 'PUT').body).geometry.coordinates[0][0], [.1, .1]);
    f.get('close-btn').click();
    assert.equal(f.get('edit-bar').classList.contains('open'), false);
    assert.equal(f.map.listenerCount('moveend'), 0);
    // The eraser's permanent click handler remains, but territory selection is detached.
    assert.equal(f.map.listenerCount('click'), 1);
});

test('the separate side button stays visible across save and cancel until editing mode is exited', async () => {
    const f = fixture();
    assert.equal(f.get('floating').hidden, true);
    await f.open();
    assert.equal(f.get('floating').hidden, false);
    assert.equal(f.get('floating').parentNode, f.context.document.body);
    assert.equal(f.get('edit-bar').parentNode, f.context.document.body);
    await f.choose('A');
    await f.get('save-btn').click();
    assert.equal(f.get('floating').hidden, false);
    await f.choose('B');
    await f.get('cancel-btn').click();
    assert.equal(f.get('floating').hidden, false);
    // The shortcut can restore selection even if the larger tool window was hidden.
    f.get('edit-bar').classList.remove('open');
    await f.get('floating-edit-btn').click();
    assert.equal(f.get('edit-bar').classList.contains('open'), true);
    await f.choose('A');
    assert.match(f.get('edit-title').textContent, /Object ID: A/);
    f.get('floating-close-btn').click();
    assert.equal(f.get('floating').hidden, true);
    assert.equal(f.get('edit-bar').classList.contains('open'), false);
});

test('the side controls respect unsaved edits and are disabled while a save is pending', async () => {
    const f = fixture();
    await f.open();
    await f.choose('A');
    f.move();
    f.control.confirm = false;
    await f.get('floating-edit-btn').click();
    f.get('floating-close-btn').click();
    assert.equal(f.confirmations.length, 2);
    assert.equal(f.get('floating').hidden, false);
    assert.match(f.get('edit-title').textContent, /Object ID: A/);
    let finish;
    f.control.fetch = () => new Promise(resolve => { finish = resolve; });
    const saving = f.get('save-btn').click();
    assert.equal(f.get('floating-edit-btn').disabled, true);
    assert.equal(f.get('floating-close-btn').disabled, true);
    finish({ ok: true, json: async () => ({ message: 'saved' }) });
    await saving;
    assert.equal(f.get('floating-edit-btn').disabled, false);
    assert.equal(f.get('floating').hidden, false);
});

test('cancel editing returns to selection and repeated selection does not duplicate listeners', async () => {
    const f = fixture();
    await f.open();
    const listeners = f.map.listenerCount('click');
    for (let i = 0; i < 4; i++) await f.get('select-btn').click();
    assert.equal(f.map.listenerCount('click'), listeners);
    await f.choose('A');
    f.move();
    await f.get('cancel-btn').click();
    assert.equal(f.confirmations.length, 0);
    assert.equal(f.get('edit-bar').classList.contains('open'), true);
    assert.equal(f.get('cancel-btn').style.display, 'none');
    await f.choose('B');
    assert.match(f.get('edit-title').textContent, /Object ID: B/);
});

test('switching or closing preserves unsaved edits when the discard confirmation is declined', async () => {
    const f = fixture();
    await f.open();
    await f.choose('A');
    f.move();
    f.control.confirm = false;
    await f.get('select-btn').click();
    f.get('close-btn').click();
    assert.equal(f.confirmations.length, 2);
    assert.match(f.get('edit-title').textContent, /Object ID: A/);
    assert.equal(f.sources.has('territory-3d-edit'), true);
    f.control.confirm = true;
    await f.get('select-btn').click();
    assert.equal(f.sources.has('territory-3d-edit'), false);
    assert.equal(f.get('edit-bar').classList.contains('open'), true);
});

test('saving prevents a territory switch and duplicate writes; a failed save can be retried', async () => {
    const f = fixture();
    await f.open();
    await f.choose('A');
    let finish;
    f.control.fetch = () => new Promise(resolve => { finish = resolve; });
    const saving = f.get('save-btn').click();
    assert.equal(f.get('select-btn').disabled, true);
    assert.equal(f.get('close-btn').disabled, true);
    f.context.window.cancelTerritoryGeomEdit();
    await f.context.window.saveTerritoryGeomEdit();
    assert.match(f.get('edit-title').textContent, /Object ID: A/);
    assert.equal(f.requests.filter(req => req.method === 'PUT').length, 1);
    finish({ ok: false, json: async () => ({ message: 'test failure' }) });
    await saving;
    assert.match(f.get('edit-msg').textContent, /test failure/);
    assert.equal(f.sources.has('territory-3d-edit'), true);
    assert.equal(f.get('select-btn').disabled, false);
    f.control.fetch = null;
    await f.get('save-btn').click();
    assert.match(f.get('edit-msg').textContent, /다음 영토를 선택/);
});

test('closing during geometry loading ignores the old response', async () => {
    const f = fixture();
    let finish;
    f.control.fetch = () => new Promise(resolve => { finish = resolve; });
    await f.open();
    await f.choose('A');
    f.get('close-btn').click();
    finish({ ok: true, json: async () => ({ _id: 'A', geometry: polygon() }) });
    await flush();
    assert.equal(f.get('edit-bar').classList.contains('open'), false);
    assert.equal(f.sources.has('territory-3d-edit'), false);
    assert.equal(f.markers.size, 0);
});

test('2D selection can be restarted repeatedly and closing removes its click handler', async () => {
    const f = fixture(false);
    await f.open();
    assert.equal(f.map.listenerCount('click'), 1);
    await f.get('select-btn').click();
    await f.get('select-btn').click();
    assert.equal(f.map.listenerCount('click'), 1);
    f.get('close-btn').click();
    assert.equal(f.map.listenerCount('click'), 0);
    assert.equal(f.get('edit-bar').classList.contains('open'), false);
});

test('2D save also returns to territory selection while keeping the tools open', async () => {
    const f = fixture(false);
    // One polygon under the click, avoiding the overlapping-layer picker.
    f.context.window.territories = f.context.window.territories.slice(0, 1);
    await f.open();
    await f.choose('A');
    assert.equal(f.get('save-btn').style.display, '');
    await f.get('save-btn').click();
    assert.equal(f.get('edit-bar').classList.contains('open'), true);
    assert.equal(f.map.listenerCount('click'), 1);
    assert.match(f.get('edit-msg').textContent, /다음 영토를 선택/);
    assert.equal(f.requests.filter(req => req.method === 'PUT').length, 1);
});

test('a previous territory tile-build notification does not replace the next edit instructions', async () => {
    const f = fixture(), timers = [], toasts = [];
    f.context.location.hostname = 'localhost';
    f.context.setTimeout = callback => { timers.push(callback); };
    f.context.showToast = message => toasts.push(message);
    await f.open();
    await f.choose('A');
    await f.get('save-btn').click();
    await f.choose('B');
    const instructions = f.get('edit-msg').textContent;
    f.control.fetch = async () => ({ ok: true, json: async () => ({
        lastBuild: { startedAt: Date.now() + 10000, status: 'completed', tileCount: 10 }
    }) });
    await timers.shift()();
    assert.equal(f.get('edit-msg').textContent, instructions);
    assert.match(toasts.at(-1), /타일 재빌드 완료/);
});

test('right-click entry opens the exact territory without a second map click in 2D and 3D', async () => {
    for (const is3d of [false, true]) {
        const f = fixture(is3d);
        f.map.selectedId = 'B'; // The precise lookup must take precedence over rendered tile hits.
        await f.context.window.openTerritoryGeomEditAt({ lng: .4, lat: .5 });
        await flush();
        assert.match(f.get('edit-title').textContent, /A/);
        assert.equal(f.get('save-btn').style.display, '');
        assert.equal(f.get('floating').hidden, false);
        const lookup = f.requests.find(req => req.url === '/api/territories/intersect');
        assert.equal(lookup.method, 'POST');
        assert.deepEqual(JSON.parse(lookup.body).point, { lng: .4, lat: .5 });
        assert.ok(f.requests.some(req => req.url === '/api/territories/A'));
        assert.equal(f.requests.some(req => req.url === '/api/territories/B'), false);
    }
});

test('right-click entry ignores late lookup results after exiting the editor', async () => {
    const f = fixture();
    let finish;
    f.control.fetch = () => new Promise(resolve => { finish = resolve; });
    const opening = f.context.window.openTerritoryGeomEditAt({ lng: .5, lat: .5 });
    f.get('floating-close-btn').click();
    finish({ ok: true, json: async () => ({ territories: [{ _id: 'A' }] }) });
    await opening;
    assert.equal(f.get('floating').hidden, true);
    assert.equal(f.sources.has('territory-3d-edit'), false);
});

test('an empty exact lookup does not select an unrelated rendered polygon', async () => {
    const f = fixture();
    f.control.fetch = async () => ({ ok: true, json: async () => ({ territories: [] }) });
    await f.context.window.openTerritoryGeomEditAt({ lng: 20, lat: 20 });
    assert.match(f.get('edit-msg').textContent, /편집할 영토가 없습니다/);
    assert.equal(f.sources.has('territory-3d-edit'), false);
    assert.equal(f.requests.some(req => /^\/api\/territories\/[AB]$/.test(req.url)), false);
});

test('a right-click lookup failure can use the rendered territory and fetch its full geometry', async () => {
    const f = fixture();
    f.control.fetch = async url => {
        if (url === '/api/territories/intersect') throw new Error('offline');
        return { ok: true, json: async () => ({ _id: 'B', geometry: polygon() }) };
    };
    f.map.selectedId = 'B';
    await f.context.window.openTerritoryGeomEditAt({ lng: .5, lat: .5 });
    await flush();
    assert.match(f.get('edit-title').textContent, /Object ID: B/);
    assert.equal(f.get('save-btn').style.display, '');
});


test('right-click entry can immediately add a vertex and save a closed boundary', async () => {
    const f = fixture();
    await f.context.window.openTerritoryGeomEditAt({ lng: .5, lat: .5 });
    await flush();
    await f.get('add-vertex-btn').click();
    assert.match(f.get('add-vertex-btn').textContent, /경계선 클릭 중/);
    f.map.fire('click', { point: { x: 150, y: 100 }, lngLat: { lng: .5, lat: 0 } });
    const geometry = f.sources.get('territory-3d-edit').data.features[0].geometry;
    assert.equal(geometry.coordinates[0].length, 6);
    assert.deepEqual(Array.from(geometry.coordinates[0][1]), [.5, 0]);
    await f.get('save-btn').click();
    const saved = JSON.parse(f.requests.find(req => req.method === 'PUT').body).geometry;
    assert.equal(saved.coordinates[0].length, 6);
    assert.deepEqual(saved.coordinates[0].at(-1), saved.coordinates[0][0]);
});

test('reopening direct vertex editing does not duplicate clicks or leave add mode active', async () => {
    const f = fixture();
    for (let i = 0; i < 3; i++) {
        await f.context.window.openTerritoryGeomEditAt({ lng: .5, lat: .5 }); await flush();
        const geometry = () => f.sources.get('territory-3d-edit').data.features[0].geometry;
        f.map.fire('click', { point: { x: 150, y: 100 }, lngLat: { lng: .5, lat: 0 } });
        assert.equal(geometry().coordinates[0].length, 5);
        await f.get('add-vertex-btn').click();
        f.map.fire('click', { point: { x: 150, y: 100 }, lngLat: { lng: .5, lat: 0 } });
        assert.equal(geometry().coordinates[0].length, 6);
        assert.equal(f.map.listenerCount('click'), 1);
        await f.get('add-vertex-btn').click();
        f.map.fire('click', { point: { x: 200, y: 150 }, lngLat: { lng: 1, lat: .5 } });
        assert.equal(geometry().coordinates[0].length, 6);
    }
});

test('add mode supports moving existing and newly inserted vertices without adding duplicates', async () => {
    const f = fixture();
    await f.context.window.openTerritoryGeomEditAt({ lng: .5, lat: .5 }); await flush();
    await f.get('add-vertex-btn').click();
    const geometry = () => f.sources.get('territory-3d-edit').data.features[0].geometry;
    for (const marker of f.markers) {
        assert.equal(marker.options.draggable, true);
        assert.match(marker.options.element.style.cssText, /pointer-events:auto/);
    }
    // A marker click reaches the map too, but must not insert a coincident vertex.
    const markerClick = () => f.map.fire('click', {
        point: { x: 100, y: 100 }, lngLat: { lng: 0, lat: 0 },
        originalEvent: { target: { closest: selector => selector === '.territory-geom-vertex' } }
    });
    markerClick();
    assert.equal(geometry().coordinates[0].length, 5);
    // Moving the first vertex must also move the closing coordinate.
    f.move();
    assert.deepEqual(Array.from(geometry().coordinates[0][0]), [.1, .1]);
    assert.deepEqual(Array.from(geometry().coordinates[0].at(-1)), [.1, .1]);
    f.map.fire('click', { point: { x: 155, y: 105 }, lngLat: { lng: .55, lat: .05 } });
    assert.equal(geometry().coordinates[0].length, 6);
    const added = [...f.markers].find(marker => marker.position[0] === .55);
    assert.ok(added);
    assert.equal(added.options.draggable, true);
    added.setLngLat([.55, -.1]);
    added.events.dragend();
    markerClick();
    assert.equal(geometry().coordinates[0].length, 6);
    assert.deepEqual(Array.from(geometry().coordinates[0][1]), [.55, -.1]);
    assert.match(f.get('add-vertex-btn').textContent, /경계선 클릭 중/);
    await f.get('save-btn').click();
    const saved = JSON.parse(f.requests.find(req => req.method === 'PUT').body).geometry;
    assert.equal(saved.coordinates[0].length, 6);
    assert.deepEqual(saved.coordinates[0][1], [.55, -.1]);
    assert.deepEqual(saved.coordinates[0].at(-1), saved.coordinates[0][0]);
});
