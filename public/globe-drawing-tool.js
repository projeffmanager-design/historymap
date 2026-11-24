/* Draw new lines and areas on the current MapLibre map. Nothing persists until the form is saved. */
(function(root) {
    'use strict';
    class GlobeDrawingTool {
        constructor(options) {
            this.options = options;
            this.map = options.map;
            this.points = [];
            this.kind = 'LineString';
            this.id = 'globe-new-drawing';
            this.closed = false;
            if (this.map.getSource(this.id)) throw new Error('이미 그리기 툴이 열려 있습니다.');
            this.previousCursor = this.map.getCanvas().style.cursor;
            this.restoreDoubleClick = this.map.doubleClickZoom?.isEnabled();
            this.click = event => {
                if (event.originalEvent?.target?.closest?.('.maplibregl-marker') || event.originalEvent?.detail > 1) return;
                event.preventDefault?.();
                this.add(event.lngLat);
            };
            this.doubleClick = event => { event.preventDefault?.(); this.finish(true); };
            this.keydown = event => {
                if (event.target?.closest?.('input,textarea,select,[contenteditable="true"]')) return;
                if (event.key === 'Escape') this.finish(false);
                else if (event.key === 'Enter') this.finish(true);
                else if (event.key === 'Backspace' || event.key === 'Delete') this.undo();
                else return;
                event.preventDefault();
                event.stopPropagation();
            };
            try {
                this.map.doubleClickZoom?.disable();
                this.map.getCanvas().style.cursor = 'crosshair';
                this.makeToolbar();
                this.map.addSource(this.id, { type:'geojson', data:this.preview() });
                this.map.addLayer({ id:this.id+'-fill', type:'fill', source:this.id,
                    filter:['==', '$type', 'Polygon'], paint:{ 'fill-color':'#53d9ff', 'fill-opacity':0.18 } });
                this.map.addLayer({ id:this.id+'-line', type:'line', source:this.id,
                    filter:['!=', '$type', 'Point'], paint:{ 'line-color':'#53d9ff', 'line-width':3 },
                    layout:{ 'line-cap':'round', 'line-join':'round' } });
                this.map.addLayer({ id:this.id+'-points', type:'circle', source:this.id,
                    filter:['==', '$type', 'Point'], paint:{ 'circle-radius':5, 'circle-color':'#53d9ff', 'circle-stroke-color':'#fff', 'circle-stroke-width':2 } });
                this.map.on('click', this.click);
                this.map.on('dblclick', this.doubleClick);
                document.addEventListener('keydown', this.keydown);
                if (options.start) this.add(options.start);
                else this.refresh();
            } catch (error) { this.destroy(); throw error; }
        }
        allowed() {
            if (this.options.isAllowed && !this.options.isAllowed()) { this.finish(false); return false; }
            return !this.closed;
        }
        add(point) {
            if (!this.allowed()) return;
            const lng=Number(point?.lng),lat=Number(point?.lat);
            if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lat)>90) return;
            const previous=this.points.at(-1);
            if (previous && previous[0]===lng && previous[1]===lat) return;
            this.points.push([lng,lat]);
            this.refresh();
        }
        undo() { if (this.allowed()) { this.points.pop(); this.refresh(); } }
        geometry() {
            const coordinates=this.points.map(point=>point.slice());
            return this.kind==='Polygon'
                ? { type:'Polygon', coordinates:[coordinates.concat([coordinates[0]?.slice()])] }
                : { type:'LineString', coordinates };
        }
        preview() {
            const features=[];
            if (this.points.length>=2) {
                const geometry=this.kind==='Polygon' && this.points.length>=3
                    ? this.geometry() : { type:'LineString', coordinates:this.points.map(point=>point.slice()) };
                features.push({ type:'Feature', properties:{}, geometry });
            }
            if (this.points.length) features.push({ type:'Feature', properties:{}, geometry:{ type:'MultiPoint', coordinates:this.points.map(point=>point.slice()) } });
            return { type:'FeatureCollection', features };
        }
        makeToolbar() {
            const bar=document.createElement('div');
            bar.id='globe-drawing-toolbar';
            bar.setAttribute('role','region');
            bar.setAttribute('aria-label','그리기 툴');
            bar.style.cssText='position:fixed;top:112px;left:50%;transform:translateX(-50%);width:max-content;max-width:90vw;box-sizing:border-box;z-index:10020;background:#172a38;color:#fff;border:1px solid #d3b861;border-radius:6px;padding:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:12px;box-shadow:0 3px 16px #0009';
            const title=document.createElement('strong'); title.textContent='✏️ 그리기 툴'; bar.appendChild(title);
            const select=document.createElement('select'); select.setAttribute('aria-label','그릴 도형');
            [['LineString','선 · 강/성곽'],['Polygon','영역 · 폴리곤']].forEach(([value,text])=>{
                const option=document.createElement('option');option.value=value;option.textContent=text;select.appendChild(option);
            });
            select.onchange=()=>{this.kind=select.value;this.refresh();};bar.appendChild(select);
            const button=(label,action)=>{const el=document.createElement('button');el.type='button';el.textContent=label;el.onclick=action;bar.appendChild(el);return el;};
            button('↶ 마지막 점 취소',()=>this.undo());
            button('그리기 완료',()=>this.finish(true));
            button('그리기 취소',()=>this.finish(false));
            this.status=document.createElement('span');this.status.style.width='100%';this.status.setAttribute('aria-live','polite');bar.appendChild(this.status);
            document.body.appendChild(bar);this.bar=bar;
        }
        refresh() {
            if (this.closed) return;
            this.map.getSource(this.id)?.setData(this.preview());
            this.status.textContent=`지도를 클릭해 점 추가 · ${this.points.length}개 점 · 완료는 Enter/더블클릭 · 취소는 Esc`;
        }
        finish(save) {
            if (this.closed) return;
            if (save) {
                if (!this.allowed()) return;
                const minimum=this.kind==='Polygon'?3:2;
                if (new Set(this.points.map(point=>point.join(','))).size<minimum) {
                    this.status.textContent=`${this.kind==='Polygon'?'영역은':'선은'} 서로 다른 점 ${minimum}개 이상이 필요합니다.`;return;
                }
                const geometry=this.geometry();
                if (this.kind==='Polygon') {
                    const ring=geometry.coordinates[0];
                    const area=ring.slice(1).reduce((sum,p,i)=>sum+ring[i][0]*p[1]-p[0]*ring[i][1],0);
                    if (Math.abs(area)<1e-12) {this.status.textContent='면적이 있는 영역을 그려주세요.';return;}
                }
                try { this.options.validate?.(geometry); }
                catch (error) {this.status.textContent=error.message;return;}
                this.destroy();
                this.options.onFinish?.({ type:'Feature', properties:{}, geometry });
            } else {this.destroy();this.options.onFinish?.(null);}
        }
        destroy() {
            if (this.closed) return;
            this.closed=true;
            this.map.off('click',this.click);this.map.off('dblclick',this.doubleClick);
            document.removeEventListener('keydown',this.keydown);
            ['-points','-line','-fill'].forEach(suffix=>{if(this.map.getLayer(this.id+suffix))this.map.removeLayer(this.id+suffix);});
            if(this.map.getSource(this.id))this.map.removeSource(this.id);
            if(this.restoreDoubleClick)this.map.doubleClickZoom?.enable();
            this.map.getCanvas().style.cursor=this.previousCursor;
            this.bar?.remove();
        }
    }
    root.GlobeDrawingTool=GlobeDrawingTool;
})(window);
