# 计时器页面 UI 微调设计

- 日期：2026-10-25
- 主题：页面布局与底部工具栏三处 UI 微调（子时间间距、底部按钮两行、主时间字号）
- 状态：已确认
- 关联：`docs/plans/2026-10-25-pomodoro-design.md`

## 目标

针对横屏大屏计时器页面做三处纯视觉微调，不改变任何计时逻辑：

1. 子时间区（副标题）位置下移，缩小其与主时间数字的垂直间距，仅保留安全距离。
2. 底部工具栏所有按钮从单行改为两行：第一行为说明（字较大），第二行为当前设置的值（字较小、色较淡）。
3. 主时间字号调小，解决倒计时 `00:00:00.00` 盖住右下角「开始」按钮的问题。

## 需求决策

| 项 | 决策 |
| --- | --- |
| 子时间间距 | `.sub-time` 的 `margin-top` 由 `4px` 加大到约 `28px`，`height: 34px` 固定占位保持不变 |
| 底部按钮范围 | 工具栏**所有**按钮（样式 / 主题 / 模式动作）都改为两行 |
| 说明 / 值层级 | 说明行字大（约 20px），值行字小且色淡（约 14px） |
| 样式 / 主题说明 | 固定文案「样式」「主题」，第二行显示当前值 |
| 值格式 | 模式动作按钮的值用 `formatDurationLabel(valueMs)` 格式化 |
| label 拆分 | `pomodoro-timer` 的 `label` 由「工作 25:00」改为纯「工作」「休息」，值交给页面格式化；倒计时组件 `label` 已是「设置」，不改 |
| 主时间字号 | `.main-time` 与 `.main-time__value` 的 `font-size` 由 `14vw` 同步降到约 `10vw` |

> 上表数值（28px、20px/14px、10vw）为起始值，最终以 DevTools 视觉微调为准。

## 文件改动清单

| 文件 | 改动 |
| --- | --- |
| `miniprogram/pages/index/index.scss` | `.sub-time` margin-top 加大；`.toolbar-btn` 改纵向两行并新增 `.toolbar-btn__desc` / `.toolbar-btn__value` 样式；`.main-time` 与 `.main-time__value` 字号 14vw→10vw |
| `miniprogram/pages/index/index.wxml` | `.toolbar-btn` 内部拆成两个 `<text>`；样式 / 主题按钮补固定说明「样式」「主题」；动作按钮改用 `item.label` + `item.value` |
| `miniprogram/pages/index/index.ts` | import `formatDurationLabel`；`onStateChange` 里给 `actions` 每条追加 `value = formatDurationLabel(valueMs)` |
| `miniprogram/components/pomodoro-timer/pomodoro-timer.ts` | `buildActions` 的 `label` 去掉时长插值，改为纯「工作」「休息」；清理不再使用的 `formatDurationLabel` 导入 |

## 边界与异常

- 值行的 `formatDurationLabel`：小于 1 小时显示 `MM:SS`，否则 `H:MM:SS`。
- 时钟 / 正计时模式 `actions` 为空，工具栏仅显示「样式」「主题」两个两行按钮，行为不变。
- 点 2 只改文案与显示层级，`onActionTap` / `_seedMode` 仍依赖 `valueMs`、`key`、`title`、`storageKey`、`minMs`，这些字段保留原样。
- 点 1 / 点 3 只改 CSS，不影响任何组件状态与切换逻辑。

## 验证（无 CLI，DevTools 手测）

- 四种模式切换后，子时间与主时间间距明显缩小、不重叠，切换模式占位不跳版。
- 底部工具栏：样式 / 主题 / 工作 / 休息 / 设置按钮均为两行，说明行大、值行小；修改时长后值行即时更新。
- 倒计时模式下主时间数字不再盖住「开始」「重置」按钮；时钟 / 正计时 / 番茄字号随之变小，视觉一致。
- 深浅色主题下两行按钮与数字配色正常。

## 不在本轮范围

- 子时间与主时间改由组件内部定位或动态适配屏幕高度。
- 主时间字号按可用宽度动态自适应（`fit`）。
- 工具栏按钮结构 / 交互逻辑重构。
