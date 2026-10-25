// stopwatch-timer.ts
// 正计时：从 0 开始累计，支持开始 / 暂停 / 重置 / 结束上限 / 计次。样式由页面统一下发。
import { formatHMS, formatHMSxx } from '../../utils/time'

const TICK_MS = 16

let isActive = false
let started = false
let baseMs = 0
let startAt = 0
let limitMs = 0
let laps: { index: number; cumulativeMs: number; splitMs: number }[] = []
let tickTimer: ReturnType<typeof setInterval> | undefined

const buildActions = () => [
  {
    key: 'limit',
    label: '结束时长',
    kind: 'duration',
    title: '结束时长',
    valueMs: limitMs,
    minMs: 0,
    storageKey: 'timer.swLimitMs',
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
    display: '00:00:00.00',
    running: false,
    finished: false,
  },

  lifetimes: {
    attached() {
      isActive = false
      started = false
      baseMs = 0
      startAt = 0
      limitMs = 0
      laps = []
      this.setData({ display: this._fmt(0), running: false, finished: false })
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
    reset() {
      this._stopTick()
      started = false
      baseMs = 0
      startAt = 0
      laps = []
      this.setData({ display: this._fmt(0), running: false, finished: false })
      this._emitState()
    },
    /** 页面设置结束上限（0 表示不限）；重置不清除该设置 */
    setDuration(key: string, ms: number) {
      if (key !== 'limit') return
      limitMs = Math.max(0, Number(ms) || 0)
      this._emitState()
    },
    /** 页面「计次」按钮：记录当前累计时间与相对上一条的分段 */
    lap() {
      if (!this.data.running) return
      const cumulativeMs = baseMs + (Date.now() - startAt)
      const prev = laps.length ? laps[laps.length - 1].cumulativeMs : 0
      laps.push({ index: laps.length + 1, cumulativeMs, splitMs: cumulativeMs - prev })
      this._emitState()
    },

    _start() {
      started = true
      if (this.data.finished) {
        baseMs = 0
        laps = []
      }
      startAt = Date.now()
      this.setData({ running: true, finished: false })
      this._startTick()
      this._emitState()
    },

    _pause() {
      baseMs += Date.now() - startAt
      startAt = 0
      this._stopTick()
      this.setData({ display: this._fmt(baseMs), running: false })
      this._emitState()
    },

    _tick() {
      const elapsed = baseMs + (Date.now() - startAt)
      const display = this._fmt(elapsed)
      if (display !== this.data.display) this.setData({ display })
      if (limitMs > 0 && elapsed >= limitMs) this._end()
    },

    _end() {
      baseMs = limitMs
      startAt = 0
      this._stopTick()
      this.setData({ display: this._fmt(limitMs), running: false, finished: true })
      this._emitState()
    },

    /** 精度设置切换后立即重排当前显示 */
    _refreshDisplay(showCentis?: boolean) {
      const current = baseMs + (startAt ? Date.now() - startAt : 0)
      this.setData({ display: this._fmt(current, showCentis) })
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

    _emitState() {
      this.triggerEvent('statechange', {
        running: this.data.running,
        finished: this.data.finished,
        started,
        subTime: '',
        capabilities: { toggle: true, reset: true },
        actions: buildActions(),
        editable: false,
        editKey: '',
        editValueMs: 0,
        laps,
      })
    },
  },
})
