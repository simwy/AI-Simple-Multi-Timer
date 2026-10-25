# 番茄计时 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在现有大屏计时器中新增第四种「番茄」模式：工作/休息循环、手动推进、震动与视觉提醒，并新增工作/休息时长设置。

**Architecture:** 番茄逻辑放进独立组件 `components/pomodoro-timer`，自包含 16ms tick、阶段状态机与数字显示；页面保留分段控件、右下角按钮、副标题、底部胶囊与设置面板，通过 `selectComponent` 转发操作、通过 `statechange` 事件同步按钮与文案状态。设置面板泛化为 countdown / work / rest 三个目标，共享时:分:秒输入。

**Tech Stack:** 微信小程序、TypeScript、Sass、Skyline、glass-easel、`Component()` 写法。

**项目约定:** 没有测试框架与 CLI 构建，只能靠微信开发者工具编译与手测。全局约定不自动 `git commit` / `git push`；计划中不包含自动提交步骤，完成后由用户确认再提交。

---

## Task 1: 新增时长标签格式化函数

**Files:**
- Modify: `miniprogram/utils/time.ts`

**Step 1: 在文件末尾追加函数**

在 `formatClockHMS` 之后追加：

```ts
/** 毫秒 → MM:SS；满 1 小时 → H:MM:SS（用于胶囊标签） */
export const formatDurationLabel = (ms: number): string => {
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`
}
```

**Step 2: 手算核对期望值**

- `formatDurationLabel(25 * 60 * 1000)` → `"25:00"`
- `formatDurationLabel(5 * 60 * 1000)` → `"05:00"`
- `formatDurationLabel(60 * 60 * 1000)` → `"01:00:00"`
- `formatDurationLabel(1000)` → `"00:01"`

**Step 3: DevTools 编译**

用微信开发者工具打开项目，确认 `utils/time.ts` 无 TypeScript 报错。

---

## Task 2: 创建番茄组件四件套

**Files:**
- Create: `miniprogram/components/pomodoro-timer/pomodoro-timer.json`
- Create: `miniprogram/components/pomodoro-timer/pomodoro-timer.wxml`
- Create: `miniprogram/components/pomodoro-timer/pomodoro-timer.scss`
- Create: `miniprogram/components/pomodoro-timer/pomodoro-timer.ts`

**Step 1: 创建 `pomodoro-timer.json`**

```json
{
  "component": true
}
```

**Step 2: 创建 `pomodoro-timer.wxml`**

```xml
<!--pomodoro-timer.wxml-->
<view class="pomo">
  <text class="digits style-{{styleKey}} {{finished ? 'finished' : ''}}">{{display}}</text>
</view>
```

**Step 3: 创建 `pomodoro-timer.scss`**

```scss
/* 番茄数字显示：主题变量由页面 .page 继承 */
.pomo {
  flex: 1;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.pomo text {
  font-family: 'TimerDigits', "SF Mono", "DIN Alternate", Menlo, Consolas, monospace;
  color: var(--fg);
  font-size: 14vw;
  text-align: center;
  white-space: nowrap;
  letter-spacing: 2px;
  text-shadow: 0 0 20px var(--glow);
}

.pomo .style-green {
  color: #34d058;
  text-shadow: 0 0 20px rgba(52, 208, 88, 0.45);
}

.pomo .style-amber {
  color: #ffb020;
  text-shadow: 0 0 20px rgba(255, 176, 32, 0.45);
}

.pomo .finished {
  color: #ff453a;
  text-shadow: 0 0 20px rgba(255, 69, 58, 0.55);
  animation: blink 0.5s ease-in-out infinite alternate;
}

@keyframes blink {
  from { opacity: 1; }
  to { opacity: 0.2; }
}
```

**Step 4: 创建 `pomodoro-timer.ts`**

```ts
// pomodoro-timer.ts
// 番茄计时：工作 / 休息阶段循环（页面内单实例，引擎状态放模块级）
import { formatHMSxx } from '../../utils/time'

const TICK_MS = 16
const DEFAULT_WORK_MS = 25 * 60 * 1000
const DEFAULT_REST_MS = 5 * 60 * 1000
const MIN_DURATION_MS = 1000

type Phase = 'work' | 'rest'

// 单实例组件：引擎状态放模块级，避免 setData 开销
let endAt = 0
let remainingMs = DEFAULT_WORK_MS
let tickTimer: ReturnType<typeof setInterval> | undefined

const nextPhase = (phase: Phase): Phase => (phase === 'work' ? 'rest' : 'work')

Component({
  properties: {
    workDurationMs: {
      type: Number,
      value: DEFAULT_WORK_MS,
      observer(this: any, value: number) {
        this._onDurationChange('work', value)
      },
    },
    restDurationMs: {
      type: Number,
      value: DEFAULT_REST_MS,
      observer(this: any, value: number) {
        this._onDurationChange('rest', value)
      },
    },
    styleKey: {
      type: String,
      value: 'white',
    },
  },

  data: {
    phase: 'work' as Phase,
    running: false,
    finished: false,
    completed: 0,
    display: formatHMSxx(DEFAULT_WORK_MS),
  },

  lifetimes: {
    attached() {
      endAt = 0
      remainingMs = this._durationOf('work')
      this.setData({ display: formatHMSxx(remainingMs) })
    },
    detached() {
      this._stopTick()
    },
  },

  pageLifetimes: {
    show() {
      if (this.data.running) this._startTick()
    },
    hide() {
      this._stopTick()
      wx.setKeepScreenOn({ keepScreenOn: false })
    },
  },

  methods: {
    /** 开始 / 暂停 / 待开始时进入下一阶段 */
    toggle(this: any) {
      if (this.data.running) this._pause()
      else this._start()
    },

    /** 重置整个番茄循环 */
    reset(this: any) {
      this._stopTick()
      endAt = 0
      remainingMs = this._durationOf('work')
      this.setData({
        phase: 'work',
        running: false,
        finished: false,
        completed: 0,
        display: formatHMSxx(remainingMs),
      })
      wx.setKeepScreenOn({ keepScreenOn: false })
      this._emitState()
    },

    /** 仅暂停（切换模式时由页面调用） */
    pause(this: any) {
      if (this.data.running) this._pause()
    },

    _durationOf(this: any, phase: Phase): number {
      const raw = phase === 'work' ? this.data.workDurationMs : this.data.restDurationMs
      return Math.max(MIN_DURATION_MS, Number(raw) || 0)
    },

    /** 时长变化：仅当对应阶段空闲时立即更新显示 */
    _onDurationChange(this: any, phase: Phase, value: number) {
      const ms = Math.max(MIN_DURATION_MS, Number(value) || 0)
      if (this.data.phase === phase && !this.data.running && !this.data.finished) {
        remainingMs = ms
        this.setData({ display: formatHMSxx(ms) })
      }
    },

    _start(this: any) {
      if (this.data.finished) {
        const phase = nextPhase(this.data.phase)
        remainingMs = this._durationOf(phase)
        this.setData({ phase, finished: false, display: formatHMSxx(remainingMs) })
      } else if (remainingMs <= 0) {
        remainingMs = this._durationOf(this.data.phase)
      }
      endAt = Date.now() + remainingMs
      this.setData({ running: true })
      this._startTick()
      wx.setKeepScreenOn({ keepScreenOn: true })
      this._emitState()
    },

    _pause(this: any) {
      const rem = Math.max(0, endAt - Date.now())
      if (rem <= 0) {
        this._endStage()
        return
      }
      remainingMs = rem
      this._stopTick()
      this.setData({ running: false, display: formatHMSxx(rem) })
      wx.setKeepScreenOn({ keepScreenOn: false })
      this._emitState()
    },

    _tick(this: any) {
      const rem = Math.max(0, endAt - Date.now())
      this.setData({ display: formatHMSxx(rem) })
      if (rem <= 0) this._endStage()
    },

    _endStage(this: any) {
      const completed =
        this.data.phase === 'work' ? this.data.completed + 1 : this.data.completed
      this._stopTick()
      endAt = 0
      remainingMs = 0
      this.setData({
        running: false,
        finished: true,
        completed,
        display: '00:00:00.00',
      })
      wx.setKeepScreenOn({ keepScreenOn: false })
      wx.vibrateLong()
      this._emitState()
    },

    _startTick(this: any) {
      this._stopTick()
      tickTimer = setInterval(() => this._tick(), TICK_MS)
    },

    _stopTick() {
      if (tickTimer) {
        clearInterval(tickTimer)
        tickTimer = undefined
      }
    },

    _emitState(this: any) {
      this.triggerEvent('statechange', {
        running: this.data.running,
        finished: this.data.finished,
        phase: this.data.phase,
        completed: this.data.completed,
      })
    },
  },
})
```

**Step 5: 在页面注册组件**

把 `miniprogram/pages/index/index.json` 改成：

```json
{
  "pageOrientation": "landscape",
  "disableScroll": true,
  "usingComponents": {
    "pomodoro-timer": "../../components/pomodoro-timer/pomodoro-timer"
  }
}
```

**Step 6: DevTools 编译**

确认组件四个文件无 TypeScript / Sass 报错（此时页面尚未使用组件，只需编译通过）。

---

## Task 3: 页面逻辑接入番茄模式

**Files:**
- Modify: `miniprogram/pages/index/index.ts`（整文件替换）

**Step 1: 用以下完整内容替换 `index.ts`**

```ts
// index.ts
// 大屏计时器：时钟 / 正计时 / 倒计时 / 番茄
import { formatClockHMS, formatDateCN, formatDurationLabel, formatHMSxx } from '../../utils/time'

type Mode = 'clock' | 'stopwatch' | 'countdown' | 'pomodoro'
type StyleKey = 'white' | 'green' | 'amber'
type DurationTarget = 'countdown' | 'work' | 'rest'

const STYLE_ORDER: StyleKey[] = ['white', 'green', 'amber']
const STYLE_LABELS: Record<StyleKey, string> = {
  white: '白色',
  green: '绿色',
  amber: '琥珀',
}

const DURATION_TITLES: Record<DurationTarget, string> = {
  countdown: '倒计时时长',
  work: '工作时长',
  rest: '休息时长',
}

const DEFAULT_WORK_MS = 25 * 60 * 1000
const DEFAULT_REST_MS = 5 * 60 * 1000
const MIN_POMODORO_MS = 1000

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

    // 番茄
    pomoRunning: false,
    pomoFinished: false,
    pomoPhase: 'work' as 'work' | 'rest',
    pomoCompleted: 0,
    pomoStageText: '专注 · 第 1 个番茄',
    workDurationMs: DEFAULT_WORK_MS,
    restDurationMs: DEFAULT_REST_MS,
    workLabel: formatDurationLabel(DEFAULT_WORK_MS),
    restLabel: formatDurationLabel(DEFAULT_REST_MS),

    // 时长设置面板（倒计时 / 工作 / 休息共用）
    durationTarget: '' as DurationTarget | '',
    durationTitle: '',
    durH: 0,
    durM: 1,
    durS: 0,
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
      if (this.data.mode === 'pomodoro') {
        const pomo = this.selectComponent('#pomo')
        if (pomo) pomo.pause()
      } else if (this.data.swRunning || this.data.cdRunning) {
        this._pause()
      }
      this.setData({ mode, durationTarget: '' })
    },

    // ===== 开始 / 暂停 =====
    onStartStop() {
      if (this.data.mode === 'clock') return
      if (this.data.mode === 'pomodoro') {
        const pomo = this.selectComponent('#pomo')
        if (pomo) pomo.toggle()
        return
      }
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
      if (this.data.mode === 'pomodoro') {
        const pomo = this.selectComponent('#pomo')
        if (pomo) pomo.reset()
        return
      }
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

    // ===== 番茄状态同步 =====
    onPomoStateChange(e: any) {
      const { running, finished, phase, completed } = e.detail as {
        running: boolean
        finished: boolean
        phase: 'work' | 'rest'
        completed: number
      }
      const pomoStageText =
        phase === 'work'
          ? finished
            ? `专注 · 已完成 ${completed} 个番茄`
            : `专注 · 第 ${completed + 1} 个番茄`
          : `休息 · 已完成 ${completed} 个番茄`
      this.setData({
        pomoRunning: running,
        pomoFinished: finished,
        pomoPhase: phase,
        pomoCompleted: completed,
        pomoStageText,
      })
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
    openDurationPanel(e: any) {
      const target = e.currentTarget.dataset.target as DurationTarget
      const ms =
        target === 'work'
          ? this.data.workDurationMs
          : target === 'rest'
            ? this.data.restDurationMs
            : this.data.cdDurationMs
      const totalSec = Math.floor(ms / 1000)
      this.setData({
        durationTarget: target,
        durationTitle: DURATION_TITLES[target],
        durH: Math.floor(totalSec / 3600),
        durM: Math.floor((totalSec % 3600) / 60),
        durS: totalSec % 60,
      })
    },
    closeDurationPanel() {
      this.setData({ durationTarget: '' })
    },
    onDurHInput(e: any) {
      this.setData({ durH: Number(e.detail.value) || 0 })
    },
    onDurMInput(e: any) {
      this.setData({ durM: Number(e.detail.value) || 0 })
    },
    onDurSInput(e: any) {
      this.setData({ durS: Number(e.detail.value) || 0 })
    },
    applyDuration() {
      const target = this.data.durationTarget
      if (!target) return
      const raw = ((this.data.durH * 60 + this.data.durM) * 60 + this.data.durS) * 1000
      const ms =
        target === 'countdown' ? Math.max(0, raw) : Math.max(MIN_POMODORO_MS, raw)
      const totalSec = Math.floor(ms / 1000)
      const updates: any = {
        durationTarget: '',
        durH: Math.floor(totalSec / 3600),
        durM: Math.floor((totalSec % 3600) / 60),
        durS: totalSec % 60,
      }
      if (target === 'countdown') {
        updates.cdDurationMs = ms
        updates.cdRemainingMs = ms
        updates.cdDisplay = formatHMSxx(ms)
        updates.cdFinished = false
        wx.setStorageSync('timer.cdDurationMs', ms)
      } else if (target === 'work') {
        updates.workDurationMs = ms
        updates.workLabel = formatDurationLabel(ms)
        wx.setStorageSync('timer.workDurationMs', ms)
      } else {
        updates.restDurationMs = ms
        updates.restLabel = formatDurationLabel(ms)
        wx.setStorageSync('timer.restDurationMs', ms)
      }
      this.setData(updates)
    },

    // ===== 持久化 =====
    _loadPersisted() {
      const theme = wx.getStorageSync('timer.theme')
      const style = wx.getStorageSync('timer.style')
      const cdDurationMs = wx.getStorageSync('timer.cdDurationMs')
      const workDurationMs = wx.getStorageSync('timer.workDurationMs')
      const restDurationMs = wx.getStorageSync('timer.restDurationMs')
      const updates: any = {}
      if (theme === 'light' || theme === 'dark') updates.theme = theme
      if (style === 'white' || style === 'green' || style === 'amber') {
        updates.style = style
        updates.styleLabel = STYLE_LABELS[style as StyleKey]
      }
      if (typeof cdDurationMs === 'number' && cdDurationMs > 0) {
        updates.cdDurationMs = cdDurationMs
        updates.cdRemainingMs = cdDurationMs
      }
      if (typeof workDurationMs === 'number' && workDurationMs > 0) {
        const ms = Math.max(MIN_POMODORO_MS, workDurationMs)
        updates.workDurationMs = ms
        updates.workLabel = formatDurationLabel(ms)
      }
      if (typeof restDurationMs === 'number' && restDurationMs > 0) {
        const ms = Math.max(MIN_POMODORO_MS, restDurationMs)
        updates.restDurationMs = ms
        updates.restLabel = formatDurationLabel(ms)
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
```

**Step 2: 检查关键点**

- `Mode` 已包含 `'pomodoro'`。
- 番茄按钮操作全部转发给 `#pomo`，不再走页面自己的 `_start/_pause`。
- `_loadPersisted` 读取 `timer.workDurationMs` / `timer.restDurationMs`。
- 原 `showSettingsPanel` / `cdH` / `cdM` / `cdS` / `toggleSettings` / `onCdXInput` / `applyCdDuration` 已全部移除。

**Step 3: DevTools 编译**

确认 `index.ts` 无 TypeScript 报错（此时 WXML 还没改，页面仍按旧结构渲染，属于中间态）。

---

## Task 4: 页面结构接入番茄模式与两个时长胶囊

**Files:**
- Modify: `miniprogram/pages/index/index.wxml`（整文件替换）

**Step 1: 用以下完整内容替换 `index.wxml`**

```xml
<!--index.wxml-->
<view class="page theme-{{theme}}">

  <!-- 顶部分段控件 -->
  <view class="modes">
    <view class="mode-item {{mode === 'clock' ? 'active' : ''}}" data-mode="clock" bindtap="onSwitchMode">时钟</view>
    <view class="mode-item {{mode === 'stopwatch' ? 'active' : ''}}" data-mode="stopwatch" bindtap="onSwitchMode">正计时</view>
    <view class="mode-item {{mode === 'countdown' ? 'active' : ''}}" data-mode="countdown" bindtap="onSwitchMode">倒计时</view>
    <view class="mode-item {{mode === 'pomodoro' ? 'active' : ''}}" data-mode="pomodoro" bindtap="onSwitchMode">番茄</view>
  </view>

  <!-- 日期（时钟）/ 番茄阶段 -->
  <view class="date" wx:if="{{mode === 'clock'}}">{{dateStr}}</view>
  <view class="date" wx:elif="{{mode === 'pomodoro'}}">{{pomoStageText}}</view>

  <!-- 中间数字：时钟 / 正计时 / 倒计时 -->
  <view class="digits {{mode === 'clock' ? 'clock' : 'timing'}} style-{{style}} {{mode === 'countdown' && cdFinished ? 'finished' : ''}}" wx:if="{{mode !== 'pomodoro'}}">
    <text wx:if="{{mode === 'clock'}}">{{timeStr}}</text>
    <text wx:elif="{{mode === 'stopwatch'}}">{{swDisplay}}</text>
    <text wx:else>{{cdDisplay}}</text>
  </view>

  <!-- 中间数字：番茄（常驻挂载，非番茄模式隐藏而非销毁） -->
  <view class="pomo-slot {{mode === 'pomodoro' ? '' : 'hidden'}}">
    <pomodoro-timer
      id="pomo"
      style-key="{{style}}"
      work-duration="{{workDurationMs}}"
      rest-duration="{{restDurationMs}}"
      bind:statechange="onPomoStateChange"
    />
  </view>

  <view class="timeup" wx:if="{{(mode === 'countdown' && cdFinished) || (mode === 'pomodoro' && pomoFinished)}}">时间到</view>

  <!-- 右下角操作（时钟模式隐藏） -->
  <view class="actions" wx:if="{{mode !== 'clock'}}">
    <view class="circle reset" bindtap="onReset">重置</view>
    <view class="circle start {{(mode === 'stopwatch' && swRunning) || (mode === 'countdown' && cdRunning) || (mode === 'pomodoro' && pomoRunning) ? 'running' : ''}}" bindtap="onStartStop">{{(mode === 'stopwatch' && swRunning) || (mode === 'countdown' && cdRunning) || (mode === 'pomodoro' && pomoRunning) ? '暂停' : '开始'}}</view>
  </view>

  <!-- 底部胶囊 -->
  <view class="pills">
    <view class="pill" bindtap="cycleStyle">{{styleLabel}}</view>
    <view class="pill" bindtap="toggleTheme">{{theme === 'dark' ? '深色' : '浅色'}}</view>
    <view class="pill" bindtap="openDurationPanel" data-target="work">工作 {{workLabel}}</view>
    <view class="pill" bindtap="openDurationPanel" data-target="rest">休息 {{restLabel}}</view>
    <view class="pill" bindtap="openDurationPanel" data-target="countdown">设置</view>
  </view>

  <!-- 时长设置面板（倒计时 / 工作 / 休息共用） -->
  <view class="mask" wx:if="{{durationTarget !== ''}}" bindtap="closeDurationPanel"></view>
  <view class="panel" wx:if="{{durationTarget !== ''}}">
    <view class="panel-title">{{durationTitle}}</view>
    <view class="panel-label">时长（时 : 分 : 秒）</view>
    <view class="panel-row">
      <input class="panel-input" type="number" value="{{durH}}" bindinput="onDurHInput" />
      <text class="panel-colon">:</text>
      <input class="panel-input" type="number" value="{{durM}}" bindinput="onDurMInput" />
      <text class="panel-colon">:</text>
      <input class="panel-input" type="number" value="{{durS}}" bindinput="onDurSInput" />
    </view>
    <view class="panel-actions">
      <button class="panel-btn" bindtap="applyDuration">确定</button>
      <button class="panel-btn secondary" bindtap="closeDurationPanel">关闭</button>
    </view>
  </view>
</view>
```

**Step 2: 检查关键点**

- 第四段「番茄」位于「倒计时」之后。
- `pomodoro-timer` 没有 `wx:if`，避免切换模式销毁组件。
- 「时间到」与红色闪烁按模式隔离。
- 底部五个胶囊：样式 / 深浅色 / 工作 / 休息 / 设置。

**Step 3: DevTools 编译**

确认 WXML 编译无报错。

---

## Task 5: 样式适配 4 段控件与 5 个胶囊

**Files:**
- Modify: `miniprogram/pages/index/index.scss`

**Step 1: 缩小分段项左右内边距**

把 `.mode-item` 的：

```scss
padding: 8px 20px;
```

改为：

```scss
padding: 8px 12px;
```

**Step 2: 缩小胶囊左右内边距**

把 `.pill` 的：

```scss
padding: 8px 18px;
```

改为：

```scss
padding: 8px 14px;
```

**Step 3: 追加番茄容器与隐藏类**

在 `.digits` 相关样式之后（例如 `.timeup` 之前）追加：

```scss
/* ===== 番茄组件容器 ===== */
.pomo-slot {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

.hidden {
  display: none;
}
```

**Step 4: DevTools 检查布局**

横屏预览确认：

- 四段控件在 568px 宽（iPhone SE 横屏）下不与右上原生胶囊重叠。
- 五个胶囊一行放得下，不换行、不溢出。
- 番茄模式数字垂直居中，与非番茄模式高度一致。

---

## Task 6: 整体手测

**Files:** 无（仅 DevTools 验证）

**Step 1: 基础三模式回归**

- 时钟正常走秒、日期显示。
- 正计时开始/暂停/继续/重置准确。
- 倒计时到零震动 + 红色闪烁 + 「时间到」；结束后切到正计时，数字**不再**保持红色闪烁（本轮修复）。

**Step 2: 番茄主流程**

1. 切到「番茄」，副标题显示「专注 · 第 1 个番茄」，数字 `00:25:00.00`。
2. 点「开始」→ 按钮变「暂停」→ 数字递减。
3. 点「暂停」→ 数字停住；再点「开始」→ 从暂停处继续。
4. 把工作时长改成 00:00:10，确定；若当前空闲则数字立刻变 `00:00:10.00`。
5. 开始并等待归零 → 长震动、红色闪烁、「时间到」，按钮变「开始」。
6. 点「开始」→ 进入休息阶段，副标题「休息 · 已完成 1 个番茄」，数字为休息时长并开始递减。
7. 休息归零 → 震动 + 提示；点「开始」→ 回到工作，副标题「专注 · 第 2 个番茄」。
8. 点「重置」→ 回到工作阶段、已完成数归零、显示工作时长、停止计时。

**Step 3: 设置与持久化**

- 「工作」「休息」胶囊分别打开对应面板，标题正确。
- 修改时长后胶囊文案同步为新的 `MM:SS` / `H:MM:SS`。
- 关闭并重新进入小程序，工作时长、休息时长保持。
- 「设置」胶囊仍打开「倒计时时长」，修改后倒计时模式生效。

**Step 4: 模式切换与主题**

- 番茄运行中切到时钟 → 番茄自动暂停；切回番茄 → 阶段与已完成数保留，按钮显示「开始」。
- 样式胶囊循环三次回到白色；番茄数字在绿/琥珀下颜色正确。
- 深浅色切换后番茄数字、副标题、胶囊配色正确。

**Step 5: 生命周期**

- 番茄运行中切后台 30 秒再回来，数字按真实时间追平。
- 若后台期间阶段已结束，回来立即显示「时间到」并震动。

---

## 完成标准

- 分段控件第四项「番茄」可用，位置正确。
- 工作 / 休息循环、手动推进、震动与视觉提示符合设计。
- 底部新增「工作」「休息」两个胶囊，可设置并持久化。
- 原有三种模式行为不回退，倒计时结束后的串模式红闪问题被修复。
- DevTools 编译无 TypeScript / Sass / WXML 报错。

> 提交前请用户手动确认；本计划不代为 `git commit` / `git push`。
