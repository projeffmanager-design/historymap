'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const script = [...index.matchAll(/<script[^>]+src="([^"?]+)(?:\?[^\"]*)?"/g)]
    .filter(match => match[1].includes('/generated/'))
    .map(match => fs.readFileSync(path.join(root, match[1]), 'utf8'))
    .find(source => source.includes('function getTerritoryStyle('));

function styles() {
    const context = vm.createContext({ window:{ territoryColorSpec:'country' }, console });
    const start = script.indexOf('    function hexToRgb(');
    const end = script.indexOf('    function getHistoryTerritoryStyle(');
    vm.runInContext(script.slice(start, end), context);
    return context;
}

test('neutral country colors stay neutral instead of gaining a red tint', () => {
    const context = styles();
    for (const color of ['#ffffff', '#fff', '#999999', '#000000']) {
        const fill = context.getTerritoryStyle({ level:'city' }, { _id:color, color }, 94, 1).fillColor;
        const channels = [1, 3, 5].map(start => parseInt(fill.slice(start, start + 2), 16));
        assert.equal(channels[0], channels[1], `${color} became ${fill}`);
        assert.equal(channels[1], channels[2], `${color} became ${fill}`);
    }
});

test('the same country uses a new phase color without needing a page refresh', () => {
    const context = styles();
    const territory = { level:'province' };
    const red = context.getTerritoryStyle(territory, { _id:'country', color:'#ff0000' }, 94, 1);
    const blue = context.getTerritoryStyle(territory, { _id:'country', color:'#0000ff' }, 95, 1);
    assert.notEqual(red.fillColor, blue.fillColor);
    assert.equal(blue.fillColor, '#0000ff');
    assert.equal(context.getTerritoryStyle(territory, { _id:'country', color:'#ff0000' }, 94, 1), red);
});

test('a refreshed country color replaces the cached color even in the same year', () => {
    const context = styles();
    const territory = { level:'city' };
    const country = { _id:'country', color:'#ff0000' };
    context.getTerritoryStyle(territory, country, 94, 1);
    country.color = '#00ff00';
    assert.equal(context.getTerritoryStyle(territory, country, 94, 1).fillColor, '#00ff00');
});

test('globe basemap changes apply clearer country fills to every existing layer', () => {
    const paint = [];
    const context = vm.createContext({ window:{}, mlMap:{ getLayer:() => true, setPaintProperty:(...args) => paint.push(args) } });
    const start = script.indexOf('            function get3dTerritoryBasemapOpacity(');
    const end = script.indexOf('            window._3dClearHeroCache', start);
    vm.runInContext(script.slice(start, end), context);
    for (const mode of ['satellite', 'terrain', 'vector']) {
        context.window._historyGlobeBasemap = mode;
        const opacity = context.get3dTerritoryBasemapOpacity();
        assert.ok(opacity >= (mode === 'vector' ? 0.35 : 0.40) && opacity <= 0.5);
        context.apply3dTerritoryBasemapOpacity();
        const updates = paint.splice(0);
        assert.equal(updates.length, 3);
        for (const [layer, property, expression] of updates) {
            assert.match(layer, /^territory-fill-(country|province|city)$/);
            assert.equal(property, 'fill-opacity');
            assert.equal(expression[0], 'case');
            assert.equal(expression[1][2], '__unowned__');
            assert.equal(expression[2], 0.18);
            assert.equal(expression[3], opacity);
        }
    }
});

test('initial rendering and subsequent territory updates use the same basemap opacity', () => {
    const layers = new Map(), sources = new Map(), paint = [];
    const map = {
        getTerrain:() => null,
        getLayer:id => layers.get(id), getSource:id => sources.get(id),
        addSource(id, source) { sources.set(id, { ...source, setData(data) { this.data = data; } }); },
        addLayer(layer) { layers.set(layer.id, layer); },
        setLayoutProperty() {}, setPaintProperty:(...args) => paint.push(args)
    };
    const context = vm.createContext({
        window:{ mlMap3d:map, _historyGlobeBasemap:'satellite', _3dTerritoryData:{ city:[{
            type:'Feature', properties:{ country_id:'country', fillColor:'#00ff00' },
            geometry:{ type:'Polygon', coordinates:[[[0, 0], [1, 0], [0, 1], [0, 0]]] }
        }] } }, console, layerVisibility:{ territoryPolygon:true }, getCurrentYearMonth:() => ({ year:94, month:1 })
    });
    let start = script.indexOf('            function get3dTerritoryBasemapOpacity(');
    let end = script.indexOf('            window._3dClearHeroCache', start);
    vm.runInContext(script.slice(start, end), context);
    start = script.indexOf('            function _refreshLayersInner(');
    end = script.indexOf('                // ── 강 레이어', start);
    vm.runInContext(script.slice(start, end) + '\n}\n}', context);
    context._refreshLayersInner(true, false);
    const initial = layers.get('territory-fill-city').paint['fill-opacity'];
    assert.equal(initial[3], 0.44);
    context._refreshLayersInner(true, false);
    assert.equal(JSON.stringify(paint[0][2]), JSON.stringify(initial));
    context.window._historyGlobeBasemap = 'terrain';
    context._refreshLayersInner(true, false);
    assert.equal(paint.at(-1)[2][3], 0.40);
});
