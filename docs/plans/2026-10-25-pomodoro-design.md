# 番茄计时模式设计

- 日期：2026-10-25
- 主题：在「时钟 / 正计时 / 倒计时」后新增第四种模式「番茄」
- 状态：已确认
- 关联：`docs/plans/2026-10-25-timer-page-design.md`、`docs/plans/2026-10-25-layout-swap-design.md`

## 目标

在现有横屏大屏计时器中增加番茄计时：

- 顶部分段控件第四项为「番茄」，位置在「倒计时」之后。
- 工作 / 休息两个阶段循环，不区分长短休。
- 阶段结束后震动 + 视觉提示，**手动点「开始」才进入下一阶段**。
- 底部「设置」旁新增「工作时长」「休息时长」两个胶囊，可分别设置并持久化。

## 需求决策

| 项 | 决策 |
| --- | --- |
| 番茄形态 | 工作 → 休息 → 工作… 经典循环 |
| 长休息 | 不区分长短休，所有休息使用同一个「休息时长」 |
| 默认时长 | 工作 25:00，休息 05:00 |
| 阶段推进 | 结束后停在待开始，手动点「开始」进入下一阶段 |
| 阶段结束提醒 | `wx.vibrateLong()` + 数字红色闪烁 + 「时间到」文字 |
| 重置 | 停止计时、回到工作阶段、已完成数归零、显示回到工作时长 |
| 进度保留 | 切换模式时保留阶段与已完成数；小程序重启不保留 |
| 实现方式 | 独立组件 `components/pomodoro-timer`（方案 B） |

## 交互模型

阶段状态机：

```
工作(work) ──结束──▶ 待开始(finished) ──点开始──▶ 休息(rest)
    ▲                                                │
    └──────── 点开始 ◀── 待开始(finished) ◀──结束────┘
```

- 默认状态：工作阶段、未运行、显示工作时长。
- 开始：从当前阶段剩余时间起跑；若处于待开始，先切到下一阶段再起跑。
- 暂停/继续：只影响当前阶段，剩余时间按 `endAt - Date.now()` 计算。
- 阶段结束：
  - 工作结束 → `completed + 1`，进入待开始。
  - 休息结束 → 进入待开始。
  - 震动一次，显示 00:00:00.00 并红色闪烁，显示「时间到」。
- 重置：`phase = work`、`completed = 0`、`finished = false`、`running = false`、剩余 = 工作时长。
- 切换模式：若番茄正在运行，先自动暂停；组件常驻挂载，切回番茄时保留原阶段与已完成数。

副标题（复用日期行位置）：

- 工作阶段进行中：`专注 · 第 {completed + 1} 个番茄`
- 工作阶段刚结束、待点开始时：`专注 · 已完成 {completed} 个番茄`
- 休息阶段：`休息 · 已完成 {completed} 个番茄`

## 组件边界

新增 `miniprogram/components/pomodoro-timer/`，自包含番茄计时引擎与数字显示。

### 对外接口

| 方向 | 名称 | 说明 |
| --- | --- | --- |
| 页面 → 组件 | `workDurationMs: Number` | 工作时长，默认 1500000 |
| 页面 → 组件 | `restDurationMs: Number` | 休息时长，默认 300000 |
| 页面 → 组件 | `styleKey: String` | 数字配色 `white / green / amber` |
| 组件 → 页面 | `statechange` | `detail: { running, finished, phase, completed }`，仅在状态切换时触发 |
| 页面 → 组件 | `toggle()` | 开始 / 暂停 / 待开始时进入下一阶段并运行 |
| 页面 → 组件 | `reset()` | 重置整个循环 |
| 页面 → 组件 | `pause()` | 仅暂停，用于切换模式 |

### 组件内部

- 数据：`phase / running / finished / completed / display`。
- 私有：`endAt` 时间戳、tick 句柄。
- tick：16ms，仅更新 `display`（`formatHMSxx`）。
- 生命周期：
  - `pageLifetimes.hide` / `detached`：清除 tick，`wx.setKeepScreenOn(false)`。
  - `pageLifetimes.show`：若 `running`，恢复 tick；靠 `endAt` 追平后台流逝时间。
  - 运行中 `wx.setKeepScreenOn(true)`。
- 阶段结束由组件调用 `wx.vibrateLong()`，并通过 `statechange` 通知页面。
- 属性 observer：时长变化时，若当前阶段空闲（未运行、未结束）则立刻同步剩余与显示；运行中或已结束则只保存，下次进入该阶段生效。

### 主题与样式

- 组件使用 `var(--fg)` / `var(--glow)`，由页面 `.page` 上的主题变量继承，深浅色自动跟随。
- 数字字体沿用全局注册的 `TimerDigits`，字号 14vw，样式与页面 `.digits` 一致。
- `styleKey` 对应 `.style-white / .style-green / .style-amber`，`.finished` 复刻红色闪烁。

### 页面职责

- 分段控件、右下角「重置 / 开始」、副标题、「时间到」提示、底部胶囊与设置面板仍由页面负责。
- 页面通过 `this.selectComponent('#pomo')` 转发按钮操作。
- 页面保存 `pomoRunning / pomoFinished / pomoPhase / pomoCompleted / pomoStageText`，用于按钮文案、提示与副标题。
- 组件常驻渲染，非番茄模式加 `hidden` 类隐藏，避免切换模式销毁组件丢失进度。

## 页面数据与设置

### 新增页面 data

- `workDurationMs`：默认 `25 * 60 * 1000`
- `restDurationMs`：默认 `5 * 60 * 1000`
- `workLabel` / `restLabel`：胶囊显示文本，如 `25:00`
- `pomoRunning` / `pomoFinished` / `pomoPhase` / `pomoCompleted` / `pomoStageText`
- `durationTarget: '' | 'countdown' | 'work' | 'rest'`：设置面板目标

### 设置面板泛化

- 现有「设置」胶囊继续打开倒计时时长面板，标题「倒计时时长」。
- 新增「工作 25:00」「休息 05:00」两个胶囊，分别打开「工作时长」「休息时长」面板。
- 三个面板共用同一套时 : 分 : 秒输入与「确定」逻辑，按 `durationTarget` 写入对应字段。
- 工作/休息时长下限按 1 秒处理，避免 0 长度阶段。

### 持久化

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `timer.workDurationMs` | 1500000 | 工作时长 |
| `timer.restDurationMs` | 300000 | 休息时长 |
| `timer.cdDurationMs` | 60000 | 现有倒计时时长，不变 |

- 读取时校验为正数，否则用默认值。
- 番茄当前阶段与已完成数不持久化，页面重载后回到工作阶段。

## UI 布局

```
┌──────────────────────────────────────────────────┐
│        ┌────┬──────┬──────┬────┐      (· · ·)    │
│        │时钟│正计时│倒计时│番茄│                 │
│        └────┴──────┴──────┴────┘                 │
│             专注 · 第 1 个番茄                    │
│              00 : 25 : 00.00                     │
│                                       ○ 重置     │
│                                       ○ 开始     │
│      ┌────┐┌────┐┌────────┐┌────────┐┌────┐      │
│      │样式││深色││工作25:00││休息05:00││设置│     │
│      └────┘└────┘└────────┘└────────┘└────┘      │
└──────────────────────────────────────────────────┘
```

- 分段控件四项后宽度约 388px，会压到横屏右上原生胶囊；`.mode-item` 左右内边距由 20px 调整为 12px，整体约 324px，最窄 568px 横屏仍安全。
- 底部由 3 个胶囊变 5 个；`.pill` 左右内边距由 18px 调整为 14px，保证 568px 横屏一行放得下。
- 胶囊文案中的时长用 `formatDurationLabel`：小于 1 小时显示 `MM:SS`，否则显示 `H:MM:SS`。
- 「时间到」提示与红色闪烁按模式隔离：
  - 倒计时：`mode === 'countdown' && cdFinished`
  - 番茄：`mode === 'pomodoro' && pomoFinished`
  - 同时修复现有「倒计时结束后切到正计时仍红闪」的串模式问题。

## 文件改动清单

| 文件 | 改动 |
| --- | --- |
| `miniprogram/components/pomodoro-timer/pomodoro-timer.ts` | 新建：番茄阶段状态机、tick、属性 observer、对外方法、`statechange` |
| `miniprogram/components/pomodoro-timer/pomodoro-timer.wxml` | 新建：数字显示与结束态 |
| `miniprogram/components/pomodoro-timer/pomodoro-timer.scss` | 新建：数字、配色档、闪烁样式 |
| `miniprogram/components/pomodoro-timer/pomodoro-timer.json` | 新建：`{ "component": true }` |
| `miniprogram/pages/index/index.json` | 注册 `pomodoro-timer` |
| `miniprogram/pages/index/index.ts` | `Mode` 加 `pomodoro`；番茄状态与转发；设置面板泛化；两个时长持久化 |
| `miniprogram/pages/index/index.wxml` | 第四段、常驻组件、番茄副标题、5 个胶囊、动态面板、结束态按模式隔离 |
| `miniprogram/pages/index/index.scss` | 分段项 / 胶囊内边距；组件容器与 `hidden` 类 |
| `miniprogram/utils/time.ts` | 新增 `formatDurationLabel` |

## 边界与异常

- 工作/休息时长最小 1 秒；输入 0 或负数按 1 秒处理。
- 运行中修改当前阶段时长不打断计时，下一次进入该阶段生效。
- 后台期间阶段结束：回到前台恢复 tick 后立即判定结束并震动。
- 切换模式时番茄自动暂停，按钮文案同步为「开始」。
- 番茄结束待开始时，点「开始」只推进一次，不重复计数。
- 非番茄模式下不显示番茄的「时间到」与红色闪烁。

## 验证（无 CLI，DevTools 手测）

- 顶部分段控件四项可切换，选中态正确；最窄横屏机型不与原生胶囊重叠。
- 番茄默认显示 25:00，点开始后正常走表，暂停/继续准确。
- 工作 25:00 结束：震动、红色闪烁、「时间到」；点开始进入休息并自动运行。
- 休息结束：同样提示；点开始进入下一轮工作，副标题轮次 +1。
- 重置后回到工作阶段、已完成数归零。
- 修改工作/休息时长：空闲阶段立即生效，运行中下次生效；重进页面保持。
- 深浅色、样式（白/绿/琥珀）对番茄数字生效。
- 切到其他模式再切回番茄，阶段与已完成数保留；切走时自动暂停。
- 切后台再回前台，计时根据真实时间追平。

## 不在本轮范围

- 长休息（每 4 个番茄）。
- 阶段结束自动进入下一阶段。
- 提示音、微信订阅消息。
- 番茄进度跨小程序重启保存、统计报表。
- 正计时/倒计时引擎重构。
