# 字体体系、番茄阶段交互与客服入口设计

- 日期：2026-10-25
- 主题：超大字号、七段/圆角/经典三档字体、渐变数字、青蓝配色、番茄结束态与阶段辨识、60 秒分组提示音、左上角客服入口、设置栏下移
- 状态：已确认
- 关联：`docs/plans/2026-10-25-timer-page-design.md`、`docs/plans/2026-10-25-pomodoro-design.md`、`docs/plans/2026-10-25-timer-features-design.md`

## 目标

在现有横屏大屏计时器（时钟 / 正计时 / 倒计时 / 番茄）上完成九项调整：

1. 字号新增「超大」档，横向尽可能铺满屏幕，左右只留安全边距。
2. 左上角新增客服入口（图标 +「向我提需求」），点击弹层展示微信号与二维码。
3. 番茄阶段结束后停在结束态，下方显示可点击的「进入休息时间 05:00」/「进入工作时间 25:00」；结束态开始、暂停不可点，只能重置或点下一阶段提示。
4. 工作 / 休息阶段用彩色阶段徽标 + 全屏氛围色一眼可辨。
5. 暂停后开始按钮文案改为「继续」。
6. 数字颜色新增青蓝。
7. 字体设置支持七段数码管（默认）、类 SF 圆角体、经典三档。
8. 渐变字体：当前颜色到固定终点、左下 → 右上斜向渐变。
9. 结束提示音改为「嘟嘟嘟—停—嘟嘟嘟」循环 60 秒，振动同步；设置栏整体下移。

## 需求决策

| 项 | 决策 |
| --- | --- |
| 超大字号 | 15.5vw 为上限，实际按可用宽度反推：`min(15.5vw, (100vw − 左右安全区 − 24px) / 5.96)`，`letter-spacing: 0`，`line-height: 1.1` |
| 字号档位 | 小 8.5vw / 中 10.5vw / 大 13vw / 超大按上式，循环切换 |
| 新增数字颜色 | 青蓝，深色 `#22d3ee`，浅色 `#0891b2` |
| 字体档位 | 数码管（默认）/ 圆角 / 经典，循环切换 |
| 七段字形 | 本地 fontTools 生成，横向段轻微斜切、段端 45° 切角、段间留细缝、数字等宽 |
| 圆角体 | 以现有 Inter 子集为底程序化圆角化生成，不引入第三方字体文件 |
| 渐变方向 | 左下 → 右上（`to top right`） |
| 渐变终点 | 白→青、绿→青蓝、琥珀→橙红、青蓝→紫，见下表 |
| 番茄推进 | 结束后停在结束态，点击主时间下方的下一阶段提示才进入并开始 |
| 结束态按钮 | 开始、暂停置灰不可点；重置可用；下一阶段提示可点 |
| 阶段辨识 | 子时间行替换为彩色阶段徽标；休息时全屏青蓝氛围光 |
| 提示音 | 3 声一组、组间停约 1s、循环 60s 自动停止；每声同步短振动 |
| 客服入口 | 左上角胶囊，点击弹层展示微信号 `chenshiming0802` + 二维码（待提供） |
| 设置栏 | 第一行新增字体、渐变两枚胶囊，共 8 枚；整栏下移约 18px |

## 一、字体与视觉

### 1.1 字号

`FontSizeKey` 由 `s | m | l` 扩展为 `s | m | l | xl`，文案「小 / 中 / 大 / 超大」。

| 档位 | 主时间字号 | 说明 |
| --- | --- | --- |
| 小 | 8.5vw | 不变 |
| 中 | 10.5vw | 默认，不变 |
| 大 | 13vw | 不变 |
| 超大 | 15.5vw（上限） | 新增，字距归零 |

- 三款字体的数字步进一致（1300/2048em，冒号 590/2048em），最长内容 `00:00:00.00`（8 数字 + 2 冒号 + 1 点）恰为 5.94em，因此超大档按可用宽度反推字号：
  `font-size: calc(min(15.5vw, (100vw - env(safe-area-inset-left) - env(safe-area-inset-right) - 24px) / 5.96))`。
  刘海机横屏时左右安全区达 47–59px，若只用 15.5vw 会伸进安全区（横屏刘海正好在屏幕竖向中部，与数字同高），故必须扣除安全区。
- 不支持 `min()` 的旧客户端整条声明被忽略，回退到 `--main-font-size: 15.5vw`，行为与改造前一致。
- 主时间仍由 `.stage` 绝对居中，新增元素不得改变 `.sub-time` / `.stage-balancer` 的占位高度。
- 超大档垂直高度约 1.1 × 15.5vw；375px 高横屏下约 64px 行高余量，不与底部设置栏重叠。

### 1.2 数字配色

`StyleKey` 由 `white | green | amber` 扩展为 `white | green | amber | cyan`，循环顺序 白 → 绿 → 琥珀 → 青蓝 → 白。

| 档位 | 深色主题 | 浅色主题 | 光晕 |
| --- | --- | --- | --- |
| 白 | `#e6e6e6` | 跟随 `--fg` | 现有 |
| 绿 | `#34d058` | 现有 | 现有 |
| 琥珀 | `#ffb020` | 现有 | 现有 |
| 青蓝 | `#22d3ee` | `#0891b2` | `rgba(34, 211, 238, 0.45)` |

### 1.3 字体设置

`FontFamilyKey = 'seven' | 'rounded' | 'classic'`，循环：数码管 → 圆角 → 经典。

| 档位 | 胶囊值 | CSS class | font-family |
| --- | --- | --- | --- |
| seven（默认） | 数码管 | `.font-seven` | `'TimerSeven', "SF Mono", Menlo, monospace` |
| rounded | 圆角 | `.font-rounded` | `'TimerRounded', "SF Pro Rounded", "PingFang SC", sans-serif` |
| classic | 经典 | `.font-classic` | `'TimerDigits', "SF Mono", "DIN Alternate", Menlo, monospace` |

- 页面 `.main-time` 通过 `--digit-font` 下发，主时间与滑动调时分段（`.edit-time`）共用。
- 三款字体均只含 `0-9 : .`，数字步进统一为 `1300/2048 em`（与现有 Inter 子集一致），切换字体不产生横向跳动。
- 字体注册沿用双路径：`app.scss` 三条 `@font-face`（base64）+ `app.ts` 循环调用 `wx.loadFontFace`（base64 Data URL，`scopes: ['webview', 'skyline']`）。
- 三款字体合计内嵌预计 30–40KB。

### 1.4 七段数码管字形

- 由 `docs/fonts/generate_fonts.py` 用 fontTools 从零绘制，不依赖第三方字体。
- 7 段布局：上、右上、右下、下、左下、左上、中；横向段带轻微斜切（左端略低），段端 45° 切角，段间留约 2% em 的缝。
- 字高与 Inter 数字视觉高度对齐，基线一致；数字步进 `1300/2048 em` 并居中。
- 冒号：两个方形点；小数点：基线上方一个方形点；空格：半宽。
- 生成后写入 `docs/fonts/TimerSeven.ttf`。

### 1.5 圆角体

- 输入：`docs/fonts/TimerDigits.ttf`（Inter 子集，OFL-1.1）。
- 处理：遍历所有字形轮廓，对尖角 on-curve 点做小半径圆角化（fillet），曲线段按短直线近似后重建，保持原有步进与基线。
- 输出：`docs/fonts/TimerRounded.ttf`，继续沿用 OFL-1.1 授权声明。
- 风险：自动圆角化不是真正的 SF Rounded，需在 DevTools/真机目测；若字形不可接受，保留设置项但圆角档回退到经典字形，并记录原因。

### 1.6 渐变字体

- `GradientKey = boolean`，由「渐变」胶囊开关，默认关；持久化 `timer.gradient`。
- 开启后 `.main-time.is-gradient .main-time__value` 与 `.edit-time` 应用：

```css
background-image: linear-gradient(to top right, var(--grad-from), var(--grad-to));
-webkit-background-clip: text;
background-clip: text;
-webkit-text-fill-color: transparent;
color: transparent;
```

- 渐变终点固定配对：

| 数字颜色 | 起点 | 终点 |
| --- | --- | --- |
| 白 | `#e6e6e6` | `#22d3ee` |
| 绿 | `#34d058` | `#22d3ee` |
| 琥珀 | `#ffb020` | `#ff6b6b` |
| 青蓝 | `#22d3ee` | `#8b7cf6` |

- 数字外发光（`text-shadow`）保留；结束态红色闪烁优先于渐变（`.is-finished` 覆盖为纯红）。
- 若个别机型 `background-clip: text` 不生效，回退为纯色，不改变布局。

## 二、番茄阶段交互

### 2.1 阶段状态机

```
工作运行中 ──时间到──▶ 工作结束态
                         │ 主时间 00:00:00.00 红色闪烁 +「时间到」
                         │ 徽标：工作时间 · 已完成 N 个番茄
                         │ 下方可点：进入休息时间 05:00
                         │ 开始/暂停置灰，只有重置 + 提示可点
                         ▼ 点提示（同时停提示音）
休息运行中 ──时间到──▶ 休息结束态
                         │ 下方可点：进入工作时间 25:00
                         ▼ 点提示
工作运行中 …
```

- 结束态点提示：组件从当前阶段切到下一阶段并立即开始走表；`finished` 复位，开始/暂停恢复可用，徽标与氛围色同步切换。
- 工作结束 → 已完成数 +1；休息结束不增加。
- 运行中可暂停；暂停后主按钮文案为「继续」，继续同一阶段剩余时间。
- 切换模式自动暂停，切回番茄保留阶段、剩余时间、已完成数。
- 「重置」任意时刻可用：停止、回工作阶段、已完成数归零、显示工作时长、提示音停止。

### 2.2 阶段徽标

- 番茄模式下，`.sub-time` 行替换为彩色阶段徽标；其他模式保持现有子时间。
- 工作：绿色系边框 + 淡底 + 绿点，文案 `工作时间 · 第 {completed + 1} 个番茄`；工作结束态为 `工作时间 · 已完成 {completed} 个番茄`。
- 休息：青蓝色系边框 + 淡底 + 青点，文案 `休息时间 · 已完成 {completed} 个番茄`。
- 徽标高度保持在现有 34px 占位内（内边距 3px 12px，字号 17px），不改变主时间居中。
- 专注模式下保留徽标（主时间之外唯一保留的信息）；其他浮层与操作组照旧隐藏。

### 2.3 全屏氛围光

- 仅休息阶段显示：整屏叠一层青色径向渐变 `radial-gradient(ellipse at center, transparent 45%, rgba(34, 211, 238, 0.16) 100%)`，0.6s 淡入/淡出。
- 工作阶段无氛围光，形成「有蓝光 = 休息」的快速识别。
- 浅色主题降低透明度至 `0.08`；不影响数字颜色与设置栏可读性。
- 放在内容下层（`z-index: 0`），不拦截点击。

### 2.4 结束态按钮

- `capabilities.toggle` 仍为 true，保证开始/暂停按钮可见。
- 页面在 `finished && mode === 'pomodoro'` 时：
  - 开始、暂停加 `is-disabled`（透明度 0.35）；
  - `onStart` / `onPause` 直接 return，不触发组件；
  - 重置保持可用；
  - 下一阶段提示可点。
- 倒计时结束态保持现状：开始按钮重新计时。

## 三、继续按钮

- 四个组件在 `statechange` 增加 `started: boolean`：
  - 倒计时 / 番茄：使用已有模块级 `started`。
  - 正计时：新增 `started`，开始置 true，重置置 false。
  - 时钟：恒为 false（无切换按钮）。
- 页面计算主按钮文案：

```
running            → 显示「暂停」按钮（主按钮为「开始」但置灰）
!running && started && !finished → 继续
其余               → 开始
```

- 暂停按钮在 `!running` 时保持置灰。
- 番茄结束态例外：开始文案不显示「继续」，整体置灰。

## 四、提示音与振动

### 4.1 节奏

```
嘟 (0.35s) → 0.12s → 嘟 → 0.12s → 嘟 → 停 1.0s → 重复
```

- 每声「嘟」开始同时 `wx.vibrateShort()`。
- 循环总时长 60 秒，到点自动停止，不再响。
- 仍受「结束提醒」三态控制：振动 / 提示音 / 振动+提示音。
- 倒计时结束、番茄阶段结束、时钟闹钟共用同一套节奏。

### 4.2 停止条件

以下任一情况立即清除所有定时器并停止音频：

- 点「重置」；
- 点「开始 / 继续」；
- 点下一阶段提示；
- 切换模式；
- 页面 `hide`、组件 `detached`；
- 新一轮提醒开始（先停旧再响新）。

### 4.3 实现

- 页面级 `_playAlert()` 改为循环调度，内部登记所有 `setTimeout` 句柄；`_stopAlert()` 统一 `clearTimeout` 并 `beepAudio.stop()`。
- 用 `Date.now()` 截止时间判断 60s，避免定时器漂移。
- `beep.wav` 保持现有 0.35s 素材。

## 五、客服入口与弹层

### 5.1 入口

- 左上角胶囊：内联 SVG 对话气泡（16px）+「向我提需求」，字号 13px，高约 30px，背景 `var(--pill-bg)`。
- 定位 `top: calc(env(safe-area-inset-top) + 10px); left: calc(env(safe-area-inset-left) + 12px)`，`z-index: 3`。
- 专注模式隐藏；点击用 `catchtap` 阻止冒泡到页面空白区（避免同时切换专注模式）。
- 最窄 568px 横屏下与居中模式栏保持约 14px 间距。

### 5.2 弹层

- 复用 `.mask` + `.panel`，标题「联系我」，宽 520px（`max-width: calc(100vw - 40px)`）。
- 横屏可用高度只有 320–430px，竖排「说明 + 微信号 + 180px 二维码 + 按钮」约 460px 会出屏，因此改为左右两栏：
  - 左栏（`flex: 1`）：说明文案「使用遇到问题，或想要新功能，直接加我微信」+ 微信号 `chenshiming0802`（`<text selectable>` 可长按选中）+「复制微信号」（`wx.setClipboardData`）与「关闭」两个按钮；
  - 右栏：二维码图片 `miniprogram/assets/contact-qr.jpg`，150px 见方。
- 整层高度约 266px，最矮 320px 横屏下仍留 27px 上下边距。
- 二维码加载失败（`binderror`）时隐藏图片区，只显示微信号与复制按钮，不影响其他交互。
- 二维码用 `show-menu-by-longpress`，可长按保存/转发。

### 5.3 待提供

- `miniprogram/assets/contact-qr.jpg`（用户提供后补入，无需改代码）。

## 六、设置栏

- 第一行 8 枚胶囊：

```
数字颜色 / 背景颜色 / 字体 / 字号 / 精度 / 渐变 / 结束提醒 / 按钮位置
```

- 「字体」胶囊值：数码管 / 圆角 / 经典；「渐变」胶囊值：开 / 关。
- 胶囊内边距由 `4px 10px` 收为 `4px 9px`，`gap` 保持 6px，最窄横屏约 500px 宽，单行可容纳。
- 设置栏整体下移：`.toolbar` 内边距由 `12px 0 24px` 改为 `10px 0 calc(4px + env(safe-area-inset-bottom))`。
- 操作组仍为 `bottom: 84px`，与下移后的设置栏无重叠。

## 七、持久化

| 键 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `timer.fontSize` | `s \| m \| l \| xl` | `m` | 新增 `xl` |
| `timer.fontFamily` | `seven \| rounded \| classic` | `seven` | 新增 |
| `timer.gradient` | boolean | `false` | 新增 |
| `timer.style` | `white \| green \| amber \| cyan` | `white` | 新增 `cyan` |
| 其他 | - | - | 不变 |

- 读取时逐项校验枚举值；非法值忽略并保持默认。
- 番茄阶段 / 已完成数仍不跨小程序重启持久化。

## 八、文件改动清单

| 文件 | 改动 |
| --- | --- |
| `docs/fonts/generate_fonts.py` | 新建：七段字形生成 + Inter 圆角化 |
| `docs/fonts/TimerSeven.ttf` | 生成：七段数码管子集 |
| `docs/fonts/TimerRounded.ttf` | 生成：Inter 圆角化子集 |
| `docs/fonts/README.md` | 补两款字体的来源、授权、重生成命令 |
| `miniprogram/utils/font.ts` | 增加 `TIMER_SEVEN_FONT` / `TIMER_ROUNDED_FONT` 及 base64 |
| `miniprogram/app.scss` | 增加两条 `@font-face` |
| `miniprogram/app.ts` | 循环注册三款字体 |
| `miniprogram/pages/index/index.ts` | 超大字号、青蓝、字体 / 渐变设置、提示音循环、番茄结束态、下一阶段提示、`started` 文案、客服面板与复制 |
| `miniprogram/pages/index/index.wxml` | 客服入口与弹层、阶段徽标、氛围光、下一阶段提示、字体 / 渐变胶囊、继续文案、结束态禁用 |
| `miniprogram/pages/index/index.scss` | 超大字号、青蓝配色、三档字体、渐变文字、安全区、设置栏下移、徽标 / 氛围光 |
| `miniprogram/components/countdown-timer/countdown-timer.ts` | `statechange` 增加 `started` |
| `miniprogram/components/pomodoro-timer/pomodoro-timer.ts` | `statechange` 增加 `started` / `phase` / `nextText` |
| `miniprogram/components/stopwatch-timer/stopwatch-timer.ts` | 新增 `started` 并在 `statechange` 上报 |
| `miniprogram/components/clock-timer/clock-timer.ts` | `statechange` 增加 `started: false`，保持字段统一 |
| `miniprogram/assets/contact-qr.jpg` | 待用户提供 |

## 九、边界与异常

- 七段 / 圆角字体注册失败时回退到 `SF Mono, Menlo, monospace`，布局不崩。
- 超大字号下若真机出现与设置栏轻微重叠，优先降低到 15vw，其次缩短 `line-height`。
- 渐变文字不支持时回退纯色；结束态始终纯红色闪烁。
- 提示音循环在切后台时立即停止，回前台不自动续响（避免用户在后台被持续打扰）。
- 番茄结束态点提示只推进一次；连续快速点击由组件 `running` 状态挡掉。
- 结束态重置后提示音停止、氛围光关闭、徽标回到工作。
- 客服弹层打开时点击遮罩关闭；复制失败时保留面板并提示。
- 二维码图片缺失时只显示微信号，不出现破图占位。

## 十、验证（无 CLI，DevTools + 真机手测）

- 字号循环四档，超大档横向接近铺满、左右留边、不压设置栏。
- 四种数字颜色循环，青蓝深浅色都清晰；渐变开关对四种颜色均正确，斜向方向正确。
- 三档字体切换：七段、圆角、经典都能加载，数字不横向跳动，滑动调时分段同步换字体。
- 关闭渐变、切换结束态时无残留透明文字。
- 番茄工作结束：提示音 3 声一组循环 60s、振动同步、开始/暂停置灰、提示可点；点提示进入休息并走表。
- 休息结束：提示进入工作 25:00，点提示回到工作；已完成数正确。
- 工作/休息徽标颜色与文案正确；休息时全屏氛围光淡入，回工作淡出。
- 暂停后按钮显示「继续」，继续后剩余时间正确。
- 重置任意阶段：回工作 25:00、已完成归零、提示音停止。
- 左上角入口在深浅色下可读，点击弹层、长按选中、复制微信号成功；专注模式隐藏。
- 设置栏下移后不压 home 指示条，8 枚胶囊在 568px 横屏单行不换行。
- 切后台立即停提示音，回前台不续响。

## 十一、不在本轮范围

- 长休息（每 4 个番茄）。
- 番茄阶段自动进入下一阶段。
- 番茄统计、报表、跨小程序重启保留进度。
- 微信原生客服会话（`open-type="contact"`）/ 企业微信客服。
- 竖屏适配、计时引擎重构、订阅消息。
