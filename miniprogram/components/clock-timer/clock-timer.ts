// clock-timer.ts
// 时钟模式：主时间显示当前时间，子时间显示日期。样式由页面统一下发。
import { formatClockHMS, formatDateCN } from '../../utils/time'

const TICK_MS = 250

let isActive = false
let dateStr = ''
let tickTimer: ReturnType<typeof setInterval> | undefined

Component({
  data: {
    display: '00:00:00',
  },

  lifetimes: {
    attached() {
      isActive = false
      this._render()
      this._emitState()
    },
    detached() {
      this._stopTick()
    },
  },

  pageLifetimes: {
    show() {
      if (isActive) this._startTick()
    },
    hide() {
      this._stopTick()
    },
  },

  methods: {
    /** 进入时钟模式：立即刷新并开始走秒 */
    activate() {
      isActive = true
      this._render()
      this._startTick()
      this._emitState()
    },
    /** 离开时钟模式：停表（时钟没有进度需要保留） */
    deactivate() {
      isActive = false
      this._stopTick()
    },
    toggle() {},
    start() {},
    pause() {},
    reset() {},
    setDuration() {},

    _render() {
      const now = new Date()
      dateStr = formatDateCN(now)
      this.setData({ display: formatClockHMS(now) })
    },

    _tick() {
      const now = new Date()
      this.setData({ display: formatClockHMS(now) })
      const nextDate = formatDateCN(now)
      if (nextDate !== dateStr) {
        dateStr = nextDate
        this._emitState()
      }
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
        running: false,
        finished: false,
        subTime: dateStr,
        capabilities: { toggle: false, reset: false },
        actions: [],
        editable: false,
        editKey: '',
        editValueMs: 0,
      })
    },
  },
})
