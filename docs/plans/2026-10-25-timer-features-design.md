# 计时器六项功能扩展设计

- 日期：2026-10-25
- 主题：时钟高精度、结束提醒三态、时钟闹钟、设置栏两行、正计时结束上限、正计时计次
- 状态：已确认
- 关联：`docs/plans/2026-10-25-timer-page-design.md`、`docs/plans/2026-10-25-pomodoro-design.md`、`docs/plans/2026-10-25-time-layout-and-buttons-design.md`

## 目标

在现有横屏大屏计时器上扩展六项能力，保持「组件只做引擎、页面负责渲染与 `wx.*`」的既有边界：

1. 时钟模式也支持高精度（`HH:MM:SS.xx`）。
2. 所有模式结束后按「仅振动 / 仅提示音 / 振动+提示音」三态提醒，默认「振动+提示音」。
3. 时钟可设置闹钟（时:分），到点一次性提醒，主时间下方显示闹钟时间。
4. 设置栏拆成两行：第一行放所有模式共有的设置。
5. 正计时增加「结束上限」，计时到设定时长自动结束。
6. 正计时增加「计次」按钮，记录累计时间，可查看全部计次（含分段间隔）。

## 需求决策

| 项 | 决策 |
| --- | --- |
| 时钟高精度 | 复用全局 `showCentis`，高精度显示百分秒并加速走秒，低精度保持现状 |
| 结束提醒 | 全局三态 `vibrate / sound / both`，默认 `both`；闹钟到点也共用 |
| 提示音 | 内置一段短「哔」声到 `miniprogram/assets/`，用 `InnerAudioContext` 播放 |
| 闹钟开关 | 设置栏第二行一个开关胶囊，显示「关」或「时:分」 |
| 闹钟设置 | 点开关弹「时:分」面板；已开时面板内多一个「关闭闹钟」 |
| 闹钟重复 | 今天一次性，不每天重复 |
| 闹钟显示 | 主时间下方用「上下滑动调整」同款样式显示闹钟时间 |
| 设置栏两行 | 第一行＝数字颜色 / 背景颜色 / 字号 / 精度 / 结束提醒 / 按钮位置 |
| 正计时结束上限 | 复用「时:分:秒」面板设置，默认不限（0 秒＝不限），到点＝时间到＋三态提醒 |
| 计次数值 | 记录并显示「累计时间」；浮层内同时显示「累计 + 分段间隔」 |
| 计次 More | 页面内浮层（复用居中弹层样式），非跳转新页面 |
| 实现方式 | 方案一：扩展现有组件引擎与 `statechange` 契约，页面统一渲染（见下） |

## 架构与边界

沿用「组件＝引擎（无样式、不碰 `wx.*`、不碰存储）；页面＝渲染 + 持久化 + 振动/声音」的分层：

- 闹钟运行时状态（开/关、时:分、到点检测）放 `clock-timer`，页面负责持久化与渲染。
- 计次记录、结束上限放 `stopwatch-timer`，页面负责渲染计次按钮 / 预览 / 浮层。
- 振动与提示音统一由页面触发（`wx.vibrateLong` / `InnerAudioContext`）。

## `statechange` 契约扩展

现有 `detail`：`{ running, finished, subTime, capabilities, actions, editable, editKey, editValueMs }`。

### clock-timer 新增

- `alarmOn: boolean`：闹钟是否开启。
- `alarmText: string`：开启时为 `"HH:MM"`（如 `"07:30"`），关闭时为 `""`。
- 新增离散事件 `alarmfire`：到点触发，`detail` 可空；页面据此提醒并落盘关闭。

### stopwatch-timer 新增

- `laps: { index: number; cumulativeMs: number; splitMs: number }[]`：计次列表。
- `actions` 新增一条：
  - `key: 'limit'`、`label: '结束时长'`、`kind: 'duration'`、`title: '结束时长'`、`valueMs: limitMs`、`minMs: 0`、`storageKey: 'timer.swLimitMs'`。
- `finished` 语义扩展：到达上限时置真（其余时刻保持 `false`）。

## 各功能详细设计

### 1. 时钟高精度

- `clock-timer` 增加 `showCentis` 属性（与其余三个组件一致），由页面下发。
- `showCentis === true`：显示 `HH:MM:SS.xx`，tick 走 `16ms`。
- `showCentis === false`：显示 `HH:MM:SS`，tick 走 `250ms`（现状）。
- 新增纯函数 `formatClockHMSxx(d: Date): string`（含百分秒）。

### 2. 结束提醒三态

- 页面新增全局设置 `endAlert: 'vibrate' | 'sound' | 'both'`，默认 `'both'`，持久化 `timer.endAlert`。
- 设置栏第一行「结束提醒」胶囊，值显示「振动 / 提示音 / 振动+提示音」，点击循环切换。
- 触发点：
  - `onStateChange` 中 `finished` 的上升沿（倒计时 / 番茄 / 正计时上限）。
  - 闹钟 `alarmfire` 事件。
- 统一入口 `_playAlert()`：
  - `vibrate` → `wx.vibrateLong()`。
  - `sound` → 播放内置提示音。
  - `both` → 两者都做。
- 移除现在 `onStateChange` 里写死的 `wx.vibrateLong()`。

### 3. 时钟闹钟

- `clock-timer` 内部持有 `alarmOn / alarmHour / alarmMinute / alarmFired`。
- 对外方法：
  - `setAlarm(hour, minute)`：开启并保存时:分，重置 `alarmFired`，`_emitState()`。
  - `clearAlarm()`：关闭，`_emitState()`。
- 到点检测：tick / `_render` 时，若 `alarmOn` 且当前时:分相等且未 `alarmFired`：
  - 置 `alarmFired = true`、`alarmOn = false`，触发 `alarmfire` 事件并 `_emitState()`（页面据此提醒 + 持久化关闭）。
- 页面职责：
  - 设置栏第二行「闹钟」胶囊，`alarmOn` 时显示 `alarmText`，否则显示「关」。
  - 点击弹「闹钟」面板（时:分两个输入 + 确定 / 取消；`alarmOn` 时多「关闭闹钟」）。
  - 确认 → `clock.setAlarm(h, m)` + 写 `timer.alarm`；关闭闹钟 → `clock.clearAlarm()` + 写 `timer.alarm`。
  - 主时间下方用「上下滑动调整」同款样式显示 `alarmText`（仅 `alarmOn`）。

### 4. 设置栏两行

- 第一行（所有模式共有，始终显示）：数字颜色 / 背景颜色 / 字号 / 精度 / 结束提醒 / 按钮位置。
- 第二行（随模式变化，来自组件 `actions` 或页面按模式渲染）：
  - 时钟：闹钟。
  - 正计时：结束时长。
  - 倒计时：倒计时长。
  - 番茄：工作时长 / 休息时长。
- 「按钮位置」由原来「仅在有操作按钮的模式显示」改为始终在第一行显示。

### 5. 正计时结束上限

- `stopwatch-timer` 内部持有 `limitMs`（`0`＝不限），支持 `setDuration('limit', ms)`。
- 走表时若 `limitMs > 0` 且 `elapsed >= limitMs`：停止、`finished = true`、`_emitState()`。
- 页面：
  - `actions` 里的 `limit` 复用现有「时:分:秒」面板（`onActionTap` / `applyDuration`）。
  - `limitMs === 0` 时胶囊值显示「不限」，否则 `formatDurationLabel(limitMs)`。
  - 到点后页面按 `finished` 上升沿走三态提醒 + 「时间到」红闪（与倒计时一致）。
  - 重置清空计次但保留上限设置。

### 6. 正计时计次

- 页面在操作组**对侧**渲染「计次」按钮（`actionSide === 'right'` 时在左，否则在右），样式复用操作组圆形按钮，仅正计时且 `running` 时可用。
- `stopwatch-timer` 新增 `lap()`：记录 `cumulativeMs = baseMs + (Date.now() - startAt)`；`splitMs = cumulativeMs - 上一条 cumulativeMs`（首条等于自身）；`_emitState()`。
- 重置清空 `laps`。
- 页面渲染：
  - 主时间下方预览：最多显示最近 2 行，格式 `N　累计时间`；`laps.length > 2` 时末尾显示「More」。
  - 点「More」弹浮层：复用居中弹层样式，逐行「第 N 次 / 累计 / 分段」。

## 页面数据与持久化

### 新增页面 data

- `endAlert: 'vibrate' | 'sound' | 'both'`
- `endAlertLabel: string`（「振动 / 提示音 / 振动+提示音」）
- `alarmOn: boolean`、`alarmText: string`（来自组件上报）
- `alarmPanelVisible: boolean`、`alarmH: number`、`alarmM: number`
- `laps: Lap[]`（来自组件上报）
- `lapPanelVisible: boolean`

### 持久化键

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `timer.endAlert` | `'both'` | 结束提醒三态 |
| `timer.alarm` | `{ on: false }` | 闹钟状态与时:分 |
| `timer.swLimitMs` | `0` | 正计时结束上限，0＝不限 |

- 读取时校验：`endAlert` 只在 `vibrate / sound / both` 中取值；`timer.alarm` 校验 `on / hour / minute` 字段，`hour ∈ [0,23]`、`minute ∈ [0,59]`；`swLimitMs` 校验为非负整数。

## 文件改动清单

| 文件 | 改动 |
| --- | --- |
| `miniprogram/components/clock-timer/clock-timer.ts` | 新增 `showCentis` 属性、`formatClockHMSxx`、闹钟运行时与 `alarmfire`、`setAlarm` / `clearAlarm` |
| `miniprogram/components/stopwatch-timer/stopwatch-timer.ts` | 新增 `limitMs` 与结束判定、`lap()` 与 `laps`、`setDuration('limit')` |
| `miniprogram/pages/index/index.ts` | 三态提醒 `endAlert` + `_playAlert`；闹钟面板与持久化；计次转发与浮层数据；两行设置栏数据；`limit` 胶囊「不限」显示 |
| `miniprogram/pages/index/index.wxml` | 闹钟面板、计次按钮 / 预览 / More 浮层、主时间下方闹钟提示、两行工具栏、`clock-timer` 加 `show-centis` |
| `miniprogram/pages/index/index.scss` | 两行工具栏、闹钟提示、计次按钮与预览、More 浮层、闹钟面板样式 |
| `miniprogram/utils/time.ts` | 新增 `formatClockHMSxx` |
| `miniprogram/assets/` | 新增内置提示音（短「哔」声） |

## 边界与异常

- 闹钟设在今天已过的时间 → 今天不触发（一次性，不自动顺延，不自动关闭）。
- 后台限制：组件 `hide()` 停表、`show()` 恢复；后台越过闹钟分钟不补响（沿用现有后台限制）。
- 结束上限设 `00:00:00` → 视为「不限」，胶囊显示「不限」。
- 重置正计时清空计次，但保留结束上限设置。
- 闹钟面板「关闭」/「取消」不改变现有闹钟状态。
- 计次按钮仅在正计时运行中可用，非运行 / 其他模式不显示。

## 验证（无 CLI，DevTools 手测）

- 时钟模式切换高/低精度，高精度显示 `HH:MM:SS.xx` 且秒后两位流畅跳动。
- 结束提醒三态：倒计时 / 番茄 / 正计时到点，分别验证「仅振动」「仅提示音」「振动+提示音」，默认振动+提示音。
- 闹钟：设时:分后胶囊显示时间、主时间下方同款样式显示；到点触发提醒并自动置「关」；「关闭闹钟」可即时关闭。
- 设置栏两行：第一行 6 个公共按钮所有模式可见；第二行随模式切换正确。
- 正计时结束上限：设 00:00:05 后从 0 走到 5 秒自动结束并提醒；「不限」时一直走。
- 计次：运行中多次点「计次」，主时间下方预览最近 2 行、超 2 条出现「More」；More 浮层列出全部并显示累计 + 分段；重置清空。
- 深浅色主题、白/绿/琥珀配色对新 UI 生效。

## 不在本轮范围

- 闹钟每天重复、跨日顺延、后台补响。
- 提示音自定义 / 音量设置。
- 计次跨会话保存、导出。
- 结束提醒的微信订阅消息。
