# 大屏计时器页面设计

- 日期：2026-10-25
- 主题：微信小程序大屏计时器页面（时钟 / 正计时 / 倒计时）
- 状态：已评审通过

## 目标

在现有 `miniprogram-ts-sass-quickstart` 模板基础上，把 `pages/index` 改造为一个**横屏、深色、数码风**的大屏计时器页面，复刻用户描述的 UI。三种模式：时钟、正计时、倒计时，通过底部 Tab 切换。

## 背景与约束

- 微信小程序，TypeScript + Sass，Skyline 渲染器，`glass-easel` 组件框架。
- 页面用 `Component()` 而非 `Page()` 定义，配 `lifetimes` / `pageLifetimes`。
- `navigationStyle: "custom"` 已全局开启。
- 无 CLI 构建 / 测试 / lint：修改只能靠微信开发者工具编译与运行验证。

## 需求决策（brainstorming 确认）

| 项 | 决策 |
| --- | --- |
| 视觉还原基准 | 以文字描述为准，不依赖截图 |
| 倒计时规格 | 可设时长 + 到零提示（震动 + 视觉提示） |
| 顶部三按钮 | 全部实现：样式下拉、深色主题切换、设置面板 |
| 页面位置 | 复用 `pages/index`，清掉演示内容 |
| 横屏方式 | 锁定横屏（`pageOrientation: "landscape"`） |
| 数码字体 | 等宽字体（monospace）模拟，无外部字体资源 |

## 架构选型

**采用「单页自包含」**：全部逻辑放在 `pages/index` 一个 `Component()` 中，三种模式用 `wx:if` 条件渲染，共用数字格式化 util 与统一时间戳计时引擎。

备选（未采用）：
- 按模式拆 `clock-display` / `stopwatch-display` / `countdown-display` 子组件：过度工程，跨组件通信反而加样板。
- 共享 `Behavior` 封装计时生命周期：间接层多，本规模用不上。

## 页面与路由

- 复用 `pages/index`，移除 `navigation-bar` 的 `usingComponents` 引用。
- `index.json` 增加：
  - `"pageOrientation": "landscape"`（锁定横屏）
  - `"disableScroll": true`
- 右上角原生胶囊栏：`navigationStyle: custom` 下微信原生胶囊（··· + ⏺）自动渲染在右上角，无需代码；布局仅需在顶栏右侧预留安全区，避免按钮重叠。

## 数据模型（`Component` 的 `data`）

- `mode: 'clock' | 'stopwatch' | 'countdown'`，默认 `clock`。
- `theme: 'dark' | 'light'`，默认 `dark`。
- 时钟：`dateStr`（`YYYY年MM月DD日 周X`）、`timeStr`（`HH:MM:SS`）。
- 正计时：`swRunning`、`swDisplay`（`HH:MM:SS.xx`）。
- 倒计时：`cdDurationMs`（默认 60000）、`cdRemainingMs`、`cdRunning`、`cdDisplay`（`HH:MM:SS.xx`）、`cdFinished`。
- 面板状态：`showStyleMenu`、`showSettingsPanel`。
- 持久化：`theme` 与 `cdDurationMs` 通过 `wx.setStorageSync` / `wx.getStorageSync` 保存。

## 计时引擎（核心正确性）

用**时间戳差值**而非 tick 累加，避免 `setInterval` 漂移：

- **时钟**：250ms tick，每次 `new Date()` 直接格式化日期与时间。
- **正计时**：
  - 开始：记录 `swStartAt = Date.now()` 与 `swBaseMs`（累计已走毫秒）。
  - tick：`elapsed = swBaseMs + (Date.now() - swStartAt)`。
  - 暂停：把 `Date.now() - swStartAt` 累加进 `swBaseMs`，清 `swStartAt`。
  - 重置：`swBaseMs = 0`、`swRunning = false`、显示归零。
- **倒计时**：
  - 开始：`cdEndAt = Date.now() + cdRemainingMs`。
  - tick：`remaining = cdEndAt - Date.now()`，clamp 到 0。
  - 到 0：停止、`wx.vibrateLong()`、数字短暂闪烁「时间到」提示、置 `cdFinished`；再点开始从 `cdDurationMs` 重跑。
- **tick 频率**：正计时/倒计时运行时用 16ms 快 tick（保证百分秒顺滑）；时钟单独 250ms 慢 tick。
- **生命周期**：
  - `lifetimes.detached` 与 `pageLifetimes.hide` 清定时器，`show` 恢复。
  - 走表时 `wx.setKeepScreenOn(true)`，停止/离开时还原。

## UI 结构与主题

```
.page (theme-dark / theme-light)
 ├ 顶栏：左 [样式▾][深色][设置] 三个胶囊按钮 · 右预留原生胶囊安全区
 ├ 日期（仅时钟模式显示）
 ├ 中间超大号数字（按模式显示 timeStr / swDisplay / cdDisplay）
 ├ 右下角：上方白色【重置】· 下方绿色【开始/暂停】两个圆形按钮
 └ 底部 Tab：时钟 · 正计时 · 倒计时（选中项底加深、文字高亮）
```

- **主题**：WXSS CSS 变量（`--bg / --fg / --dim / --accent` 等），`.theme-dark` 深黑底、`.theme-light` 浅色，切类名即切主题。
- **数码字**：`"SF Mono", "DIN Alternate", Menlo, Consolas, monospace` + 大字号 + 字距 + 可选发光；数字配色「白/绿/琥珀」由样式下拉切换。
- **三按钮**：
  - `样式`：下拉选数字配色 / 字号档。
  - `深色`：切亮暗主题（默认暗）。
  - `设置`：面板设倒计时时长（时/分/秒）等。

## 交互细节（默认值，需用户确认）

1. `开始` 按钮运行时变 `暂停`，可暂停/继续。
2. 时钟模式下右下角「重置/开始」隐藏（时钟只读）。
3. 正计时/倒计时的小时位允许超过 2 位（如 100:00:00.00 不截断）。

## 边界与错误处理

- 定时器全部在 `detached` / `hide` 清理，`show` 恢复，防泄漏与后台耗电。
- 倒计时到 0 严格 clamp，不出现负数。
- 主题与倒计时时长持久化，重进不丢。
- 无网络 / 外部资源依赖，风险低。

## 文件改动清单

| 文件 | 改动 |
| --- | --- |
| `miniprogram/pages/index/index.ts` | 重写：三种模式 + 计时引擎 + 按钮/面板交互 |
| `miniprogram/pages/index/index.wxml` | 重写：页面结构 |
| `miniprogram/pages/index/index.scss` | 重写：布局 + 主题变量 + 数码样式 |
| `miniprogram/pages/index/index.json` | 加 `pageOrientation`/`disableScroll`，移除 navigation-bar |
| `miniprogram/utils/util.ts`（或新增 `time.ts`） | 新增格式化纯函数：时分秒、百分秒、中文日期/星期 |
| `miniprogram/app.scss` | 可选：加主题 CSS 变量 token |

## 验证（无 CLI，纯手测）

- 三模式切换正常，选中态正确。
- 正计时对表跑 10s 无漂移，暂停/继续/重置正确。
- 倒计时到零触发震动 + 提示，且可重跑。
- 深色/浅色主题切换正确，重进保持。
- 横屏锁定生效，布局不塌。
- 切后台/返回时定时器正确停止/恢复。
- 设置持久化：主题与倒计时时长。
- 格式化纯函数在 DevTools console 中逐条核对。

## 不在本轮范围

- `logs` 演示页：保留不动（可后续删除）。
- 样式下拉之外的更多主题/字体自定义。
- 右上角原生胶囊功能（原生，无自定义）。
