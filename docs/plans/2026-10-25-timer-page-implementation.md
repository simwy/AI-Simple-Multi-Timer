# 大屏计时器页面 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把 `pages/index` 改造成横屏、深色、数码风的大屏计时器页（时钟 / 正计时 / 倒计时三模式）。

**Architecture:** 单页自包含——全部逻辑放 `pages/index` 一个 `Component()`，三模式用 `wx:if` 条件渲染，共用 `utils/time.ts` 格式化纯函数 + 时间戳差值计时引擎（非渲染状态放模块级变量，避免进 `data` 触发重渲染）。

**Tech Stack:** 微信小程序 · TypeScript · Sass · Skyline 渲染器 · glass-easel · `Component()`（非 `Page()`）。

**设计文档：** `docs/plans/2026-10-25-timer-page-design.md`

---

## 执行约定（本仓库特有）

- **无 CLI 构建 / 测试 / lint**：所有验证在微信开发者工具里进行（编译 + 运行）。纯函数用 DevTools Console 临时 `console.log` 核对。
- **不自动 git commit**：每个任务的 commit 步骤都标为「用户确认后手动执行」。你随时可在 DevTools 编译检查后自己提交。
- **工作区**：直接在当前 `main` 分支改（仓库目前基本为空，仅一次 first commit，且文件均未跟踪）。

---

## Task 1: 时间格式化纯函数

**Files:**
- Create: `miniprogram/utils/time.ts`

**Step 1: 写格式化函数**

```ts
// time.ts
// 计时器格式化纯函数

const pad2 = (n: number): string => (n < 10 ? '0' : '') + n

/** 毫秒 → HH:MM:SS（小时可超过 2 位） */
export const formatHMS = (ms: number): string => {
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`
}

/** 毫秒 → HH:MM:SS.xx（xx 为百分秒） */
export const formatHMSxx = (ms: number): string => {
  const cs = Math.floor((ms % 1000) / 10)
  return `${formatHMS(ms)}.${pad2(cs)}`
}

const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六']

/** Date → YYYY年MM月DD日 周X */
export const formatDateCN = (d: Date): string => {
  const week = WEEK_CN[d.getDay()]
  return `${d.getFullYear()}年${pad2(d.getMonth() + 1)}月${pad2(d.getDate())}日 周${week}`
}

/** Date → HH:MM:SS */
export const formatClockHMS = (d: Date): string =>
  `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
```

**Step 2: 验证**

这些是纯函数，正式验证发生在 Task 4（时钟显示）。如需即时核对，可临时在 `miniprogram/app.ts` 的 `onLaunch()` 里加：

```ts
import { formatDateCN, formatHMSxx } from './utils/time'
console.log(formatDateCN(new Date()))       // 期望：2026年10月25日 周六
console.log(formatHMSxx(61050))             // 期望：00:01:01.05
console.log(formatHMSxx(3661000))           // 期望：01:01:01.00
```

在 DevTools Console 看输出，符合后删掉临时代码。

**Step 3: Commit（用户确认后手动）**

```bash
git add miniprogram/utils/time.ts
git commit -m "feat: add timer formatting utils"
```

---

## Task 2: 页面配置（横屏 / 禁滚动 / 去掉导航栏）

**Files:**
- Modify: `miniprogram/pages/index/index.json`

**Step 1: 改写 index.json**

```json
{
  "pageOrientation": "landscape",
  "disableScroll": true
}
```

（移除 `usingComponents`——不再使用模板的 `navigation-bar` 组件；`navigationStyle: "custom"` 已在 `app.json` 全局开启，右上角原生胶囊会自动渲染。）

**Step 2: 验证**

DevTools 编译无报错；模拟器切换成横屏预览，页面锁定横屏不随旋转回竖屏。

**Step 3: Commit（用户确认后手动）**

```bash
git add miniprogram/pages/index/index.json
git commit -m "feat: lock index page to landscape, disable scroll"
```

---

## Task 3: 页面结构与样式（静态 UI + 深色主题）

**Files:**
- Modify: `miniprogram/pages/index/index.wxml`（整体重写）
- Modify: `miniprogram/pages/index/index.scss`（整体重写）

**Step 1: 写 index.wxml**

```xml
<!--index.wxml-->
<view class="page theme-{{theme}}">

  <!-- 顶栏 -->
  <view class="topbar">
    <view class="top-left">
      <view class="pill" bindtap="toggleStyleMenu">样式▾</view>
      <view class="pill" bindtap="toggleTheme">{{theme === 'dark' ? '深色' : '浅色'}}</view>
      <view class="pill" bindtap="toggleSettings">设置</view>
    </view>
    <view class="top-right"></view>
  </view>

  <!-- 日期（仅时钟模式） -->
  <view class="date" wx:if="{{mode === 'clock'}}">{{dateStr}}</view>

  <!-- 中间数字 -->
  <view class="digits {{mode === 'clock' ? 'clock' : 'timing'}} style-{{style}} {{cdFinished ? 'finished' : ''}}">
    <text wx:if="{{mode === 'clock'}}">{{timeStr}}</text>
    <text wx:elif="{{mode === 'stopwatch'}}">{{swDisplay}}</text>
    <text wx:else>{{cdDisplay}}</text>
  </view>
  <view class="timeup" wx:if="{{cdFinished}}">时间到</view>

  <!-- 右下角操作（时钟模式隐藏） -->
  <view class="actions" wx:if="{{mode !== 'clock'}}">
    <view class="circle reset" bindtap="onReset">重置</view>
    <view class="circle start {{(mode === 'stopwatch' && swRunning) || (mode === 'countdown' && cdRunning) ? 'running' : ''}}" bindtap="onStartStop">{{(mode === 'stopwatch' && swRunning) || (mode === 'countdown' && cdRunning) ? '暂停' : '开始'}}</view>
  </view>

  <!-- 底部 Tab -->
  <view class="tabbar">
    <view class="tab {{mode === 'clock' ? 'active' : ''}}" data-mode="clock" bindtap="onSwitchMode">时钟</view>
    <view class="tab {{mode === 'stopwatch' ? 'active' : ''}}" data-mode="stopwatch" bindtap="onSwitchMode">正计时</view>
    <view class="tab {{mode === 'countdown' ? 'active' : ''}}" data-mode="countdown" bindtap="onSwitchMode">倒计时</view>
  </view>

  <!-- 样式下拉 -->
  <view class="menu" wx:if="{{showStyleMenu}}">
    <view class="menu-item {{style === 'white' ? 'active' : ''}}" data-style="white" bindtap="onPickStyle">白色</view>
    <view class="menu-item {{style === 'green' ? 'active' : ''}}" data-style="green" bindtap="onPickStyle">绿色</view>
    <view class="menu-item {{style === 'amber' ? 'active' : ''}}" data-style="amber" bindtap="onPickStyle">琥珀</view>
  </view>

  <!-- 设置面板 -->
  <view class="mask" wx:if="{{showSettingsPanel}}" bindtap="toggleSettings"></view>
  <view class="panel" wx:if="{{showSettingsPanel}}">
    <view class="panel-title">设置</view>
    <view class="panel-label">倒计时时长（时 : 分 : 秒）</view>
    <view class="panel-row">
      <input class="panel-input" type="number" value="{{cdH}}" bindinput="onCdHInput" />
      <text class="panel-colon">:</text>
      <input class="panel-input" type="number" value="{{cdM}}" bindinput="onCdMInput" />
      <text class="panel-colon">:</text>
      <input class="panel-input" type="number" value="{{cdS}}" bindinput="onCdSInput" />
    </view>
    <view class="panel-actions">
      <button class="panel-btn" bindtap="applyCdDuration">确定</button>
      <button class="panel-btn secondary" bindtap="toggleSettings">关闭</button>
    </view>
  </view>
</view>
```

**Step 2: 写 index.scss**

```scss
/**index.scss**/
page {
  height: 100%;
  width: 100%;
  overflow: hidden;
  background: #000;
}

.page {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  box-sizing: border-box;
  overflow: hidden;

  /* 深色主题变量（默认） */
  --bg: #000000;
  --fg: #e6e6e6;
  --dim: #8a8a8a;
  --pill-bg: #1c1c1e;
  --pill-text: #b0b0b0;
  --tab-bg: #151515;
  --tab-active-bg: #2c2c2e;
  --accent: #34d058;
  --reset-fg: #ffffff;
  --menu-bg: #1c1c1e;
  --panel-bg: #1a1a1c;
  --glow: rgba(52, 208, 88, 0.30);

  background: var(--bg);
  color: var(--fg);
}

/* 浅色主题变量覆盖 */
.theme-light {
  --bg: #f5f5f7;
  --fg: #111111;
  --dim: #666666;
  --pill-bg: #e4e4e6;
  --pill-text: #444444;
  --tab-bg: #ececee;
  --tab-active-bg: #d4d4d6;
  --accent: #1a9c3a;
  --reset-fg: #111111;
  --menu-bg: #e4e4e6;
  --panel-bg: #ffffff;
  --glow: rgba(26, 156, 58, 0.20);
}

/* ===== 顶栏 ===== */
.topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  padding-right: 200px; /* 预留右上角原生胶囊安全区 */
}
.top-left {
  display: flex;
  gap: 12px;
}
.top-right { flex: none; }
.pill {
  padding: 10px 22px;
  border-radius: 999px;
  background: var(--pill-bg);
  color: var(--pill-text);
  font-size: 28px;
  line-height: 1.4;
}

/* ===== 日期 ===== */
.date {
  text-align: center;
  color: var(--dim);
  font-size: 34px;
  margin-top: 8px;
}

/* ===== 数字 ===== */
.digits {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.digits text {
  font-family: "SF Mono", "DIN Alternate", Menlo, Consolas, monospace;
  color: var(--fg);
  text-align: center;
  white-space: nowrap;
  letter-spacing: 4px;
  text-shadow: 0 0 30px var(--glow);
}
.digits.clock text { font-size: 20vw; }
.digits.timing text { font-size: 13vw; }
.digits.style-green text { color: #34d058; text-shadow: 0 0 30px rgba(52, 208, 88, 0.5); }
.digits.style-amber text { color: #ffb020; text-shadow: 0 0 30px rgba(255, 176, 32, 0.5); }
.digits.finished text {
  color: #ff453a;
  text-shadow: 0 0 30px rgba(255, 69, 58, 0.6);
  animation: blink 0.5s ease-in-out infinite alternate;
}

.timeup {
  position: absolute;
  top: 42%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: #ff453a;
  font-size: 40px;
  letter-spacing: 8px;
}

@keyframes blink {
  from { opacity: 1; }
  to { opacity: 0.2; }
}

/* ===== 右下角操作 ===== */
.actions {
  position: absolute;
  right: 40px;
  bottom: 180px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}
.circle {
  width: 140px;
  height: 140px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 40px;
}
.circle.reset {
  color: var(--reset-fg);
  background: rgba(128, 128, 128, 0.15);
}
.circle.start {
  color: var(--accent);
  background: rgba(52, 208, 88, 0.12);
}
.circle.start.running {
  color: #ffb020;
}

/* ===== 底部 Tab ===== */
.tabbar {
  display: flex;
  justify-content: center;
  gap: 12px;
  padding: 20px 0 32px;
}
.tab {
  padding: 14px 40px;
  border-radius: 999px;
  background: var(--tab-bg);
  color: var(--dim);
  font-size: 32px;
  line-height: 1.4;
}
.tab.active {
  background: var(--tab-active-bg);
  color: var(--fg);
}

/* ===== 样式下拉 ===== */
.menu {
  position: absolute;
  left: 20px;
  top: 96px;
  background: var(--menu-bg);
  border-radius: 16px;
  padding: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}
.menu-item {
  padding: 12px 32px;
  font-size: 30px;
  color: var(--dim);
  border-radius: 10px;
}
.menu-item.active {
  color: var(--fg);
  background: var(--tab-active-bg);
}

/* ===== 设置面板 ===== */
.mask {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 10;
}
.panel {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  background: var(--panel-bg);
  border-radius: 24px;
  padding: 32px;
  width: 560px;
  z-index: 11;
  color: var(--fg);
}
.panel-title {
  font-size: 36px;
  margin-bottom: 20px;
}
.panel-label {
  font-size: 26px;
  color: var(--dim);
  margin-bottom: 12px;
}
.panel-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 24px;
}
.panel-input {
  width: 120px;
  text-align: center;
  background: var(--pill-bg);
  color: var(--fg);
  border-radius: 12px;
  padding: 8px 0;
  font-size: 34px;
}
.panel-colon {
  font-size: 34px;
  color: var(--dim);
}
.panel-actions {
  display: flex;
  gap: 16px;
}
.panel-btn {
  flex: 1;
  margin: 0;
  border-radius: 999px;
  background: var(--accent);
  color: #fff;
  font-size: 30px;
  line-height: 2.4;
}
.panel-btn.secondary {
  background: var(--pill-bg);
  color: var(--fg);
}
```

**Step 3: 验证**

此时 `index.ts` 还是模板旧逻辑，但 WXML 引用了新 `data` 字段会报「undefined」。所以本任务验证只做「样式不报错」：确认 DevTools 能编译、无 Sass 语法错误即可；运行时字段由 Task 4 起补齐。

**Step 4: Commit（用户确认后手动）**

```bash
git add miniprogram/pages/index/index.wxml miniprogram/pages/index/index.scss
git commit -m "feat: timer page layout and dark theme styles"
```

---

## Task 4: 时钟模式 + 页面数据骨架

**Files:**
- Modify: `miniprogram/pages/index/index.ts`（整体重写为下面的完整实现，含 Task 4–7 全部逻辑）

> 说明：`index.ts` 一个文件承载三模式 + 交互 + 定时器。为避免把同一文件拆成多次「半成品」重写，这里一次性给出**完整最终实现**。Task 4 只验证时钟部分，Task 5–7 逐项验证其余部分。

**Step 1: 写完整 index.ts**

```ts
// index.ts
// 大屏计时器：时钟 / 正计时 / 倒计时
import { formatClockHMS, formatDateCN, formatHMSxx } from '../../utils/time'

type Mode = 'clock' | 'stopwatch' | 'countdown'
type StyleKey = 'white' | 'green' | 'amber'

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
    showStyleMenu: false,
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
      this.setData({ mode, showStyleMenu: false, showSettingsPanel: false })
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
    toggleStyleMenu() {
      this.setData({ showStyleMenu: !this.data.showStyleMenu })
    },
    onPickStyle(e: any) {
      const style = e.currentTarget.dataset.style as StyleKey
      this.setData({ style, showStyleMenu: false })
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
      if (style === 'white' || style === 'green' || style === 'amber') updates.style = style
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
```

**Step 2: 验证（时钟）**

DevTools 编译无报错；进入页面后：
- 中间显示当前 `HH:MM:SS`，每秒跳动，与系统时间一致。
- 顶部显示 `YYYY年MM月DD日 周X`，星期正确。
- 右下角「重置/开始」不显示（时钟模式隐藏）。

**Step 3: Commit（用户确认后手动）**

```bash
git add miniprogram/pages/index/index.ts
git commit -m "feat: implement clock, stopwatch, countdown logic"
```

---

## Task 5: 验证正计时

**Step 1: 验证**

切到「正计时」Tab：
- 初始显示 `00:00:00.00`。
- 点「开始」→ 数字从 0 开始走，百分秒快速变化；按钮变「暂停」（黄色）。
- 暂停 → 数字停住；再开始 → 从停住处继续。
- 重置 → 归 `00:00:00.00`。
- 对表跑约 10s，误差 < 0.1s（时间戳差值，无累积漂移）。

**Step 2: 边界检查**

- 运行时切到「时钟」再切回「正计时」：应停在切走那一刻的数值（已暂停，未归零）。

---

## Task 6: 验证倒计时

**Step 1: 验证**

切到「倒计时」Tab：
- 初始显示 `00:01:00.00`（默认 1 分钟）。
- 点「开始」→ 递减；暂停/继续正常。
- 到 0：数字归 `00:00:00.00`、变红闪烁、显示「时间到」、手机震动（真机）。DevTools 模拟器震动可能不生效，属正常。
- 到 0 后再点「开始」→ 从设定时长重跑。

**Step 2: 设时长**

点顶部「设置」→ 面板改时/分/秒 → 「确定」：
- 倒计时显示更新为新时长；重进小程序时长保持（持久化）。

---

## Task 7: 验证样式 / 主题 / 设置 / 生命周期

**Step 1: 样式下拉**

点「样式」→ 下拉出现「白色/绿色/琥珀」；点「绿色」→ 数字变绿；重进保持。

**Step 2: 主题切换**

点「深色」→ 整体切浅色主题；再点切回深色；重进保持。

**Step 3: 生命周期**

- 走表时切到后台（开发者工具切窗口/或真机 Home）→ 定时器停止、屏幕可熄。
- 回到前台 → 正计时/倒计时从正确时间继续（时间戳差值保证不丢时），时钟刷新。
- 页面 `detached` 时定时器被清理，无泄漏。

**Step 4: Commit（用户确认后手动）**

（Task 4 已一次性提交 index.ts；本任务无新文件，如有微调再单独 commit）

---

## 最终手测清单（收尾）

- 三模式切换：选中 Tab 底色加深、文字高亮；切换时运行中的计时正确暂停。
- 正计时 10s 对表无漂移；暂停/继续/重置正确。
- 倒计时到零震动 + 闪烁「时间到」+ 可重跑；设时长生效并持久化。
- 深/浅主题切换正确、持久化。
- 横屏锁定生效，顶栏三按钮不与右上角原生胶囊重叠，右下角按钮不与底部 Tab 重叠。
- 数字字号：时钟 `20vw`、正/倒计时 `13vw`；如超出屏幕可在 DevTools 里微调 `index.scss` 的 `.digits.clock` / `.digits.timing` 字号。

## 不在本轮范围

- `pages/logs` 演示页保留不动。
- 样式下拉之外的更多字体/主题自定义。
- 右上角原生胶囊（系统原生，无自定义功能）。
