# 计时器页面 UI 微调实现计划

> **For Claude:** 本计划供逐任务执行参考。项目无 CLI / 测试 / lint，所有验证在微信开发者工具中手动进行。

**Goal:** 完成三处页面 UI 微调——子时间下移缩间距、底部工具栏所有按钮改两行、主时间字号调小，不改变任何计时逻辑。

**Architecture:** 全部为页面层样式与文案改动；唯一涉及组件的是 `pomodoro-timer.ts` 的 `label` 拆分（去掉时长插值）。值的格式化统一由页面用 `formatDurationLabel` 完成。

**Tech Stack:** 微信小程序 · TypeScript + Sass（Skyline / glass-easel）。无 npm scripts、无测试框架，DevTools 编译。

**约定：**
- 不自动 `git add/commit/push`（项目规则），提交由用户手动执行。
- 数值（28px、20px/14px、10vw）为起始值，DevTools 微调。

---

### Task 1: 子时间下移、缩小与主时间间距

**Files:**
- Modify: `miniprogram/pages/index/index.scss`（`.sub-time` 块）

**Step 1: 修改 `.sub-time` 的 `margin-top`**

把：

```scss
.sub-time {
  height: 34px;
  line-height: 34px;
  text-align: center;
  color: var(--dim);
  font-size: 22px;
  letter-spacing: 2px;
  margin-top: 4px;
}
```

改为（仅 `margin-top` 变化）：

```scss
.sub-time {
  height: 34px;
  line-height: 34px;
  text-align: center;
  color: var(--dim);
  font-size: 22px;
  letter-spacing: 2px;
  margin-top: 28px;
}
```

**Step 2: DevTools 验证**

- 打开项目，子时间（副标题）明显下移、更贴近主时间数字，且不重叠。
- 切换四种模式（时钟/正计时/倒计时/番茄），子时间区高度不跳版。

---

### Task 2: 底部工具栏所有按钮改两行（说明 + 值）

分四个小步，每步一个文件。

#### 2a. 拆分 pomodoro 组件的 label

**Files:**
- Modify: `miniprogram/components/pomodoro-timer/pomodoro-timer.ts`

**Step 1: 去掉 label 里的时长插值**

把：

```ts
const buildActions = () => [
  {
    key: 'work',
    label: `工作 ${formatDurationLabel(workMs)}`,
    kind: 'duration',
    title: '工作时长',
    valueMs: workMs,
    minMs: MIN_DURATION_MS,
    storageKey: 'timer.workDurationMs',
  },
  {
    key: 'rest',
    label: `休息 ${formatDurationLabel(restMs)}`,
    kind: 'duration',
    title: '休息时长',
    valueMs: restMs,
    minMs: MIN_DURATION_MS,
    storageKey: 'timer.restDurationMs',
  },
]
```

改为（label 只留说明）：

```ts
const buildActions = () => [
  {
    key: 'work',
    label: '工作',
    kind: 'duration',
    title: '工作时长',
    valueMs: workMs,
    minMs: MIN_DURATION_MS,
    storageKey: 'timer.workDurationMs',
  },
  {
    key: 'rest',
    label: '休息',
    kind: 'duration',
    title: '休息时长',
    valueMs: restMs,
    minMs: MIN_DURATION_MS,
    storageKey: 'timer.restDurationMs',
  },
]
```

**Step 2: 清理不再使用的导入**

把：

```ts
import { formatDurationLabel, formatHMSxx } from '../../utils/time'
```

改为：

```ts
import { formatHMSxx } from '../../utils/time'
```

（`noUnusedLocals` 开启，`formatDurationLabel` 不再使用必须移除，否则 DevTools 编译报错。）

#### 2b. 页面为 actions 追加格式化后的 value

**Files:**
- Modify: `miniprogram/pages/index/index.ts`

**Step 1: 顶部新增导入**

在注释行之后、`type Mode` 之前加：

```ts
import { formatDurationLabel } from '../../utils/time'
```

**Step 2: `ModeAction` 接口增加可选 `value` 字段**

把：

```ts
interface ModeAction {
  key: string
  label: string
  kind: 'duration'
  title: string
  valueMs: number
  minMs: number
  storageKey: string
}
```

改为：

```ts
interface ModeAction {
  key: string
  label: string
  kind: 'duration'
  title: string
  valueMs: number
  minMs: number
  storageKey: string
  value?: string
}
```

**Step 3: `onStateChange` 里给 actions 追加 value**

把：

```ts
      this.setData({
        running: !!detail.running,
        finished: !!detail.finished,
        subTime: detail.subTime || '',
        capabilities: detail.capabilities || NO_CAPABILITIES,
        actions: detail.actions || [],
      })
```

改为：

```ts
      this.setData({
        running: !!detail.running,
        finished: !!detail.finished,
        subTime: detail.subTime || '',
        capabilities: detail.capabilities || NO_CAPABILITIES,
        actions: (detail.actions || []).map((a: ModeAction) => ({
          ...a,
          value: formatDurationLabel(a.valueMs),
        })),
      })
```

#### 2c. 改 wxml 为两行结构

**Files:**
- Modify: `miniprogram/pages/index/index.wxml`

**Step 1: 替换底部工具栏块**

把：

```xml
  <view class="toolbar">
    <view class="toolbar-btn" bindtap="onCycleStyle">{{styleLabel}}</view>
    <view class="toolbar-btn" bindtap="onToggleTheme">{{theme === 'dark' ? '深色' : '浅色'}}</view>
    <view class="toolbar-btn" wx:for="{{actions}}" wx:key="key"
          data-key="{{item.key}}" bindtap="onActionTap">{{item.label}}</view>
  </view>
```

改为：

```xml
  <view class="toolbar">
    <view class="toolbar-btn" bindtap="onCycleStyle">
      <text class="toolbar-btn__desc">样式</text>
      <text class="toolbar-btn__value">{{styleLabel}}</text>
    </view>
    <view class="toolbar-btn" bindtap="onToggleTheme">
      <text class="toolbar-btn__desc">主题</text>
      <text class="toolbar-btn__value">{{theme === 'dark' ? '深色' : '浅色'}}</text>
    </view>
    <view class="toolbar-btn" wx:for="{{actions}}" wx:key="key"
          data-key="{{item.key}}" bindtap="onActionTap">
      <text class="toolbar-btn__desc">{{item.label}}</text>
      <text class="toolbar-btn__value">{{item.value}}</text>
    </view>
  </view>
```

#### 2d. 改 scss 为两行样式

**Files:**
- Modify: `miniprogram/pages/index/index.scss`（`.toolbar-btn` 块）

**Step 1: 替换 `.toolbar-btn` 并新增两行类**

把：

```scss
.toolbar-btn {
  padding: 8px 14px;
  border-radius: 999px;
  background: var(--pill-bg);
  color: var(--pill-text);
  font-size: 20px;
  line-height: 1.5;
}
```

改为：

```scss
.toolbar-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6px 16px;
  border-radius: 999px;
  background: var(--pill-bg);
}
.toolbar-btn__desc {
  color: var(--pill-text);
  font-size: 20px;
  line-height: 1.3;
}
.toolbar-btn__value {
  color: var(--dim);
  font-size: 14px;
  line-height: 1.2;
  letter-spacing: 0.5px;
}
```

**Step 2: DevTools 验证（Task 2 整体）**

- 番茄模式：底部出现「样式 / 主题 / 工作 / 休息」四个两行按钮，工作值 `25:00`、休息值 `05:00`，说明行字大、值行字小且淡。
- 倒计时模式：多出「设置」按钮，值行为当前时长（默认 `01:00`）。
- 时钟 / 正计时模式：仅「样式 / 主题」两个两行按钮。
- 在番茄模式改「工作时长」为 30 分钟，确定后「工作」按钮值行即时变为 `30:00`。
- 深浅色主题下说明 / 值两行配色正常。

---

### Task 3: 主时间字号调小

**Files:**
- Modify: `miniprogram/pages/index/index.scss`（`.main-time` 与 `.main-time__value`）

**Step 1: 两处字号 14vw → 10vw（必须同步）**

`.main-time` 块内：

```scss
  font-size: 14vw;
```

改为：

```scss
  font-size: 10vw;
```

`.main-time__value` 块内：

```scss
  font-size: 14vw;
```

改为：

```scss
  font-size: 10vw;
```

（两处都改，否则组件内 `<text>` 数字不跟随容器字号。）

**Step 2: DevTools 验证**

- 倒计时模式：主时间数字不再盖住右下角「重置 / 开始」按钮。
- 时钟 / 正计时 / 番茄模式数字随之变小，视觉一致，数字与副标题、按钮无重叠。

---

## 完成检查

- `pomodoro-timer.ts` 无未使用导入（`formatDurationLabel` 已移除）。
- `index.ts` 已引入 `formatDurationLabel` 且 `ModeAction` 含 `value`。
- 三处 UI 在四种模式下均正常，无逻辑回归。

## 不在本轮范围

- 子时间 / 主时间动态定位、字号自适应。
- 工具栏按钮结构或交互逻辑重构。
