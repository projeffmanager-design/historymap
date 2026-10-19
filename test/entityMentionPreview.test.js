'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../public/assets/map/map-core.js'), 'utf8');
const previewCode = source.slice(source.indexOf('    let _entityMentionPlacePreview ='), source.indexOf('    async function _openHistoryPlaceOnMap'));

function fixture(globe = false) {
    const elements = [];
    function element() {
        const classes = new Set();
        return { children:[], events:{}, isConnected:true,
            classList:{ add:value => classes.add(value), remove:value => classes.delete(value), contains:value => classes.has(value) },
            getClientRects:() => [{}], setAttribute() {},
            append(...children) { this.children.push(...children); },
            appendChild(child) { this.children.push(child); },
            addEventListener(name, callback) { this.events[name] = callback; },
            focus() { this.focused = true; },
            remove() { this.removed = true; } };
    }
    const panel = element(), body = element();
    const field = { value:'번역 초안 @신성 참고', selectionStart:7, selectionEnd:9, isConnected:true,
        setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; },
        closest:() => panel, focus() { this.focused = true; } };
    let popup, highlight;
    const calls = [];
    const map = { getZoom:() => 6, flyTo:(...args) => calls.push(args) };
    const makePopup = () => {
        popup = { events:{}, setLatLng(value) { this.position = value; return this; }, setLngLat(value) { this.position = value; return this; },
            setContent(value) { this.content = value; return this; }, setDOMContent(value) { this.content = value; return this; },
            openOn() { return this; }, addTo() { return this; }, on(name, handler) { this.events[name] = handler; return this; },
            remove() { this.removed = true; this.events[globe ? 'close' : 'remove']?.(); } };
        return popup;
    };
    const context = vm.createContext({ window:{ _is3dMode:globe, mlMap3d:globe ? map : null }, map,
        document:{ querySelectorAll:() => [panel], createElement:() => { const node = element(); elements.push(node); return node; }, body },
        getComputedStyle:() => ({ visibility:'visible' }), console:{ warn() {} },
        L:{ popup:makePopup, circleMarker:() => { highlight = { addTo() { return this; }, remove() { this.removed = true; } }; return highlight; } },
        maplibregl:{ Popup:function() { return makePopup(); } }
    });
    vm.runInContext(previewCode, context);
    return { preview:context.window.previewEntityMentionPlaceOnMap, panel, field, body, calls, elements,
        popup:() => popup, highlight:() => highlight, map };
}

test('mention preview uses the selected coordinates even when names match and leaves the editor and draft untouched', () => {
    const f = fixture();
    assert.equal(f.preview({ _id:'first', name:'신성', lat:41.8, lng:123.4 }, f.field), true);
    const firstPopup = f.popup();
    assert.equal(f.panel.classList.contains('entity-mention-map-preview-hidden'), false);
    assert.equal(f.body.children.length, 0);
    assert.equal(f.preview({ _id:'second', name:'신성', lat:32.1, lng:118.7 }, f.field), true);
    assert.equal(firstPopup.removed, true);
    assert.equal(JSON.stringify(f.calls.at(-1)[0]), '[32.1,118.7]');
    assert.match(f.popup().content.textContent, /신성.*32.1000, 118.7000/);
    f.popup().remove();
    assert.equal(f.panel.classList.contains('entity-mention-map-preview-hidden'), false);
    assert.equal(f.popup().removed, true);
    assert.equal(f.highlight().removed, true);
    assert.equal(f.field.value, '번역 초안 @신성 참고');
    assert.equal(f.field.selectionStart, 7);
    assert.equal(f.field.selectionEnd, 9);
    assert.equal(f.field.focused, undefined);
});

test('3D preview uses longitude-latitude order and does not take focus from the editor', () => {
    const f = fixture(true);
    f.preview({ name:'신성', location:{ coordinates:[118.7, 32.1] } }, f.field);
    assert.equal(JSON.stringify(f.calls[0][0].center), '[118.7,32.1]');
    assert.equal(JSON.stringify(f.popup().position), '[118.7,32.1]');
    f.popup().events.close();
    assert.equal(f.panel.classList.contains('entity-mention-map-preview-hidden'), false);
    assert.equal(f.field.focused, undefined);
});

test('missing or invalid coordinates never hide the editor or jump to zero', () => {
    const f = fixture();
    for (const place of [{}, {lat:null,lng:118}, {lat:'',lng:118}, {lat:91,lng:118}, {lat:32,lng:181}]) {
        assert.equal(f.preview(place, f.field), false);
    }
    assert.equal(f.calls.length, 0);
    assert.equal(f.body.children.length, 0);
    assert.equal(f.panel.classList.contains('entity-mention-map-preview-hidden'), false);
});

test('map rendering failure leaves the editor untouched', () => {
    const f = fixture();
    f.map.flyTo = () => { throw new Error('map unavailable'); };
    assert.equal(f.preview({name:'신성',lat:32,lng:118}, f.field), false);
    assert.equal(f.panel.classList.contains('entity-mention-map-preview-hidden'), false);
    assert.equal(f.body.children.length, 0);
    assert.equal(f.field.focused, undefined);
});

test('reselecting a same-name place replaces the previous tag ID instead of saving the old one', () => {
    const mentions = fs.readFileSync(require.resolve('../src/core/entity-mentions.js'), 'utf8');
    const serialize = mentions.slice(mentions.indexOf('function serializeLinks('), mentions.indexOf('function reconcileLinkRanges('));
    const insert = mentions.slice(mentions.indexOf('function insertToken('), mentions.indexOf('async function searchAll('));
    const ctx = vm.createContext({ Event });
    vm.runInContext(serialize + insert, ctx);
    const field = { value:'@신성', matches:() => true,
        setRangeText(marker, start, end) { this.value = this.value.slice(0, start) + marker + this.value.slice(end); },
        dispatchEvent() {}, focus() {}, setSelectionRange() {} };
    const state = { links:[{ type:'place', id:'old', start:0, end:3 }], previousValue:field.value };
    ctx.insertToken(field, 0, 3, '@신성', '[[place:new|신성]]', state, 'place', 'new');
    assert.equal(state.links.length, 1);
    assert.equal(ctx.serializeLinks(field.value, state.links), '[[place:new|신성]]');
});
