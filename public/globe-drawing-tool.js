/* Draw new lines and areas on the current MapLibre map. Nothing persists until the form is saved. */
(function(root) {
    'use strict';
    const earth=6371008.8,rad=Math.PI/180;
    function distance(a,b){const h=Math.sin((b[1]-a[1])*rad/2)**2+Math.cos(a[1]*rad)*Math.cos(b[1]*rad)*Math.sin((b[0]-a[0])*rad/2)**2;return earth*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));}
    function circle(center,radius){const d=radius/earth,lat=center[1]*rad,lng=center[0]*rad,ring=[];for(let i=0;i<64;i++){const bearing=i/64*2*Math.PI,y=Math.asin(Math.sin(lat)*Math.cos(d)+Math.cos(lat)*Math.sin(d)*Math.cos(bearing));const x=lng+Math.atan2(Math.sin(bearing)*Math.sin(d)*Math.cos(lat),Math.cos(d)-Math.sin(lat)*Math.sin(y));ring.push([x/rad,y/rad]);}ring.push(ring[0].slice());return {type:'Polygon',coordinates:[ring]};}
    function validate(geometry){
        if(geometry.type!=='Polygon')return;
        const ring=geometry.coordinates[0],n=ring.length-1,eps=1e-12;
        const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
        const on=(a,b,p)=>Math.abs(cross(a,b,p))<=eps&&p[0]>=Math.min(a[0],b[0])-eps&&p[0]<=Math.max(a[0],b[0])+eps&&p[1]>=Math.min(a[1],b[1])-eps&&p[1]<=Math.max(a[1],b[1])+eps;
        for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){
            if(j===i+1||(i===0&&j===n-1))continue;
            const a=ring[i],b=ring[i+1],c=ring[j],d=ring[j+1];
            if(Math.max(a[0],b[0])<Math.min(c[0],d[0])||Math.max(c[0],d[0])<Math.min(a[0],b[0])||Math.max(a[1],b[1])<Math.min(c[1],d[1])||Math.max(c[1],d[1])<Math.min(a[1],b[1]))continue;
            if((cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0)||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b))throw new Error('영역의 선이 서로 교차합니다. 마지막 점을 취소해 수정하세요.');
        }
        const area=ring.slice(1).reduce((sum,p,i)=>sum+ring[i][0]*p[1]-p[0]*ring[i][1],0);
        if(Math.abs(area)<eps)throw new Error('면적이 있는 영역을 그려주세요.');
    }
    class GlobeDrawingTool {
        constructor(options) {
            this.options = options;
            this.map = options.map;
            this.points = [];
            this.kind = 'LineString';
            this.defaults=options.defaults||{};
            this.id = 'globe-new-drawing';
            this.closed = false;
            if (this.map.getSource(this.id)) throw new Error('이미 그리기 툴이 열려 있습니다.');
            this.previousCursor = this.map.getCanvas().style.cursor;
            this.restoreDoubleClick = this.map.doubleClickZoom?.isEnabled();
            this.click = event => {
                if (event.originalEvent?.target?.closest?.('.maplibregl-marker') || event.originalEvent?.detail > 1) return;
                event.preventDefault?.();
                if(this.kind==='Polygon'&&this.points.length>=3&&this.map.project&&event.point){
                    const first=this.map.project(this.points[0]);
                    if(Math.hypot(first.x-event.point.x,first.y-event.point.y)<10){this.finish(true);return;}
                }
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
            if(this.kind==='Point')this.points=[[lng,lat]];
            else if(['Rectangle','Circle'].includes(this.kind)&&this.points.length===2)this.points[1]=[lng,lat];
            else this.points.push([lng,lat]);
            this.refresh();
        }
        undo() { if (this.allowed()) { this.points.pop(); this.refresh(); } }
        geometry() {
            const coordinates=this.points.map(point=>point.slice());
            if(this.kind==='Point')return {type:'Point',coordinates:coordinates[0]};
            if(this.kind==='Circle')return circle(coordinates[0],distance(coordinates[0],coordinates[1]));
            if(this.kind==='Rectangle'){
                const [a,b]=coordinates;
                return {type:'Polygon',coordinates:[[[a[0],a[1]],[b[0],a[1]],[b[0],b[1]],[a[0],b[1]],[a[0],a[1]]]]};
            }
            return this.kind==='Polygon'
                ? {type:'Polygon',coordinates:[coordinates.concat([coordinates[0]?.slice()])]} : {type:'LineString',coordinates};
        }
        preview() {
            const features=[];
            if(this.points.length>=2){
                const geometry=(this.kind==='Polygon'&&this.points.length<3)?{type:'LineString',coordinates:this.points.map(p=>p.slice())}:this.geometry();
                features.push({type:'Feature',properties:{},geometry});
            }
            if(this.points.length)features.push({type:'Feature',properties:{},geometry:{type:'MultiPoint',coordinates:this.points.map(p=>p.slice())}});
            return {type:'FeatureCollection',features};
        }
        setKind(kind){
            this.kind=kind;
            if(kind==='Point')this.points=this.points.slice(0,1);
            if(['Rectangle','Circle'].includes(kind))this.points=this.points.slice(0,2);
            if(kind==='Point'&&['river','wall','arrow'].includes(this.fields.type.value))this.fields.type.value='general';
            this.shapeButtons?.forEach(button=>{const active=button.shape===kind;button.setAttribute('aria-pressed',String(active));button.style.background=active?'#86662b':'#273947';});
            this.refresh();
        }
        metadata(){
            const f=this.fields;
            return {name:f.name.value.trim(),type:f.type.value,color:f.color.value,line_width:Math.min(20,Math.max(.5,Number(f.line_width.value)||1.5)),start_year:f.start_year.value,end_year:f.end_year.value,path_label:f.path_label.value,path_label_size:13,hide_path_line:false};
        }
        makeToolbar() {
            const bar=document.createElement('div');bar.id='globe-drawing-toolbar';
            bar.setAttribute('role','region');bar.setAttribute('aria-label','그리기 툴');
            bar.style.cssText='position:fixed;top:110px;right:16px;width:310px;max-width:90vw;max-height:calc(100dvh - 190px);overflow:auto;box-sizing:border-box;z-index:10020;background:#1e2a38;color:#ecf0f1;border:1px solid #d3b861;border-radius:8px;padding:12px;font:12px sans-serif;box-shadow:0 3px 16px #0009';
            const title=document.createElement('strong');title.textContent='✏️ 그리기 툴';title.style.cssText='display:block;color:#f5d98b;font-size:14px;margin-bottom:10px';bar.appendChild(title);
            const shapes=document.createElement('div');shapes.style.cssText='display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin-bottom:12px';bar.appendChild(shapes);
            this.shapeButtons=[];
            [['LineString','〰 선'],['Polygon','⬠ 다각형'],['Rectangle','▭ 사각형'],['Circle','◯ 원'],['Point','📍 점']].forEach(([kind,label])=>{
                const button=document.createElement('button');button.type='button';button.textContent=label;button.shape=kind;button.setAttribute('aria-label',label.slice(label.indexOf(' ')+1)+' 그리기');button.onclick=()=>this.setKind(kind);button.style.cssText='color:#fff;border:1px solid #627384;border-radius:4px;padding:7px 2px;font-size:11px;cursor:pointer';shapes.appendChild(button);this.shapeButtons.push(button);
            });
            this.fields={};
            const field=(key,label,type='text',value='')=>{
                const row=document.createElement('label');row.style.cssText='display:flex;align-items:center;gap:8px;margin:7px 0';
                const caption=document.createElement('span');caption.textContent=label;caption.style.cssText='width:58px;flex-shrink:0';row.appendChild(caption);
                const input=document.createElement(type==='select'?'select':'input');if(type!=='select')input.type=type;
                input.setAttribute('aria-label',label);input.style.cssText='min-width:0;width:100%;box-sizing:border-box;padding:6px;border:1px solid #627384;border-radius:4px;background:#16202b;color:#fff';
                input.value=String(value??'');row.appendChild(input);bar.appendChild(row);this.fields[key]=input;return input;
            };
            const name=field('name','이름','text',this.defaults.name);name.placeholder='강·도형 이름';
            const type=field('type','용도','select');
            [['river','강'],['wall','성곽'],['arrow','화살표'],['mountain','산맥'],['general','일반도형']].forEach(([value,text])=>{const option=document.createElement('option');option.value=value;option.textContent=text;type.appendChild(option);});type.value=this.defaults.type||'river';
            type.onchange=()=>{if(type.value==='arrow'&&this.kind!=='LineString')this.setKind('LineString');};
            field('color','색상','color',this.defaults.color||'#3388ff');
            const width=field('line_width','선 굵기','number',this.defaults.line_width||1.5);width.min='.5';width.max='20';width.step='.5';
            field('start_year','시작 연도','number',this.defaults.start_year??'');field('end_year','종료 연도','number',this.defaults.end_year??'');
            field('path_label','선 위 글씨','text',this.defaults.path_label||'');
            const actions=document.createElement('div');actions.style.cssText='display:flex;flex-wrap:wrap;gap:5px;margin-top:10px';bar.appendChild(actions);
            const button=(label,action)=>{const el=document.createElement('button');el.type='button';el.textContent=label;el.style.cssText='padding:7px;border:1px solid #627384;border-radius:4px;background:#34495e;color:#fff;cursor:pointer';el.onclick=action;actions.appendChild(el);return el;};
            button('↶ 마지막 점 취소',()=>this.undo());button('그리기 완료',()=>this.finish(true)).style.background='#86662b';button('취소',()=>this.finish(false));
            this.status=document.createElement('div');this.status.style.cssText='color:#c8d4df;line-height:1.6;margin-top:9px';this.status.setAttribute('aria-live','polite');bar.appendChild(this.status);
            document.body.appendChild(bar);this.bar=bar;this.setKind(this.kind);
            this.fields.color.oninput=()=>this.refresh();this.fields.line_width.oninput=()=>this.refresh();
        }
        refresh() {
            if (this.closed) return;
            this.map.getSource(this.id)?.setData(this.preview());
            const hint=this.kind==='Rectangle'?'서로 마주 보는 두 모서리를 클릭':this.kind==='Circle'?'중심과 원 둘레를 클릭':this.kind==='Point'?'지도에서 위치를 클릭':'지도를 클릭해 점 추가';
            this.status.textContent=`${hint} · ${this.points.length}개 점\n완료는 Enter/더블클릭 · 취소는 Esc`;
            const color=this.fields?.color?.value||'#53d9ff',width=Number(this.fields?.line_width?.value)||3;
            if(this.map.getLayer(this.id+'-line'))this.map.setPaintProperty?.(this.id+'-line','line-color',color);
            if(this.map.getLayer(this.id+'-fill'))this.map.setPaintProperty?.(this.id+'-fill','fill-color',color);
            if(this.map.getLayer(this.id+'-line'))this.map.setPaintProperty?.(this.id+'-line','line-width',width);
        }
        finish(save) {
            if (this.closed) return;
            if (save) {
                if (!this.allowed()) return;
                const minimum=this.kind==='Point'?1:this.kind==='Polygon'?3:2;
                if (new Set(this.points.map(point=>point.join(','))).size<minimum) {
                    this.status.textContent=`${this.kind==='Polygon'?'영역은':'선은'} 서로 다른 점 ${minimum}개 이상이 필요합니다.`;return;
                }
                const geometry=this.geometry();
                try {
                    validate(geometry);
                    if(this.metadata().type==='arrow'&&geometry.type!=='LineString')throw new Error('화살표는 선으로 그려주세요.');
                    if(['river','wall'].includes(this.metadata().type)&&geometry.type==='Point')throw new Error('강·성곽은 선 또는 영역으로 그려주세요.');
                    this.options.validate?.(geometry);
                } catch(error){this.status.textContent=error.message;return;}
                this.destroy();
                this.options.onFinish?.({ type:'Feature', properties:{}, geometry },this.metadata());
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
    GlobeDrawingTool.validateGeometry=validate;GlobeDrawingTool.circle=circle;
    root.GlobeDrawingTool=GlobeDrawingTool;
})(window);
