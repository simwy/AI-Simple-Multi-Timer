// stopwatch-timer.ts
// 正计时：从 0 开始累计，支持开始 / 暂停 / 重置。样式由页面统一下发。
import { formatHMS, formatHMSxx } from '../../utils/time'

const TICK_MS = 16

let isActive = false
let baseMs = 0
let startAt = 0
let tickTimer: ReturnType<typeof setInterval> | undefined

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
  },

  lifetimes: {
    attached() {
      isActive = false
      baseMs = 0
      startAt = 0
      this.setData({ display: this._fmt(0), running: false })
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
      baseMs = 0
      startAt = 0
      this.setData({ display: this._fmt(0), running: false })
      this._emitState()
    },
    setDuration() {},

    _start() {
      startAt = Date.now()
      this.setData({ running: true })
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
      const display = this._fmt(baseMs + (Date.now() - startAt))
      // 「整秒」精度下同一秒内不必重复 setData
      if (display !== this.data.display) this.setData({ display })
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
        finished: false,
        subTime: '',
        capabilities: { toggle: true, reset: true },
        actions: [],
        editable: false,
        editKey: '',
        editValueMs: 0,
      })
    },
  },
})
