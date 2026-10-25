# 计时器页面控制区与字号微调实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
>
> **本项目适配说明：** 本仓库没有 npm scripts、lint、测试框架，TypeScript/Sass 由微信开发者工具编译。因此每个任务的「验证」以 **DevTools 编译无报错 + 页面行为目测** 为准，不写自动化测试；**不要执行 `git add` / `git commit` / `git push`**（见项目 `CLAUDE.md`）。

**Goal:** 缩小子/主时间间距、将操作组改为 64px 的三固定按钮并支持左右贴边、缩小顶部模式框字号。

**Architecture:** 页面仍是单个 `pages/index` + 4 个计时组件。布局上新增 `.stage` 把子时间与主时间作为一组垂直居中；操作组由 2 个按钮改为 3 个固定按钮，页面调用组件新增的幂等 `start()` / `pause()`；贴边方向作为页面级持久化设置，仅改变 `.action-group` 的定位类。计时引擎逻辑不变。

**Tech Stack:** 微信小程序（Skyline / glass-easel）、TypeScript、Sass、`Component()` 写法。

**设计依据：** `docs/plans/2026-10-25-timer-controls-ui-design.md`

---

## 前置说明

- 所有改动都在 `miniprogram/` 下，无需安装依赖。
- 每完成一个任务，保存文件后在微信开发者工具中确认编译通过；最终整体手测见 Task 5。
- 中间任务（Task 2 与 Task 3 之间）DevTools 可能短暂提示 `onStart` / `onPause` 未找到，完成两个任务后应消失。
- 不提交 git。全部完成并自测后，由用户检查再手动提交。

---

### Task 1: 给 4 个计时组件补充 `start()` / `pause()`

**Files:**
- Modify: `miniprogram/components/stopwatch-timer/stopwatch-timer.ts:51-54`
- Modify: `miniprogram/components/countdown-timer/countdown-timer.ts:71-74`
- Modify: `miniprogram/components/pomodoro-timer/pomodoro-timer.ts:92-95`
- Modify: `miniprogram/components/clock-timer/clock-timer.ts:49-51`

**为什么：** 三个固定按钮需要分别触发「开始」和「暂停」。方法必须幂等，置灰按钮被误点时不能重复启动或重复暂停。

**Step 1: 修改正计时组件**

在 `stopwatch-timer.ts` 的 `toggle()` 方法之后插入：

```ts
    /** 页面「开始」按钮：未运行时启动 */
    start() {
      if (!this.data.running) this._start()
    },
    /** 页面「暂停」按钮：运行中暂停 */
    pause() {
      if (this.data.running) this._pause()
    },
```

插入后的上下文应类似：

```ts
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
```

**Step 2: 修改倒计时组件**

在 `countdown-timer.ts` 的 `toggle()` 之后插入**完全相同**的两个方法：

```ts
    /** 页面「开始」按钮：未运行时启动 */
    start() {
      if (!this.data.running) this._start()
    },
    /** 页面「暂停」按钮：运行中暂停 */
    pause() {
      if (this.data.running) this._pause()
    },
```

> 结束态点击开始会走 `_start()` 内部的重开逻辑，无需额外处理。

**Step 3: 修改番茄组件**

在 `pomodoro-timer.ts` 的 `toggle()` 之后插入：

```ts
    /** 页面「开始」按钮：未运行时启动 */
    start() {
      if (!this.data.running) this._start()
    },
    /** 页面「暂停」按钮：运行中暂停 */
    pause() {
      if (this.data.running) this._pause()
    },
```

> 阶段切换逻辑仍由 `_start()` 内部处理。

**Step 4: 修改时钟组件（保持接口一致）**

在 `clock-timer.ts` 的 `toggle() {}` 之后插入空实现：

```ts
    start() {},
    pause() {},
```

插入后该段应为：

```ts
    toggle() {},
    start() {},
    pause() {},
    reset() {},
    setDuration() {},
```

**Step 5: 验证**

在微信开发者工具中保存 4 个文件，查看 Compiler 面板：
- 预期：无 TypeScript 报错。
- 此时页面仍使用旧的 2 按钮模板，视觉与行为应保持不变。

---

### Task 2: 页面状态与事件（`index.ts`）

**Files:**
- Modify: `miniprogram/pages/index/index.ts:61-66`（data 增加 `actionSide`）
- Modify: `miniprogram/pages/index/index.ts:176-184`（`onToggle` → `onStart` / `onPause`）
- Modify: `miniprogram/pages/index/index.ts:228-239`（新增 `onToggleActionSide`）
- Modify: `miniprogram/pages/index/index.ts:247-258`（`_loadPersisted` 读取 actionSide）

**Step 1: data 增加贴边方向**

把：

```ts
    // 由激活组件上报
    subTime: '',
    running: false,
    finished: false,
    focusMode: false,
    capabilities: NO_CAPABILITIES,
    actions: [] as ModeAction[],
```

改为：

```ts
    // 由激活组件上报
    subTime: '',
    running: false,
    finished: false,
    focusMode: false,
    capabilities: NO_CAPABILITIES,
    actions: [] as ModeAction[],

    // 操作组贴边方向（全局设置，默认右侧）
    actionSide: 'right' as 'left' | 'right',
```

**Step 2: 用 onStart / onPause 替换 onToggle**

把：

```ts
    // ===== 主操作（重置 / 开始） =====
    onToggle() {
      const comp = this.selectComponent(MODE_COMPONENTS[activeMode])
      if (comp) comp.toggle()
    },
    onReset() {
      const comp = this.selectComponent(MODE_COMPONENTS[activeMode])
      if (comp) comp.reset()
    },
```

改为：

```ts
    // ===== 主操作（重置 / 暂停 / 开始） =====
    onStart() {
      const comp = this.selectComponent(MODE_COMPONENTS[activeMode])
      if (comp) comp.start()
    },
    onPause() {
      const comp = this.selectComponent(MODE_COMPONENTS[activeMode])
      if (comp) comp.pause()
    },
    onReset() {
      const comp = this.selectComponent(MODE_COMPONENTS[activeMode])
      if (comp) comp.reset()
    },
```

**Step 3: 新增贴边方向切换方法**

在 `onToggleTheme()` 之后插入：

```ts
    // ===== 操作组贴边方向 =====
    onToggleActionSide() {
      const actionSide = this.data.actionSide === 'right' ? 'left' : 'right'
      this.setData({ actionSide })
      wx.setStorageSync('timer.actionSide', actionSide)
    },
```

插入后的上下文：

```ts
    onToggleTheme() {
      const theme = this.data.theme === 'dark' ? 'light' : 'dark'
      this.setData({ theme })
      wx.setStorageSync('timer.theme', theme)
    },

    // ===== 操作组贴边方向 =====
    onToggleActionSide() {
      const actionSide = this.data.actionSide === 'right' ? 'left' : 'right'
      this.setData({ actionSide })
      wx.setStorageSync('timer.actionSide', actionSide)
    },

    // ===== 专注模式：点击空白区域，切换「只显示主/子时间」与「显示全部」 =====
```

**Step 4: `_loadPersisted` 读取存储**

把：

```ts
      const theme = wx.getStorageSync('timer.theme')
      const style = wx.getStorageSync('timer.style')
      const updates: any = {}
      if (theme === 'light' || theme === 'dark') updates.theme = theme
      if (style === 'white' || style === 'green' || style === 'amber') {
        updates.style = style
        updates.styleLabel = STYLE_LABELS[style as StyleKey]
      }
      if (Object.keys(updates).length) this.setData(updates)
```

改为：

```ts
      const theme = wx.getStorageSync('timer.theme')
      const style = wx.getStorageSync('timer.style')
      const actionSide = wx.getStorageSync('timer.actionSide')
      const updates: any = {}
      if (theme === 'light' || theme === 'dark') updates.theme = theme
      if (style === 'white' || style === 'green' || style === 'amber') {
        updates.style = style
        updates.styleLabel = STYLE_LABELS[style as StyleKey]
      }
      if (actionSide === 'left' || actionSide === 'right') updates.actionSide = actionSide
      if (Object.keys(updates).length) this.setData(updates)
```

**Step 5: 验证**

保存 `index.ts`，DevTools Compiler 面板预期无报错。此时 WXML 仍引用 `onToggle`，控制台可能提示找不到该方法；继续 Task 3。

---

### Task 3: 页面模板（`index.wxml`）

**Files:**
- Modify: `miniprogram/pages/index/index.wxml:10-33`（子时间 + 主时间包进 `.stage`；操作组三按钮）
- Modify: `miniprogram/pages/index/index.wxml:36-50`（设置栏新增按钮位置胶囊）

**Step 1: 子时间与主时间包进 `.stage`**

把：

```xml
  <!-- 2 子时间区：固定占位，空字符串也保留高度 -->
  <view class="sub-time">{{subTime}}</view>

  <!-- 3 主时间区：4 个组件常驻，非激活项隐藏 -->
  <view class="main-time style-{{style}} {{finished ? 'is-finished' : ''}}">
    <clock-timer id="clock-timer" class="mode-host {{mode === 'clock' ? '' : 'hidden'}}"
                 data-mode="clock" bind:statechange="onStateChange" />
    <stopwatch-timer id="stopwatch-timer" class="mode-host {{mode === 'stopwatch' ? '' : 'hidden'}}"
                     data-mode="stopwatch" bind:statechange="onStateChange" />
    <countdown-timer id="countdown-timer" class="mode-host {{mode === 'countdown' ? '' : 'hidden'}}"
                     data-mode="countdown" bind:statechange="onStateChange" />
    <pomodoro-timer id="pomodoro-timer" class="mode-host {{mode === 'pomodoro' ? '' : 'hidden'}}"
                    data-mode="pomodoro" bind:statechange="onStateChange" />
  </view>
```

改为：

```xml
  <!-- 2/3 子时间 + 主时间：作为一组垂直居中，间距固定 -->
  <view class="stage">
    <!-- 子时间区：固定占位，空字符串也保留高度 -->
    <view class="sub-time">{{subTime}}</view>

    <!-- 主时间区：4 个组件常驻，非激活项隐藏 -->
    <view class="main-time style-{{style}} {{finished ? 'is-finished' : ''}}">
      <clock-timer id="clock-timer" class="mode-host {{mode === 'clock' ? '' : 'hidden'}}"
                   data-mode="clock" bind:statechange="onStateChange" />
      <stopwatch-timer id="stopwatch-timer" class="mode-host {{mode === 'stopwatch' ? '' : 'hidden'}}"
                       data-mode="stopwatch" bind:statechange="onStateChange" />
      <countdown-timer id="countdown-timer" class="mode-host {{mode === 'countdown' ? '' : 'hidden'}}"
                       data-mode="countdown" bind:statechange="onStateChange" />
      <pomodoro-timer id="pomodoro-timer" class="mode-host {{mode === 'pomodoro' ? '' : 'hidden'}}"
                      data-mode="pomodoro" bind:statechange="onStateChange" />
    </view>
  </view>
```

**Step 2: 操作组改为三固定按钮**

把：

```xml
  <!-- 5 主操作组：由激活组件的 capabilities 决定显隐 -->
  <view class="action-group" wx:if="{{!focusMode && (capabilities.toggle || capabilities.reset)}}" catchtap="noop">
    <view class="action-btn action-reset" wx:if="{{capabilities.reset}}" bindtap="onReset">重置</view>
    <view class="action-btn action-toggle {{running ? 'is-running' : ''}}" wx:if="{{capabilities.toggle}}"
          bindtap="onToggle">{{running ? '暂停' : '开始'}}</view>
  </view>
```

改为：

```xml
  <!-- 5 主操作组：重置 / 暂停 / 开始，贴边方向由 actionSide 决定 -->
  <view class="action-group {{actionSide === 'left' ? 'is-left' : ''}}"
        wx:if="{{!focusMode && (capabilities.toggle || capabilities.reset)}}" catchtap="noop">
    <view class="action-btn action-reset" wx:if="{{capabilities.reset}}" bindtap="onReset">重置</view>
    <view class="action-btn action-pause {{running ? '' : 'is-disabled'}}"
          wx:if="{{capabilities.toggle}}" bindtap="onPause">暂停</view>
    <view class="action-btn action-start {{running ? 'is-disabled' : ''}}"
          wx:if="{{capabilities.toggle}}" bindtap="onStart">开始</view>
  </view>
```

**Step 3: 设置栏新增「按钮位置」胶囊**

在「背景颜色」按钮之后、`wx:for="{{actions}}"` 之前插入：

```xml
    <view class="toolbar-btn" wx:if="{{capabilities.toggle || capabilities.reset}}" bindtap="onToggleActionSide">
      <text class="toolbar-btn__desc">按钮位置</text>
      <text class="toolbar-btn__value">{{actionSide === 'left' ? '左侧' : '右侧'}}</text>
    </view>
```

插入后该段应为：

```xml
  <!-- 6 底部工具栏：前两个公共按钮 + 组件声明的模式专属按钮 -->
  <view class="toolbar" wx:if="{{!focusMode}}" catchtap="noop">
    <view class="toolbar-btn" bindtap="onCycleStyle">
      <text class="toolbar-btn__desc">数字颜色</text>
      <text class="toolbar-btn__value">{{styleLabel}}</text>
    </view>
    <view class="toolbar-btn" bindtap="onToggleTheme">
      <text class="toolbar-btn__desc">背景颜色</text>
      <text class="toolbar-btn__value">{{theme === 'dark' ? '深色' : '浅色'}}</text>
    </view>
    <view class="toolbar-btn" wx:if="{{capabilities.toggle || capabilities.reset}}" bindtap="onToggleActionSide">
      <text class="toolbar-btn__desc">按钮位置</text>
      <text class="toolbar-btn__value">{{actionSide === 'left' ? '左侧' : '右侧'}}</text>
    </view>
    <view class="toolbar-btn" wx:for="{{actions}}" wx:key="key"
          data-key="{{item.key}}" bindtap="onActionTap">
      <text class="toolbar-btn__desc">{{item.label}}</text>
      <text class="toolbar-btn__value">{{item.value}}</text>
    </view>
  </view>
```

**Step 4: 验证**

保存 `index.wxml`：
- 预期：DevTools 编译通过，Task 2 的 `onStart` / `onPause` 提示消失。
- 目测：正计时 / 倒计时 / 番茄出现 3 个操作钮；时钟无操作组；非时钟模式设置栏出现「按钮位置」。
- 此时按钮仍是旧尺寸（SCSS 未改），属正常。

---

### Task 4: 页面样式（`index.scss`）

**Files:**
- Modify: `miniprogram/pages/index/index.scss:59-70`（`.mode-tab` 字号）
- Modify: `miniprogram/pages/index/index.scss:72-103`（新增 `.stage`，调整 `.sub-time` / `.main-time`）
- Modify: `miniprogram/pages/index/index.scss:154-184`（操作组尺寸、左右贴边、三按钮配色、置灰）

**Step 1: 缩小模式框字号**

把：

```scss
.mode-tab {
  padding: 8px 12px;
  border-radius: 999px;
  font-size: 22px;
  line-height: 1.5;
  color: var(--dim);
  white-space: nowrap;
}
```

改为：

```scss
.mode-tab {
  padding: 7px 11px;
  border-radius: 999px;
  font-size: 17px;
  line-height: 1.4;
  color: var(--dim);
  white-space: nowrap;
}
```

**Step 2: 新增 `.stage` 并调整子时间**

把：

```scss
/* ===== 2 子时间区（固定高度，切换模式不跳动） ===== */
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

改为：

```scss
/* ===== 2/3 子时间 + 主时间：成组垂直居中，间距固定 ===== */
.stage {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  overflow: hidden;
}

/* 子时间区（固定高度，切换模式不跳动） */
.sub-time {
  height: 34px;
  line-height: 34px;
  text-align: center;
  color: var(--dim);
  font-size: 22px;
  letter-spacing: 2px;
}
```

**Step 3: 主时间不再自己撑满**

把：

```scss
/* ===== 3 主时间区 ===== */
.main-time {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
```

改为：

```scss
/* ===== 3 主时间区 ===== */
.main-time {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
```

> 其余 `.main-time` 属性（字体、字号、发光、配色变量）保持原样，不要删。原 `overflow: hidden` 也一并去掉：主时间现在按内容宽度收缩，保留它会把左右两侧 20px 的文字发光裁掉；溢出保护由 `.stage` 的 `overflow: hidden` 承担。

**Step 4: 操作组尺寸与左右贴边**

把：

```scss
/* ===== 5 主操作组（重置 / 开始） ===== */
.action-group {
  position: absolute;
  right: 32px;
  bottom: 120px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}
.action-btn {
  width: 88px;
  height: 88px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}
.action-reset {
  color: var(--reset-fg);
  background: rgba(128, 128, 128, 0.15);
}
.action-toggle {
  color: var(--accent);
  background: rgba(52, 208, 88, 0.12);
}
.action-toggle.is-running {
  color: #ffb020;
}
```

改为：

```scss
/* ===== 5 主操作组（重置 / 暂停 / 开始） ===== */
.action-group {
  position: absolute;
  right: 32px;
  left: auto;
  bottom: 90px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.action-group.is-left {
  left: 32px;
  right: auto;
}
.action-btn {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
}
.action-reset {
  color: var(--reset-fg);
  background: rgba(128, 128, 128, 0.15);
}
.action-start {
  color: var(--accent);
  background: rgba(52, 208, 88, 0.12);
}
.action-pause {
  color: #ffb020;
  background: rgba(255, 176, 32, 0.12);
}
.action-btn.is-disabled {
  opacity: 0.35;
}
```

**Step 5: 验证**

保存 `index.scss`：
- 预期：Sass 编译无报错。
- 目测：模式框字号变小；子时间与主时间贴近、整组居中；三个按钮 64px、竖排在右侧底部、置灰状态正确。
- 切到时钟模式：无操作组、无「按钮位置」胶囊；子时间仍显示日期。

---

### Task 5: 整体手测与数值微调

**Files:**
- 可能 Modify: `miniprogram/pages/index/index.scss`（仅当手测发现尺寸/间距不合适）

**Step 1: 四模式基础检查**

在 DevTools 横屏模拟器中依次切换 时钟 / 正计时 / 倒计时 / 番茄：
- 子时间与主时间间距一致、切换不跳版。
- 正计时、倒计时、番茄均为「重置 / 暂停 / 开始」三钮；时钟无操作组。
- 番茄模式下设置栏共 5 个胶囊，不换行、不溢出。

**Step 2: 按钮状态检查**

- 未运行：暂停置灰，开始高亮；点置灰的暂停无反应。
- 运行中：开始置灰，暂停高亮；点置灰的开始不会重复启动。
- 倒计时 / 番茄结束后：开始恢复高亮，点击能重新开始。
- 连续快速点击开始/暂停，计时数值不跳变、不出现双倍速。

**Step 3: 左右贴边与持久化**

- 点击「按钮位置」：操作组从左/右贴边切换，胶囊值同步显示「左侧 / 右侧」。
- 切换模式后位置保持。
- 重进小程序（或 DevTools「清缓存 → 重新编译」前先确认存储）后位置保持上次选择。
- 在控制台执行 `wx.setStorageSync('timer.actionSide', 'bogus')` 后重编译，操作组回落右侧。

**Step 4: 最小屏幕适配**

在 DevTools 选择 iPhone SE 横屏（568×320）：
- 三钮整组不压顶部模式栏、不与设置栏重叠。
- 操作组在左侧时与主时间数字不遮挡；如轻微遮挡，把 `.action-group` 的 `left/right` 从 `32px` 调小到 `24px` 后复查。
- 若三钮整组仍偏高，把 `.action-group` 的 `gap` 从 `10px` 调小到 `8px`。

**Step 5: 主题与配色**

- 深色 / 浅色主题下，模式框、胶囊、三钮文字清晰可读。
- 白色 / 绿色 / 琥珀三种数字配色下，开始钮保持绿色系、暂停钮保持琥珀色系，置灰态仍可辨认。

**Step 6: 专注模式回归**

- 点击空白区域进入专注模式：模式栏、操作组、设置栏全部隐藏，只剩子/主时间。
- 再次点击空白恢复，三钮状态与进入前一致。

**Step 7: 完成**

- 汇总改动文件与手测结果反馈给用户。
- **等待用户检查后手动提交 git**，不要自动执行 `git add` / `git commit`。

---

## 回滚参考

若需撤销本轮改动：

```bash
git checkout -- miniprogram/pages/index/index.ts \
  miniprogram/pages/index/index.wxml \
  miniprogram/pages/index/index.scss \
  miniprogram/components/stopwatch-timer/stopwatch-timer.ts \
  miniprogram/components/countdown-timer/countdown-timer.ts \
  miniprogram/components/pomodoro-timer/pomodoro-timer.ts \
  miniprogram/components/clock-timer/clock-timer.ts
```

> 该命令会丢弃未提交改动，执行前确认没有其他未保存的工作。设计文档与计划文档按需保留。
