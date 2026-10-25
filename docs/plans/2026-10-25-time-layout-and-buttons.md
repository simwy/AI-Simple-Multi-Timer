# 计时器页面主/子时间布局与按钮样式微调 实现计划

> **For Claude:** 直接按下方任务顺序实现。本计划为纯视觉改动，无 CLI 构建/测试；每步改完在微信开发者工具打开项目根目录，切换四种模式目测效果。完成后不自动 `git commit`，等用户确认后手动提交。

**Goal:** 完成五项 UI 微调：主时间精确垂直居中、子时间靠近主时间、主时间字号 13vw、设置栏缩小并区分标签/值颜色、操作组统一「可点击 / 不可点击」两种样式。

**Architecture:** 全部改动集中在页面层（`index.wxml` + `index.scss`），不触碰四个计时组件的引擎与状态机。主时间居中通过在 `.stage` 内补一个与 `.sub-time` 等高（34px）的空占位实现，使「子时间 + 主时间 + 占位」整组居中时主时间恰好落在屏幕垂直中心。

**Tech Stack:** 微信小程序 · TypeScript + Sass（Skyline / glass-easel），无 npm scripts / lint / 测试框架，DevTools 热编译。

**验证方式（所有任务通用）：** 无命令行构建。改完后在微信开发者工具打开项目根目录，依赖 compiler 插件热编译；切「时钟 / 正计时 / 倒计时 / 番茄」四种模式，目测布局、字号、配色是否符合预期，并在 568×320（iPhone SE 横屏）下确认不溢出、不贴边。

---

### Task 1: 主时间精确居中 + 子时间靠近

**Files:**
- Modify: `miniprogram/pages/index/index.wxml`（在 `.main-time` 之后新增占位）
- Modify: `miniprogram/pages/index/index.scss`（`.stage` 的 `gap`、新增 `.stage-balancer`）

**Step 1: 在 `.stage` 内新增与子时间等高的空占位**

`index.wxml` 中，`.stage` 块当前为：

```html
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

在 `.main-time` 的 `</view>` 之后、`.stage` 的 `</view>` 之前插入一行：

```html
    <!-- 与子时间等高的空占位，让主时间成为整组的垂直中心 -->
    <view class="stage-balancer"></view>
```

**Step 2: 调整 `.stage` 间距并新增 `.stage-balancer` 样式**

`index.scss` 中，`.stage` 的 `gap: 16px;` 改为 `gap: 8px;`：

```scss
.stage {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  overflow: hidden;
}
```

在 `.sub-time` 规则之后新增（与 `.sub-time` 的 `height: 34px` 保持一致）：

```scss
/* 主时间下方空占位：与子时间等高，抵消子时间在整组中的高度，使主时间精确居中 */
.stage-balancer {
  height: 34px;
  flex: none;
}
```

**Step 3: 验证**

切四种模式，主时间应始终位于屏幕垂直中心，子时间紧贴主时间上方（间距明显小于现状）；切换模式不跳版。

---

### Task 2: 主时间字号加大到 13vw

**Files:**
- Modify: `miniprogram/pages/index/index.scss`

**Step 1: 两处 `font-size: 10vw` 改为 `13vw`**

`.main-time` 容器与 `.main-time__value`（组件内文字）都写死了 10vw，需同时改：

```scss
.main-time {
  /* ... 其余不变 ... */
  font-size: 13vw;
}

.main-time__value {
  /* ... 其余不变 ... */
  font-size: 13vw;
}
```

> 注意：这两处各自独立出现一次，均从 `10vw` 改为 `13vw`，不要只改一处。

**Step 2: 验证**

四种模式下主时间明显更大，8 位 `00:00:00` 完整显示；568×320 下不贴边。

---

### Task 3: 设置栏缩小 + 标签/值颜色区分

**Files:**
- Modify: `miniprogram/pages/index/index.scss`

**Step 1: 缩小胶囊与文字、拉开标签/值颜色**

依次改动以下规则：

```scss
/* 按钮间距 10px → 8px */
.toolbar {
  /* ... 其余不变 ... */
  gap: 8px;
}

/* 胶囊内边距 6px 16px → 4px 12px */
.toolbar-btn {
  /* ... 其余不变 ... */
  padding: 4px 12px;
}

/* 标签（第一行）：颜色 --pill-text → --fg（更亮），字号 14px → 12px */
.toolbar-btn__desc {
  color: var(--fg);
  font-size: 12px;
  line-height: 1.3;
}

/* 值（第二行）：字号 12px → 11px，颜色保持 --dim */
.toolbar-btn__value {
  color: var(--dim);
  font-size: 11px;
  line-height: 1.2;
  letter-spacing: 0.5px;
}
```

**Step 2: 验证**

设置栏整体更小；每个胶囊内标签（亮）与值（暗）层次清晰；番茄模式 5 个胶囊不换行溢出。

---

### Task 4: 操作组统一「可点击 / 不可点击」两种样式

**Files:**
- Modify: `miniprogram/pages/index/index.scss`

**Step 1: 把三套配色收敛进 `.action-btn` 基类，删除 `.action-reset/.action-start/.action-pause` 配色**

当前：

```scss
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

改为：

```scss
.action-btn {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  color: var(--fg);
  background: rgba(128, 128, 128, 0.15);
}
.action-btn.is-disabled {
  opacity: 0.35;
}
```

> 说明：`.action-reset` / `.action-start` / `.action-pause` 三条规则删除；WXML 中按钮仍带这些 class，但不再有色差，统一落到 `.action-btn` 基类。`--reset-fg` 变量删除引用后保留（不主动清理）。开始/暂停/重置从此只靠文字与明暗区分状态。

**Step 2: 验证**

- 未运行时：暂停置灰、开始可点击、重置可点击，三者可点击态视觉一致。
- 运行中：开始置灰、暂停可点击、重置可点击。
- 恰好两种视觉：可点击（中性灰底 + 亮字）与不可点击（opacity 0.35）。
- 深浅色主题、三种数字配色下正常。

---

## 整体验证与收尾

1. 切四种模式，通读五项改动是否同时生效且互不干扰（主时间居中、子时间靠近、字号 13vw、设置栏更小、操作组两态）。
2. 在 568×320 横屏与常见屏宽下确认不溢出、不贴边、番茄 5 胶囊不换行。
3. 专注模式（点击空白）下，主时间仍精确居中。
4. 确认无 TypeScript / Sass 编译报错（DevTools 控制台无红错）。

**提交：** 按项目约定，本轮不执行 `git add/commit/push`。改动（含 `docs/plans/2026-10-25-time-layout-and-buttons-design.md` 与本计划）由用户检查后手动提交。
