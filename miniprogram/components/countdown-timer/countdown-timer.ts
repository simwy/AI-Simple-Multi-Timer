// countdown-timer.ts
// 倒计时：从设定时长倒数到 0，支持开始 / 暂停 / 重置 / 设置时长。样式由页面统一下发。
import { formatHMSxx } from '../../utils/time'

const TICK_MS = 16
const DEFAULT_DURATION_MS = 60 * 1000

let isActive = false
let durationMs = DEFAULT_DURATION_MS
let remainingMs = DEFAULT_DURATION_MS
let endAt = 0
let tickTimer: ReturnType<typeof setInterval> | undefined

const buildActions = () => [
  {
    key: 'countdown',
    label: '设置',
    kind: 'duration',
    title: '倒计时时长',
    valueMs: durationMs,
    minMs: 0,
    storageKey: 'timer.cdDurationMs',
  },
]

Component({
  data: {
    display: formatHMSxx(DEFAULT_DURATION_MS),
    running: false,
    finished: false,
  },

  lifetimes: {
    attached() {
      isActive = false
      durationMs = DEFAULT_DURATION_MS
      remainingMs = durationMs
      endAt = 0
      this.setData({
        display: formatHMSxx(remainingMs),
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
    reset() {
      this._stopTick()
      remainingMs = durationMs
      endAt = 0
      this.setData({
        display: formatHMSxx(remainingMs),
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
        this.setData({ display: formatHMSxx(durationMs), finished: false })
      }
      this._emitState()
    },

    _start() {
      if (this.data.finished || remainingMs <= 0) {
        remainingMs = durationMs
        this.setData({ display: formatHMSxx(remainingMs), finished: false })
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
      this.setData({ display: formatHMSxx(remainingMs), running: false })
      this._emitState()
    },

    _tick() {
      const rem = Math.max(0, endAt - Date.now())
      this.setData({ display: formatHMSxx(rem) })
      if (rem <= 0) this._end()
    },

    _end() {
      remainingMs = 0
      endAt = 0
      this._stopTick()
      this.setData({ display: '00:00:00.00', running: false, finished: true })
      this._emitState()
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
        subTime: '',
        capabilities: { toggle: true, reset: true },
        actions: buildActions(),
      })
    },
  },
})
