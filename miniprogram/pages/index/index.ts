// index.ts
// 大屏计时器页面：只负责布局、公共样式与模式编排；计时逻辑在各自组件内。
import { formatDurationLabel } from '../../utils/time'

type Mode = 'clock' | 'stopwatch' | 'countdown' | 'pomodoro'
type StyleKey = 'white' | 'green' | 'amber'

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

const NO_CAPABILITIES: Capabilities = { toggle: false, reset: false }

// 单页实例的瞬时状态（不进 data，避免无谓渲染）
let activeMode: Mode = 'clock'
let seeded: Record<string, boolean> = {}
let pendingAction: ModeAction | null = null

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

    // 操作组贴边方向（全局设置，默认右侧）
    actionSide: 'right' as 'left' | 'right',

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
      pendingAction = null
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
      pendingAction = null
      this.setData({
        mode,
        subTime: '',
        running: false,
        finished: false,
        capabilities: NO_CAPABILITIES,
        actions: [],
        durationTarget: '',
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
      if (mode !== activeMode) return

      // 结束提醒只在「运行中 → 已结束」的上升沿触发，切到已结束的模式不会误震
      if (this.data.running && detail.finished) wx.vibrateLong()
      if (this.data.running !== !!detail.running) {
        wx.setKeepScreenOn({ keepScreenOn: !!detail.running })
      }

      this.setData({
        running: !!detail.running,
        finished: !!detail.finished,
        subTime: detail.subTime || '',
        capabilities: detail.capabilities || NO_CAPABILITIES,
        actions: (detail.actions || []).map((a: ModeAction) => ({
          ...a,
          value: formatDurationLabel(a.valueMs),
        })),
      })
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

    // ===== 持久化（仅主题 / 样式；时长由各按钮的 storageKey 负责） =====
    _loadPersisted() {
      const theme = wx.getStorageSync('timer.theme')
      const style = wx.getStorageSync('timer.style')
      const actionSide = wx.getStorageSync('timer.actionSide')
      const updates: any = {}
      if (theme === 'light' || theme === 'dark') updates.theme = theme
      if (style === 'white' || style === 'green' || style === 'amber') {
        updates.style = style
        updates.styleLabel = STYLE_LABELS[style as StyleKey]
      }
      if (actionSide === 'left' || actionSide === 'right') updates.actionSide = actionSide
      if (Object.keys(updates).length) this.setData(updates)
    },
  },
})
