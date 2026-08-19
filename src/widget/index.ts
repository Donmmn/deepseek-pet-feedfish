import { TokenPetLedger, petEvent, type PetEventV1, type PetSnapshotV1 } from '../core/index.js'
import type { FoodAssetV1, FoodCatalogV1 } from '../server/food-catalog.js'
import type { InstalledSkinV1, SkinCatalogV1, SkinPackageV1 } from '../server/skin-catalog.js'
import {
  DEFAULT_WIDGET_SETTINGS,
  PET_SETTINGS_STORAGE_KEY,
  cloneWidgetSettings,
  loadWidgetSettings,
  mergeWidgetSettings,
  saveWidgetSettings,
  type PetWidgetSettingsPatch,
  type PetWidgetSettingsV1,
} from './settings.js'

export * from './settings.js'

const HTMLElementBase = (globalThis.HTMLElement ?? class {}) as typeof HTMLElement
const ASSET_REVISION = '20260819-v9'
const PET_WIDTH = 440
const PET_HEIGHT = 370

const styles = String.raw`
:host{--pet-scale:1;--feed-offset-x:0px;--feed-offset-y:0px;--food-distance:68px;--food-half-distance:34px;--button-bg:#16295f;--button-border:#79b8ff;--button-text:#fff;--progress-fill:#4387e7;position:relative;display:block;width:${PET_WIDTH}px;height:${PET_HEIGHT}px;contain:layout paint style;user-select:none;-webkit-user-select:none;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;color:#eef6ff}
*{box-sizing:border-box}.root{position:absolute;left:0;bottom:0;width:${PET_WIDTH}px;height:${PET_HEIGHT}px;overflow:hidden;transform:scale(var(--pet-scale));transform-origin:left bottom;image-rendering:pixelated;filter:drop-shadow(0 3px 0 rgba(8,18,58,.32))}
.stage{position:absolute;inset:0 0 30px 0}.character{position:absolute;right:120px;bottom:-28px;width:256px;height:256px;image-rendering:pixelated;z-index:2}
.character-layer{position:absolute;inset:0;width:256px;height:256px;background-repeat:no-repeat;background-position:0 0;image-rendering:pixelated}.appendage-canvas{position:absolute;left:0;top:0;width:360px;height:256px;z-index:0;image-rendering:pixelated}.appendage-canvas[hidden]{display:none}.character-body{z-index:1;background-size:100% 100%}.character-face{z-index:2;background-size:400% 100%}
.character-layer[data-frame="0"]{background-position:0 0}.character-layer[data-frame="1"]{background-position:33.333% 0}.character-layer[data-frame="2"]{background-position:66.666% 0}.character-layer[data-frame="3"]{background-position:100% 0}
.character.error{filter:saturate(.3) brightness(.85)}
.queue{position:absolute;left:calc(116px + var(--feed-offset-x) - var(--food-distance));bottom:calc(40px - var(--feed-offset-y));width:260px;height:64px;z-index:4;pointer-events:none}.bowl{position:absolute;width:64px;height:64px;background-repeat:no-repeat;background-size:100% 100%;background-position:0 0;image-rendering:pixelated;filter:drop-shadow(0 2px 0 rgba(8,18,58,.22))}.bowl.waiting{left:calc(var(--slot)*52px);opacity:calc(1 - var(--slot)*.1)}
.bowl.eating{left:0;animation:eatPath var(--eat-ms,900ms) linear forwards}.overflow{position:absolute;left:8px;bottom:52px;padding:2px 5px;background:#16295f;border:2px solid #79b8ff;border-radius:2px;color:white;font-size:11px;z-index:4}
.hud{position:absolute;right:164px;bottom:4px;width:174px;height:25px;display:flex;align-items:center;gap:8px;padding:3px 7px;background:rgba(11,25,65,.9);border:2px solid #6faeff;border-radius:3px;box-shadow:inset 0 0 0 2px #263f86;font-size:12px;line-height:1;z-index:5}.meter{height:9px;flex:0 0 104px;background:#071331;border:1px solid #94c8ff;padding:1px}.fill{height:100%;width:calc(var(--progress)*100%);background:var(--progress-fill);transition:width .25s steps(8,end)}.bowl-count{margin-left:auto;white-space:nowrap}
.settings-toggle,.manual-feed,.resize-handle,.settings-close,.reset-settings,.skin-action{padding:0;border:2px solid var(--button-border);border-radius:3px;background:var(--button-bg);color:var(--button-text);box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--button-border) 35%,transparent);cursor:pointer;image-rendering:pixelated;-webkit-app-region:no-drag}.settings-toggle:hover,.manual-feed:hover,.resize-handle:hover,.settings-close:hover,.reset-settings:hover,.skin-action:hover{filter:brightness(1.25)}.settings-toggle:active,.manual-feed:active,.resize-handle:active,.reset-settings:active,.skin-action:active{transform:translateY(1px)}
.settings-toggle{position:absolute;right:346px;bottom:4px;width:25px;height:25px;font:15px/20px sans-serif;z-index:20}.manual-feed{position:absolute;right:94px;bottom:4px;width:62px;height:25px;font:12px/20px ui-monospace,SFMono-Regular,Consolas,monospace;z-index:6}.resize-handle{position:absolute;right:61px;bottom:4px;width:25px;height:25px;font:16px/20px monospace;cursor:nwse-resize;z-index:20;touch-action:none}.resize-handle::before{content:'↘';display:block;transform:translateY(-1px)}
.settings-panel{position:absolute;right:8px;bottom:36px;width:286px;max-height:326px;overflow:auto;padding:7px 8px 8px;border:2px solid var(--button-border);border-radius:4px;background:rgba(8,18,48,.97);color:var(--button-text);box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--button-border) 28%,transparent),0 3px 0 rgba(3,8,25,.45);font:10px/1.25 ui-monospace,SFMono-Regular,Consolas,monospace;z-index:40;image-rendering:auto;-webkit-app-region:no-drag;scrollbar-width:thin;scrollbar-color:var(--progress-fill) var(--button-bg)}.settings-panel::-webkit-scrollbar{width:9px}.settings-panel::-webkit-scrollbar-track{background:var(--button-bg);border-left:1px solid var(--button-border)}.settings-panel::-webkit-scrollbar-thumb{min-height:24px;border:2px solid var(--button-bg);border-radius:3px;background:var(--progress-fill);box-shadow:inset 0 0 0 1px var(--button-border)}.settings-panel::-webkit-scrollbar-thumb:hover{background:color-mix(in srgb,var(--progress-fill) 78%,white)}.settings-panel::-webkit-scrollbar-corner{background:var(--button-bg)}.settings-panel[hidden],.feed-target-marker[hidden],.feed-flight-guide[hidden],.leg-setting[hidden]{display:none}.settings-header{height:22px;display:flex;align-items:center;justify-content:space-between;padding-left:2px;font-size:12px}.settings-close{width:21px;height:21px;font:14px/16px monospace}.settings-panel fieldset{margin:3px 0 5px;padding:4px 6px 5px;border:1px solid var(--button-border)}.settings-panel legend{padding:0 4px;color:var(--button-text)}.setting-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}.setting-grid.theme{grid-template-columns:repeat(2,1fr)}.setting-row{display:flex;align-items:center;justify-content:space-between;gap:5px;margin:4px 0}.setting-grid label{display:flex;flex-direction:column;align-items:stretch;gap:2px;white-space:nowrap}.setting-grid.theme label{display:grid;grid-template-columns:1fr 30px;align-items:center;gap:3px}.settings-panel input[type=number],.settings-panel select{min-width:0;width:100%;height:19px;padding:1px 2px;border:1px solid var(--button-border);background:#071331;color:var(--button-text);font:10px monospace}.setting-row input[type=number]{width:48px}.setting-row select{width:132px}.settings-panel input[type=color]{width:30px;height:20px;padding:1px;border:1px solid var(--button-border);background:#071331}.settings-hint{margin:3px 0 0;color:#b9d9ff}.skin-actions,.settings-actions{display:flex;align-items:center;justify-content:flex-end;gap:5px}.skin-action,.reset-settings{height:23px;padding:0 8px;font:10px/18px ui-monospace,SFMono-Regular,Consolas,monospace}.skin-status{min-height:12px;margin:3px 0 0;color:#b9d9ff;overflow-wrap:anywhere}
.feed-flight-guide{position:absolute;left:calc(148px + var(--feed-offset-x) - var(--food-distance));bottom:calc(102px - var(--feed-offset-y));width:var(--food-distance);height:0;border-top:2px dashed #ff5b72;z-index:34;pointer-events:none}.feed-flight-guide::before{content:'';position:absolute;left:-3px;top:-4px;width:6px;height:6px;border:1px solid #fff;background:#ff304c}.feed-distance-label{position:absolute;left:50%;top:-15px;transform:translateX(-50%);padding:1px 3px;background:#81162b;color:#fff;white-space:nowrap;font:9px/11px monospace}.feed-target-marker{position:absolute;left:calc(148px + var(--feed-offset-x));bottom:calc(102px - var(--feed-offset-y));width:19px;height:19px;transform:translate(-50%,50%);border:1px solid #fff;background:rgba(255,48,76,.25);z-index:35;pointer-events:none}.feed-target-marker::before,.feed-target-marker::after{content:'';position:absolute;background:#ff304c}.feed-target-marker::before{left:8px;top:-5px;width:2px;height:27px}.feed-target-marker::after{left:-5px;top:8px;width:27px;height:2px}.feed-target-label{position:absolute;right:13px;top:-13px;padding:1px 3px;background:#81162b;color:#fff;white-space:nowrap;font:9px/11px monospace}
@keyframes eatPath{0%{transform:translate(0,0);opacity:1}45%{transform:translate(var(--food-half-distance),0);opacity:1}89%{transform:translate(var(--food-distance),0);opacity:1}89.1%,100%{transform:translate(var(--food-distance),0);opacity:0}}
@media (prefers-reduced-motion:reduce){.bowl.eating{animation-duration:1ms}}
`

const settingsMarkup = String.raw`
<button class="settings-toggle" type="button" aria-label="打开桌宠设置" aria-expanded="false" title="桌宠设置">⚙</button>
<div class="settings-panel" role="dialog" aria-label="桌宠设置" hidden>
  <div class="settings-header"><strong>桌宠设置</strong><button class="settings-close" type="button" aria-label="关闭设置">×</button></div>
  <fieldset>
    <legend>投喂消失点</legend>
    <div class="setting-grid">
      <label>X 偏移 <input type="number" min="-120" max="120" step="1" data-setting="feed.offsetX"></label>
      <label>Y 偏移 <input type="number" min="-120" max="120" step="1" data-setting="feed.offsetY"></label>
      <label>飞行距离 <input type="number" min="20" max="180" step="1" data-setting="feed.distance"></label>
    </div>
    <p class="settings-hint">红色十字是食物消失位置，单位为像素。</p>
  </fieldset>
  <div class="setting-row"><label for="pet-initial-scale">初始化尺寸</label><span><input id="pet-initial-scale" type="number" min="60" max="200" step="5" data-setting="initialScalePercent">%</span></div>
  <fieldset>
    <legend>模块化皮肤</legend>
    <div class="setting-row"><label for="appendage-mode">下身形态</label><select id="appendage-mode" data-setting="appendageMode"><option value="tail">鲸尾</option><option value="legs">腿</option></select></div>
    <div class="setting-row leg-setting" data-leg-setting hidden><label for="leg-style">腿部样式</label><select id="leg-style" data-setting="legStyle"><option value="bare">光腿</option><option value="black-stockings">黑丝</option><option value="white-stockings">白丝</option></select></div>
    <div class="setting-row leg-setting" data-leg-setting hidden><label for="leg-footwear">脚部选项</label><select id="leg-footwear" data-setting="legFootwear"><option value="barefoot">光脚</option><option value="shoes">穿鞋</option></select></div>
    <div class="setting-row"><label for="active-skin">当前皮肤</label><select id="active-skin" data-setting="activeSkinId"><option value="">默认素材</option></select></div>
    <div class="setting-row"><label for="skin-package">待安装 ZIP</label><select id="skin-package" data-role="skin-package"><option value="">未发现皮肤包</option></select></div>
    <div class="skin-actions"><button class="skin-action scan-skins" type="button">重新扫描</button><button class="skin-action install-skin" type="button">安装并启用</button></div>
    <p class="skin-status" aria-live="polite"></p>
  </fieldset>
  <fieldset>
    <legend>按钮主题色</legend>
    <div class="setting-grid theme">
      <label>按钮背景 <input type="color" data-setting="theme.buttonBackground"></label>
      <label>按钮边框 <input type="color" data-setting="theme.buttonBorder"></label>
      <label>按钮字体 <input type="color" data-setting="theme.buttonText"></label>
      <label>进度填充 <input type="color" data-setting="theme.progressFill"></label>
    </div>
  </fieldset>
  <div class="settings-actions"><button class="reset-settings" type="button">恢复默认</button></div>
</div>
<div class="feed-flight-guide" aria-hidden="true" hidden><span class="feed-distance-label">68px</span></div>
<div class="feed-target-marker" aria-hidden="true" hidden><span class="feed-target-label">消失点</span></div>
`

export class DeepseekTokenPetElement extends HTMLElementBase {
  private readonly ledger = new TokenPetLedger()
  private snapshotValue = this.ledger.snapshot()
  private rootNode: ShadowRoot | undefined
  private character: HTMLElement | undefined
  private bodyLayer: HTMLElement | undefined
  private faceLayer: HTMLElement | undefined
  private tailCanvas: HTMLCanvasElement | undefined
  private tailContext: CanvasRenderingContext2D | undefined
  private legsCanvas: HTMLCanvasElement | undefined
  private legsContext: CanvasRenderingContext2D | undefined
  private legImages: LegImages | undefined
  private legLoadRevision = 0
  private idleFaceUrl = ''
  private feedFaceUrl = ''
  private queue: HTMLElement | undefined
  private fill: HTMLElement | undefined
  private bowlCountLabel: HTMLElement | undefined
  private stream: EventSource | undefined
  private animating = false
  private manualFeeds = 0
  private foods: FoodAssetV1[] = []
  private lastObservedTotal = 0
  private readonly usageBursts: Array<{ at: number, tokens: number }> = []
  private tailDurationMs = 3200
  private tailPhase = 0
  private tailLastFrame = 0
  private tailFrame: number | undefined
  private rateTimer: ReturnType<typeof setInterval> | undefined
  private blinkTimer: ReturnType<typeof setTimeout> | undefined
  private blinkSteps: Array<ReturnType<typeof setTimeout>> = []
  private idleRunning = false
  private scaleValue = 1
  private resizeHandle: HTMLButtonElement | undefined
  private resizeStart: { x: number, y: number, scale: number } | undefined
  private settingsValue = loadWidgetSettings()
  private skinCatalog: SkinCatalogV1 = { schema: 'deepseek-token-pet/skins@1', packages: [], installed: [] }
  private settingsPanel: HTMLElement | undefined
  private settingsToggle: HTMLButtonElement | undefined
  private feedTargetMarker: HTMLElement | undefined
  private feedFlightGuide: HTMLElement | undefined
  private feedDistanceLabel: HTMLElement | undefined
  private readonly storageListener = (event: StorageEvent): void => {
    if (event.key !== PET_SETTINGS_STORAGE_KEY) return
    this.settingsValue = loadWidgetSettings()
    this.applySettings(true)
    this.applyAssets()
    this.setScale(this.settingsValue.initialScalePercent / 100)
  }

  static get observedAttributes(): string[] { return ['endpoint', 'asset-base', 'scale'] }

  connectedCallback(): void {
    if (this.rootNode === undefined) this.mount()
    globalThis.addEventListener?.('storage', this.storageListener)
    this.startIdleAnimations()
    void this.connectEndpoint()
  }

  disconnectedCallback(): void {
    this.stream?.close()
    globalThis.removeEventListener?.('storage', this.storageListener)
    this.stopIdleAnimations()
  }
  attributeChangedCallback(name: string): void {
    if (!this.isConnected) return
    if (name === 'scale') { this.applyScale(); return }
    this.applyAssets()
    void this.connectEndpoint()
  }

  dispatchPetEvent(event: PetEventV1): PetSnapshotV1 {
    const result = this.ledger.ingest(event)
    this.setState(result.snapshot)
    return result.snapshot
  }

  addTokens(tokens: number, source = 'embedded-client'): PetSnapshotV1 {
    return this.dispatchPetEvent(petEvent({
      type: 'usage', mode: 'delta', source,
      usage: { inputTokens: tokens, outputTokens: 0 },
    }))
  }

  feedOnce(): void {
    this.manualFeeds += 1
    void this.pumpBowls()
  }

  setScale(scale: number): void {
    const next = Math.min(2, Math.max(.6, Number.isFinite(scale) ? scale : 1))
    this.setAttribute('scale', next.toFixed(3))
    if (!this.isConnected) this.applyScale(next)
  }

  get settings(): PetWidgetSettingsV1 { return cloneWidgetSettings(this.settingsValue) }

  updateSettings(patch: PetWidgetSettingsPatch): PetWidgetSettingsV1 {
    const feedChanged = patch.feed !== undefined
    const scaleChanged = patch.initialScalePercent !== undefined
    const assetsChanged = patch.appendageMode !== undefined || patch.legStyle !== undefined || patch.legFootwear !== undefined || patch.activeSkinId !== undefined
    this.settingsValue = mergeWidgetSettings(this.settingsValue, patch)
    saveWidgetSettings(this.settingsValue)
    this.applySettings(feedChanged)
    if (assetsChanged) this.applyAssets()
    if (scaleChanged) this.setScale(this.settingsValue.initialScalePercent / 100)
    this.dispatchSettingsChange()
    return this.settings
  }

  resetSettings(): PetWidgetSettingsV1 {
    this.settingsValue = cloneWidgetSettings(DEFAULT_WIDGET_SETTINGS)
    saveWidgetSettings(this.settingsValue)
    this.applySettings(true)
    this.applyAssets()
    this.setScale(this.settingsValue.initialScalePercent / 100)
    this.dispatchSettingsChange()
    return this.settings
  }

  setState(snapshot: PetSnapshotV1, trackUsage = true): void {
    if (snapshot.revision < this.snapshotValue.revision) return
    const tokenDelta = snapshot.totalTokens - this.lastObservedTotal
    this.lastObservedTotal = snapshot.totalTokens
    if (trackUsage && tokenDelta > 0) this.usageBursts.push({ at: Date.now(), tokens: tokenDelta })
    this.updateTailSpeed()
    this.snapshotValue = snapshot
    this.renderState()
    void this.pumpBowls()
  }

  get state(): PetSnapshotV1 { return this.snapshotValue }

  private mount(): void {
    this.rootNode = this.attachShadow({ mode: 'open' })
    this.rootNode.innerHTML = `<style>${styles}</style><div class="root"><div class="stage"><div class="queue"></div><div class="character"><canvas class="appendage-canvas tail-canvas" width="135" height="96" data-joints="6" data-resample="2.667" data-root-width="84" data-tip-width="32"></canvas><canvas class="appendage-canvas legs-canvas" width="135" height="96" data-bones-per-leg="2" data-resample="2.667" data-static-pose="false" data-animation="alternating" hidden></canvas><div class="character-layer character-body"></div><div class="character-layer character-face" data-frame="0" data-expression="idle"></div></div></div><div class="hud"><div class="meter" title="下一碗饭进度"><div class="fill"></div></div><span class="bowl-count"></span></div><button class="manual-feed" type="button" title="只播放动画，不增加 token">喂饭</button><button class="resize-handle" type="button" aria-label="拖动缩放" title="拖动缩放"></button>${settingsMarkup}</div>`
    this.character = this.rootNode.querySelector<HTMLElement>('.character') ?? undefined
    this.bodyLayer = this.rootNode.querySelector<HTMLElement>('.character-body') ?? undefined
    this.faceLayer = this.rootNode.querySelector<HTMLElement>('.character-face') ?? undefined
    this.tailCanvas = this.rootNode.querySelector<HTMLCanvasElement>('.tail-canvas') ?? undefined
    if (this.tailCanvas !== undefined && globalThis.CanvasRenderingContext2D !== undefined) this.tailContext = this.tailCanvas.getContext('2d') ?? undefined
    this.legsCanvas = this.rootNode.querySelector<HTMLCanvasElement>('.legs-canvas') ?? undefined
    if (this.legsCanvas !== undefined && globalThis.CanvasRenderingContext2D !== undefined) this.legsContext = this.legsCanvas.getContext('2d') ?? undefined
    this.queue = this.rootNode.querySelector<HTMLElement>('.queue') ?? undefined
    this.fill = this.rootNode.querySelector<HTMLElement>('.fill') ?? undefined
    this.bowlCountLabel = this.rootNode.querySelector<HTMLElement>('.bowl-count') ?? undefined
    this.resizeHandle = this.rootNode.querySelector<HTMLButtonElement>('.resize-handle') ?? undefined
    this.settingsPanel = this.rootNode.querySelector<HTMLElement>('.settings-panel') ?? undefined
    this.settingsToggle = this.rootNode.querySelector<HTMLButtonElement>('.settings-toggle') ?? undefined
    this.feedTargetMarker = this.rootNode.querySelector<HTMLElement>('.feed-target-marker') ?? undefined
    this.feedFlightGuide = this.rootNode.querySelector<HTMLElement>('.feed-flight-guide') ?? undefined
    this.feedDistanceLabel = this.rootNode.querySelector<HTMLElement>('.feed-distance-label') ?? undefined
    this.rootNode.querySelector<HTMLButtonElement>('.manual-feed')?.addEventListener('click', () => this.feedOnce())
    this.settingsToggle?.addEventListener('click', () => this.toggleSettings())
    this.rootNode.querySelector<HTMLButtonElement>('.settings-close')?.addEventListener('click', () => this.toggleSettings(false))
    this.rootNode.querySelector<HTMLButtonElement>('.reset-settings')?.addEventListener('click', () => this.resetSettings())
    this.settingsPanel?.addEventListener('input', event => this.handleSettingsInput(event))
    this.settingsPanel?.addEventListener('change', event => this.handleSettingsInput(event))
    this.rootNode.querySelector<HTMLButtonElement>('.scan-skins')?.addEventListener('click', () => { void this.loadSkins(this.endpoint(), true) })
    this.rootNode.querySelector<HTMLButtonElement>('.install-skin')?.addEventListener('click', () => { void this.installSelectedSkin() })
    this.resizeHandle?.addEventListener('pointerdown', event => this.beginResize(event))
    this.resizeHandle?.addEventListener('pointermove', event => this.resizeFromPointer(event))
    this.resizeHandle?.addEventListener('pointerup', event => this.endResize(event))
    this.resizeHandle?.addEventListener('pointercancel', event => this.endResize(event))
    this.lastObservedTotal = this.snapshotValue.totalTokens
    this.applyAssets()
    this.updateTailSpeed()
    this.drawAppendage()
    this.renderState()
    this.applySettings()
    this.applyScale(this.hasAttribute('scale') ? Number(this.getAttribute('scale')) : this.settingsValue.initialScalePercent / 100)
  }

  private toggleSettings(force?: boolean): void {
    if (this.settingsPanel === undefined) return
    const open = force ?? this.settingsPanel.hidden
    this.settingsPanel.hidden = !open
    if (this.feedTargetMarker !== undefined) this.feedTargetMarker.hidden = !open
    if (this.feedFlightGuide !== undefined) this.feedFlightGuide.hidden = !open
    this.settingsToggle?.setAttribute('aria-expanded', String(open))
    if (open) {
      this.syncSettingsForm()
      void this.loadSkins(this.endpoint())
    }
  }

  private handleSettingsInput(event: Event): void {
    const control = event.target
    if (!(control instanceof HTMLInputElement) && !(control instanceof HTMLSelectElement)) return
    const setting = control.dataset.setting
    if (setting === undefined) return
    const numericValue = control instanceof HTMLInputElement && control.type === 'number' ? control.valueAsNumber : undefined
    if (control instanceof HTMLInputElement && control.type === 'number' && !Number.isFinite(numericValue)) return
    switch (setting) {
      case 'feed.offsetX': this.updateSettings({ feed: { offsetX: numericValue as number } }); break
      case 'feed.offsetY': this.updateSettings({ feed: { offsetY: numericValue as number } }); break
      case 'feed.distance': this.updateSettings({ feed: { distance: numericValue as number } }); break
      case 'initialScalePercent': this.updateSettings({ initialScalePercent: numericValue as number }); break
      case 'appendageMode': if (control.value === 'tail' || control.value === 'legs') this.updateSettings({ appendageMode: control.value }); break
      case 'legStyle': if (control.value === 'bare' || control.value === 'black-stockings' || control.value === 'white-stockings') this.updateSettings({ legStyle: control.value }); break
      case 'legFootwear': if (control.value === 'barefoot' || control.value === 'shoes') this.updateSettings({ legFootwear: control.value }); break
      case 'activeSkinId': this.updateSettings({ activeSkinId: control.value }); break
      case 'theme.buttonBackground': this.updateSettings({ theme: { buttonBackground: control.value } }); break
      case 'theme.buttonBorder': this.updateSettings({ theme: { buttonBorder: control.value } }); break
      case 'theme.buttonText': this.updateSettings({ theme: { buttonText: control.value } }); break
      case 'theme.progressFill': this.updateSettings({ theme: { progressFill: control.value } }); break
    }
  }

  private applySettings(reloadFoodAnimation = false): void {
    const { feed, theme } = this.settingsValue
    this.style.setProperty('--feed-offset-x', `${feed.offsetX}px`)
    this.style.setProperty('--feed-offset-y', `${feed.offsetY}px`)
    this.style.setProperty('--food-distance', `${feed.distance}px`)
    this.style.setProperty('--food-half-distance', `${feed.distance / 2}px`)
    this.style.setProperty('--button-bg', theme.buttonBackground)
    this.style.setProperty('--button-border', theme.buttonBorder)
    this.style.setProperty('--button-text', theme.buttonText)
    this.style.setProperty('--progress-fill', theme.progressFill)
    if (this.feedDistanceLabel !== undefined) this.feedDistanceLabel.textContent = `${feed.distance}px`
    if (this.tailCanvas !== undefined) this.tailCanvas.hidden = this.settingsValue.appendageMode !== 'tail'
    if (this.legsCanvas !== undefined) {
      this.legsCanvas.hidden = this.settingsValue.appendageMode !== 'legs'
      this.legsCanvas.dataset.legStyle = this.settingsValue.legStyle
      this.legsCanvas.dataset.footwear = this.settingsValue.legFootwear
      this.legsCanvas.dataset.skinId = this.settingsValue.activeSkinId
    }
    for (const row of this.settingsPanel?.querySelectorAll<HTMLElement>('[data-leg-setting]') ?? []) {
      row.hidden = this.settingsValue.appendageMode !== 'legs'
    }
    this.syncSettingsForm()
    if (reloadFoodAnimation) this.reloadFoodAnimation()
  }

  private syncSettingsForm(): void {
    if (this.settingsPanel === undefined) return
    const values: Record<string, string> = {
      'feed.offsetX': String(this.settingsValue.feed.offsetX),
      'feed.offsetY': String(this.settingsValue.feed.offsetY),
      'feed.distance': String(this.settingsValue.feed.distance),
      initialScalePercent: String(this.settingsValue.initialScalePercent),
      appendageMode: this.settingsValue.appendageMode,
      legStyle: this.settingsValue.legStyle,
      legFootwear: this.settingsValue.legFootwear,
      activeSkinId: this.settingsValue.activeSkinId,
      'theme.buttonBackground': this.settingsValue.theme.buttonBackground,
      'theme.buttonBorder': this.settingsValue.theme.buttonBorder,
      'theme.buttonText': this.settingsValue.theme.buttonText,
      'theme.progressFill': this.settingsValue.theme.progressFill,
    }
    for (const input of this.settingsPanel.querySelectorAll<HTMLInputElement>('input[data-setting]')) {
      const value = values[input.dataset.setting ?? '']
      if (value !== undefined && input.value !== value) input.value = value
    }
    for (const select of this.settingsPanel.querySelectorAll<HTMLSelectElement>('select[data-setting]')) {
      const value = values[select.dataset.setting ?? '']
      if (value !== undefined && select.value !== value) select.value = value
    }
    this.renderSkinOptions()
  }

  private reloadFoodAnimation(): void {
    const bowl = this.queue?.querySelector<HTMLElement>('.bowl.eating')
    if (bowl === null || bowl === undefined) return
    bowl.style.animation = 'none'
    void bowl.offsetWidth
    bowl.style.removeProperty('animation')
    bowl.dataset.animationReloaded = 'true'
  }

  private dispatchSettingsChange(): void {
    this.dispatchEvent(new CustomEvent('pet-settings-change', {
      detail: this.settings,
      bubbles: true,
      composed: true,
    }))
  }

  private applyScale(value = Number(this.getAttribute('scale') ?? 1)): void {
    this.scaleValue = Math.min(2, Math.max(.6, Number.isFinite(value) ? value : 1))
    this.style.setProperty('--pet-scale', String(this.scaleValue))
    const width = Math.round(PET_WIDTH * this.scaleValue)
    const height = Math.round(PET_HEIGHT * this.scaleValue)
    this.style.width = `${width}px`
    this.style.height = `${height}px`
    this.dispatchEvent(new CustomEvent('pet-resize', { detail: { scale: this.scaleValue, width, height }, bubbles: true, composed: true }))
  }

  private beginResize(event: PointerEvent): void {
    this.resizeStart = { x: event.clientX, y: event.clientY, scale: this.scaleValue }
    this.resizeHandle?.setPointerCapture?.(event.pointerId)
    event.preventDefault()
  }

  private resizeFromPointer(event: PointerEvent): void {
    if (this.resizeStart === undefined) return
    const deltaX = event.clientX - this.resizeStart.x
    const deltaY = event.clientY - this.resizeStart.y
    const delta = (deltaX * PET_WIDTH + deltaY * PET_HEIGHT) / (PET_WIDTH * PET_WIDTH + PET_HEIGHT * PET_HEIGHT)
    this.setScale(this.resizeStart.scale + delta)
  }

  private endResize(event: PointerEvent): void {
    if (this.resizeStart === undefined) return
    this.resizeStart = undefined
    if (this.resizeHandle?.hasPointerCapture?.(event.pointerId)) this.resizeHandle.releasePointerCapture(event.pointerId)
    const initialScalePercent = Math.round(this.scaleValue * 100)
    if (initialScalePercent !== this.settingsValue.initialScalePercent) this.updateSettings({ initialScalePercent })
  }

  private applyAssets(): void {
    const base = (this.getAttribute('asset-base') ?? '/assets').replace(/\/$/, '')
    const skin = this.activeSkin()
    this.idleFaceUrl = this.skinAssetUrl(skin?.assetUrls.faceIdle) ?? versionAsset(`${base}/character-face-idle.png`)
    this.feedFaceUrl = this.skinAssetUrl(skin?.assetUrls.faceFeed) ?? versionAsset(`${base}/character-face-feed.png`)
    const bodyUrl = this.skinAssetUrl(skin?.assetUrls.body) ?? versionAsset(`${base}/character-body.png`)
    if (this.bodyLayer !== undefined) this.bodyLayer.style.backgroundImage = `url(${JSON.stringify(bodyUrl)})`
    this.setFaceMode('idle', 0)
    void this.loadLegImages(skin)
  }

  private activeSkin(): InstalledSkinV1 | undefined {
    return this.skinCatalog.installed.find(skin => skin.id === this.settingsValue.activeSkinId)
  }

  private skinAssetUrl(path: string | undefined): string | undefined {
    if (path === undefined) return undefined
    const endpoint = this.endpoint()
    if (endpoint === undefined) return undefined
    return versionAsset(new URL(path, `${endpoint}/`).href)
  }

  private async loadLegImages(skin = this.activeSkin()): Promise<void> {
    if (typeof Image === 'undefined') return
    const revision = ++this.legLoadRevision
    const base = (this.getAttribute('asset-base') ?? '/assets').replace(/\/$/, '')
    const style = this.settingsValue.legStyle
    const builtIn = (part: keyof LegImages): string => {
      if (part === 'shoeFar') return versionAsset(`${base}/legs/shoe-far.png`)
      if (part === 'shoeNear') return versionAsset(`${base}/legs/shoe-near.png`)
      if (part === 'footFar') return versionAsset(`${base}/legs/${style}/foot-far.png`)
      if (part === 'footNear') return versionAsset(`${base}/legs/${style}/foot-near.png`)
      return versionAsset(`${base}/legs/${style}/${part}.svg`)
    }
    const requested = (part: keyof LegImages): string => {
      const shared = part === 'footFar' || part === 'footNear' ? skin?.assetUrls.foot : part === 'shoeFar' || part === 'shoeNear' ? skin?.assetUrls.shoe : undefined
      return this.skinAssetUrl(skin?.assetUrls[part] ?? shared) ?? builtIn(part)
    }
    try {
      const entries = await Promise.all((['thigh', 'calf', 'footFar', 'footNear', 'shoeFar', 'shoeNear'] as const).map(async part => [part, await loadImageWithFallback(requested(part), builtIn(part))] as const))
      if (revision !== this.legLoadRevision) return
      this.legImages = Object.fromEntries(entries) as unknown as LegImages
      this.drawAppendage()
    } catch {
      if (revision === this.legLoadRevision) this.legImages = undefined
    }
  }

  private async loadSkins(endpoint: string | undefined, report = false): Promise<void> {
    if (endpoint === undefined) {
      this.skinCatalog = { schema: 'deepseek-token-pet/skins@1', packages: [], installed: [] }
      this.renderSkinOptions()
      if (report) this.setSkinStatus('独立嵌入模式无法扫描本地 skin 目录。')
      return
    }
    try {
      const response = await fetch(`${endpoint}/v1/skins`, { cache: 'no-store' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const catalog = await response.json() as SkinCatalogV1
      if (catalog.schema !== 'deepseek-token-pet/skins@1') throw new Error('皮肤目录格式不受支持')
      this.skinCatalog = catalog
      this.renderSkinOptions()
      this.applyAssets()
      if (report) this.setSkinStatus(`发现 ${catalog.packages.length} 个 ZIP，已安装 ${catalog.installed.length} 个皮肤。`)
    } catch (error) {
      if (report) this.setSkinStatus(`扫描失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private renderSkinOptions(): void {
    const installed = this.settingsPanel?.querySelector<HTMLSelectElement>('select[data-setting="activeSkinId"]')
    if (installed !== null && installed !== undefined) {
      const options = [new Option('默认素材', '')]
      for (const skin of this.skinCatalog.installed) options.push(new Option(`${skin.name} (${skin.version})`, skin.id))
      installed.replaceChildren(...options)
      installed.value = this.settingsValue.activeSkinId
    }
    const packages = this.settingsPanel?.querySelector<HTMLSelectElement>('select[data-role="skin-package"]')
    if (packages !== null && packages !== undefined) {
      const valid = this.skinCatalog.packages.filter((entry): entry is SkinPackageV1 & { manifest: NonNullable<SkinPackageV1['manifest']> } => entry.manifest !== undefined)
      const options = valid.length === 0 ? [new Option('未发现有效皮肤包', '')] : valid.map(entry => new Option(`${entry.manifest.name} · ${entry.file}`, entry.file))
      packages.replaceChildren(...options)
    }
  }

  private async installSelectedSkin(): Promise<void> {
    const endpoint = this.endpoint()
    const packageSelect = this.settingsPanel?.querySelector<HTMLSelectElement>('select[data-role="skin-package"]')
    if (endpoint === undefined || packageSelect === null || packageSelect === undefined || packageSelect.value === '') {
      this.setSkinStatus('请先把有效 ZIP 放进 skin 目录并重新扫描。')
      return
    }
    this.setSkinStatus('正在安装皮肤…')
    try {
      const response = await fetch(`${endpoint}/v1/skins/install`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ file: packageSelect.value }) })
      const result = await response.json() as { installed?: InstalledSkinV1, catalog?: SkinCatalogV1, error?: string }
      if (!response.ok || result.installed === undefined || result.catalog === undefined) throw new Error(result.error ?? `HTTP ${response.status}`)
      this.skinCatalog = result.catalog
      const patch: PetWidgetSettingsPatch = { activeSkinId: result.installed.id }
      if (result.installed.appendageMode !== undefined) patch.appendageMode = result.installed.appendageMode
      if (result.installed.legStyle !== undefined) patch.legStyle = result.installed.legStyle
      this.updateSettings(patch)
      this.renderSkinOptions()
      this.setSkinStatus(`已安装并启用：${result.installed.name}`)
    } catch (error) {
      this.setSkinStatus(`安装失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private setSkinStatus(message: string): void {
    const status = this.settingsPanel?.querySelector<HTMLElement>('.skin-status')
    if (status !== null && status !== undefined) status.textContent = message
  }

  private renderState(): void {
    const state = this.snapshotValue
    this.style.setProperty('--progress', String(state.nextBowlProgress))
    if (this.fill !== undefined) this.fill.style.setProperty('--progress', String(state.nextBowlProgress))
    if (this.bowlCountLabel !== undefined) this.bowlCountLabel.textContent = `${state.earnedBowls} 🍚`
    if (this.character !== undefined) {
      this.character.className = `character ${state.activity}${this.animating ? ' feeding' : ''}`
    }
    this.renderQueue()
  }

  private renderQueue(): void {
    if (this.queue === undefined || this.animating) return
    this.queue.replaceChildren()
    const visible = Math.min(3, this.snapshotValue.pendingBowls)
    for (let index = 0; index < visible; index += 1) {
      const bowl = this.createFoodElement('bowl waiting')
      bowl.style.setProperty('--slot', String(index))
      this.queue.append(bowl)
    }
    if (this.snapshotValue.pendingBowls > visible) {
      const overflow = document.createElement('span')
      overflow.className = 'overflow'
      overflow.textContent = `+${this.snapshotValue.pendingBowls - visible}`
      this.queue.append(overflow)
    }
  }

  private async pumpBowls(): Promise<void> {
    if (this.animating || (this.snapshotValue.pendingBowls <= 0 && this.manualFeeds <= 0) || this.queue === undefined) return
    this.animating = true
    const countsTokens = this.snapshotValue.pendingBowls > 0
    const bowlIndex = countsTokens ? this.snapshotValue.consumedBowls + 1 : undefined
    if (!countsTokens) this.manualFeeds -= 1
    const backlog = countsTokens ? this.snapshotValue.pendingBowls : 1
    const duration = Math.max(180, 900 - Math.min(720, (backlog - 1) * 45))
    this.queue.replaceChildren()
    const bowl = this.createFoodElement('bowl eating')
    bowl.style.setProperty('--eat-ms', `${duration}ms`)
    this.queue.append(bowl)
    this.renderState()
    const firstBite = Math.max(40, Math.round(duration * .22))
    const openWide = Math.max(50, Math.round(duration * .67))
    this.setFaceMode('feed', 0)
    await delay(firstBite)
    this.setFaceMode('feed', 1)
    await delay(openWide)
    this.setFaceMode('feed', 2)
    await delay(Math.max(30, duration - firstBite - openWide))
    this.setFaceMode('feed', 3)
    await delay(Math.max(90, duration * .22))
    if (bowlIndex !== undefined) await this.acknowledgeBowl(bowlIndex)
    this.animating = false
    this.setFaceMode('idle', 0)
    this.renderState()
    if (this.snapshotValue.pendingBowls > 0 || this.manualFeeds > 0) queueMicrotask(() => { void this.pumpBowls() })
  }

  private createFoodElement(className: string): HTMLDivElement {
    const food = this.pickFood()
    const bowl = document.createElement('div')
    bowl.className = className
    bowl.dataset.foodId = food.id
    bowl.dataset.foodWeight = String(food.weight)
    bowl.style.backgroundImage = `url(${JSON.stringify(food.url)})`
    return bowl
  }

  private pickFood(): FoodAssetV1 {
    const totalWeight = this.foods.reduce((sum, food) => sum + food.weight, 0)
    if (totalWeight <= 0) return this.foods[0] ?? fallbackFood((this.getAttribute('asset-base') ?? '/assets').replace(/\/$/, ''))
    let cursor = Math.random() * totalWeight
    for (const food of this.foods) {
      cursor -= food.weight
      if (cursor < 0) return food
    }
    return this.foods[this.foods.length - 1] ?? fallbackFood((this.getAttribute('asset-base') ?? '/assets').replace(/\/$/, ''))
  }

  private async acknowledgeBowl(index: number): Promise<void> {
    const endpoint = this.endpoint()
    if (endpoint === undefined) {
      this.snapshotValue = { ...this.snapshotValue, revision: this.snapshotValue.revision + 1, consumedBowls: index, pendingBowls: Math.max(0, this.snapshotValue.earnedBowls - index) }
      return
    }
    try {
      const response = await fetch(`${endpoint}/v1/bowls/${index}/ack`, { method: 'POST' })
      if (response.ok) this.snapshotValue = await response.json() as PetSnapshotV1
    } catch { /* The next SSE snapshot retries the same unacknowledged bowl. */ }
  }

  private async loadFoods(endpoint: string | undefined): Promise<void> {
    const base = (this.getAttribute('asset-base') ?? '/assets').replace(/\/$/, '')
    if (endpoint === undefined) { this.foods = [fallbackFood(base)]; return }
    try {
      const response = await fetch(`${endpoint}/v1/foods`)
      if (!response.ok) return
      const catalog = await response.json() as FoodCatalogV1
      if (catalog.schema !== 'deepseek-token-pet/foods@1' || catalog.foods.length === 0) return
      this.foods = catalog.foods.map(food => {
        const url = new URL(food.url, `${endpoint}/`)
        url.searchParams.set('v', ASSET_REVISION)
        return { ...food, url: url.href }
      })
    } catch { /* Keep the built-in plain-rice fallback. */ }
  }

  private startIdleAnimations(): void {
    if (this.idleRunning) return
    this.idleRunning = true
    this.scheduleBlink()
    this.rateTimer = setInterval(() => this.updateTailSpeed(), 250)
    if (typeof requestAnimationFrame === 'function') this.tailFrame = requestAnimationFrame(time => this.animateTail(time))
  }

  private stopIdleAnimations(): void {
    this.idleRunning = false
    if (this.blinkTimer !== undefined) clearTimeout(this.blinkTimer)
    for (const timer of this.blinkSteps) clearTimeout(timer)
    this.blinkSteps = []
    if (this.rateTimer !== undefined) clearInterval(this.rateTimer)
    if (this.tailFrame !== undefined && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.tailFrame)
    this.tailFrame = undefined
    this.tailLastFrame = 0
  }

  private scheduleBlink(): void {
    if (!this.idleRunning) return
    const wait = 1_800 + Math.random() * 3_200
    this.blinkTimer = setTimeout(() => {
      if (!this.animating) this.playBlink()
      else this.scheduleBlink()
    }, wait)
  }

  private playBlink(): void {
    if (this.faceLayer === undefined) { this.scheduleBlink(); return }
    const frames = [1, 2, 1, 0]
    this.blinkSteps = frames.map((frame, index) => setTimeout(() => {
      this.setFaceMode('idle', frame)
      if (index === frames.length - 1) this.scheduleBlink()
    }, index * 85))
  }

  private animateTail(time: number): void {
    if (!this.idleRunning) return
    if (this.tailLastFrame === 0) this.tailLastFrame = time
    const elapsed = Math.min(100, Math.max(0, time - this.tailLastFrame))
    this.tailLastFrame = time
    this.tailPhase = (this.tailPhase + elapsed / this.tailDurationMs * Math.PI * 2) % (Math.PI * 2)
    this.drawAppendage()
    if (this.tailCanvas !== undefined) this.tailCanvas.dataset.durationMs = String(this.tailDurationMs)
    this.tailFrame = requestAnimationFrame(next => this.animateTail(next))
  }

  private updateTailSpeed(): void {
    const cutoff = Date.now() - 5_000
    while (this.usageBursts[0]?.at !== undefined && this.usageBursts[0].at < cutoff) this.usageBursts.shift()
    const tokens = this.usageBursts.reduce((sum, burst) => sum + burst.tokens, 0)
    const normalized = Math.min(1, Math.log1p(tokens) / Math.log1p(2_000_000))
    this.tailDurationMs = Math.round(3_200 - normalized * 2_500)
    if (this.tailCanvas !== undefined) {
      this.tailCanvas.dataset.tokens5s = String(tokens)
      this.tailCanvas.dataset.durationMs = String(this.tailDurationMs)
    }
    if (this.legsCanvas !== undefined) {
      this.legsCanvas.dataset.tokens5s = String(tokens)
      this.legsCanvas.dataset.durationMs = String(this.tailDurationMs)
    }
  }

  private setFaceMode(mode: 'idle' | 'feed', frame: number): void {
    if (this.faceLayer === undefined) return
    this.faceLayer.style.backgroundImage = `url(${JSON.stringify(mode === 'idle' ? this.idleFaceUrl : this.feedFaceUrl)})`
    this.faceLayer.dataset.expression = mode
    this.faceLayer.dataset.frame = String(frame)
  }

  private drawAppendage(): void {
    if (this.settingsValue.appendageMode === 'legs') this.drawLegs()
    else this.drawTail()
  }

  private drawLegs(): void {
    const context = this.legsContext
    const images = this.legImages
    if (context === undefined) return
    context.clearRect(0, 0, 135, 96)
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    if (images === undefined) return
    // Animate around the verified prone reference pose exported from the editor.
    const showShoe = this.settingsValue.legFootwear === 'shoes'
    const swing = Math.sin(this.tailPhase)
    drawLeg(context, images, { rootX: 54, rootY: 62.5, thighAngle: 12, calfAngle: -173.13 - swing * 7, footAngle: -17.48 + swing * 10, scale: .74, alpha: .9 }, 'far', showShoe)
    drawLeg(context, images, { rootX: 62, rootY: 72.1, thighAngle: 8, calfAngle: -165 + swing * 8, footAngle: 14.87 - swing * 8, scale: .78, alpha: 1 }, 'near', showShoe)
    if (this.legsCanvas !== undefined) {
      this.legsCanvas.dataset.phase = this.tailPhase.toFixed(3)
      this.legsCanvas.dataset.durationMs = String(this.tailDurationMs)
    }
  }

  private drawTail(): void {
    const context = this.tailContext
    if (context === undefined) return
    const centerline = buildTailCenterline(this.tailPhase)
    const smooth = catmullRom(centerline, 5)
    context.clearRect(0, 0, 135, 96)
    context.imageSmoothingEnabled = false

    traceFluke(context, smooth, 1.5)
    context.fillStyle = '#202766'
    context.fill()
    traceRibbon(context, smooth, 15.75, 6)
    context.fillStyle = '#202766'
    context.fill()

    traceFluke(context, smooth, 1.2)
    context.fillStyle = '#4a6fc7'
    context.fill()
    traceRibbon(context, smooth, 13.125, 4.8)
    context.fillStyle = '#4a6fc7'
    context.fill()

    context.save()
    traceRibbon(context, smooth, 13.125, 4.8)
    context.clip()
    context.beginPath()
    for (let index = 2; index < smooth.length - 3; index += 1) {
      const point = smooth[index]
      const before = smooth[index - 1]
      const after = smooth[index + 1]
      if (point === undefined || before === undefined || after === undefined) continue
      const normal = unitNormal(before, after)
      const ratio = index / (smooth.length - 1)
      const offset = (13.125 + (4.8 - 13.125) * ratio) * -.42
      const x = point.x + normal.x * offset
      const y = point.y + normal.y * offset
      if (index === 2) context.moveTo(x, y)
      else context.lineTo(x, y)
    }
    context.strokeStyle = '#8ebcf1'
    context.lineWidth = 1.5
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.stroke()
    context.restore()
  }

  private endpoint(): string | undefined {
    const raw = this.getAttribute('endpoint')?.trim()
    return raw === undefined || raw === '' ? undefined : raw.replace(/\/$/, '')
  }

  private async connectEndpoint(): Promise<void> {
    this.stream?.close()
    const endpoint = this.endpoint()
    await Promise.all([this.loadFoods(endpoint), this.loadSkins(endpoint)])
    if (endpoint === undefined) return
    try {
      const response = await fetch(`${endpoint}/v1/state`)
      if (response.ok) this.setState(await response.json() as PetSnapshotV1, false)
    } catch { return }
    this.stream = new EventSource(`${endpoint}/v1/stream`)
    this.stream.addEventListener('state', (event) => {
      this.setState(JSON.parse((event as MessageEvent<string>).data) as PetSnapshotV1)
    })
  }
}

export function defineDeepseekTokenPet(tagName = 'deepseek-token-pet'): void {
  if (globalThis.customElements !== undefined && customElements.get(tagName) === undefined) customElements.define(tagName, DeepseekTokenPetElement)
}

interface LegImages {
  thigh: HTMLImageElement
  calf: HTMLImageElement
  footFar: HTMLImageElement
  footNear: HTMLImageElement
  shoeFar: HTMLImageElement
  shoeNear: HTMLImageElement
}

interface LegPose {
  rootX: number
  rootY: number
  thighAngle: number
  calfAngle: number
  footAngle: number
  scale: number
  alpha: number
}

function drawLeg(context: CanvasRenderingContext2D, images: LegImages, pose: LegPose, perspective: 'far' | 'near', showShoe: boolean): void {
  context.save()
  context.globalAlpha = pose.alpha
  context.translate(pose.rootX, pose.rootY)
  context.scale(pose.scale, pose.scale)
  context.rotate(pose.thighAngle * Math.PI / 180)
  context.drawImage(images.thigh, 0, -12, 46, 24)
  context.translate(40, 0)
  context.rotate(pose.calfAngle * Math.PI / 180)
  context.drawImage(images.calf, -12, -5, 24, 54)
  context.translate(0, 46)
  context.rotate(pose.footAngle * Math.PI / 180)
  // Keep feet and footwear fully opaque even when the far limb uses depth alpha.
  context.globalAlpha = 1
  context.save()
  context.scale(-1, 1)
  // Anatomical right (far, screen-left): 1.4x Y thickness, ankle anchored.
  if (perspective === 'far') context.drawImage(images.footFar, -.5, -9.1, 24, 19.6)
  // Anatomical left (near, screen-right): restore the earlier moderate size;
  // retain ankle anchoring so the heel does not expand into the calf.
  else context.drawImage(images.footNear, -.5, -10.08, 24, 23.52)
  context.restore()
  if (showShoe) {
    context.save()
    // The far shoe needs a small counter-clockwise correction relative to its foot.
    if (perspective === 'far') context.rotate(-3 * Math.PI / 180)
    context.scale(-1, 1)
    if (perspective === 'far') context.drawImage(images.shoeFar, -.5, -10.725, 28.6, 23.1)
    else context.drawImage(images.shoeNear, -.5, -10.627, 26.4, 25.872)
    context.restore()
  }
  context.restore()
}

function loadImageWithFallback(url: string, fallback: string): Promise<HTMLImageElement> {
  return loadImage(url).catch(() => url === fallback ? Promise.reject(new Error('leg_asset_load_failed')) : loadImage(fallback))
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`asset_load_failed:${url}`))
    image.src = url
  })
}

interface TailPoint { x: number, y: number }

function buildTailCenterline(phase: number): TailPoint[] {
  const lengths = [11.25, 11.25, 10.5, 9.75, 9, 8.25]
  const rests = [-5, -24, -25, -25, -25, -24]
  const points: TailPoint[] = [{ x: 81, y: 68 }]
  let angle = rests[0]! + Math.sin(phase) * 2.2
  for (let index = 0; index < lengths.length; index += 1) {
    if (index > 0) angle += rests[index]! + Math.sin(phase - index * .48) * (2 + index * .65)
    const previous = points[points.length - 1] as TailPoint
    const radians = angle * Math.PI / 180
    points.push({ x: previous.x + Math.cos(radians) * lengths[index]!, y: previous.y + Math.sin(radians) * lengths[index]! })
  }
  return points
}

function catmullRom(points: TailPoint[], subdivisions: number): TailPoint[] {
  const output: TailPoint[] = []
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[Math.max(0, index - 1)] as TailPoint
    const p1 = points[index] as TailPoint
    const p2 = points[index + 1] as TailPoint
    const p3 = points[Math.min(points.length - 1, index + 2)] as TailPoint
    for (let step = 0; step < subdivisions; step += 1) {
      const t = step / subdivisions
      const t2 = t * t
      const t3 = t2 * t
      output.push({
        x: .5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: .5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      })
    }
  }
  output.push(points[points.length - 1] as TailPoint)
  return output
}

function unitNormal(before: TailPoint, after: TailPoint): TailPoint {
  const dx = after.x - before.x
  const dy = after.y - before.y
  const length = Math.hypot(dx, dy) || 1
  return { x: -dy / length, y: dx / length }
}

function traceRibbon(context: CanvasRenderingContext2D, points: TailPoint[], startWidth: number, endWidth: number): void {
  const left: TailPoint[] = []
  const right: TailPoint[] = []
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index] as TailPoint
    const before = points[Math.max(0, index - 1)] as TailPoint
    const after = points[Math.min(points.length - 1, index + 1)] as TailPoint
    const normal = unitNormal(before, after)
    const ratio = index / Math.max(1, points.length - 1)
    const width = startWidth + (endWidth - startWidth) * ratio
    left.push({ x: point.x + normal.x * width, y: point.y + normal.y * width })
    right.push({ x: point.x - normal.x * width, y: point.y - normal.y * width })
  }
  context.beginPath()
  context.moveTo(left[0]!.x, left[0]!.y)
  for (const point of left.slice(1)) context.lineTo(point.x, point.y)
  for (const point of right.reverse()) context.lineTo(point.x, point.y)
  context.closePath()
}

function traceFluke(context: CanvasRenderingContext2D, points: TailPoint[], scale: number): void {
  const tip = points[points.length - 1] as TailPoint
  const before = points[points.length - 3] as TailPoint
  const dx = tip.x - before.x
  const dy = tip.y - before.y
  const length = Math.hypot(dx, dy) || 1
  const tangent = { x: dx / length, y: dy / length }
  const normal = { x: -tangent.y, y: tangent.x }
  const at = (forward: number, side: number): TailPoint => ({
    x: tip.x + tangent.x * forward * scale + normal.x * side * scale,
    y: tip.y + tangent.y * forward * scale + normal.y * side * scale,
  })
  const attachUpper = at(-1, 4)
  const attachLower = at(-1, -4)
  const upper = at(5, 12)
  const notch = at(7, 1)
  const lower = at(5, -12)
  context.beginPath()
  context.moveTo(attachUpper.x, attachUpper.y)
  let point = at(2, 7)
  let control = at(4, 11)
  context.bezierCurveTo(point.x, point.y, control.x, control.y, upper.x, upper.y)
  point = at(8, 10)
  control = at(9, 4)
  context.bezierCurveTo(point.x, point.y, control.x, control.y, notch.x, notch.y)
  point = at(9, -4)
  control = at(8, -10)
  context.bezierCurveTo(point.x, point.y, control.x, control.y, lower.x, lower.y)
  point = at(4, -11)
  control = at(2, -7)
  context.bezierCurveTo(point.x, point.y, control.x, control.y, attachLower.x, attachLower.y)
  context.lineTo(attachUpper.x, attachUpper.y)
  context.closePath()
}

function fallbackFood(base: string): FoodAssetV1 {
  return { id: 'core/plain-rice{10}.png', name: 'plain-rice', url: versionAsset(`${base}/foods/core/plain-rice%7B10%7D.png`), weight: 10, width: 48, height: 48 }
}

function versionAsset(url: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}v=${ASSET_REVISION}`
}

const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))
defineDeepseekTokenPet()
