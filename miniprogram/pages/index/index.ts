// index.ts
// 大屏计时器：时钟 / 正计时 / 倒计时
import { formatClockHMS, formatDateCN, formatHMSxx } from '../../utils/time'

type Mode = 'clock' | 'stopwatch' | 'countdown'
type StyleKey = 'white' | 'green' | 'amber'

const STYLE_ORDER: StyleKey[] = ['white', 'green', 'amber']
const STYLE_LABELS: Record<StyleKey, string> = {
  white: '白色',
  green: '绿色',
  amber: '琥珀',
}

const TICK_FAST = 16 // 走表（百分秒）
const TICK_SLOW = 250 // 时钟

// 非渲染状态放模块级（本页单实例），避免进 data 触发重渲染
let swBaseMs = 0
let swStartAt = 0
let cdEndAt = 0
let slowTimer: ReturnType<typeof setInterval> | undefined
let fastTimer: ReturnType<typeof setInterval> | undefined

Component({
  data: {
    mode: 'clock' as Mode,
    theme: 'dark' as 'dark' | 'light',
    style: 'white' as StyleKey,
    styleLabel: '白色',

    // 时钟
    dateStr: '',
    timeStr: '',

    // 正计时
    swRunning: false,
    swDisplay: '00:00:00.00',

    // 倒计时
    cdRunning: false,
    cdFinished: false,
    cdDisplay: '00:01:00.00',
    cdDurationMs: 60000,
    cdRemainingMs: 60000,
    cdH: 0,
    cdM: 1,
    cdS: 0,

    // 面板
    showSettingsPanel: false,
  },

  lifetimes: {
    attached() {
      this._loadPersisted()
      this._renderCountdown()
      this._refreshClock()
      this._startSlowTimer()
    },
    detached() {
      this._clearTimers()
      wx.setKeepScreenOn({ keepScreenOn: false })
    },
  },

  pageLifetimes: {
    show() {
      this._refreshClock()
      this._startSlowTimer()
      if (this.data.swRunning || this.data.cdRunning) this._startFastTimer()
    },
    hide() {
      this._clearTimers()
      wx.setKeepScreenOn({ keepScreenOn: false })
    },
  },

  methods: {
    // ===== 模式切换 =====
    onSwitchMode(e: any) {
      const mode = e.currentTarget.dataset.mode as Mode
      if (mode === this.data.mode) return
      if (this.data.swRunning || this.data.cdRunning) this._pause()
      this.setData({ mode, showSettingsPanel: false })
    },

    // ===== 开始 / 暂停 =====
    onStartStop() {
      if (this.data.mode === 'clock') return
      if (this.data.swRunning || this.data.cdRunning) this._pause()
      else this._start()
    },

    _start() {
      if (this.data.mode === 'stopwatch') {
        swStartAt = Date.now()
        this.setData({ swRunning: true })
      } else {
        if (this.data.cdRemainingMs <= 0) this._syncCountdownFromDuration()
        cdEndAt = Date.now() + this.data.cdRemainingMs
        this.setData({ cdRunning: true, cdFinished: false })
      }
      this._startFastTimer()
      wx.setKeepScreenOn({ keepScreenOn: true })
    },

    _pause() {
      if (this.data.mode === 'stopwatch' && this.data.swRunning) {
        swBaseMs += Date.now() - swStartAt
        swStartAt = 0
        this.setData({ swRunning: false, swDisplay: formatHMSxx(swBaseMs) })
      } else if (this.data.mode === 'countdown' && this.data.cdRunning) {
        const remaining = Math.max(0, cdEndAt - Date.now())
        this.setData({ cdRemainingMs: remaining, cdDisplay: formatHMSxx(remaining), cdRunning: false })
      }
      this._stopFastTimer()
      wx.setKeepScreenOn({ keepScreenOn: false })
    },

    onReset() {
      if (this.data.mode === 'stopwatch') {
        swBaseMs = 0
        swStartAt = 0
        this.setData({ swRunning: false, swDisplay: '00:00:00.00' })
      } else {
        this._syncCountdownFromDuration()
        this.setData({ cdRunning: false, cdFinished: false })
      }
      this._stopFastTimer()
      wx.setKeepScreenOn({ keepScreenOn: false })
    },

    // ===== 走表 tick =====
    _tickFast() {
      if (this.data.mode === 'stopwatch') {
        const elapsed = swBaseMs + (Date.now() - swStartAt)
        this.setData({ swDisplay: formatHMSxx(elapsed) })
      } else if (this.data.mode === 'countdown') {
        const remaining = Math.max(0, cdEndAt - Date.now())
        this.setData({ cdRemainingMs: remaining, cdDisplay: formatHMSxx(remaining) })
        if (remaining <= 0) this._onCountdownEnd()
      }
    },

    _onCountdownEnd() {
      this._pause()
      this.setData({ cdFinished: true, cdRemainingMs: 0, cdDisplay: '00:00:00.00' })
      wx.vibrateLong()
    },

    // ===== 时钟 =====
    _refreshClock() {
      const now = new Date()
      this.setData({ dateStr: formatDateCN(now), timeStr: formatClockHMS(now) })
    },

    // ===== 倒计时设置 =====
    _syncCountdownFromDuration() {
      this.setData({
        cdRemainingMs: this.data.cdDurationMs,
        cdDisplay: formatHMSxx(this.data.cdDurationMs),
      })
    },
    _renderCountdown() {
      this.setData({ cdDisplay: formatHMSxx(this.data.cdRemainingMs) })
    },

    // ===== 样式 / 主题 / 设置 =====
    cycleStyle() {
      const current = STYLE_ORDER.indexOf(this.data.style)
      const style = STYLE_ORDER[(current + 1) % STYLE_ORDER.length]
      this.setData({ style, styleLabel: STYLE_LABELS[style] })
      wx.setStorageSync('timer.style', style)
    },
    toggleTheme() {
      const theme = this.data.theme === 'dark' ? 'light' : 'dark'
      this.setData({ theme })
      wx.setStorageSync('timer.theme', theme)
    },
    toggleSettings() {
      this.setData({ showSettingsPanel: !this.data.showSettingsPanel })
    },
    onCdHInput(e: any) {
      this.setData({ cdH: Number(e.detail.value) || 0 })
    },
    onCdMInput(e: any) {
      this.setData({ cdM: Number(e.detail.value) || 0 })
    },
    onCdSInput(e: any) {
      this.setData({ cdS: Number(e.detail.value) || 0 })
    },
    applyCdDuration() {
      const ms = ((this.data.cdH * 60 + this.data.cdM) * 60 + this.data.cdS) * 1000
      const clamped = Math.max(0, ms)
      const totalSec = Math.floor(clamped / 1000)
      this.setData({
        cdDurationMs: clamped,
        cdRemainingMs: clamped,
        cdDisplay: formatHMSxx(clamped),
        cdFinished: false,
        cdH: Math.floor(totalSec / 3600),
        cdM: Math.floor((totalSec % 3600) / 60),
        cdS: totalSec % 60,
        showSettingsPanel: false,
      })
      wx.setStorageSync('timer.cdDurationMs', clamped)
    },

    // ===== 持久化 =====
    _loadPersisted() {
      const theme = wx.getStorageSync('timer.theme')
      const style = wx.getStorageSync('timer.style')
      const cdDurationMs = wx.getStorageSync('timer.cdDurationMs')
      const updates: any = {}
      if (theme === 'light' || theme === 'dark') updates.theme = theme
      if (style === 'white' || style === 'green' || style === 'amber') {
        updates.style = style
        updates.styleLabel = STYLE_LABELS[style as StyleKey]
      }
      if (typeof cdDurationMs === 'number' && cdDurationMs > 0) {
        const totalSec = Math.floor(cdDurationMs / 1000)
        updates.cdDurationMs = cdDurationMs
        updates.cdRemainingMs = cdDurationMs
        updates.cdH = Math.floor(totalSec / 3600)
        updates.cdM = Math.floor((totalSec % 3600) / 60)
        updates.cdS = totalSec % 60
      }
      if (Object.keys(updates).length) this.setData(updates)
    },

    // ===== 定时器 =====
    _startSlowTimer() {
      this._stopSlowTimer()
      slowTimer = setInterval(() => this._refreshClock(), TICK_SLOW)
    },
    _stopSlowTimer() {
      if (slowTimer) {
        clearInterval(slowTimer)
        slowTimer = undefined
      }
    },
    _startFastTimer() {
      this._stopFastTimer()
      fastTimer = setInterval(() => this._tickFast(), TICK_FAST)
    },
    _stopFastTimer() {
      if (fastTimer) {
        clearInterval(fastTimer)
        fastTimer = undefined
      }
    },
    _clearTimers() {
      this._stopSlowTimer()
      this._stopFastTimer()
    },
  },
})
