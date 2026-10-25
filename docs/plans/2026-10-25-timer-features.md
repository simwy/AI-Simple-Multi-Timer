# 计时器六项功能扩展 实现计划

> **给执行者**：本计划逐任务、逐步骤给出精确文件路径与完整代码。按顺序执行，每完成一个任务在微信开发者工具里编译验证一次（见各任务「DevTools 验证」）。

**Goal:** 为现有微信小程序计时器增加时钟高精度、结束提醒三态、时钟闹钟、设置栏两行、正计时结束上限、正计时计次六项能力。

**Architecture:** 保持「组件只做引擎（无样式、不碰 `wx.*`、不碰存储）；页面负责渲染 + 持久化 + 振动/声音」。扩展 `statechange` 契约与组件公共方法，新增逻辑全部落在 `clock-timer`、`stopwatch-timer` 与 `pages/index`。

**Tech Stack:** TypeScript + Sass + glass-easel，微信小程序（无 npm scripts / 无 lint / 无测试框架）。

---

## 重要说明（与通用模板的差异）

1. **无 CLI 构建/测试**：本项目没有 npm scripts、没有测试框架，TypeScript/Sass 由微信开发者工具的 compiler 插件编译。因此不存在「写失败测试 → 跑测试」的 TDD 步骤；每任务的验证 = 在微信开发者工具中编译并手测。
2. **不自动 git 提交**：项目 CLAUDE.md 与全局约定均要求**不自动 `git commit`**。本计划所有任务**不含 commit 步骤**，改动由用户检查后手动提交。每个任务末尾的「提交」一律改为「由用户手动提交」提示。
3. 相关设计文档：`docs/plans/2026-10-25-timer-features-design.md`。

---

## Task 1: `utils/time.ts` 新增两个格式化纯函数

**Files:**
- Modify: `miniprogram/utils/time.ts`

**Step 1: 追加两个导出函数**

在文件末尾（`formatDurationLabel` 之后）追加：

```ts
/** Date → HH:MM:SS.xx（xx 为百分秒） */
export const formatClockHMSxx = (d: Date): string => {
  const cs = Math.floor(d.getMilliseconds() / 10)
  return `${formatClockHMS(d)}.${pad2(cs)}`
}

/** 毫秒 → MM:SS.xx（满 1 小时 → H:MM:SS.xx），用于计次列表 */
export const formatLapTime = (ms: number): string => {
  const totalMs = Math.max(0, ms)
  const h = Math.floor(totalMs / 3600000)
  const m = Math.floor((totalMs % 3600000) / 60000)
  const s = Math.floor((totalMs % 60000) / 1000)
  const cs = Math.floor((totalMs % 1000) / 10)
  const hms = h > 0 ? `${pad2(h)}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`
  return `${hms}.${pad2(cs)}`
}
```

**Step 2: DevTools 验证**

无运行期影响，DevTools 编译无类型错误即可（`formatClockHMSxx` 复用已存在的 `formatClockHMS` 与 `pad2`）。

**提交：** 由用户手动提交。

---

## Task 2: `clock-timer` 高精度 + 闹钟引擎

**Files:**
- Modify: `miniprogram/components/clock-timer/clock-timer.ts`

**Step 1: 整文件替换**

将 `clock-timer.ts` 整体替换为：

```ts
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
```

**Step 2: DevTools 验证**

- 编译无类型错误。
- 时钟模式切到高精度显示 `HH:MM:SS.xx` 且秒后两位流畅跳动；低精度显示 `HH:MM:SS`。
- 页面暂未处理 `alarmOn/alarmText/alarmfire`（Task 5 才接入），此时不影响既有功能。

**提交：** 由用户手动提交。

---

## Task 3: `stopwatch-timer` 结束上限 + 计次

**Files:**
- Modify: `miniprogram/components/stopwatch-timer/stopwatch-timer.ts`

**Step 1: 整文件替换**

将 `stopwatch-timer.ts` 整体替换为：

```ts
// stopwatch-timer.ts
// 正计时：从 0 开始累计，支持开始 / 暂停 / 重置 / 结束上限 / 计次。样式由页面统一下发。
import { formatHMS, formatHMSxx } from '../../utils/time'

const TICK_MS = 16

let isActive = false
let baseMs = 0
let startAt = 0
let limitMs = 0
let laps: { index: number; cumulativeMs: number; splitMs: number }[] = []
let tickTimer: ReturnType<typeof setInterval> | undefined

const buildActions = () => [
  {
    key: 'limit',
    label: '结束时长',
    kind: 'duration',
    title: '结束时长',
    valueMs: limitMs,
    minMs: 0,
    storageKey: 'timer.swLimitMs',
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
    display: '00:00:00.00',
    running: false,
    finished: false,
  },

  lifetimes: {
    attached() {
      isActive = false
      baseMs = 0
      startAt = 0
      limitMs = 0
      laps = []
      this.setData({ display: this._fmt(0), running: false, finished: false })
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
      laps = []
      this.setData({ display: this._fmt(0), running: false, finished: false })
      this._emitState()
    },
    /** 页面设置结束上限（0 表示不限）；重置不清除该设置 */
    setDuration(key: string, ms: number) {
      if (key !== 'limit') return
      limitMs = Math.max(0, Number(ms) || 0)
      this._emitState()
    },
    /** 页面「计次」按钮：记录当前累计时间与相对上一条的分段 */
    lap() {
      if (!this.data.running) return
      const cumulativeMs = baseMs + (Date.now() - startAt)
      const prev = laps.length ? laps[laps.length - 1].cumulativeMs : 0
      laps.push({ index: laps.length + 1, cumulativeMs, splitMs: cumulativeMs - prev })
      this._emitState()
    },

    _start() {
      if (this.data.finished) {
        baseMs = 0
        laps = []
      }
      startAt = Date.now()
      this.setData({ running: true, finished: false })
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
      const elapsed = baseMs + (Date.now() - startAt)
      const display = this._fmt(elapsed)
      if (display !== this.data.display) this.setData({ display })
      if (limitMs > 0 && elapsed >= limitMs) this._end()
    },

    _end() {
      baseMs = limitMs
      startAt = 0
      this._stopTick()
      this.setData({ display: this._fmt(limitMs), running: false, finished: true })
      this._emitState()
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
        finished: this.data.finished,
        subTime: '',
        capabilities: { toggle: true, reset: true },
        actions: buildActions(),
        editable: false,
        editKey: '',
        editValueMs: 0,
        laps,
      })
    },
  },
})
```

**Step 2: DevTools 验证**

- 编译无类型错误。
- 正计时底部设置栏出现「结束时长」胶囊（此时值可能显示 `00:00`，Task 5 会改成「不限」）；开始/暂停/重置不受影响。
- 页面暂未处理 `laps`（Task 5 才接入），不影响既有功能。

**提交：** 由用户手动提交。

---

## Task 4: 内置提示音资源

**Files:**
- Create: `miniprogram/assets/beep.wav`

**Step 1: 生成短提示音**

在项目根目录执行（生成后脚本不保留）：

```bash
cd /Users/chensm/Desktop/my-source/github.com/simwy/AI-Simple-Multi-Timer
mkdir -p miniprogram/assets
node -e '
const { writeFileSync } = require("node:fs")
const rate = 16000, dur = 0.35, freq = 880
const n = Math.round(rate * dur)
const samples = new Int16Array(n)
for (let i = 0; i < n; i++) {
  const t = i / rate
  const fade = Math.min(1, i / (rate * 0.01), (n - i) / (rate * 0.05))
  samples[i] = Math.round(Math.sin(2 * Math.PI * freq * t) * 0.6 * fade * 32767)
}
const data = Buffer.from(samples.buffer)
const h = Buffer.alloc(44)
h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8)
h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22)
h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34)
h.write("data", 36); h.writeUInt32LE(data.length, 40)
writeFileSync("miniprogram/assets/beep.wav", Buffer.concat([h, data]))
console.log("wrote miniprogram/assets/beep.wav bytes=", data.length)
'
```

**Step 2: 确认产物**

`ls -l miniprogram/assets/beep.wav` 应存在且约 11KB（16000Hz × 0.35s × 2 字节 ≈ 11.2KB）。

**提交：** 由用户手动提交（含新增的二进制资源）。

---

## Task 5: 页面 `pages/index/index.ts`

**Files:**
- Modify: `miniprogram/pages/index/index.ts`

下面按「区块」给出精确改动，均以当前文件为基线。

### 5.1 导入与类型/常量

将顶部 `import` 行改为：

```ts
import { formatDurationLabel, formatLapTime, pad2, splitHMS } from '../../utils/time'
```

在 `type EditUnit = 'h' | 'm' | 's'` 之后追加：

```ts
type EndAlert = 'vibrate' | 'sound' | 'both'

interface Lap {
  index: number
  cumulativeMs: number
  splitMs: number
}
```

在 `const NO_CAPABILITIES: Capabilities = { toggle: false, reset: false }` 之后追加：

```ts
const END_ALERT_ORDER: EndAlert[] = ['vibrate', 'sound', 'both']
const END_ALERT_LABELS: Record<EndAlert, string> = {
  vibrate: '振动',
  sound: '提示音',
  both: '振动+提示音',
}
```

在模块级瞬时状态区（`let editDrag: ... = null` 之后）追加：

```ts
let beepAudio: WechatMiniprogram.InnerAudioContext | null = null
let seededAlarm = false
```

### 5.2 data 新增字段

在 `data` 中 `actionSide` 字段之后、`durationTarget` 之前，追加：

```ts
    // 结束提醒三态（全局设置）
    endAlert: 'both' as EndAlert,
    endAlertLabel: END_ALERT_LABELS.both,

    // 时钟闹钟（由组件上报，页面负责渲染与持久化）
    alarmOn: false,
    alarmText: '',
    alarmPanelVisible: false,
    alarmH: 0,
    alarmM: 0,

    // 正计时计次（由组件上报，页面负责渲染）
    laps: [] as { index: number; cumulativeText: string; splitText: string }[],
    lapPreview: [] as { index: number; cumulativeText: string }[],
    lapMore: false,
    lapPanelVisible: false,
```

### 5.3 模式切换 `onSwitchMode` 清理

在 `onSwitchMode` 的 `this.setData({ ... })` 对象中，`editTouched: false,` 之后追加：

```ts
        alarmOn: false,
        alarmText: '',
        laps: [],
        lapPreview: [],
        lapMore: false,
        lapPanelVisible: false,
```

并在方法开头（`activeMode = mode` 之前或之后）追加 `seededAlarm = false`。将 `activeMode = mode` 一行改为：

```ts
      activeMode = mode
      seededAlarm = false
```

### 5.4 `onStateChange` 改造

将 `onStateChange` 整体替换为：

```ts
    onStateChange(e: any) {
      const mode = e.currentTarget.dataset.mode as Mode
      const detail = e.detail

      // 每个模式第一次上报时，用已保存的时长回填（组件本身不碰存储）
      if (!seeded[mode] && this._seedMode(mode, detail.actions || [])) return

      // 时钟闹钟：首次进入时用存储回填一次
      if (mode === 'clock' && !seededAlarm) {
        seededAlarm = true
        const stored = wx.getStorageSync('timer.alarm')
        if (stored && stored.on) {
          const comp = this.selectComponent(MODE_COMPONENTS.clock)
          if (comp) comp.setAlarm(stored.hour, stored.minute)
        }
      }

      if (mode !== activeMode) return

      // 结束提醒只在「运行中 → 已结束」的上升沿触发，切到已结束的模式不会误报
      if (this.data.running && detail.finished) this._playAlert()
      if (this.data.running !== !!detail.running) {
        wx.setKeepScreenOn({ keepScreenOn: !!detail.running })
      }

      const updates: any = {
        running: !!detail.running,
        finished: !!detail.finished,
        subTime: detail.subTime || '',
        capabilities: detail.capabilities || NO_CAPABILITIES,
        actions: (detail.actions || []).map((a: ModeAction) => ({
          ...a,
          value: a.key === 'limit' && a.valueMs === 0 ? '不限' : formatDurationLabel(a.valueMs),
        })),
      }

      // 时钟闹钟上报
      if (typeof detail.alarmOn === 'boolean') updates.alarmOn = detail.alarmOn
      if (typeof detail.alarmText === 'string') updates.alarmText = detail.alarmText

      // 正计时计次上报（组件只在开始/暂停/重置/计次时 emit，这里格式化开销可忽略）
      if (Array.isArray(detail.laps)) {
        const formatted = (detail.laps as Lap[]).map(l => ({
          index: l.index,
          cumulativeText: formatLapTime(l.cumulativeMs),
          splitText: formatLapTime(l.splitMs),
        }))
        updates.laps = formatted
        updates.lapPreview = formatted.slice(-2).map(f => ({
          index: f.index,
          cumulativeText: f.cumulativeText,
        }))
        updates.lapMore = formatted.length > 2
      }

      // 倒计时 / 番茄「未开始」时，主时间切换为页面自绘的可滑动分段
      const editable = (mode === 'countdown' || mode === 'pomodoro') && !!detail.editable
      if (editable) {
        const editKey = detail.editKey || ''
        const entering = !this.data.editable || editKey !== this.data.editKey
        updates.editable = true
        updates.editKey = editKey
        if (entering) updates.editTouched = false
        if (entering || !editDrag) {
          const t = splitHMS(Number(detail.editValueMs) || 0)
          updates.editH = pad2(t.h)
          updates.editM = pad2(t.m)
          updates.editS = pad2(t.s)
        }
      } else {
        updates.editable = false
        updates.editKey = ''
      }

      this.setData(updates)
    },
```

### 5.5 新增事件处理（闹钟 / 计次 / 三态提醒 / 声音）

在 `onActionTap` 之后、`closeDurationPanel` 之前，追加：

```ts
    // ===== 闹钟 =====
    onAlarmTap() {
      const stored = wx.getStorageSync('timer.alarm')
      if (stored && stored.on) {
        this.setData({ alarmPanelVisible: true, alarmH: stored.hour, alarmM: stored.minute })
      } else {
        const now = new Date()
        this.setData({ alarmPanelVisible: true, alarmH: now.getHours(), alarmM: now.getMinutes() })
      }
    },
    closeAlarmPanel() {
      this.setData({ alarmPanelVisible: false })
    },
    onAlarmHInput(e: any) {
      this.setData({ alarmH: clamp(Number(e.detail.value) || 0, 0, 23) })
    },
    onAlarmMInput(e: any) {
      this.setData({ alarmM: clamp(Number(e.detail.value) || 0, 0, 59) })
    },
    applyAlarm() {
      const comp = this.selectComponent(MODE_COMPONENTS.clock)
      if (comp) comp.setAlarm(this.data.alarmH, this.data.alarmM)
      wx.setStorageSync('timer.alarm', { on: true, hour: this.data.alarmH, minute: this.data.alarmM })
      this.setData({ alarmPanelVisible: false })
    },
    clearAlarm() {
      const comp = this.selectComponent(MODE_COMPONENTS.clock)
      if (comp) comp.clearAlarm()
      wx.setStorageSync('timer.alarm', { on: false })
      this.setData({ alarmPanelVisible: false, alarmOn: false, alarmText: '' })
    },
    onAlarmFire() {
      this._playAlert()
      wx.setStorageSync('timer.alarm', { on: false })
      this.setData({ alarmOn: false, alarmText: '' })
    },

    // ===== 正计时计次 =====
    onLap() {
      const comp = this.selectComponent(MODE_COMPONENTS.stopwatch)
      if (comp) comp.lap()
    },
    openLapPanel() {
      this.setData({ lapPanelVisible: true })
    },
    closeLapPanel() {
      this.setData({ lapPanelVisible: false })
    },
```

### 5.6 三态提醒与声音

在「全局设置」区块（`onCycleFontSize` / `onTogglePrecision`）附近追加：

```ts
    onCycleEndAlert() {
      const current = END_ALERT_ORDER.indexOf(this.data.endAlert)
      const endAlert = END_ALERT_ORDER[(current + 1) % END_ALERT_ORDER.length]
      this.setData({ endAlert, endAlertLabel: END_ALERT_LABELS[endAlert] })
      wx.setStorageSync('timer.endAlert', endAlert)
    },

    // ===== 结束 / 闹钟提醒：按三态设置执行 =====
    _playAlert() {
      if (this.data.endAlert === 'vibrate' || this.data.endAlert === 'both') wx.vibrateLong()
      if (this.data.endAlert === 'sound' || this.data.endAlert === 'both') this._playSound()
    },
    _playSound() {
      if (!beepAudio) {
        beepAudio = wx.createInnerAudioContext()
        beepAudio.src = '/assets/beep.wav'
      }
      beepAudio.stop()
      beepAudio.play()
    },
```

### 5.7 持久化加载 `_loadPersisted`

在 `_loadPersisted` 中，`if (typeof showCentis === 'boolean') updates.showCentis = showCentis` 之后追加：

```ts
      const endAlert = wx.getStorageSync('timer.endAlert')
      if (endAlert === 'vibrate' || endAlert === 'sound' || endAlert === 'both') {
        updates.endAlert = endAlert
        updates.endAlertLabel = END_ALERT_LABELS[endAlert as EndAlert]
      }
```

### 5.8 DevTools 验证

- 编译无类型错误（注意 `noUnusedLocals`：`formatLapTime`、`END_ALERT_ORDER` 等均被使用）。

**提交：** 由用户手动提交。

---

## Task 6: 页面 `pages/index/index.wxml`

**Files:**
- Modify: `miniprogram/pages/index/index.wxml`

### 6.1 `clock-timer` 下发 `show-centis`

将 `clock-timer` 那一行：

```xml
      <clock-timer id="clock-timer" class="mode-host {{mode === 'clock' ? '' : 'hidden'}}"
                   data-mode="clock" bind:statechange="onStateChange" />
```

改为：

```xml
      <clock-timer id="clock-timer" class="mode-host {{mode === 'clock' ? '' : 'hidden'}}"
                   data-mode="clock" show-centis="{{showCentis}}"
                   bind:statechange="onStateChange" bind:alarmfire="onAlarmFire" />
```

### 6.2 主时间下方：闹钟提示 + 计次预览

在 `.main-time` 内部、`.edit-hint` 之后追加：

```xml
      <!-- 时钟闹钟提示：与「上下滑动调整」同款样式，绝对定位不参与布局 -->
      <view class="alarm-hint" wx:if="{{mode === 'clock' && alarmOn && !focusMode}}">闹钟 {{alarmText}}</view>

      <!-- 正计时计次预览：最多最近 2 行，超出显示 More -->
      <view class="lap-preview" wx:if="{{mode === 'stopwatch' && lapPreview.length && !focusMode}}">
        <view class="lap-line" wx:for="{{lapPreview}}" wx:key="index">第{{item.index}}次　{{item.cumulativeText}}</view>
        <text class="lap-more" wx:if="{{lapMore}}" catchtap="openLapPanel">More</text>
      </view>
```

### 6.3 正计时「计次」按钮（操作组对侧）

在「5 主操作组」区块之后、工具栏之前，追加：

```xml
  <!-- 5b 计次按钮：正计时运行中，位于操作组对侧 -->
  <view class="lap-btn {{actionSide === 'left' ? 'is-right' : 'is-left'}}"
        wx:if="{{!focusMode && mode === 'stopwatch' && running}}" bindtap="onLap">计次</view>
```

### 6.4 工具栏拆两行

将现有「6 底部工具栏」整块（从 `<view class="toolbar" ...>` 到其 `</view>`）替换为：

```xml
  <!-- 6 底部工具栏：第一行所有模式共有，第二行模式专属 -->
  <view class="toolbar" wx:if="{{!focusMode}}" catchtap="noop">
    <view class="toolbar-row toolbar-row--common">
      <view class="toolbar-btn" bindtap="onCycleStyle">
        <text class="toolbar-btn__desc">数字颜色</text>
        <text class="toolbar-btn__value">{{styleLabel}}</text>
      </view>
      <view class="toolbar-btn" bindtap="onToggleTheme">
        <text class="toolbar-btn__desc">背景颜色</text>
        <text class="toolbar-btn__value">{{theme === 'dark' ? '深色' : '浅色'}}</text>
      </view>
      <view class="toolbar-btn" bindtap="onCycleFontSize">
        <text class="toolbar-btn__desc">字号</text>
        <text class="toolbar-btn__value">{{fontSizeLabel}}</text>
      </view>
      <view class="toolbar-btn" bindtap="onTogglePrecision">
        <text class="toolbar-btn__desc">精度</text>
        <text class="toolbar-btn__value">{{showCentis ? '高' : '低'}}</text>
      </view>
      <view class="toolbar-btn" bindtap="onCycleEndAlert">
        <text class="toolbar-btn__desc">结束提醒</text>
        <text class="toolbar-btn__value">{{endAlertLabel}}</text>
      </view>
      <view class="toolbar-btn" bindtap="onToggleActionSide">
        <text class="toolbar-btn__desc">按钮位置</text>
        <text class="toolbar-btn__value">{{actionSide === 'left' ? '左侧' : '右侧'}}</text>
      </view>
    </view>
    <view class="toolbar-row toolbar-row--mode">
      <view class="toolbar-btn" wx:if="{{mode === 'clock'}}" bindtap="onAlarmTap">
        <text class="toolbar-btn__desc">闹钟</text>
        <text class="toolbar-btn__value">{{alarmOn ? alarmText : '关'}}</text>
      </view>
      <view class="toolbar-btn" wx:for="{{actions}}" wx:key="key"
            data-key="{{item.key}}" bindtap="onActionTap">
        <text class="toolbar-btn__desc">{{item.label}}</text>
        <text class="toolbar-btn__value">{{item.value}}</text>
      </view>
    </view>
  </view>
```

### 6.5 闹钟面板 + 计次浮层

在「7 时长设置弹层」之后（`</view>` 页面根元素之前）追加：

```xml
  <!-- 8 闹钟设置弹层（时 : 分） -->
  <view class="mask" wx:if="{{alarmPanelVisible}}" catchtap="closeAlarmPanel"></view>
  <view class="panel" wx:if="{{alarmPanelVisible}}" catchtap="noop">
    <view class="panel-title">闹钟</view>
    <view class="panel-label">时间（时 : 分）</view>
    <view class="panel-row">
      <input class="panel-input" type="number" value="{{alarmH}}" bindinput="onAlarmHInput" />
      <text class="panel-colon">:</text>
      <input class="panel-input" type="number" value="{{alarmM}}" bindinput="onAlarmMInput" />
    </view>
    <view class="panel-actions">
      <button class="panel-btn" bindtap="applyAlarm">确定</button>
      <button class="panel-btn secondary" wx:if="{{alarmOn}}" bindtap="clearAlarm">关闭闹钟</button>
      <button class="panel-btn secondary" bindtap="closeAlarmPanel">取消</button>
    </view>
  </view>

  <!-- 9 计次浮层：全部计次（累计 + 分段） -->
  <view class="mask" wx:if="{{lapPanelVisible}}" catchtap="closeLapPanel"></view>
  <view class="panel lap-panel" wx:if="{{lapPanelVisible}}" catchtap="noop">
    <view class="panel-title">全部计次</view>
    <scroll-view class="lap-list" scroll-y>
      <view class="lap-row" wx:for="{{laps}}" wx:key="index">
        <text class="lap-row__idx">第{{item.index}}次</text>
        <text class="lap-row__cum">{{item.cumulativeText}}</text>
        <text class="lap-row__split">+{{item.splitText}}</text>
      </view>
    </scroll-view>
    <view class="panel-actions">
      <button class="panel-btn secondary" bindtap="closeLapPanel">关闭</button>
    </view>
  </view>
```

### 6.6 DevTools 验证

- 编译无错误；四个模式切换时工具栏两行内容正确、闹钟/计次控件按模式出现。

**提交：** 由用户手动提交。

---

## Task 7: 页面 `pages/index/index.scss`

**Files:**
- Modify: `miniprogram/pages/index/index.scss`

### 7.1 工具栏拆两行

将现有 `.toolbar` 规则（`display:flex; justify-content:center` 那段）替换为：

```scss
.toolbar {
  position: relative;
  z-index: 2;
  align-self: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 0 24px;
}
.toolbar-row {
  display: flex;
  justify-content: center;
  gap: 6px;
}
```

### 7.2 闹钟提示与计次预览（锚在 `.main-time` 正下方）

在 `.edit-hint.is-faded` 之后追加：

```scss
/* 时钟闹钟提示：与「上下滑动调整」同款，绝对定位不参与布局 */
.alarm-hint {
  position: absolute;
  top: 100%;
  margin-top: 2px;
  left: 50%;
  transform: translateX(-50%);
  font-family: -apple-system, "PingFang SC", "Helvetica Neue", sans-serif;
  font-size: 13px;
  line-height: 1.3;
  letter-spacing: 1px;
  color: var(--dim);
  text-shadow: none;
  white-space: nowrap;
  pointer-events: none;
}

/* 正计时计次预览：最近 2 行 + More */
.lap-preview {
  position: absolute;
  top: 100%;
  margin-top: 2px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  font-size: 13px;
  line-height: 1.4;
  letter-spacing: 1px;
  color: var(--dim);
  white-space: nowrap;
}
.lap-more {
  color: var(--accent);
}
```

### 7.3 计次按钮

在「5 主操作组」相关样式之后追加：

```scss
/* ===== 5b 计次按钮（操作组对侧） ===== */
.lap-btn {
  position: absolute;
  bottom: 84px;
  z-index: 2;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: var(--fg);
  background: rgba(128, 128, 128, 0.32);
}
.lap-btn.is-left {
  left: 32px;
}
.lap-btn.is-right {
  right: 32px;
}
```

### 7.4 计次浮层列表

在「7 时长设置弹层」相关样式之后追加：

```scss
/* ===== 9 计次浮层列表 ===== */
.lap-panel {
  width: 520px;
}
.lap-list {
  max-height: 60vh;
  margin-bottom: 20px;
}
.lap-row {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 8px 12px;
  font-size: 20px;
}
.lap-row__idx {
  color: var(--dim);
  min-width: 88px;
}
.lap-row__cum {
  font-family: 'TimerDigits', "SF Mono", Menlo, Consolas, monospace;
  min-width: 120px;
}
.lap-row__split {
  font-family: 'TimerDigits', "SF Mono", Menlo, Consolas, monospace;
  color: var(--accent);
}
```

### 7.5 DevTools 验证

- 两行工具栏布局正常，不溢出横屏；闹钟提示/计次预览不挤压主时间；计次浮层可滚动、深色/浅色与三种配色均正常。

**提交：** 由用户手动提交。

---

## Task 8: 端到端 DevTools 验证清单

在微信开发者工具中逐条手测（对应设计文档「验证」一节）：

1. **时钟高精度**：精度切「高」显示 `HH:MM:SS.xx` 且流畅跳动；切「低」显示 `HH:MM:SS`。
2. **结束提醒三态**：分别设「振动 / 提示音 / 振动+提示音」，让倒计时、番茄、正计时（设结束上限）到点，逐一验证提醒行为；默认应为「振动+提示音」。
3. **闹钟**：设置栏「闹钟」显示「关」→ 点开设时:分 → 胶囊显示时间、主时间下方同款样式显示「闹钟 HH:MM」；到点触发提醒并自动置「关」；「关闭闹钟」可即时关闭；重进页面闹钟状态保留。
4. **设置栏两行**：第一行 6 个公共按钮在所有模式可见；第二行随模式切换（时钟=闹钟、正计时=结束时长、倒计时=倒计时长、番茄=工作时长+休息时长）。
5. **正计时结束上限**：设 `00:00:05` 从 0 走到 5 秒自动结束、显示「时间到」并按三态提醒；设 `00:00:00`（不限）则一直走；胶囊显示「不限」。
6. **正计时计次**：运行中多次点「计次」，主时间下方显示最近 2 行、超过 2 条出现「More」；More 浮层列出全部并显示累计 + 分段；重置清空计次。
7. **主题/配色**：深浅色、白/绿/琥珀对新 UI 生效。
8. **回归**：倒计时滑动调时、番茄阶段循环、模式切换、后台恢复计时等既有功能不回归。

---

## 执行方式交接

计划已保存。由于本项目无 CLI 测试且要求不自动提交，建议在本会话内逐任务实现，每完成一两个任务在微信开发者工具里验证一次，全部完成后由你手动提交。

需要我**现在开始按计划逐任务实现**吗？还是你先审阅这份计划？
