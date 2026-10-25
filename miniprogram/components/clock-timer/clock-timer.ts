// clock-timer.ts
// 时钟模式：主时间显示当前时间，子时间显示日期；支持高精度（百分秒）与一次性闹钟。
// 样式由页面统一下发，闹钟运行时在组件内，振动/提示音与持久化由页面负责。
import { formatClockHMS, formatClockHMSxx, formatDateCN, pad2 } from '../../utils/time'

const TICK_MS_HI = 16
const TICK_MS_LO = 250

let isActive = false
let dateStr = ''
let alarmOn = false
let alarmHour = 0
let alarmMinute = 0
let alarmFired = false
let tickTimer: ReturnType<typeof setInterval> | undefined

Component({
  properties: {
    // 由页面下发：是否显示秒后的两位小数（与其余三个组件一致）
    showCentis: {
      type: Boolean,
      value: true,
      observer(this: any, value: boolean) {
        this._refreshDisplay(value)
        if (isActive) this._startTick(value)
      },
    },
  },

  data: {
    display: '00:00:00',
  },

  lifetimes: {
    attached() {
      isActive = false
      alarmOn = false
      alarmFired = false
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
    /** 离开时钟模式：停表 */
    deactivate() {
      isActive = false
      this._stopTick()
    },
    toggle() {},
    start() {},
    pause() {},
    reset() {},
    setDuration() {},

    /** 页面在闹钟面板确认时调用：开启并保存时:分 */
    setAlarm(hour: number, minute: number) {
      alarmOn = true
      alarmHour = hour
      alarmMinute = minute
      alarmFired = false
      this._emitState()
    },
    /** 页面「关闭闹钟」或到点关闭时调用 */
    clearAlarm() {
      alarmOn = false
      alarmFired = false
      this._emitState()
    },

    _render() {
      const now = new Date()
      dateStr = formatDateCN(now)
      this.setData({ display: this._fmt(now) })
      this._checkAlarm(now)
    },

    _tick() {
      const now = new Date()
      const display = this._fmt(now)
      if (display !== this.data.display) this.setData({ display })
      const nextDate = formatDateCN(now)
      if (nextDate !== dateStr) {
        dateStr = nextDate
        this._emitState()
      }
      this._checkAlarm(now)
    },

    _fmt(d: Date): string {
      return this.data.showCentis ? formatClockHMSxx(d) : formatClockHMS(d)
    },

    _refreshDisplay(showCentis?: boolean) {
      const now = new Date()
      const withCentis = typeof showCentis === 'boolean' ? showCentis : this.data.showCentis
      this.setData({ display: withCentis ? formatClockHMSxx(now) : formatClockHMS(now) })
    },

    /** 一次性闹钟：仅当天，当前时:分命中即触发并自动关闭 */
    _checkAlarm(now: Date) {
      if (!alarmOn || alarmFired) return
      if (now.getHours() === alarmHour && now.getMinutes() === alarmMinute) {
        alarmFired = true
        alarmOn = false
        this.triggerEvent('alarmfire', {})
        this._emitState()
      }
    },

    _startTick(showCentis?: boolean) {
      this._stopTick()
      const withCentis = typeof showCentis === 'boolean' ? showCentis : this.data.showCentis
      const ms = withCentis ? TICK_MS_HI : TICK_MS_LO
      tickTimer = setInterval(() => this._tick(), ms)
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
        started: false,
        subTime: dateStr,
        capabilities: { toggle: false, reset: false },
        actions: [],
        editable: false,
        editKey: '',
        editValueMs: 0,
        alarmOn,
        alarmText: alarmOn ? `${pad2(alarmHour)}:${pad2(alarmMinute)}` : '',
      })
    },
  },
})
