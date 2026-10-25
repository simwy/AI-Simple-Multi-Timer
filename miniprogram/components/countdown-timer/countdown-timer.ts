// countdown-timer.ts
// 倒计时：从设定时长倒数到 0，支持开始 / 暂停 / 重置 / 设置时长。样式由页面统一下发。
import { formatHMS, formatHMSxx } from '../../utils/time'

const TICK_MS = 16
const DEFAULT_DURATION_MS = 60 * 1000

let isActive = false
let started = false
let durationMs = DEFAULT_DURATION_MS
let remainingMs = DEFAULT_DURATION_MS
let endAt = 0
let tickTimer: ReturnType<typeof setInterval> | undefined

const buildActions = () => [
  {
    key: 'countdown',
    label: '倒计时长',
    kind: 'duration',
    title: '倒计时时长',
    valueMs: durationMs,
    minMs: 0,
    storageKey: 'timer.cdDurationMs',
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
    display: formatHMSxx(DEFAULT_DURATION_MS),
    running: false,
    finished: false,
  },

  lifetimes: {
    attached() {
      isActive = false
      started = false
      durationMs = DEFAULT_DURATION_MS
      remainingMs = durationMs
      endAt = 0
      this.setData({
        display: this._fmt(remainingMs),
        running: false,
        finished: false,
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
    reset() {
      this._stopTick()
      started = false
      remainingMs = durationMs
      endAt = 0
      this.setData({
        display: this._fmt(remainingMs),
        running: false,
        finished: false,
      })
      this._emitState()
    },
    /** 页面在弹层确认或首次回填时调用；运行中只记录，下次重置 / 开始时生效 */
    setDuration(key: string, ms: number) {
      if (key !== 'countdown') return
      durationMs = Math.max(0, Number(ms) || 0)
      if (!this.data.running) {
        remainingMs = durationMs
        this.setData({ display: this._fmt(durationMs), finished: false })
      }
      this._emitState()
    },

    _start() {
      started = true
      if (this.data.finished || remainingMs <= 0) {
        remainingMs = durationMs
        this.setData({ display: this._fmt(remainingMs), finished: false })
      }
      endAt = Date.now() + remainingMs
      this.setData({ running: true })
      this._startTick()
      this._emitState()
    },

    _pause() {
      const rem = Math.max(0, endAt - Date.now())
      if (rem <= 0) {
        this._end()
        return
      }
      remainingMs = rem
      endAt = 0
      this._stopTick()
      this.setData({ display: this._fmt(remainingMs), running: false })
      this._emitState()
    },

    _tick() {
      const rem = Math.max(0, endAt - Date.now())
      const display = this._fmt(rem)
      // 「整秒」精度下同一秒内不必重复 setData
      if (display !== this.data.display) this.setData({ display })
      if (rem <= 0) this._end()
    },

    _end() {
      remainingMs = 0
      endAt = 0
      this._stopTick()
      this.setData({ display: this._fmt(0), running: false, finished: true })
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

    _emitState() {
      this.triggerEvent('statechange', {
        running: this.data.running,
        finished: this.data.finished,
        started,
        subTime: '',
        capabilities: { toggle: true, reset: true },
        actions: buildActions(),
        editable: !started,
        editKey: 'countdown',
        editValueMs: durationMs,
      })
    },
  },
})
