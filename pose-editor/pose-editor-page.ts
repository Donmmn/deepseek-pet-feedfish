export function poseEditorHtml(): string {
  return String.raw`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>DeepSeek Token Pet · 骨骼动画参考编辑器</title>
  <style>
    :root{color-scheme:dark;--bg:#0a1020;--panel:#111a31;--line:#35518c;--text:#edf5ff;--muted:#9eb5d8;--accent:#72b4ff;--near:#ff7fa7;--far:#6bbcff}
    *{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 35% 20%,#17264a 0,#0a1020 52%,#070b16 100%);color:var(--text);font:14px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace}
    main{max-width:1220px;margin:auto;padding:20px}.title{display:flex;align-items:end;justify-content:space-between;gap:16px;margin-bottom:14px}.title h1{margin:0;font-size:20px}.title p{margin:0;color:var(--muted)}
    .layout{display:grid;grid-template-columns:minmax(560px,1fr) 420px;gap:16px}.card{border:1px solid var(--line);border-radius:8px;background:rgba(17,26,49,.96);box-shadow:0 12px 35px rgba(0,0,0,.3)}
    .preview-card{padding:14px}.canvas-shell{display:grid;place-items:center;min-height:520px;border:1px solid #243967;border-radius:6px;background-color:#080e1d;background-image:linear-gradient(45deg,#111b31 25%,transparent 25%),linear-gradient(-45deg,#111b31 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#111b31 75%),linear-gradient(-45deg,transparent 75%,#111b31 75%);background-size:24px 24px;background-position:0 0,0 12px,12px -12px,-12px 0}
    canvas{width:min(100%,675px);height:auto;aspect-ratio:135/96;image-rendering:pixelated;cursor:crosshair;touch-action:none}.help{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;color:var(--muted);font-size:12px}.dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px}.dot.near{background:var(--near)}.dot.far{background:var(--far)}
    .controls{padding:12px;max-height:calc(100vh - 40px);overflow:auto}fieldset{margin:0 0 10px;padding:9px;border:1px solid var(--line);border-radius:5px}legend{padding:0 6px;color:#cde4ff}.row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:6px 0}.row>label:first-child{color:var(--muted)}select,input,textarea,button{font:12px ui-monospace,SFMono-Regular,Consolas,monospace}select,input[type=number]{width:132px;height:28px;border:1px solid #4f6fa9;border-radius:3px;background:#091229;color:var(--text);padding:3px 6px}.pose-grid{display:grid;grid-template-columns:1fr 82px;gap:5px 8px;align-items:center}.pose-grid label{color:var(--muted)}.pose-grid input{width:82px}.checks{display:flex;align-items:center;gap:8px}.actions{display:grid;grid-template-columns:1fr 1fr;gap:7px}button{min-height:32px;border:1px solid #6da8ee;border-radius:4px;background:#19376d;color:white;cursor:pointer}button:hover{filter:brightness(1.18)}button:active{transform:translateY(1px)}textarea{width:100%;min-height:164px;resize:vertical;border:1px solid #4f6fa9;border-radius:4px;background:#071024;color:#dcebff;padding:8px;tab-size:2}.status{min-height:20px;margin-top:6px;color:#9fd3ff;font-size:12px}.near-legend{color:var(--near)}.far-legend{color:var(--far)}
    @media(max-width:980px){.layout{grid-template-columns:1fr}.controls{max-height:none}.canvas-shell{min-height:400px}}
  </style>
</head>
<body>
<main>
  <div class="title"><div><h1>骨骼动画参考编辑器</h1><p>拖动控制点，或直接输入数值；所有结果自动保存在此浏览器。</p></div><span style="color:#9fd3ff">SVG 肢体 + PNG 脚掌/鞋面</span></div>
  <div class="layout">
    <section class="card preview-card">
      <div class="canvas-shell"><canvas id="preview" width="135" height="96" aria-label="骨骼姿势预览"></canvas></div>
      <div class="help">
        <span><i class="dot far"></i>人体右腿（画面左）：先绘制，位于较后层</span><span><i class="dot near"></i>人体左腿（画面右）：后绘制，位于较前层</span>
        <span>圆点可拖动髋部位置</span><span>方块依次调整膝、踝、脚尖方向</span>
      </div>
    </section>
    <aside class="card controls">
      <fieldset>
        <legend>预览</legend>
        <div class="row"><label for="style">腿部样式</label><select id="style"><option value="bare">光腿</option><option value="black-stockings">黑丝</option><option value="white-stockings">白丝</option></select></div>
        <div class="row"><label for="footwear">脚部选项</label><select id="footwear"><option value="barefoot">光脚</option><option value="shoes">穿鞋（覆盖层）</option></select></div>
        <div class="row"><label>播放原动画</label><label class="checks"><input id="animate" type="checkbox">启用</label></div>
        <div class="row"><label for="duration">循环时长 (ms)</label><input id="duration" type="number" min="500" max="10000" step="100"></div>
        <div class="row"><label for="amplitude">动画振幅 (%)</label><input id="amplitude" type="number" min="0" max="200" step="5"></div>
        <div class="row"><label>编辑辅助线</label><label class="checks"><input id="show-bones" type="checkbox">显示</label></div>
      </fieldset>
      <fieldset>
        <legend class="far-legend">人体右腿（画面左 / 远端）</legend>
        <div class="pose-grid">
          <label>髋部 X</label><input data-leg="far" data-key="rootX" type="number" step="1">
          <label>髋部 Y</label><input data-leg="far" data-key="rootY" type="number" step="1">
          <label>大腿角度</label><input data-leg="far" data-key="thighAngle" type="number" step="1">
          <label>小腿相对角度</label><input data-leg="far" data-key="calfAngle" type="number" step="1">
          <label>脚相对角度</label><input data-leg="far" data-key="footAngle" type="number" step="1">
          <label>整体缩放</label><input data-leg="far" data-key="scale" type="number" min="0.3" max="1.5" step="0.01">
          <label>透明度</label><input data-leg="far" data-key="alpha" type="number" min="0.2" max="1" step="0.05">
        </div>
      </fieldset>
      <fieldset>
        <legend class="near-legend">人体左腿（画面右 / 近端）</legend>
        <div class="pose-grid">
          <label>髋部 X</label><input data-leg="near" data-key="rootX" type="number" step="1">
          <label>髋部 Y</label><input data-leg="near" data-key="rootY" type="number" step="1">
          <label>大腿角度</label><input data-leg="near" data-key="thighAngle" type="number" step="1">
          <label>小腿相对角度</label><input data-leg="near" data-key="calfAngle" type="number" step="1">
          <label>脚相对角度</label><input data-leg="near" data-key="footAngle" type="number" step="1">
          <label>整体缩放</label><input data-leg="near" data-key="scale" type="number" min="0.3" max="1.5" step="0.01">
          <label>透明度</label><input data-leg="near" data-key="alpha" type="number" min="0.2" max="1" step="0.05">
        </div>
      </fieldset>
      <fieldset>
        <legend>配置交接</legend>
        <textarea id="json" spellcheck="false" aria-label="姿势 JSON"></textarea>
        <div class="actions"><button id="apply-json" type="button">应用 JSON</button><button id="copy-json" type="button">复制 JSON</button><button id="reset" type="button">恢复当前默认</button><button id="pause" type="button">暂停到基准姿势</button></div>
        <div id="status" class="status" aria-live="polite"></div>
      </fieldset>
    </aside>
  </div>
</main>
<script type="module">
const STORAGE_KEY='deepseek-token-pet/pose-editor@3';
const DEFAULT_CONFIG={schema:'deepseek-token-pet/leg-pose@2',style:'white-stockings',footwear:'shoes',showBones:true,animation:{enabled:true,durationMs:3200,amplitudePercent:100},far:{rootX:54,rootY:62.5,thighAngle:12,calfAngle:-173.13,footAngle:-17.48,scale:.74,alpha:.9},near:{rootX:62,rootY:72.1,thighAngle:8,calfAngle:-165,footAngle:14.87,scale:.78,alpha:1}};
const canvas=document.querySelector('#preview');const ctx=canvas.getContext('2d');const jsonBox=document.querySelector('#json');const status=document.querySelector('#status');
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const number=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
const clone=value=>JSON.parse(JSON.stringify(value));
function normalize(source){const value=source&&typeof source==='object'?source:{};const animation=value.animation&&typeof value.animation==='object'?value.animation:{};const current=value.schema==='deepseek-token-pet/leg-pose@2';return{schema:'deepseek-token-pet/leg-pose@2',style:['bare','black-stockings','white-stockings'].includes(value.style)?value.style:'bare',footwear:value.footwear==='barefoot'?'barefoot':'shoes',showBones:value.showBones!==false,animation:{enabled:current?animation.enabled!==false:true,durationMs:clamp(number(animation.durationMs,3200),500,10000),amplitudePercent:clamp(number(animation.amplitudePercent,100),0,200)},far:pose(value.far,DEFAULT_CONFIG.far),near:pose(value.near,DEFAULT_CONFIG.near)}}
function pose(value,fallback){const item=value&&typeof value==='object'?value:{};return{rootX:clamp(number(item.rootX,fallback.rootX),0,135),rootY:clamp(number(item.rootY,fallback.rootY),0,96),thighAngle:angle(number(item.thighAngle,fallback.thighAngle)),calfAngle:angle(number(item.calfAngle,fallback.calfAngle)),footAngle:angle(number(item.footAngle,fallback.footAngle)),scale:clamp(number(item.scale,fallback.scale),.3,1.5),alpha:clamp(number(item.alpha,fallback.alpha),.2,1)}}
function angle(value){let next=value%360;if(next>180)next-=360;if(next<-180)next+=360;return Math.round(next*100)/100}
function loadConfig(){try{const saved=localStorage.getItem(STORAGE_KEY);return saved?normalize(JSON.parse(saved)):clone(DEFAULT_CONFIG)}catch{return clone(DEFAULT_CONFIG)}}
let config=loadConfig();let images={};let drag=null;let lastHandles=[];let loaded=false;
function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify(config));syncForm();if(document.activeElement!==jsonBox)jsonBox.value=JSON.stringify(config,null,2)}
function image(url){return new Promise((resolve,reject)=>{const item=new Image();item.onload=()=>resolve(item);item.onerror=reject;item.src=url})}
async function loadAssets(){loaded=false;const base='/assets/legs/'+config.style+'/';const result=await Promise.all([image(base+'thigh.svg?v=pose-editor-6'),image(base+'calf.svg?v=pose-editor-6'),image(base+'foot-far.png?v=pose-editor-6'),image(base+'foot-near.png?v=pose-editor-6'),image('/assets/legs/shoe-far.png?v=pose-editor-6'),image('/assets/legs/shoe-near.png?v=pose-editor-6'),image('/assets/character-body.png?v=20260819-v9'),image('/assets/character-face-idle.png?v=20260819-v9')]);images={thigh:result[0],calf:result[1],footFar:result[2],footNear:result[3],shoeFar:result[4],shoeNear:result[5],body:result[6],face:result[7]};loaded=true;draw(performance.now())}
function effective(source,name,time){const output={...source};if(config.animation.enabled&&drag===null){const phase=time/config.animation.durationMs*Math.PI*2;const swing=Math.sin(phase)*config.animation.amplitudePercent/100;if(name==='far'){output.calfAngle-=swing*7;output.footAngle+=swing*10}else{output.calfAngle+=swing*8;output.footAngle-=swing*8}}return output}
const radians=degrees=>degrees*Math.PI/180;
function rotate(x,y,degrees){const r=radians(degrees);return{x:x*Math.cos(r)-y*Math.sin(r),y:x*Math.sin(r)+y*Math.cos(r)}}
function points(pose){const thighGlobal=pose.thighAngle;const kneeOffset=rotate(40*pose.scale,0,thighGlobal);const knee={x:pose.rootX+kneeOffset.x,y:pose.rootY+kneeOffset.y};const calfGlobal=thighGlobal+pose.calfAngle;const ankleOffset=rotate(0,46*pose.scale,calfGlobal);const ankle={x:knee.x+ankleOffset.x,y:knee.y+ankleOffset.y};const footGlobal=calfGlobal+pose.footAngle;const toeOffset=rotate(-22*pose.scale,0,footGlobal);return{root:{x:pose.rootX,y:pose.rootY},knee,ankle,toe:{x:ankle.x+toeOffset.x,y:ankle.y+toeOffset.y}}}
function drawLeg(pose,name){const foot=name==='far'?images.footFar:images.footNear;const shoe=name==='far'?images.shoeFar:images.shoeNear;ctx.save();ctx.globalAlpha=pose.alpha;ctx.translate(pose.rootX,pose.rootY);ctx.scale(pose.scale,pose.scale);ctx.rotate(radians(pose.thighAngle));ctx.drawImage(images.thigh,0,-12,46,24);ctx.translate(40,0);ctx.rotate(radians(pose.calfAngle));ctx.drawImage(images.calf,-12,-5,24,54);ctx.translate(0,46);ctx.rotate(radians(pose.footAngle));ctx.globalAlpha=1;ctx.save();ctx.scale(-1,1);if(name==='far')ctx.drawImage(foot,-.5,-9.1,24,19.6);else ctx.drawImage(foot,-.5,-10.08,24,23.52);ctx.restore();if(config.footwear==='shoes'){ctx.save();if(name==='far')ctx.rotate(radians(-3));ctx.scale(-1,1);if(name==='far')ctx.drawImage(shoe,-.5,-10.725,28.6,23.1);else ctx.drawImage(shoe,-.5,-10.627,26.4,25.872);ctx.restore()}ctx.restore()}
function drawBones(poses){lastHandles=[];for(const entry of poses){const p=points(entry.pose);ctx.save();ctx.globalAlpha=.92;ctx.strokeStyle=entry.color;ctx.fillStyle=entry.color;ctx.lineWidth=.65;ctx.beginPath();ctx.moveTo(p.root.x,p.root.y);ctx.lineTo(p.knee.x,p.knee.y);ctx.lineTo(p.ankle.x,p.ankle.y);ctx.lineTo(p.toe.x,p.toe.y);ctx.stroke();for(const key of ['root','knee','ankle','toe']){const point=p[key];ctx.beginPath();if(key==='root'){ctx.arc(point.x,point.y,2.4,0,Math.PI*2);ctx.fill()}else{ctx.fillRect(point.x-2,point.y-2,4,4)}lastHandles.push({leg:entry.name,key,x:point.x,y:point.y,color:entry.color})}ctx.restore()}}
function draw(time){ctx.clearRect(0,0,135,96);if(!loaded)return;ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';const far=effective(config.far,'far',time);const near=effective(config.near,'near',time);drawLeg(far,'far');drawLeg(near,'near');ctx.globalAlpha=1;ctx.drawImage(images.body,0,0,96,96);ctx.drawImage(images.face,0,0,96,96,0,0,96,96);if(config.showBones)drawBones([{name:'far',pose:far,color:'#6bbcff'},{name:'near',pose:near,color:'#ff7fa7'}])}
function frame(time){draw(time);requestAnimationFrame(frame)}
function syncForm(){document.querySelector('#style').value=config.style;document.querySelector('#footwear').value=config.footwear;document.querySelector('#animate').checked=config.animation.enabled;document.querySelector('#duration').value=String(config.animation.durationMs);document.querySelector('#amplitude').value=String(config.animation.amplitudePercent);document.querySelector('#show-bones').checked=config.showBones;for(const input of document.querySelectorAll('[data-leg][data-key]'))input.value=String(config[input.dataset.leg][input.dataset.key])}
function pointer(event){const rect=canvas.getBoundingClientRect();return{x:(event.clientX-rect.left)*135/rect.width,y:(event.clientY-rect.top)*96/rect.height}}
canvas.addEventListener('pointerdown',event=>{const at=pointer(event);const hit=[...lastHandles].reverse().find(item=>Math.hypot(item.x-at.x,item.y-at.y)<=5);if(!hit)return;drag={leg:hit.leg,key:hit.key};canvas.setPointerCapture(event.pointerId);message(config.animation.enabled?'拖动时临时定格；松开后动画会自动继续。':'动画开关当前为关闭。');event.preventDefault()})
canvas.addEventListener('pointermove',event=>{if(!drag)return;const at=pointer(event);const item=config[drag.leg];const p=points(item);if(drag.key==='root'){item.rootX=clamp(Math.round(at.x*10)/10,0,135);item.rootY=clamp(Math.round(at.y*10)/10,0,96)}else if(drag.key==='knee'){item.thighAngle=angle(Math.atan2(at.y-item.rootY,at.x-item.rootX)*180/Math.PI)}else if(drag.key==='ankle'){const global=Math.atan2(at.y-p.knee.y,at.x-p.knee.x)*180/Math.PI-90;item.calfAngle=angle(global-item.thighAngle)}else{const global=Math.atan2(at.y-p.ankle.y,at.x-p.ankle.x)*180/Math.PI;item.footAngle=angle(global-item.thighAngle-item.calfAngle)}save()})
canvas.addEventListener('pointerup',event=>{drag=null;if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);if(config.animation.enabled)message('姿势已保存，动画继续播放。')});canvas.addEventListener('pointercancel',()=>{drag=null})
document.querySelector('#style').addEventListener('change',event=>{config.style=event.target.value;save();loadAssets().catch(showError)});document.querySelector('#footwear').addEventListener('change',event=>{config.footwear=event.target.value;save()});document.querySelector('#animate').addEventListener('change',event=>{config.animation.enabled=event.target.checked;save()});document.querySelector('#duration').addEventListener('input',event=>{config.animation.durationMs=clamp(number(event.target.value,3200),500,10000);save()});document.querySelector('#amplitude').addEventListener('input',event=>{config.animation.amplitudePercent=clamp(number(event.target.value,100),0,200);save()});document.querySelector('#show-bones').addEventListener('change',event=>{config.showBones=event.target.checked;save()});
for(const input of document.querySelectorAll('[data-leg][data-key]'))input.addEventListener('input',event=>{const leg=event.target.dataset.leg;const key=event.target.dataset.key;config[leg][key]=number(event.target.value,config[leg][key]);config=normalize(config);save()})
document.querySelector('#reset').addEventListener('click',()=>{config=clone(DEFAULT_CONFIG);save();loadAssets().catch(showError);message('已恢复当前代码中的默认姿势。')});document.querySelector('#pause').addEventListener('click',()=>{config.animation.enabled=false;save();message('动画已暂停到基准姿势。')});document.querySelector('#apply-json').addEventListener('click',()=>{try{config=normalize(JSON.parse(jsonBox.value));save();loadAssets().catch(showError);message('JSON 已应用。')}catch(error){message('JSON 格式错误：'+error.message)}});document.querySelector('#copy-json').addEventListener('click',async()=>{const value=JSON.stringify(config,null,2);try{await navigator.clipboard.writeText(value);message('配置已复制，可以直接发给开发者。')}catch{jsonBox.focus();jsonBox.select();document.execCommand('copy');message('配置已复制。')}})
function message(value){status.textContent=value}function showError(error){message('素材加载失败：'+String(error))}
syncForm();jsonBox.value=JSON.stringify(config,null,2);loadAssets().then(()=>requestAnimationFrame(frame)).catch(showError);
</script>
</body>
</html>`
}
