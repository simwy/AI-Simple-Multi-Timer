// index.ts
// 大屏计时器页面：只负责布局、公共样式与模式编排；计时逻辑在各自组件内。
import { formatDurationLabel, formatLapTime, pad2, splitHMS } from '../../utils/time'

type Mode = 'clock' | 'stopwatch' | 'countdown' | 'pomodoro'
type StyleKey = 'white' | 'green' | 'amber'
type FontSizeKey = 's' | 'm' | 'l'
type EditUnit = 'h' | 'm' | 's'

type EndAlert = 'vibrate' | 'sound' | 'both'

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

const STYLE_ORDER: StyleKey[] = ['white', 'green', 'amber']
const STYLE_LABELS: Record<StyleKey, string> = {
  white: '白色',
  green: '绿色',
  amber: '琥珀',
}

const FONT_SIZE_ORDER: FontSizeKey[] = ['s', 'm', 'l']
const FONT_SIZE_LABELS: Record<FontSizeKey, string> = {
  s: '小',
  m: '中',
  l: '大',
}

// 主时间滑动调时：每滑过这么多 px 变化 1
const EDIT_STEP_PX = 24
const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v))

const NO_CAPABILITIES: Capabilities = { toggle: false, reset: false }

const END_ALERT_ORDER: EndAlert[] = ['vibrate', 'sound', 'both']
const END_ALERT_LABELS: Record<EndAlert, string> = {
  vibrate: '振动',
  sound: '提示音',
  both: '振动+提示音',
}

// 单页实例的瞬时状态（不进 data，避免无谓渲染）
let activeMode: Mode = 'clock'
let seeded: Record<string, boolean> = {}
let pendingAction: ModeAction | null = null
let editDrag: { unit: EditUnit; startY: number; steps: number } | null = null
let beepAudio: WechatMiniprogram.InnerAudioContext | null = null
let seededAlarm = false

Component({
  data: {
    modes: MODES,
    mode: 'clock' as Mode,
    theme: 'dark' as 'dark' | 'light',
    style: 'white' as StyleKey,
    styleLabel: '白色',

    // 由激活组件上报
    subTime: '',
    running: false,
    finished: false,
    focusMode: false,
    capabilities: NO_CAPABILITIES,
    actions: [] as ModeAction[],

    // 全局设置：主时间字号 / 是否显示百分秒
    fontSize: 'm' as FontSizeKey,
    fontSizeLabel: FONT_SIZE_LABELS.m,
    showCentis: true,

    // 倒计时 / 番茄未开始时的「主时间滑动调时」
    editable: false,
    editKey: '',
    editH: '00',
    editM: '00',
    editS: '00',
    editTouched: false,

    // 操作组贴边方向（全局设置，默认右侧）
    actionSide: 'right' as 'left' | 'right',

    // 结束提醒三态（全局设置）
    endAlert: 'both' as EndAlert,
    endAlertLabel: END_ALERT_LABELS.both,

    // 时钟闹钟（由组件上报，页面负责渲染与持久化）
    alarmOn: false,
    alarmText: '',
    alarmPanelVisible: false,
    alarmH: 0,
    alarmM: 0,

    // 正计时计次（由组件上报，页面负责渲染）
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
  },

  lifetimes: {
    attached() {
      seeded = {}
      seededAlarm = false
      pendingAction = null
      editDrag = null
      activeMode = this.data.mode
      this._loadPersisted()
    },
    ready() {
      const comp = this.selectComponent(MODE_COMPONENTS[activeMode])
      if (comp) comp.activate()
    },
    detached() {
      wx.setKeepScreenOn({ keepScreenOn: false })
    },
  },

  pageLifetimes: {
    show() {
      if (this.data.running) wx.setKeepScreenOn({ keepScreenOn: true })
    },
    hide() {
      wx.setKeepScreenOn({ keepScreenOn: false })
    },
  },

  methods: {
    // ===== 模式切换 =====
    onSwitchMode(e: any) {
      const mode = e.currentTarget.dataset.mode as Mode
      if (mode === activeMode) return

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
        capabilities: NO_CAPABILITIES,
        actions: [],
        durationTarget: '',
        editable: false,
        editKey: '',
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
            comp.setAlarm(stored.hour, stored.minute)
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

      const updates: any = {
        running: !!detail.running,
        finished: !!detail.finished,
        subTime: detail.subTime || '',
        capabilities: detail.capabilities || NO_CAPABILITIES,
        actions: (detail.actions || []).map((a: ModeAction) => ({
          ...a,
          value: a.key === 'limit' && a.valueMs === 0 ? '不限' : formatDurationLabel(a.valueMs),
        })),
      }

      // 时钟闹钟上报
      if (typeof detail.alarmOn === 'boolean') updates.alarmOn = detail.alarmOn
      if (typeof detail.alarmText === 'string') updates.alarmText = detail.alarmText

      // 正计时计次上报（组件只在开始/暂停/重置/计次时 emit，这里格式化开销可忽略）
      if (Array.isArray(detail.laps)) {
        const formatted = (detail.laps as Lap[]).map(l => ({
          index: l.index,
          cumulativeText: formatLapTime(l.cumulativeMs),
          splitText: formatLapTime(l.splitMs),
        }))
        updates.laps = formatted
        updates.lapPreview = formatted.slice(-2).map(f => ({
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
        // 拖动过程中组件会回传新值，此时不要覆盖页面正在编辑的分段
        if (entering || !editDrag) {
          const t = splitHMS(Number(detail.editValueMs) || 0)
          updates.editH = pad2(t.h)
          updates.editM = pad2(t.m)
          updates.editS = pad2(t.s)
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
      const comp = this.selectComponent(MODE_COMPONENTS[activeMode])
      if (comp) comp.start()
    },
    onPause() {
      const comp = this.selectComponent(MODE_COMPONENTS[activeMode])
      if (comp) comp.pause()
    },
    onReset() {
      const comp = this.selectComponent(MODE_COMPONENTS[activeMode])
      if (comp) comp.reset()
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
      })
    },
    // ===== 闹钟 =====
    onAlarmTap() {
      const stored = wx.getStorageSync('timer.alarm')
      if (stored && stored.on) {
        this.setData({ alarmPanelVisible: true, alarmH: stored.hour, alarmM: stored.minute })
      } else {
        const now = new Date()
        this.setData({ alarmPanelVisible: true, alarmH: now.getHours(), alarmM: now.getMinutes() })
      }
    },
    closeAlarmPanel() {
      this.setData({ alarmPanelVisible: false })
    },
    onAlarmHInput(e: any) {
      this.setData({ alarmH: clamp(Number(e.detail.value) || 0, 0, 23) })
    },
    onAlarmMInput(e: any) {
      this.setData({ alarmM: clamp(Number(e.detail.value) || 0, 0, 59) })
    },
    applyAlarm() {
      const comp = this.selectComponent(MODE_COMPONENTS.clock)
      if (comp) comp.setAlarm(this.data.alarmH, this.data.alarmM)
      wx.setStorageSync('timer.alarm', { on: true, hour: this.data.alarmH, minute: this.data.alarmM })
      this.setData({ alarmPanelVisible: false })
    },
    clearAlarm() {
      const comp = this.selectComponent(MODE_COMPONENTS.clock)
      if (comp) comp.clearAlarm()
      wx.setStorageSync('timer.alarm', { on: false })
      this.setData({ alarmPanelVisible: false, alarmOn: false, alarmText: '' })
    },
    onAlarmFire() {
      this._playAlert()
      wx.setStorageSync('timer.alarm', { on: false })
      this.setData({ alarmOn: false, alarmText: '' })
    },

    // ===== 正计时计次 =====
    onLap() {
      const comp = this.selectComponent(MODE_COMPONENTS.stopwatch)
      if (comp) comp.lap()
    },
    openLapPanel() {
      this.setData({ lapPanelVisible: true })
    },
    closeLapPanel() {
      this.setData({ lapPanelVisible: false })
    },

    closeDurationPanel() {
      pendingAction = null
      this.setData({ durationTarget: '' })
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
    applyDuration() {
      const action = pendingAction
      if (!action) return
      const raw = ((this.data.durH * 60 + this.data.durM) * 60 + this.data.durS) * 1000
      const ms = Math.max(action.minMs, raw)

      const comp = this.selectComponent(MODE_COMPONENTS[activeMode])
      if (comp) comp.setDuration(action.key, ms)
      wx.setStorageSync(action.storageKey, ms)

      pendingAction = null
      this.setData({ durationTarget: '' })
    },

    // ===== 主时间滑动调时（倒计时 / 番茄，仅未开始） =====
    onEditTouchStart(e: any) {
      const unit = e.currentTarget.dataset.unit as EditUnit
      const touch = e.touches && e.touches[0]
      if (!unit || !touch) return
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
      const h = Number(this.data.editH) || 0
      const m = Number(this.data.editM) || 0
      const s = Number(this.data.editS) || 0
      return ((h * 60 + m) * 60 + s) * 1000
    },
    _applyEditDelta(unit: EditUnit, delta: number) {
      const action = (this.data.actions as ModeAction[]).find(a => a.key === this.data.editKey)
      if (!action) return

      let h = Number(this.data.editH) || 0
      let m = Number(this.data.editM) || 0
      let s = Number(this.data.editS) || 0
      if (unit === 'h') h = clamp(h + delta, 0, 99)
      else if (unit === 'm') m = clamp(m + delta, 0, 59)
      else s = clamp(s + delta, 0, 59)

      const ms = Math.max(action.minMs, ((h * 60 + m) * 60 + s) * 1000)
      const t = splitHMS(ms)
      this.setData({
        editH: pad2(t.h),
        editM: pad2(t.m),
        editS: pad2(t.s),
      })

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
    onTogglePrecision() {
      const showCentis = !this.data.showCentis
      this.setData({ showCentis })
      wx.setStorageSync('timer.showCentis', showCentis)
    },
    onCycleEndAlert() {
      const current = END_ALERT_ORDER.indexOf(this.data.endAlert)
      const endAlert = END_ALERT_ORDER[(current + 1) % END_ALERT_ORDER.length]
      this.setData({ endAlert, endAlertLabel: END_ALERT_LABELS[endAlert] })
      wx.setStorageSync('timer.endAlert', endAlert)
    },

    // ===== 结束 / 闹钟提醒：按三态设置执行 =====
    _playAlert() {
      if (this.data.endAlert === 'vibrate' || this.data.endAlert === 'both') wx.vibrateLong()
      if (this.data.endAlert === 'sound' || this.data.endAlert === 'both') this._playSound()
    },
    _playSound() {
      if (!beepAudio) {
        beepAudio = wx.createInnerAudioContext()
        beepAudio.src = '/assets/beep.wav'
      }
      beepAudio.stop()
      beepAudio.play()
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
    noop() {},

    // ===== 持久化（主题 / 样式 / 字号 / 精度；时长由各按钮的 storageKey 负责） =====
    _loadPersisted() {
      const theme = wx.getStorageSync('timer.theme')
      const style = wx.getStorageSync('timer.style')
      const actionSide = wx.getStorageSync('timer.actionSide')
      const fontSize = wx.getStorageSync('timer.fontSize')
      const showCentis = wx.getStorageSync('timer.showCentis')
      const updates: any = {}
      if (theme === 'light' || theme === 'dark') updates.theme = theme
      if (style === 'white' || style === 'green' || style === 'amber') {
        updates.style = style
        updates.styleLabel = STYLE_LABELS[style as StyleKey]
      }
      if (actionSide === 'left' || actionSide === 'right') updates.actionSide = actionSide
      if (fontSize === 's' || fontSize === 'm' || fontSize === 'l') {
        updates.fontSize = fontSize
        updates.fontSizeLabel = FONT_SIZE_LABELS[fontSize as FontSizeKey]
      }
      if (typeof showCentis === 'boolean') updates.showCentis = showCentis
      const endAlert = wx.getStorageSync('timer.endAlert')
      if (endAlert === 'vibrate' || endAlert === 'sound' || endAlert === 'both') {
        updates.endAlert = endAlert
        updates.endAlertLabel = END_ALERT_LABELS[endAlert as EndAlert]
      }
      if (Object.keys(updates).length) this.setData(updates)
    },
  },
})
