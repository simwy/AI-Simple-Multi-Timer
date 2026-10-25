// pomodoro-timer.ts
// 番茄计时：工作 / 休息阶段循环。震动、亮屏与「时间到」由页面统一处理，样式由页面统一下发。
import { formatDurationLabel, formatHMS, formatHMSxx } from '../../utils/time'

const TICK_MS = 16
const DEFAULT_WORK_MS = 25 * 60 * 1000
const DEFAULT_REST_MS = 5 * 60 * 1000
const MIN_DURATION_MS = 1000

type Phase = 'work' | 'rest'

let isActive = false
let started = false
// manualWorkMs / manualRestMs：用户手动设置的时长（落盘）；
// workMs / restMs：当前生效的时长，重置第一次回手动值、第二次回默认值。
let manualWorkMs = DEFAULT_WORK_MS
let manualRestMs = DEFAULT_REST_MS
let workMs = DEFAULT_WORK_MS
let restMs = DEFAULT_REST_MS
let remainingMs = DEFAULT_WORK_MS
let nextResetUsesDefault = false
let endAt = 0
let tickTimer: ReturnType<typeof setInterval> | undefined

const nextPhase = (phase: Phase): Phase => (phase === 'work' ? 'rest' : 'work')

const buildActions = () => [
  {
    key: 'work',
    label: '工作时长',
    kind: 'duration',
    title: '工作时长',
    valueMs: workMs,
    minMs: MIN_DURATION_MS,
    storageKey: 'timer.workDurationMs',
  },
  {
    key: 'rest',
    label: '休息时长',
    kind: 'duration',
    title: '休息时长',
    valueMs: restMs,
    minMs: MIN_DURATION_MS,
    storageKey: 'timer.restDurationMs',
  },
]

Component({
  properties: {
    // 由页面下发：是否显示秒后的两位小数
    showCentis: {
      type: Boolean,
      value: true,
      observer(this: any, value: boolean) {
        this._refreshDisplay(value)
      },
    },
  },

  data: {
    display: formatHMSxx(DEFAULT_WORK_MS),
    running: false,
    finished: false,
    phase: 'work' as Phase,
    completed: 0,
  },

  lifetimes: {
    attached() {
      isActive = false
      started = false
      manualWorkMs = DEFAULT_WORK_MS
      manualRestMs = DEFAULT_REST_MS
      workMs = DEFAULT_WORK_MS
      restMs = DEFAULT_REST_MS
      remainingMs = workMs
      nextResetUsesDefault = false
      endAt = 0
      this.setData({
        display: this._fmt(workMs),
        running: false,
        finished: false,
        phase: 'work',
        completed: 0,
      })
      this._emitState()
    },
    detached() {
      this._stopTick()
    },
  },

  pageLifetimes: {
    show() {
      if (isActive && this.data.running) this._startTick()
    },
    hide() {
      this._stopTick()
    },
  },

  methods: {
    activate() {
      isActive = true
      if (this.data.running) this._startTick()
      this._emitState()
    },
    deactivate() {
      isActive = false
      if (this.data.running) this._pause()
      this._stopTick()
    },
    toggle() {
      if (this.data.running) this._pause()
      else this._start()
    },
    /** 页面「开始」按钮：未运行时启动 */
    start() {
      if (!this.data.running) this._start()
    },
    /** 页面「暂停」按钮：运行中暂停 */
    pause() {
      if (this.data.running) this._pause()
    },
    /** 第一次重置回用户手动设置的工作 / 休息时长，第二次回默认值，如此交替 */
    reset() {
      this._stopTick()
      started = false
      workMs = nextResetUsesDefault ? DEFAULT_WORK_MS : manualWorkMs
      restMs = nextResetUsesDefault ? DEFAULT_REST_MS : manualRestMs
      nextResetUsesDefault = !nextResetUsesDefault
      remainingMs = workMs
      endAt = 0
      this.setData({
        phase: 'work',
        running: false,
        finished: false,
        completed: 0,
        display: this._fmt(remainingMs),
      })
      this._emitState()
    },
    /** 运行中只记录；当前阶段空闲（未运行、未结束）时立即生效 */
    setDuration(key: string, ms: number) {
      const value = Math.max(MIN_DURATION_MS, Number(ms) || 0)
      if (key === 'work') {
        manualWorkMs = value
        workMs = value
      } else if (key === 'rest') {
        manualRestMs = value
        restMs = value
      } else return
      nextResetUsesDefault = false

      const isCurrent =
        (key === 'work' && this.data.phase === 'work') ||
        (key === 'rest' && this.data.phase === 'rest')
      if (isCurrent && !this.data.running && !this.data.finished) {
        remainingMs = value
        this.setData({ display: this._fmt(value) })
      }
      this._emitState()
    },
    /** 「重置设置」：工作 / 休息时长回到默认，当前未开始的计时同步刷新 */
    resetDefaults() {
      manualWorkMs = DEFAULT_WORK_MS
      manualRestMs = DEFAULT_REST_MS
      workMs = DEFAULT_WORK_MS
      restMs = DEFAULT_REST_MS
      nextResetUsesDefault = false
      if (!started) {
        this._stopTick()
        remainingMs = workMs
        endAt = 0
        this.setData({
          phase: 'work',
          running: false,
          finished: false,
          completed: 0,
          display: this._fmt(remainingMs),
        })
      }
      this._emitState()
    },

    _durationOf(phase: Phase): number {
      return phase === 'work' ? workMs : restMs
    },

    _start() {
      started = true
      if (this.data.finished) {
        const phase = nextPhase(this.data.phase)
        remainingMs = this._durationOf(phase)
        this.setData({ phase, finished: false, display: this._fmt(remainingMs) })
      } else if (remainingMs <= 0) {
        remainingMs = this._durationOf(this.data.phase)
      }
      endAt = Date.now() + remainingMs
      this.setData({ running: true })
      this._startTick()
      this._emitState()
    },

    _pause() {
      const rem = Math.max(0, endAt - Date.now())
      if (rem <= 0) {
        this._endStage()
        return
      }
      remainingMs = rem
      endAt = 0
      this._stopTick()
      this.setData({ display: this._fmt(rem), running: false })
      this._emitState()
    },

    _tick() {
      const rem = Math.max(0, endAt - Date.now())
      const display = this._fmt(rem)
      // 「整秒」精度下同一秒内不必重复 setData
      if (display !== this.data.display) this.setData({ display })
      if (rem <= 0) this._endStage()
    },

    _endStage() {
      const completed =
        this.data.phase === 'work' ? this.data.completed + 1 : this.data.completed
      remainingMs = 0
      endAt = 0
      this._stopTick()
      this.setData({
        running: false,
        finished: true,
        completed,
        display: this._fmt(0),
      })
      this._emitState()
    },

    /** 精度设置切换后立即重排当前显示 */
    _refreshDisplay(showCentis?: boolean) {
      const remaining = this.data.running && endAt ? Math.max(0, endAt - Date.now()) : remainingMs
      this.setData({ display: this._fmt(remaining, showCentis) })
    },

    /** 按当前精度设置格式化（含 / 不含百分秒） */
    _fmt(ms: number, showCentis?: boolean): string {
      const withCentis = typeof showCentis === 'boolean' ? showCentis : this.data.showCentis
      return withCentis ? formatHMSxx(ms) : formatHMS(ms)
    },

    _startTick() {
      this._stopTick()
      tickTimer = setInterval(() => this._tick(), TICK_MS)
    },

    _stopTick() {
      if (tickTimer) {
        clearInterval(tickTimer)
        tickTimer = undefined
      }
    },

    _subTime(): string {
      // 未开始时不显示「工作时间」等提示，点击开始后才出现
      if (!started) return ''
      const { phase, finished, completed } = this.data
      if (phase === 'work') {
        return finished
          ? `工作时间 · 已完成 ${completed} 个番茄`
          : `工作时间 · 第 ${completed + 1} 个番茄`
      }
      return `休息时间 · 已完成 ${completed} 个番茄`
    },

    _nextText(): string {
      if (!this.data.finished) return ''
      const next = nextPhase(this.data.phase)
      const label = next === 'rest' ? '休息时间' : '工作时间'
      return `进入${label} ${formatDurationLabel(this._durationOf(next))}`
    },

    _emitState() {
      this.triggerEvent('statechange', {
        running: this.data.running,
        finished: this.data.finished,
        started,
        subTime: this._subTime(),
        capabilities: { toggle: true, reset: true },
        actions: buildActions(),
        editable: !started,
        editKey: this.data.phase,
        editValueMs: remainingMs,
        phase: this.data.phase,
        nextText: this._nextText(),
      })
    },
  },
})
