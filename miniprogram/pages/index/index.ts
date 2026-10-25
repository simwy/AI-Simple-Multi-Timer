// index.ts
// 大屏计时器页面：只负责布局、公共样式与模式编排；计时逻辑在各自组件内。
import { formatDurationLabel, formatLapTime, formatClockLap, pad2 } from '../../utils/time'

type Mode = 'clock' | 'stopwatch' | 'countdown' | 'pomodoro'
type StyleKey = 'white' | 'green' | 'amber' | 'cyan'
type FontSizeKey = 's' | 'm' | 'l' | 'xl'
type FontFamilyKey = 'seven' | 'rounded' | 'classic'

// 可滑动调时的最小单位：时/分/秒各拆成十位与个位，另有百分秒的十位与个位
type EditDigit = 'h10' | 'h1' | 'm10' | 'm1' | 's10' | 's1' | 'cs10' | 'cs1'

interface EditDigits {
  h10: string
  h1: string
  m10: string
  m1: string
  s10: string
  s1: string
  cs10: string
  cs1: string
}

type EndAlert = 'vibrate' | 'sound' | 'both' | 'none'

interface Lap {
  index: number
  cumulativeMs: number
  splitMs: number
}

interface ModeAction {
  key: string
  label: string
  kind: 'duration'
  title: string
  valueMs: number
  minMs: number
  storageKey: string
  value?: string
}

interface Capabilities {
  toggle: boolean
  reset: boolean
}

const MODES: { key: Mode; label: string }[] = [
  { key: 'clock', label: '时钟' },
  { key: 'stopwatch', label: '正计时' },
  { key: 'countdown', label: '倒计时' },
  { key: 'pomodoro', label: '番茄' },
]

// 页面唯一知道「哪个模式用哪个组件」的地方
const MODE_COMPONENTS: Record<Mode, string> = {
  clock: '#clock-timer',
  stopwatch: '#stopwatch-timer',
  countdown: '#countdown-timer',
  pomodoro: '#pomodoro-timer',
}

const STYLE_ORDER: StyleKey[] = ['white', 'green', 'cyan', 'amber']
const STYLE_LABELS: Record<StyleKey, string> = {
  white: '白色',
  green: '绿色',
  amber: '琥珀',
  cyan: '青蓝',
}

const FONT_SIZE_ORDER: FontSizeKey[] = ['s', 'm', 'l', 'xl']
const FONT_SIZE_LABELS: Record<FontSizeKey, string> = {
  s: '小',
  m: '中',
  l: '大',
  xl: '超大',
}

const FONT_FAMILY_ORDER: FontFamilyKey[] = ['seven', 'rounded', 'classic']
const FONT_FAMILY_LABELS: Record<FontFamilyKey, string> = {
  seven: '数码管',
  rounded: '圆角',
  classic: '经典',
}

// 主时间滑动调时：每滑过这么多 px 变化 1
const EDIT_STEP_PX = 24
const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v))

// 每一位数字的滑动上限：分/秒的十位最多到 5（59），时与百分秒十位到 9
const EDIT_DIGIT_MAX: Record<EditDigit, number> = {
  h10: 9,
  h1: 9,
  m10: 5,
  m1: 9,
  s10: 5,
  s1: 9,
  cs10: 9,
  cs1: 9,
}

const emptyEditDigits = (): EditDigits => ({
  h10: '0',
  h1: '0',
  m10: '0',
  m1: '0',
  s10: '0',
  s1: '0',
  cs10: '0',
  cs1: '0',
})

const NO_CAPABILITIES: Capabilities = { toggle: false, reset: false }

// 循环顺序从默认的「振动+提示音」开始，避免第一次点击就切成「无」
const END_ALERT_ORDER: EndAlert[] = ['both', 'vibrate', 'sound', 'none']
const END_ALERT_LABELS: Record<EndAlert, string> = {
  vibrate: '振动',
  sound: '提示音',
  both: '振动+提示音',
  none: '无',
}

// 全局设置默认值：首次进入、以及「重置设置」时使用
const DEFAULT_THEME = 'dark' as 'dark' | 'light'
const DEFAULT_STYLE: StyleKey = 'white'
const DEFAULT_FONT_SIZE: FontSizeKey = 'l'
const DEFAULT_FONT_FAMILY: FontFamilyKey = 'seven'
const DEFAULT_GRADIENT = true
const DEFAULT_SHOW_CENTIS = false
const DEFAULT_SHOW_SUBTIME = true
const DEFAULT_CLOCK_24H = true
const DEFAULT_CLOCK_SECONDS = true
const DEFAULT_ACTION_SIDE = 'right' as 'left' | 'right'
const DEFAULT_LAP_ENABLED = false
const DEFAULT_END_ALERT: EndAlert = 'both'

// 各设置对应的本地存储键；「重置设置」时统一清除，下次启动即回到默认
const SETTINGS_STORAGE_KEYS = [
  'timer.theme',
  'timer.style',
  'timer.fontSize',
  'timer.fontFamily',
  'timer.gradient',
  'timer.showCentis',
  'timer.showSubTime',
  'timer.clock24h',
  'timer.clockShowSeconds',
  'timer.lapEnabled',
  'timer.endAlert',
  'timer.actionSide',
]
// 各模式时长 / 闹钟等由组件回填的设置键
const TIMER_STORAGE_KEYS = [
  'timer.cdDurationMs',
  'timer.workDurationMs',
  'timer.restDurationMs',
  'timer.swLimitMs',
  'timer.alarm',
]

// 单页实例的瞬时状态（不进 data，避免无谓渲染）
let activeMode: Mode = 'clock'
let seeded: Record<string, boolean> = {}
let pendingAction: ModeAction | null = null
let editDrag: { unit: EditDigit; startY: number; steps: number } | null = null
let beepAudio: WechatMiniprogram.InnerAudioContext | null = null
let seededAlarm = false
let alertInterval: ReturnType<typeof setInterval> | undefined
let alertStopTimer: ReturnType<typeof setTimeout> | undefined
let alertStep = 0
// 「结束提醒」切换后延后一拍试听，避免被设置栏父级的 catchtap 立即停掉
let previewTimer: ReturnType<typeof setTimeout> | undefined
// 键盘高度监听（用于弹层抬高，避免横屏键盘遮住「确定」）
let keyboardHandler: ((res: any) => void) | undefined

Component({
  data: {
    modes: MODES,
    mode: 'clock' as Mode,
    theme: DEFAULT_THEME,
    style: DEFAULT_STYLE,
    styleLabel: STYLE_LABELS[DEFAULT_STYLE],

    // 由激活组件上报
    subTime: '',
    running: false,
    finished: false,
    started: false,
    startLabel: '开始',
    pomodoroPhase: 'work' as 'work' | 'rest',
    nextText: '',
    focusMode: false,
    capabilities: NO_CAPABILITIES,
    actions: [] as ModeAction[],

    // 全局设置：主时间字号 / 是否显示百分秒
    fontSize: DEFAULT_FONT_SIZE,
    fontSizeLabel: FONT_SIZE_LABELS[DEFAULT_FONT_SIZE],
    fontFamily: DEFAULT_FONT_FAMILY,
    fontFamilyLabel: FONT_FAMILY_LABELS[DEFAULT_FONT_FAMILY],
    gradient: DEFAULT_GRADIENT,
    showCentis: DEFAULT_SHOW_CENTIS,
    showSubTime: DEFAULT_SHOW_SUBTIME,

    // 时钟专属：24 小时制 / 是否显示秒
    clock24h: DEFAULT_CLOCK_24H,
    clockShowSeconds: DEFAULT_CLOCK_SECONDS,

    // 倒计时 / 番茄未开始时的「主时间滑动调时」
    editable: false,
    editKey: '',
    editDigits: emptyEditDigits(),
    editTouched: false,

    // 操作组贴边方向（全局设置，默认右侧）
    actionSide: DEFAULT_ACTION_SIDE,

    // 设置栏：第二行（通用设置）默认收起，点「更多」展开
    moreOpen: false,

    // 时钟 / 正计时：是否显示「计次」功能按钮
    lapEnabled: DEFAULT_LAP_ENABLED,

    // 结束提醒（全局设置）
    endAlert: DEFAULT_END_ALERT,
    endAlertLabel: END_ALERT_LABELS[DEFAULT_END_ALERT],

    // 时钟闹钟（由组件上报，页面负责渲染与持久化）
    alarmOn: false,
    alarmText: '',
    alarmPanelVisible: false,
    alarmH: 0,
    alarmM: 0,

    // 正计时 / 时钟计次（由组件上报，页面负责渲染）
    laps: [] as { index: number; cumulativeText: string; splitText: string }[],
    lapPreview: [] as { index: number; cumulativeText: string }[],
    lapMore: false,
    lapPanelVisible: false,

    // 时长设置弹层（组件只给参数，弹层由页面统一渲染）
    durationTarget: '',
    durationTitle: '',
    durH: 0,
    durM: 0,
    durS: 0,

    // 左上角客服入口
    contactPanelVisible: false,
    contactQrVisible: true,
    wechatId: 'chenshiming0802',

    // 弹出框输入框当前聚焦项，用于高亮「可输入」状态
    focusField: '',

    // 键盘高度：>0 时弹层上移并紧凑排版，保证横屏下「确定」不被键盘挡住
    keyboardHeight: 0,
  },

  lifetimes: {
    attached() {
      seeded = {}
      seededAlarm = false
      pendingAction = null
      editDrag = null
      activeMode = this.data.mode
      this._stopAlert()
      this._loadPersisted()
      // 横屏键盘较高：弹层按键盘高度上移，避免输入时遮住「确定」
      const handler = (res: any) => {
        this.setData({ keyboardHeight: res.height || 0 })
      }
      keyboardHandler = handler
      if (typeof wx.onKeyboardHeightChange === 'function') {
        wx.onKeyboardHeightChange(handler)
      }
    },
    ready() {
      const comp = this.selectComponent(MODE_COMPONENTS[activeMode])
      if (comp) comp.activate()
    },
    detached() {
      this._stopAlert()
      if (previewTimer) {
        clearTimeout(previewTimer)
        previewTimer = undefined
      }
      if (keyboardHandler && typeof wx.offKeyboardHeightChange === 'function') {
        wx.offKeyboardHeightChange(keyboardHandler)
      }
      keyboardHandler = undefined
      wx.setKeepScreenOn({ keepScreenOn: false })
    },
  },

  pageLifetimes: {
    show() {
      if (this.data.running) wx.setKeepScreenOn({ keepScreenOn: true })
    },
    hide() {
      this._stopAlert()
      wx.setKeepScreenOn({ keepScreenOn: false })
    },
  },

  methods: {
    // ===== 模式切换 =====
    onSwitchMode(e: any) {
      const mode = e.currentTarget.dataset.mode as Mode
      if (mode === activeMode) return

      this._stopAlert()
      const prev = this.selectComponent(MODE_COMPONENTS[activeMode])
      if (prev) prev.deactivate()

      activeMode = mode
      seededAlarm = false
      pendingAction = null
      editDrag = null
      this.setData({
        mode,
        subTime: '',
        running: false,
        finished: false,
        started: false,
        startLabel: '开始',
        pomodoroPhase: 'work',
        nextText: '',
        capabilities: NO_CAPABILITIES,
        actions: [],
        durationTarget: '',
        editable: false,
        editKey: '',
        editDigits: emptyEditDigits(),
        editTouched: false,
        alarmOn: false,
        alarmText: '',
        laps: [],
        lapPreview: [],
        lapMore: false,
        lapPanelVisible: false,
      })

      const next = this.selectComponent(MODE_COMPONENTS[mode])
      if (next) next.activate()
    },

    // ===== 组件状态同步 =====
    onStateChange(e: any) {
      const mode = e.currentTarget.dataset.mode as Mode
      const detail = e.detail

      // 每个模式第一次上报时，用已保存的时长回填（组件本身不碰存储）
      if (!seeded[mode] && this._seedMode(mode, detail.actions || [])) return

      // 时钟闹钟：首次进入时用存储回填一次（组件未就绪则下次 statechange 重试）
      if (mode === 'clock' && !seededAlarm) {
        const stored = wx.getStorageSync('timer.alarm')
        if (stored && stored.on) {
          const comp = this.selectComponent(MODE_COMPONENTS.clock)
          if (comp) {
            seededAlarm = true
            // 带上设置时刻：重启后在「错过不久」的窗口内仍会补响
            const setAtMs = typeof stored.setAtMs === 'number' ? stored.setAtMs : undefined
            comp.setAlarm(stored.hour, stored.minute, setAtMs)
            // setAlarm 会同步再发一次 statechange（已带最新闹钟状态），
            // 这里直接返回，避免随后用旧 detail 把闹钟状态覆盖掉
            return
          }
        } else {
          seededAlarm = true
        }
      }

      if (mode !== activeMode) return

      // 结束提醒只在「运行中 → 已结束」的上升沿触发，切到已结束的模式不会误报
      if (this.data.running && detail.finished) this._playAlert()
      if (this.data.running !== !!detail.running) {
        wx.setKeepScreenOn({ keepScreenOn: !!detail.running })
      }

      const running = !!detail.running
      const finished = !!detail.finished
      const started = !!detail.started
      const updates: any = {
        running,
        finished,
        started,
        startLabel: !running && started && !finished ? '继续' : '开始',
        subTime: detail.subTime || '',
        capabilities: detail.capabilities || NO_CAPABILITIES,
        actions: (detail.actions || []).map((a: ModeAction) => ({
          ...a,
          value: a.key === 'limit' && a.valueMs === 0 ? '不限' : formatDurationLabel(a.valueMs),
        })),
      }

      if (detail.phase === 'work' || detail.phase === 'rest') {
        updates.pomodoroPhase = detail.phase
      }
      if (typeof detail.nextText === 'string') updates.nextText = detail.nextText

      // 时钟闹钟上报
      if (typeof detail.alarmOn === 'boolean') updates.alarmOn = detail.alarmOn
      if (typeof detail.alarmText === 'string') updates.alarmText = detail.alarmText

      // 正计时 / 时钟计次上报（组件只在开始/暂停/重置/计次时 emit，这里格式化开销可忽略）
      if (Array.isArray(detail.laps)) {
        const isClock = mode === 'clock'
        const formatted = (detail.laps as Lap[]).map(l => ({
          index: l.index,
          cumulativeText: isClock ? formatClockLap(l.cumulativeMs) : formatLapTime(l.cumulativeMs),
          splitText: isClock ? '' : formatLapTime(l.splitMs),
        }))
        // 计次倒序：列表与预览都从最新一条开始，往下是更早的
        updates.laps = formatted.slice().reverse()
        updates.lapPreview = updates.laps.slice(0, 2).map((f: any) => ({
          index: f.index,
          cumulativeText: f.cumulativeText,
        }))
        updates.lapMore = formatted.length > 2
      }

      // 倒计时 / 番茄「未开始」时，主时间切换为页面自绘的可滑动分段
      const editable = (mode === 'countdown' || mode === 'pomodoro') && !!detail.editable
      if (editable) {
        const editKey = detail.editKey || ''
        const entering = !this.data.editable || editKey !== this.data.editKey
        updates.editable = true
        updates.editKey = editKey
        if (entering) updates.editTouched = false
        // 拖动过程中组件会回传新值，此时不要覆盖页面正在编辑的数字
        if (entering || !editDrag) {
          updates.editDigits = this._digitsFromMs(Number(detail.editValueMs) || 0)
        }
      } else {
        updates.editable = false
        updates.editKey = ''
      }

      this.setData(updates)
    },

    /** 首次拿到某模式的按钮描述时回填一次存储；返回 true 表示正在等待组件的第二次上报 */
    _seedMode(mode: Mode, actions: ModeAction[]): boolean {
      let pending = false
      let missing = false
      for (const action of actions) {
        const stored = wx.getStorageSync(action.storageKey)
        if (typeof stored !== 'number' || stored < action.minMs || stored === action.valueMs) {
          continue
        }
        const comp = this.selectComponent(MODE_COMPONENTS[mode])
        if (!comp) {
          missing = true
          continue
        }
        seeded[mode] = true
        comp.setDuration(action.key, stored)
        pending = true
      }
      if (!pending && !missing) seeded[mode] = true
      return pending
    },

    // ===== 主操作（重置 / 暂停 / 开始） =====
    onStart() {
      this._stopAlert()
      if (activeMode === 'pomodoro' && this.data.finished) return
      const comp = this.selectComponent(MODE_COMPONENTS[activeMode])
      if (comp) comp.start()
    },
    onPause() {
      this._stopAlert()
      if (activeMode === 'pomodoro' && this.data.finished) return
      const comp = this.selectComponent(MODE_COMPONENTS[activeMode])
      if (comp) comp.pause()
    },
    onReset() {
      this._stopAlert()
      const comp = this.selectComponent(MODE_COMPONENTS[activeMode])
      if (comp) comp.reset()
    },
    onPomodoroNext() {
      this._stopAlert()
      const comp = this.selectComponent(MODE_COMPONENTS.pomodoro)
      if (comp) comp.start()
    },

    // ===== 模式专属按钮 =====
    onActionTap(e: any) {
      const key = e.currentTarget.dataset.key
      const action = (this.data.actions as ModeAction[]).find(item => item.key === key)
      if (!action) return
      pendingAction = action
      const totalSec = Math.floor(action.valueMs / 1000)
      this.setData({
        durationTarget: action.key,
        durationTitle: action.title,
        durH: Math.floor(totalSec / 3600),
        durM: Math.floor((totalSec % 3600) / 60),
        durS: totalSec % 60,
        focusField: '',
        keyboardHeight: 0,
      })
    },
    // ===== 闹钟 =====
    onAlarmTap() {
      this._stopAlert()
      const stored = wx.getStorageSync('timer.alarm')
      if (stored && stored.on) {
        this.setData({
          alarmPanelVisible: true,
          alarmH: stored.hour,
          alarmM: stored.minute,
          focusField: '',
          keyboardHeight: 0,
        })
      } else {
        const now = new Date()
        this.setData({
          alarmPanelVisible: true,
          alarmH: now.getHours(),
          alarmM: now.getMinutes(),
          focusField: '',
          keyboardHeight: 0,
        })
      }
    },
    closeAlarmPanel() {
      this.setData({ alarmPanelVisible: false, focusField: '', keyboardHeight: 0 })
    },
    onAlarmHInput(e: any) {
      this.setData({ alarmH: clamp(Number(e.detail.value) || 0, 0, 23) })
    },
    onAlarmMInput(e: any) {
      this.setData({ alarmM: clamp(Number(e.detail.value) || 0, 0, 59) })
    },
    applyAlarm() {
      const hour = clamp(Number(this.data.alarmH) || 0, 0, 23)
      const minute = clamp(Number(this.data.alarmM) || 0, 0, 59)
      // 先落盘再下发：若正好设到当前分钟，组件可能立刻触发提醒并回写「关闭」
      // setAtMs：设置时刻，用于重启后还原闹钟原本的目标时间
      wx.setStorageSync('timer.alarm', { on: true, hour, minute, setAtMs: Date.now() })
      seededAlarm = true
      const comp = this.selectComponent(MODE_COMPONENTS.clock)
      if (comp) comp.setAlarm(hour, minute)
      this.setData({
        alarmPanelVisible: false,
        alarmH: hour,
        alarmM: minute,
        keyboardHeight: 0,
        focusField: '',
      })
      wx.showToast({ title: `闹钟已设置 ${pad2(hour)}:${pad2(minute)}`, icon: 'none' })
    },
    clearAlarm() {
      seededAlarm = true
      const comp = this.selectComponent(MODE_COMPONENTS.clock)
      if (comp) comp.clearAlarm()
      wx.setStorageSync('timer.alarm', { on: false })
      this.setData({
        alarmPanelVisible: false,
        alarmOn: false,
        alarmText: '',
        keyboardHeight: 0,
        focusField: '',
      })
    },
    onAlarmFire() {
      this._playAlert()
      wx.showToast({ title: '闹钟时间到', icon: 'none', duration: 3000 })
      wx.setStorageSync('timer.alarm', { on: false })
      this.setData({ alarmOn: false, alarmText: '' })
    },

    // ===== 正计时计次 =====
    onLap() {
      this._stopAlertIfActive()
      const comp = this.selectComponent(MODE_COMPONENTS[activeMode])
      if (comp) comp.lap()
    },
    onClearLaps() {
      const comp = this.selectComponent(MODE_COMPONENTS.clock)
      if (comp) comp.clearLaps()
    },
    openLapPanel() {
      this._stopAlertIfActive()
      this.setData({ lapPanelVisible: true })
    },
    closeLapPanel() {
      this.setData({ lapPanelVisible: false })
    },

    closeDurationPanel() {
      pendingAction = null
      this.setData({ durationTarget: '', focusField: '', keyboardHeight: 0 })
    },
    onDurHInput(e: any) {
      this.setData({ durH: Number(e.detail.value) || 0 })
    },
    onDurMInput(e: any) {
      this.setData({ durM: Number(e.detail.value) || 0 })
    },
    onDurSInput(e: any) {
      this.setData({ durS: Number(e.detail.value) || 0 })
    },
    onInputFocus(e: any) {
      this.setData({ focusField: e.currentTarget.dataset.field || '' })
    },
    onInputBlur() {
      this.setData({ focusField: '' })
    },
    applyDuration() {
      const action = pendingAction
      if (!action) return
      const raw = ((this.data.durH * 60 + this.data.durM) * 60 + this.data.durS) * 1000
      const ms = Math.max(action.minMs, raw)

      const comp = this.selectComponent(MODE_COMPONENTS[activeMode])
      if (comp) comp.setDuration(action.key, ms)
      wx.setStorageSync(action.storageKey, ms)

      pendingAction = null
      this.setData({ durationTarget: '', focusField: '', keyboardHeight: 0 })
    },

    // ===== 主时间滑动调时（倒计时 / 番茄，仅未开始） =====
    onEditTouchStart(e: any) {
      const unit = e.currentTarget.dataset.unit as EditDigit
      const touch = e.touches && e.touches[0]
      if (!unit || !(unit in EDIT_DIGIT_MAX) || !touch) return
      editDrag = { unit, startY: touch.clientY, steps: 0 }
    },
    onEditTouchMove(e: any) {
      if (!editDrag) return
      const touch = e.touches && e.touches[0]
      if (!touch) return
      const steps = Math.trunc((editDrag.startY - touch.clientY) / EDIT_STEP_PX)
      if (steps === editDrag.steps) return
      const delta = steps - editDrag.steps
      editDrag.steps = steps
      this._applyEditDelta(editDrag.unit, delta)
    },
    onEditTouchEnd() {
      if (editDrag && editDrag.steps !== 0) {
        const action = (this.data.actions as ModeAction[]).find(a => a.key === this.data.editKey)
        if (action) {
          wx.setStorageSync(action.storageKey, this._currentEditMs())
          this.setData({ editTouched: true })
        }
      }
      editDrag = null
    },
    _currentEditMs(): number {
      return this._msFromDigits(this.data.editDigits)
    },
    /** 毫秒 → 每一位数字（含百分秒），供主时间分段显示 */
    _digitsFromMs(ms: number): EditDigits {
      const totalCs = Math.max(0, Math.floor(ms / 10))
      const cs = totalCs % 100
      const totalSec = Math.floor(totalCs / 100)
      // 分段编辑上限 99 小时，超出时按上限显示，避免十位出现两位字符
      const h = Math.min(99, Math.floor(totalSec / 3600))
      const m = Math.floor((totalSec % 3600) / 60)
      const s = totalSec % 60
      return {
        h10: String(Math.floor(h / 10)),
        h1: String(h % 10),
        m10: String(Math.floor(m / 10)),
        m1: String(m % 10),
        s10: String(Math.floor(s / 10)),
        s1: String(s % 10),
        cs10: String(Math.floor(cs / 10)),
        cs1: String(cs % 10),
      }
    },
    /** 每一位数字 → 毫秒 */
    _msFromDigits(d: EditDigits): number {
      const h = Number(d.h10) * 10 + Number(d.h1)
      const m = Number(d.m10) * 10 + Number(d.m1)
      const s = Number(d.s10) * 10 + Number(d.s1)
      const cs = Number(d.cs10) * 10 + Number(d.cs1)
      return ((h * 60 + m) * 60 + s) * 1000 + cs * 10
    },
    _applyEditDelta(unit: EditDigit, delta: number) {
      const action = (this.data.actions as ModeAction[]).find(a => a.key === this.data.editKey)
      if (!action) return

      const digits = { ...this.data.editDigits }
      digits[unit] = String(clamp(Number(digits[unit]) + delta, 0, EDIT_DIGIT_MAX[unit]))

      const ms = Math.max(action.minMs, this._msFromDigits(digits))
      this.setData({ editDigits: this._digitsFromMs(ms) })

      const comp = this.selectComponent(MODE_COMPONENTS[activeMode])
      if (comp) comp.setDuration(action.key, ms)
    },

    // ===== 全局设置：字号 / 显示精度 =====
    onCycleFontSize() {
      const current = FONT_SIZE_ORDER.indexOf(this.data.fontSize)
      const fontSize = FONT_SIZE_ORDER[(current + 1) % FONT_SIZE_ORDER.length]
      this.setData({ fontSize, fontSizeLabel: FONT_SIZE_LABELS[fontSize] })
      wx.setStorageSync('timer.fontSize', fontSize)
    },
    onCycleFontFamily() {
      const current = FONT_FAMILY_ORDER.indexOf(this.data.fontFamily)
      const fontFamily = FONT_FAMILY_ORDER[(current + 1) % FONT_FAMILY_ORDER.length]
      this.setData({ fontFamily, fontFamilyLabel: FONT_FAMILY_LABELS[fontFamily] })
      wx.setStorageSync('timer.fontFamily', fontFamily)
    },
    onToggleGradient() {
      const gradient = !this.data.gradient
      this.setData({ gradient })
      wx.setStorageSync('timer.gradient', gradient)
    },
    onTogglePrecision() {
      const showCentis = !this.data.showCentis
      this.setData({ showCentis })
      wx.setStorageSync('timer.showCentis', showCentis)
    },
    onToggleSubTime() {
      const showSubTime = !this.data.showSubTime
      this.setData({ showSubTime })
      wx.setStorageSync('timer.showSubTime', showSubTime)
    },
    onToggleMore() {
      this.setData({ moreOpen: !this.data.moreOpen })
    },
    onToggleLapEnabled() {
      const lapEnabled = !this.data.lapEnabled
      this.setData({ lapEnabled })
      wx.setStorageSync('timer.lapEnabled', lapEnabled)
    },
    onToggleClock24h() {
      const clock24h = !this.data.clock24h
      this.setData({ clock24h })
      wx.setStorageSync('timer.clock24h', clock24h)
    },
    onToggleClockSeconds() {
      const clockShowSeconds = !this.data.clockShowSeconds
      this.setData({ clockShowSeconds })
      wx.setStorageSync('timer.clockShowSeconds', clockShowSeconds)
    },
    onCycleEndAlert() {
      const current = END_ALERT_ORDER.indexOf(this.data.endAlert)
      const endAlert = END_ALERT_ORDER[(current + 1) % END_ALERT_ORDER.length]
      this.setData({ endAlert, endAlertLabel: END_ALERT_LABELS[endAlert] })
      wx.setStorageSync('timer.endAlert', endAlert)
      // 立即试听新设置；延后一拍，避免被设置栏父级的 catchtap 当场停掉
      this._schedulePreview(endAlert)
    },

    // ===== 重置设置：所有全局设置与各模式时长 / 闹钟恢复默认 =====
    onResetSettings() {
      this._stopAlert()
      pendingAction = null
      editDrag = null
      seededAlarm = false
      this.setData({
        theme: DEFAULT_THEME,
        style: DEFAULT_STYLE,
        styleLabel: STYLE_LABELS[DEFAULT_STYLE],
        fontSize: DEFAULT_FONT_SIZE,
        fontSizeLabel: FONT_SIZE_LABELS[DEFAULT_FONT_SIZE],
        fontFamily: DEFAULT_FONT_FAMILY,
        fontFamilyLabel: FONT_FAMILY_LABELS[DEFAULT_FONT_FAMILY],
        gradient: DEFAULT_GRADIENT,
        showCentis: DEFAULT_SHOW_CENTIS,
        showSubTime: DEFAULT_SHOW_SUBTIME,
        clock24h: DEFAULT_CLOCK_24H,
        clockShowSeconds: DEFAULT_CLOCK_SECONDS,
        actionSide: DEFAULT_ACTION_SIDE,
        lapEnabled: DEFAULT_LAP_ENABLED,
        endAlert: DEFAULT_END_ALERT,
        endAlertLabel: END_ALERT_LABELS[DEFAULT_END_ALERT],
        alarmOn: false,
        alarmText: '',
        alarmPanelVisible: false,
        durationTarget: '',
        focusField: '',
        keyboardHeight: 0,
      })
      SETTINGS_STORAGE_KEYS.forEach(key => wx.removeStorageSync(key))
      TIMER_STORAGE_KEYS.forEach(key => wx.removeStorageSync(key))
      // 组件内的时长 / 闹钟一并回到默认，并刷新界面
      ;(Object.keys(MODE_COMPONENTS) as Mode[]).forEach(mode => {
        const comp = this.selectComponent(MODE_COMPONENTS[mode])
        if (comp && typeof comp.resetDefaults === 'function') comp.resetDefaults()
      })
      this._applyMenuStyle()
      wx.showToast({ title: '已恢复默认设置', icon: 'none' })
    },

    _schedulePreview(kind: EndAlert) {
      if (previewTimer) {
        clearTimeout(previewTimer)
        previewTimer = undefined
      }
      previewTimer = setTimeout(() => {
        previewTimer = undefined
        this._playPreview(kind)
      }, 0)
    },
    /** 试听一轮：按设置响 3 下（振动 / 提示音 / 两者） */
    _playPreview(kind: EndAlert) {
      this._stopAlert()
      if (kind === 'none') return
      const sound = kind === 'sound' || kind === 'both'
      const vibrate = kind === 'vibrate' || kind === 'both'
      let count = 0
      const tick = () => {
        if (sound) this._playSound()
        if (vibrate) wx.vibrateShort({ type: 'medium' })
        count += 1
        if (count >= 3) {
          // 停止轮询，但让第 3 声播完再收尾（立即 stop 会把它掐断）
          if (alertInterval) {
            clearInterval(alertInterval)
            alertInterval = undefined
          }
          alertStopTimer = setTimeout(() => this._stopAlert(), 400)
        }
      }
      tick()
      alertInterval = setInterval(tick, 450)
    },

    // ===== 结束 / 闹钟提醒：按设置执行 =====
    _playAlert() {
      this._stopAlert()
      if (this.data.endAlert === 'none') return
      const sound = this.data.endAlert === 'sound' || this.data.endAlert === 'both'
      const vibrate = this.data.endAlert === 'vibrate' || this.data.endAlert === 'both'
      alertStep = 0

      const tick = () => {
        // 3 声一组，组间 2 个空拍（约 1.2s），60s 后由 alertStopTimer 停止
        if (alertStep % 5 < 3) {
          if (sound) this._playSound()
          if (vibrate) wx.vibrateShort({ type: 'medium' })
        }
        alertStep += 1
      }

      tick()
      alertInterval = setInterval(tick, 400)
      alertStopTimer = setTimeout(() => this._stopAlert(), 60000)
    },
    _playSound() {
      if (!beepAudio) {
        beepAudio = wx.createInnerAudioContext()
        beepAudio.src = '/assets/beep.wav'
      }
      beepAudio.stop()
      beepAudio.play()
    },
    _stopAlert() {
      if (alertInterval) {
        clearInterval(alertInterval)
        alertInterval = undefined
      }
      if (alertStopTimer) {
        clearTimeout(alertStopTimer)
        alertStopTimer = undefined
      }
      alertStep = 0
      if (beepAudio) beepAudio.stop()
    },

    // ===== 样式 / 主题 =====
    onCycleStyle() {
      const current = STYLE_ORDER.indexOf(this.data.style)
      const style = STYLE_ORDER[(current + 1) % STYLE_ORDER.length]
      this.setData({ style, styleLabel: STYLE_LABELS[style] })
      wx.setStorageSync('timer.style', style)
    },
    onToggleTheme() {
      const theme = this.data.theme === 'dark' ? 'light' : 'dark'
      this.setData({ theme })
      wx.setStorageSync('timer.theme', theme)
      this._applyMenuStyle()
    },

    // ===== 操作组贴边方向 =====
    onToggleActionSide() {
      const actionSide = this.data.actionSide === 'right' ? 'left' : 'right'
      this.setData({ actionSide })
      wx.setStorageSync('timer.actionSide', actionSide)
    },

    // ===== 专注模式：点击空白区域，切换「只显示主/子时间」与「显示全部」 =====
    onToggleFocus() {
      this.setData({ focusMode: !this.data.focusMode })
    },

    // ===== 左上角客服入口 =====
    openContactPanel() {
      this._stopAlertIfActive()
      this.setData({ contactPanelVisible: true, contactQrVisible: true })
    },
    closeContactPanel() {
      this.setData({ contactPanelVisible: false })
    },
    copyWechatId() {
      wx.setClipboardData({ data: this.data.wechatId })
    },
    onQrError() {
      this.setData({ contactQrVisible: false })
    },

    // ===== 结束提醒：屏幕任意点击即全部停止 =====
    onPageTap() {
      if (this._stopAlertIfActive()) return
      this.onToggleFocus()
    },
    onUIAreaTap() {
      this._stopAlertIfActive()
    },
    _stopAlertIfActive(): boolean {
      if (alertInterval || alertStopTimer) {
        this._stopAlert()
        return true
      }
      return false
    },

    // ===== 胶囊按钮样式：跟随主题（浅/深），无法指定任意背景色 =====
    _applyMenuStyle() {
      if (typeof (wx as any).setMenuStyle === 'function') {
        (wx as any).setMenuStyle({ style: this.data.theme === 'dark' ? 'dark' : 'light' })
      }
    },

    // ===== 持久化（主题 / 样式 / 字号 / 精度；时长由各按钮的 storageKey 负责） =====
    _loadPersisted() {
      const theme = wx.getStorageSync('timer.theme')
      const style = wx.getStorageSync('timer.style')
      const actionSide = wx.getStorageSync('timer.actionSide')
      const fontSize = wx.getStorageSync('timer.fontSize')
      const fontFamily = wx.getStorageSync('timer.fontFamily')
      const gradient = wx.getStorageSync('timer.gradient')
      const showCentis = wx.getStorageSync('timer.showCentis')
      const showSubTime = wx.getStorageSync('timer.showSubTime')
      const clock24h = wx.getStorageSync('timer.clock24h')
      const clockShowSeconds = wx.getStorageSync('timer.clockShowSeconds')
      const lapEnabled = wx.getStorageSync('timer.lapEnabled')
      const updates: any = {}
      if (theme === 'light' || theme === 'dark') updates.theme = theme
      if (style === 'white' || style === 'green' || style === 'amber' || style === 'cyan') {
        updates.style = style
        updates.styleLabel = STYLE_LABELS[style as StyleKey]
      }
      if (actionSide === 'left' || actionSide === 'right') updates.actionSide = actionSide
      if (fontSize === 's' || fontSize === 'm' || fontSize === 'l' || fontSize === 'xl') {
        updates.fontSize = fontSize
        updates.fontSizeLabel = FONT_SIZE_LABELS[fontSize as FontSizeKey]
      }
      if (fontFamily === 'seven' || fontFamily === 'rounded' || fontFamily === 'classic') {
        updates.fontFamily = fontFamily
        updates.fontFamilyLabel = FONT_FAMILY_LABELS[fontFamily as FontFamilyKey]
      }
      if (typeof gradient === 'boolean') updates.gradient = gradient
      if (typeof showCentis === 'boolean') updates.showCentis = showCentis
      if (typeof showSubTime === 'boolean') updates.showSubTime = showSubTime
      if (typeof clock24h === 'boolean') updates.clock24h = clock24h
      if (typeof clockShowSeconds === 'boolean') updates.clockShowSeconds = clockShowSeconds
      if (typeof lapEnabled === 'boolean') updates.lapEnabled = lapEnabled
      const endAlert = wx.getStorageSync('timer.endAlert')
      if (endAlert === 'vibrate' || endAlert === 'sound' || endAlert === 'both' || endAlert === 'none') {
        updates.endAlert = endAlert
        updates.endAlertLabel = END_ALERT_LABELS[endAlert as EndAlert]
      }
      if (Object.keys(updates).length) this.setData(updates)
      this._applyMenuStyle()
    },
  },
})
