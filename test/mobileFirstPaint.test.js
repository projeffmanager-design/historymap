'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const mapScript = fs.readFileSync(require.resolve('../public/assets/generated/map-scripts.8dd474ba3c36.js'), 'utf8');
const territoryEditorScript = fs.readFileSync(require.resolve('../public/assets/generated/map-scripts.844fdec57596.js'), 'utf8');
const start = mapScript.indexOf('    const mobileFirstPaint =');
const end = mapScript.indexOf('    const mobileOptionalLoads =', start);
assert.ok(start >= 0 && end > start);

test('mobile eclipse data waits for explicit layer activation', async () => {
    const script = fs.readFileSync(require.resolve('../public/assets/eclipse-layer.js'), 'utf8');
    let onReady;
    let fetchCount = 0;
    const controls = {
        'menu-layer-eclipse': { checked: true, addEventListener() {}, toggleAttribute() {} },
        'mobile-layer-eclipse': { checked: false, addEventListener() {} },
        yearInput: { value: '981' },
        monthInput: { value: '1' }
    };
    const context = {
        window: { innerWidth: 390, innerHeight: 844, mlMap3d: null },
        document: {
            body: { classList: { contains: () => false } },
            getElementById: id => controls[id] || null,
            addEventListener: (_event, handler) => { onReady = handler; }
        },
        fetch: async () => { fetchCount++; return { ok: true, json: async () => ({ features: [], events: [], historical_records: [] }) }; },
        AbortController,
        setTimeout: () => 1,
        clearTimeout,
        console
    };
    vm.createContext(context);
    vm.runInContext(script, context);
    onReady();
    assert.equal(fetchCount, 0);
    assert.equal(controls['mobile-layer-eclipse'].checked, false);
    context.window.eclipseLayer.setEnabled(true);
    await Promise.resolve();
    assert.equal(fetchCount > 0, true);
});

test('mobile first paint enables exactly the five basic map layers', () => {
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
    assert.equal(result.city, true);
    assert.equal(result.placeLabel, true);
    assert.equal(result.countryLabel, true);
    assert.equal(result.adminLabel, true);
    assert.equal(result.territoryPolygon, true);
    assert.equal(result.military, false);
    assert.equal(result.activityFeed, false);
    assert.equal(result.natural, false);
    assert.equal(result.historyPanel, false);
    assert.equal(Object.values(result).filter(Boolean).length, 5);
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

test('rapid mobile year changes update the date immediately and render only the last year', () => {
    const start = mapScript.indexOf('    let _mobileTimeCommitTimer =');
    const end = mapScript.indexOf('    window.goToHistoricalTime =', start);
    assert.ok(start >= 0 && end > start);
    const calls = [];
    const timers = new Map();
    let nextTimer = 1;
    const context = {
        mobileFirstPaint: true,
        combinedSlider: { min: '0', max: '30000', value: 0 },
        yearMonthToTotalMonths: year => year,
        updateMap: year => calls.push(`map:${year}`),
        updateUI: year => calls.push(`ui:${year}`),
        refreshHeroPinsForTime: () => {},
        checkAndDisplayEvent: () => {},
        updateTimelineScroll: () => {},
        scheduleHistoryPanelUpdate: () => {},
        layerVisibility: { event:false, timeline:false, historyPanel:false, captionPanel:false },
        document: { getElementById: () => null },
        window: {},
        setTimeout: callback => { const id = nextTimer++; timers.set(id, callback); return id; },
        clearTimeout: id => timers.delete(id)
    };
    vm.createContext(context);
    vm.runInContext(mapScript.slice(start, end), context);
    context.updateTime(400, 1);
    context.updateTime(500, 1);
    assert.deepEqual(calls, ['ui:400', 'ui:500']);
    assert.equal(timers.size, 1);
    [...timers.values()][0]();
    assert.deepEqual(calls, ['ui:400', 'ui:500', 'map:500']);
});

test('OpenFreeMap styles use a single glyph directory instead of a missing joined font stack', () => {
    const start = mapScript.indexOf('    function normalizeOpenFreeMapGlyphStacks');
    const end = mapScript.indexOf('    async function fetchOpenFreeMapStyle', start);
    assert.ok(start >= 0 && end > start);
    const context = {};
    vm.createContext(context);
    vm.runInContext(mapScript.slice(start, end) + `
        this.result = normalizeOpenFreeMapGlyphStacks({ layers: [
            { layout: { 'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'] } },
            { layout: { 'text-font': ['Open Sans Regular,Arial Unicode MS Regular'] } },
            { layout: { 'text-font': 'Open Sans Regular,Arial Unicode MS Regular' } },
            { layout: { 'text-font': ['Noto Sans Regular'] } },
            { type: 'fill' }
        ] });`, context);
    assert.deepEqual(
        JSON.parse(JSON.stringify(context.result.layers.map(layer => layer.layout?.['text-font'] || null))),
        [['Open Sans Regular'], ['Open Sans Regular'], ['Open Sans Regular'], ['Noto Sans Regular'], null]
    );
});

test('3D country labels accept the active historical capital without requiring a legacy top-level flag', () => {
    assert.match(mapScript, /rec\?\.place_type === 'capital'/);
    assert.match(mapScript, /rec\?\.place_type === 'hwangseong'/);
    assert.doesNotMatch(mapScript, /if \(!c\.lat \|\| !c\.lng \|\| !c\.is_capital\) return;/);
});

test('king panel looks up rulers by the exact country object instead of a shared country name', () => {
    assert.match(mapScript, /getKingByYear\(rawCountry, year, month\)/);
    assert.doesNotMatch(mapScript, /getKingByYear\(rawCountry\.name, year, month\)/);
});

test('country genealogy separates identical country names by the active historical phase', () => {
    const start = mapScript.indexOf('    function getKingsForCountryPhase');
    const end = mapScript.indexOf('    /** 현재 연도와 월의 왕 정보를 패널에 업데이트합니다.', start);
    assert.ok(start >= 0 && end > start);
    const context = {};
    vm.createContext(context);
    vm.runInContext(mapScript.slice(start, end) + `
        this.result = getKingsForCountryPhase([
            { name:'장수왕', start:413, end:491, faction:'고려' },
            { name:'태조', start:918, end:943, faction:'고려' }
        ], { _id:'late-goguryeo', name:'고려', start:427, end:668 });`, context);
    assert.deepEqual(JSON.parse(JSON.stringify(context.result.map(king => king.name))), ['장수왕']);
});

test('country genealogy prefers exact phase rulers over a predecessor ending in the same year', () => {
    const start = mapScript.indexOf('    function getKingsForCountryPhase');
    const end = mapScript.indexOf('    /** 현재 연도와 월의 왕 정보를 패널에 업데이트합니다.', start);
    const context = {};
    vm.createContext(context);
    vm.runInContext(mapScript.slice(start, end) + `
        this.result = getKingsForCountryPhase([
            { name:'공양왕', start:1389, end:1392 },
            { name:'태조', start:1392, end:1398, country_phase_id:'joseon' },
            { name:'정종', start:1398, end:1400, country_phase_id:'joseon' }
        ], { _id:'joseon', name:'조선', start_year:1392, end_year:1897 });`, context);
    assert.deepEqual(JSON.parse(JSON.stringify(context.result.map(king => king.name))), ['태조', '정종']);
});

test('Gung Ye and Wang Geon are assigned by reign career, not birth year', () => {
    const start = mapScript.indexOf('    function getKingsForCountryPhase');
    const end = mapScript.indexOf('    /** 현재 연도와 월의 왕 정보를 패널에 업데이트합니다.', start);
    const context = {};
    vm.createContext(context);
    vm.runInContext(mapScript.slice(start, end) + `
        const rulers = [
            { _id:'wang', name:'왕건', start:877, end:943, faction:'고려(高麗)', source_country_id:'goryeo', career_history:[
                { country_id:'goryeo', faction:'후고구려(後高句麗)', hero_type:'general', start_year:898, end_year:917 },
                { country_id:'goryeo', faction:'고려(高麗)', hero_type:'emperor', title:'태조', start_year:918, end_year:943 }
            ]},
            { _id:'gung', name:'궁예', start:882, end:918, faction:'후고구려(後高句麗)', source_country_id:'goryeo', career_history:[
                { country_id:'goryeo', faction:'후고구려(後高句麗)', hero_type:'king', title:'후고구려 왕', start_year:898, end_year:903 },
                { country_id:'goryeo', faction:'후고구려(後高句麗)', hero_type:'king', title:'마진 왕', start_year:904, end_year:910 },
                { country_id:'goryeo', faction:'후고구려(後高句麗)', hero_type:'king', title:'태봉 왕', start_year:911, end_year:918 }
            ]}
        ];
        this.majin = getKingsForCountryPhase(rulers, { _id:'majin-phase', name:'마진(摩震)', start_year:904, end_year:910 });
        this.goryeo = getKingsForCountryPhase(rulers, { _id:'goryeo-phase', name:'고려(高麗)', start_year:918, end_year:1392 });`, context);
    assert.deepEqual(JSON.parse(JSON.stringify(context.majin.map(king => [king.name, king.start, king.end]))), [['궁예', 904, 910]]);
    assert.deepEqual(JSON.parse(JSON.stringify(context.goryeo.map(king => [king.name, king.start, king.end]))), [['왕건', 918, 943]]);
});

test('country detail uses the active phase dates instead of the merged base-country dates', () => {
    const start = mapScript.indexOf('function getEffectiveCountryInfo');
    const end = mapScript.indexOf('function getCountryInfoById', start);
    assert.ok(start >= 0 && end > start);
    const context = { document: { getElementById: () => null } };
    vm.createContext(context);
    vm.runInContext(mapScript.slice(start, end) + `
        this.result = getEffectiveCountryInfo({
            _id:'goryeo-lineage', name:'고려(高麗)', start:901, end:1392,
            history:[{ _id:'joseon', name:'조선(朝鮮)', start_year:1392, end_year:1897 }]
        }, 1679, 1);`, context);
    assert.equal(context.result.name, '조선(朝鮮)');
    assert.equal(context.result.start, 1392);
    assert.equal(context.result.end, 1897);
    const current = vm.runInContext(`getEffectiveCountryInfo({
        _id:'goryeo-lineage', name:'고려(高麗)', start:901, end:1392,
        history:[{ name:'대한민국', start_year:1919, end_year:null }]
    }, 2000, 1)`, context);
    assert.equal(current.end, null);
});

test('country labels prefer phase capital coordinates before a remote territory centroid', () => {
    assert.match(mapScript, /country\.label_lat \?\? country\.capital_lat/);
    assert.ok(
        (mapScript.match(/country\.label_lat \?\? country\.capital_lat/g) || []).length >= 2,
        '2D와 3D 국가 라벨 모두 시대별 수도 좌표를 사용해야 한다'
    );
    assert.ok(
        mapScript.indexOf('country.label_lat ?? country.capital_lat') <
        mapScript.indexOf('_renderedCountryLargestPatch.has(countryId)')
    );
});

test('3D country labels treat an open-ended phase as current instead of year zero', () => {
    assert.match(mapScript, /if \(value == null \|\| value === ''\) return '';/);
});

test('king genealogy links to the next name phase in the same dynasty', () => {
    assert.match(mapScript, /class="cdp-king-dynasty-link cdp-king-continuation"/);
    assert.match(mapScript, /class="cdp-king-dynasty-link cdp-king-predecessor"/);
    assert.match(mapScript, /<span>이어지는 왕조<\/span>/);
    assert.match(mapScript, /<span>선대 왕조<\/span>/);
    assert.match(mapScript, /successor\.predecessor_relations/);
    assert.match(mapScript, /String\(rel\.relation_type \|\| 'continuation'\) === 'continuation'/);
    assert.match(mapScript, /updateTime\(phaseYear, phaseMonth\)/);
    assert.match(mapScript, /showCountryInfoModal\(effectiveTarget \|\| targetCountry, 'kings'\)/);
});

test('king genealogy uses phase-specific royal careers instead of birth and death years', () => {
    assert.match(mapScript, /const phaseCareer = royalCareers\.filter\(careerOverlapsPhase\)/);
    assert.match(mapScript, /royalCareerTypes\.has/);
    assert.match(mapScript, /start: Math\.max\(careerStart, phaseStart\)/);
    assert.match(mapScript, /end: Math\.min\(careerEnd, phaseEnd\)/);
    assert.match(mapScript, /상세 왕 경력이 있는 인물은 생몰년만 겹친 다른 국호의 왕계보에 넣지 않는다/);
    assert.match(mapScript, /_lineage_source_id: king\._id/);
});

test('king genealogy can show, link, and create connected historical events', () => {
    assert.match(mapScript, /class="cdp-king-events"/);
    assert.match(mapScript, /includeRecords:'1'/);
    assert.match(mapScript, /_historyRichContent\(summary, year, month/);
    assert.match(mapScript, /🔗 기존 역사 연결/);
    assert.match(mapScript, /＋ 새 역사 입력/);
    assert.match(mapScript, /predicate:'participated_in'/);
    assert.match(mapScript, /\[\[person:\$\{block\.dataset\.heroId\}\|\$\{block\.dataset\.kingName\}\]\]/);
    assert.match(mapScript, /주요 사건 한 번에 보기/);
    assert.match(mapScript, /한 번에 접기/);
    assert.match(mapScript, /for \(let index = 0; index < blocks\.length; index \+= 4\)/);
});

test('country labels prefer the active true capital over palace or territory fallbacks', () => {
    assert.match(mapScript, /rec\.is_capital === true \? 3/);
    assert.match(mapScript, /_capitalMap\.get\(countryId\)\?\.castle/);
    assert.ok(
        mapScript.indexOf('_capitalMap.get(countryId)?.castle') <
        mapScript.indexOf('country.label_lat ?? country.capital_lat', mapScript.indexOf('_capitalMap.get(countryId)?.castle'))
    );
});

test('king summary popup escapes panel stacking contexts', () => {
    assert.match(mapScript, /document\.body\.appendChild\(popup\)/);
    assert.match(mapScript, /popup\.style\.setProperty\('z-index', '2147482500', 'important'\)/);
});

test('king panel links ruler names to people and country names to country details', () => {
    assert.match(mapScript, /openKingPersonFromPanel\(event,this\.dataset\.heroId\)/);
    assert.match(mapScript, /window\.heroSystem\.openSidebar\(String\(heroId\)\)/);
    assert.match(mapScript, /openKingCountryFromPanel\(event,this\.dataset\.countryId\)/);
    assert.match(mapScript, /window\.showCountryInfoModal\(country\)/);
});

test('3D marker culling uses CSS canvas dimensions when MapLibre pixel ratio differs from device DPR', () => {
    assert.match(mapScript, /const cw = _cullCanvas\.clientWidth \|\| canvasRect\.width/);
    assert.match(mapScript, /const ch = _cullCanvas\.clientHeight \|\| canvasRect\.height/);
    assert.doesNotMatch(mapScript, /_cullCanvas\.height \/ \(window\.devicePixelRatio/);
});

test('mobile globe decorative layers do not force an unnecessary full-rate render loop', () => {
    assert.match(mapScript, /if \(pitch < 15\) return;/);
    assert.match(mapScript, /this\._nextRepaintTimer = setTimeout\(\(\) => \{/);
    assert.doesNotMatch(mapScript, /_threeRenderer\.render\(_threeScene, _threeCamera\);\s*window\.mlMap3d\.triggerRepaint\(\)/);
});

test('mobile globe uses MapLibre WebGL1 fallback to avoid WebGL2 PBO fence warnings', () => {
    assert.match(mapScript, /contextType: mobileFirstPaint \? 'webgl' : 'webgl2'/);
});

test('mobile MapLibre symbol layer declares one available glyph font', () => {
    const layerStart = mapScript.indexOf('id: _mobileSymbolTextId');
    const layerEnd = mapScript.indexOf('paint:', layerStart);
    assert.ok(layerStart >= 0 && layerEnd > layerStart);
    assert.match(mapScript.slice(layerStart, layerEnd), /'text-font': \['Open Sans Regular'\]/);
});

test('shared-boundary editor can reselect endpoints without restarting territory selection', () => {
    assert.match(territoryEditorScript, /function _tgReselectPairRange\(\)/);
    assert.match(territoryEditorScript, /btn\.textContent='📍 시작·끝점 다시 선택'/);
    assert.match(territoryEditorScript, /_tgRestorePairState\(context\.snapshot\)/);
    assert.match(territoryEditorScript, /btn\.textContent='📍 시작점 다시 선택'/);
});
