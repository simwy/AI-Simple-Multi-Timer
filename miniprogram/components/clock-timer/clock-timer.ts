// clock-timer.ts
// 时钟模式：主时间显示当前时间，子时间显示日期（12 小时制时追加上午/下午）；支持高精度、一次性闹钟与计次。
// 样式由页面统一下发，闹钟运行时在组件内，振动/提示音与持久化由页面负责。
import { formatDateCN, formatClock, meridiemOf, pad2 } from '../../utils/time'

const TICK_MS_HI = 16
const TICK_MS_LO = 250

let isActive = false
let dateStr = ''
let meridiem = ''
let alarmOn = false
let alarmHour = 0
let alarmMinute = 0
let alarmFired = false
let laps: { index: number; cumulativeMs: number; splitMs: number }[] = []
let tickTimer: ReturnType<typeof setInterval> | undefined

Component({
  properties: {
    // 由页面下发：是否显示秒后的两位小数（与其余三个组件一致）
    showCentis: {
      type: Boolean,
      value: true,
      observer(this: any) {
        this._refreshDisplay()
        if (isActive) this._startTick()
      },
    },
    // 由页面下发：是否显示秒（关闭后同时隐藏百分秒）
    showSeconds: {
      type: Boolean,
      value: true,
      observer(this: any) {
        this._refreshDisplay()
        if (isActive) this._startTick()
      },
    },
    // 由页面下发：是否 24 小时制（否则 12 小时制）
    clock24h: {
      type: Boolean,
      value: true,
      observer(this: any) {
        this._render()
        this._emitState()
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
      laps = []
      meridiem = ''
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

    /** 页面「计次」按钮：记录当前时刻 */
    lap() {
      const now = new Date()
      const msOfDay =
        ((now.getHours() * 60 + now.getMinutes()) * 60 + now.getSeconds()) * 1000
      laps.push({ index: laps.length + 1, cumulativeMs: msOfDay, splitMs: 0 })
      this._emitState()
    },
    /** 页面「清空」按钮：清空计次 */
    clearLaps() {
      laps = []
      this._emitState()
    },

    _render() {
      const now = new Date()
      dateStr = formatDateCN(now)
      meridiem = this.data.clock24h ? '' : meridiemOf(now)
      this.setData({ display: this._fmt(now) })
      this._checkAlarm(now)
    },

    _tick() {
      const now = new Date()
      const display = this._fmt(now)
      if (display !== this.data.display) this.setData({ display })
      const nextDate = formatDateCN(now)
      const nextMeridiem = this.data.clock24h ? '' : meridiemOf(now)
      if (nextDate !== dateStr || nextMeridiem !== meridiem) {
        dateStr = nextDate
        meridiem = nextMeridiem
        this._emitState()
      }
      this._checkAlarm(now)
    },

    _fmt(d: Date): string {
      return formatClock(d, !this.data.clock24h, this.data.showSeconds, this.data.showCentis)
    },

    _refreshDisplay() {
      this.setData({ display: this._fmt(new Date()) })
    },

    _subTime(): string {
      return dateStr + (meridiem ? `  ${meridiem}` : '')
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

    _startTick() {
      this._stopTick()
      const ms = this.data.showCentis && this.data.showSeconds ? TICK_MS_HI : TICK_MS_LO
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
        subTime: this._subTime(),
        capabilities: { toggle: false, reset: false },
        actions: [],
        editable: false,
        editKey: '',
        editValueMs: 0,
        alarmOn,
        alarmText: alarmOn ? `${pad2(alarmHour)}:${pad2(alarmMinute)}` : '',
        laps,
      })
    },
  },
})
