'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const mapScript = fs.readFileSync(require.resolve('../public/assets/generated/map-scripts.f8beb53dd7ab.js'), 'utf8');
const start = mapScript.indexOf('    const mobileFirstPaint =');
const end = mapScript.indexOf('    const mobileOptionalLoads =', start);
assert.ok(start >= 0 && end > start);

test('mobile first paint keeps only map labels and territory, without label alias overriding place labels', () => {
    const context = {
        window: { innerWidth: 390, innerHeight: 844 },
        layerVisibility: {
            city: true, placeLabel: true, countryLabel: true, territoryPolygon: true,
            military: true, activityFeed: true, natural: true, historyPanel: true,
            get label() { return this.placeLabel; },
            set label(value) { this.placeLabel = value; }
        }
    };
    vm.createContext(context);
    vm.runInContext(mapScript.slice(start, end) + '\nthis.result = applyMobileFirstPaintLayers({ city:true, nationalPower:true, label:false });', context);
    const result = context.result;
    assert.equal(result.placeLabel, true);
    assert.equal(result.countryLabel, true);
    assert.equal(result.territoryPolygon, true);
    assert.equal(result.city, false);
    assert.equal(result.military, false);
    assert.equal(result.activityFeed, false);
    assert.equal(result.natural, false);
    assert.equal(result.historyPanel, false);
    assert.equal('label' in result, false);
});

test('mobile optional server layer defaults do not fetch or activate national power', async () => {
    const script = fs.readFileSync(require.resolve('../public/assets/layer-default-extras.js'), 'utf8');
    let loadHandler;
    let calls = 0;
    const context = {
        window: { innerWidth: 390, innerHeight: 844, addEventListener: (_event, handler) => { loadHandler = handler; } },
        fetch: async () => { calls++; return { ok: true, json: async () => ({ settings: { nationalPower:true } }) }; },
        document: { getElementById: () => null },
        console
    };
    vm.createContext(context);
    vm.runInContext(script, context);
    await loadHandler();
    assert.equal(calls, 0);
});
