// clock-timer.ts
// 时钟模式：主时间显示当前时间，子时间显示日期（12 小时制时追加上午/下午）；支持高精度、一次性闹钟与计次。
// 样式由页面统一下发，闹钟运行时在组件内，振动/提示音与持久化由页面负责。
import { formatDateCN, formatClock, meridiemOf, pad2 } from '../../utils/time'

const TICK_MS_HI = 16
const TICK_MS_LO = 250
const DAY_MS = 24 * 60 * 60 * 1000
const ALARM_CHECK_MS = 1000
// 后台 / 锁屏错过太久的不补响，顺延到下一次
const ALARM_LATE_MS = 10 * 60 * 1000

let isActive = false
let dateStr = ''
let meridiem = ''
let alarmOn = false
let alarmHour = 0
let alarmMinute = 0
// 闹钟目标时间戳（下一次命中该时:分）。
// 闹钟检查独立于「是否处于时钟模式」，切到其他模式也会到点提醒。
let alarmAtMs = 0
let alarmFired = false
let laps: { index: number; cumulativeMs: number; splitMs: number }[] = []
let tickTimer: ReturnType<typeof setInterval> | undefined
let alarmTimer: ReturnType<typeof setInterval> | undefined

/** 从现在起的下一次 hour:minute 时间戳（今天已过则顺延到明天） */
const nextAlarmAt = (hour: number, minute: number, from: number): number => {
  const d = new Date(from)
  d.setHours(hour, minute, 0, 0)
  const at = d.getTime()
  return at <= from ? at + DAY_MS : at
}

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
      alarmAtMs = 0
      this._stopAlarmTimer()
      laps = []
      meridiem = ''
      this._render()
      this._emitState()
    },
    detached() {
      this._stopTick()
      this._stopAlarmTimer()
    },
  },

  pageLifetimes: {
    show() {
      if (isActive) this._startTick()
      // 回到前台时补查一次：后台期间越过目标则尽快提醒
      if (alarmOn) {
        this._checkAlarm(new Date())
        this._startAlarmTimer()
      }
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

    /**
     * 页面在闹钟面板确认或启动回填时调用：开启并保存时:分
     * @param setAtMs 设置闹钟的时刻（回填时传入），据此还原原本要响的目标时间；
     *                省略时按当前时间计算
     */
    setAlarm(hour: number, minute: number, setAtMs?: number) {
      const from = typeof setAtMs === 'number' && setAtMs > 0 ? setAtMs : Date.now()
      const d = new Date(from)
      alarmOn = true
      alarmHour = hour
      alarmMinute = minute
      alarmFired = false
      // 设到当前分钟时立刻算作已到点；否则取设置之后的下一次命中时间
      alarmAtMs =
        d.getHours() === hour && d.getMinutes() === minute
          ? from
          : nextAlarmAt(hour, minute, from)
      this._startAlarmTimer()
      this._emitState()
    },
    /** 页面「关闭闹钟」或到点关闭时调用 */
    clearAlarm() {
      alarmOn = false
      alarmFired = false
      alarmAtMs = 0
      this._stopAlarmTimer()
      this._emitState()
    },
    /** 「重置设置」：关闭闹钟 */
    resetDefaults() {
      alarmOn = false
      alarmFired = false
      alarmAtMs = 0
      this._stopAlarmTimer()
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

    /** 一次性闹钟：到点触发并自动关闭；错过太久则顺延到下一次 */
    _checkAlarm(now: Date) {
      if (!alarmOn || alarmFired) return
      const nowMs = now.getTime()
      if (nowMs < alarmAtMs) return
      if (nowMs - alarmAtMs > ALARM_LATE_MS) {
        alarmAtMs = nextAlarmAt(alarmHour, alarmMinute, nowMs)
        return
      }
      alarmFired = true
      alarmOn = false
      this._stopAlarmTimer()
      this.triggerEvent('alarmfire', {})
      this._emitState()
    },

    _startAlarmTimer() {
      this._stopAlarmTimer()
      if (!alarmOn) return
      alarmTimer = setInterval(() => this._checkAlarm(new Date()), ALARM_CHECK_MS)
    },

    _stopAlarmTimer() {
      if (alarmTimer) {
        clearInterval(alarmTimer)
        alarmTimer = undefined
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
