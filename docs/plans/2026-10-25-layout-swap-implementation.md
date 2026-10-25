# 计时器页面上下控件对调 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把「时钟 / 正计时 / 倒计时」移到顶部居中并改为连体分段控件，把「样式 / 深色 / 设置」移到屏幕底部居中，样式改为点击循环切换。

**Architecture:** 单页 `pages/index`，`Component()` 定义。布局是 flex 纵向流：顶部分段控件 → 日期 → 大数字（`flex: 1`）→ 底部胶囊行；右下角圆形操作按钮保持绝对定位。本次只重排 WXML 顺序、重写对应 WXSS、精简 TS 状态，不动计时引擎与持久化键名。

**Tech Stack:** 微信小程序、TypeScript（strict）、Sass、Skyline 渲染器、glass-easel。无 CLI 构建 / 测试 / lint，验证全部在微信开发者工具中进行。

---

## 前置说明

- 设计依据：`docs/plans/2026-10-25-layout-swap-design.md`
- 本项目无自动测试。每个任务的"验证"是 DevTools 编译无报错 + 目测/交互手测，不写测试文件。
- **提交步骤仅列出建议命令，不自动执行**（用户全局约定：commit / push 必须由用户确认后手动执行）。
- 不需要创建 worktree；改动集中在 3 个文件。

---

### Task 1: 精简并扩展 TS 状态（`index.ts`）

**Files:**
- Modify: `miniprogram/pages/index/index.ts`

**Step 1: 增加样式顺序与标签常量**

在 `type StyleKey = 'white' | 'green' | 'amber'` 之后插入：

```ts
const STYLE_ORDER: StyleKey[] = ['white', 'green', 'amber']
const STYLE_LABELS: Record<StyleKey, string> = {
  white: '白色',
  green: '绿色',
  amber: '琥珀',
}
```

**Step 2: `data` 增加 `styleLabel`，删除 `showStyleMenu`**

把：

```ts
    theme: 'dark' as 'dark' | 'light',
    style: 'white' as StyleKey,
```

改为：

```ts
    theme: 'dark' as 'dark' | 'light',
    style: 'white' as StyleKey,
    styleLabel: '白色',
```

把：

```ts
    // 面板
    showStyleMenu: false,
    showSettingsPanel: false,
```

改为：

```ts
    // 面板
    showSettingsPanel: false,
```

**Step 3: `onSwitchMode` 去掉菜单状态**

把：

```ts
      this.setData({ mode, showStyleMenu: false, showSettingsPanel: false })
```

改为：

```ts
      this.setData({ mode, showSettingsPanel: false })
```

**Step 4: 用 `cycleStyle` 替换下拉相关方法**

把：

```ts
    toggleStyleMenu() {
      this.setData({ showStyleMenu: !this.data.showStyleMenu })
    },
    onPickStyle(e: any) {
      const style = e.currentTarget.dataset.style as StyleKey
      this.setData({ style, showStyleMenu: false })
      wx.setStorageSync('timer.style', style)
    },
```

改为：

```ts
    cycleStyle() {
      const current = STYLE_ORDER.indexOf(this.data.style)
      const style = STYLE_ORDER[(current + 1) % STYLE_ORDER.length]
      this.setData({ style, styleLabel: STYLE_LABELS[style] })
      wx.setStorageSync('timer.style', style)
    },
```

**Step 5: `_loadPersisted` 同步 `styleLabel`**

把：

```ts
      if (style === 'white' || style === 'green' || style === 'amber') updates.style = style
```

改为：

```ts
      if (style === 'white' || style === 'green' || style === 'amber') {
        updates.style = style
        updates.styleLabel = STYLE_LABELS[style as StyleKey]
      }
```

**Step 6: 验证编译**

在微信开发者工具中打开项目，确认 Console 无 TypeScript 报错；页面仍能显示（此时 WXML 尚未改，`cycleStyle` 未绑定，属预期）。

**Step 7: 建议提交（用户手动执行）**

```bash
git add miniprogram/pages/index/index.ts
git commit -m "refactor(index): cycle timer style instead of dropdown menu"
```

---

### Task 2: 重排 WXML 结构（`index.wxml`）

**Files:**
- Modify: `miniprogram/pages/index/index.wxml`

**Step 1: 整体替换文件内容**

```xml
<!--index.wxml-->
<view class="page theme-{{theme}}">

  <!-- 顶部分段控件 -->
  <view class="modes">
    <view class="mode-item {{mode === 'clock' ? 'active' : ''}}" data-mode="clock" bindtap="onSwitchMode">时钟</view>
    <view class="mode-item {{mode === 'stopwatch' ? 'active' : ''}}" data-mode="stopwatch" bindtap="onSwitchMode">正计时</view>
    <view class="mode-item {{mode === 'countdown' ? 'active' : ''}}" data-mode="countdown" bindtap="onSwitchMode">倒计时</view>
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

  <!-- 底部胶囊 -->
  <view class="pills">
    <view class="pill" bindtap="cycleStyle">{{styleLabel}}</view>
    <view class="pill" bindtap="toggleTheme">{{theme === 'dark' ? '深色' : '浅色'}}</view>
    <view class="pill" bindtap="toggleSettings">设置</view>
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

改动要点：
- 删除 `.topbar` / `.top-left` / `.top-right` 整块。
- 顶部新增 `.modes` 分段控件（原来在底部的 `.tabbar` 逻辑，类名与结构改为分段控件）。
- 底部 `.tabbar` 改为 `.pills` 三胶囊，样式按钮绑定 `cycleStyle` 并显示 `styleLabel`。
- 删除 `.menu` 下拉弹层。
- 日期、数字、时间到、右下角操作、设置面板原样保留。

**Step 2: 验证**

DevTools 编译无 WXML 报错。此时样式未改，分段控件与胶囊会以默认块级样式堆叠，属预期；点击模式、样式、主题、设置应均无 JS 报错。

**Step 3: 建议提交（用户手动执行）**

```bash
git add miniprogram/pages/index/index.wxml
git commit -m "feat(index): move mode switch to top, controls to bottom bar"
```

---

### Task 3: 重写布局样式（`index.scss`）

**Files:**
- Modify: `miniprogram/pages/index/index.scss`

**Step 1: 用分段控件样式替换顶栏样式**

删除整段 `/* ===== 顶栏 ===== */` 到 `.pill { ... }` 结束之间的 `.topbar`、`.top-left`、`.top-right` 规则（保留 `.pill`），替换为：

```scss
/* ===== 顶部分段控件 ===== */
.modes {
  align-self: center;
  display: flex;
  margin-top: 12px;
  padding: 4px;
  border-radius: 999px;
  background: var(--tab-bg);
}
.mode-item {
  padding: 8px 20px;
  border-radius: 999px;
  font-size: 22px;
  line-height: 1.5;
  color: var(--dim);
  white-space: nowrap;
}
.mode-item.active {
  background: var(--tab-active-bg);
  color: var(--fg);
}

/* ===== 胶囊按钮（通用） ===== */
.pill {
  padding: 8px 18px;
  border-radius: 999px;
  background: var(--pill-bg);
  color: var(--pill-text);
  font-size: 20px;
  line-height: 1.5;
}
```

说明：`padding: 8px 20px` 让三段总宽约 300–310px，保证 iPhone SE 等窄横屏下与右上原生胶囊不重叠。如果实测仍偏宽，先把 `font-size` 降到 20px，不要加大左右内边距。

**Step 2: 用底部胶囊行替换底部 Tab 样式**

删除整段：

```scss
/* ===== 底部 Tab ===== */
.tabbar {
  display: flex;
  justify-content: center;
  gap: 10px;
  padding: 16px 0 24px;
}
.tab {
  padding: 10px 26px;
  border-radius: 999px;
  background: var(--tab-bg);
  color: var(--dim);
  font-size: 24px;
  line-height: 1.5;
}
.tab.active {
  background: var(--tab-active-bg);
  color: var(--fg);
}
```

替换为：

```scss
/* ===== 底部胶囊行 ===== */
.pills {
  display: flex;
  justify-content: center;
  gap: 10px;
  padding: 12px 0 24px;
}
```

**Step 3: 删除样式下拉菜单**

删除整段：

```scss
/* ===== 样式下拉 ===== */
.menu {
  position: absolute;
  left: 16px;
  top: 80px;
  background: var(--menu-bg);
  border-radius: 14px;
  padding: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}
.menu-item {
  padding: 10px 22px;
  font-size: 22px;
  color: var(--dim);
  border-radius: 10px;
}
.menu-item.active {
  color: var(--fg);
  background: var(--tab-active-bg);
}
```

**Step 4: 清理不再使用的 `--menu-bg` 变量（可选但推荐）**

从 `.page` 与 `.theme-light` 两处删除 `--menu-bg` 声明。确认全文件不再有 `var(--menu-bg)` 引用。

**Step 5: 验证**

DevTools 编译无 Sass 报错；顶部三段控件居中且选中态正确；底部三胶囊居中；日期与大数字位置正常；右下角圆钮不与底部胶囊重叠。

**Step 6: 建议提交（用户手动执行）**

```bash
git add miniprogram/pages/index/index.scss
git commit -m "style(index): segmented top switch and centered bottom pills"
```

---

### Task 4: DevTools 手测清单

**Files:**
- 无代码改动

**Step 1: 三种模式与选中态**

- 依次点击顶部「时钟 / 正计时 / 倒计时」，选中段背景高亮、文字提亮，其余段为暗色文字。
- 时钟模式显示日期；切到正计时/倒计时后日期消失。
- 正计时/倒计时运行时切换模式，走表暂停，顶部选中态切换正确。

**Step 2: 样式循环**

- 底部第一个胶囊初始显示「白色」；连点三次依次为「绿色」「琥珀」「白色」，数字颜色与发光同步变化。
- 杀掉小程序重进，配色保持上次选择（读 `timer.style`），胶囊文字一致。

**Step 3: 主题与设置**

- 点「深色」切浅色：页面背景、分段控件、胶囊、数字均跟随 CSS 变量变化。
- 点「设置」打开居中面板；改时长点确定后，倒计时显示同步更新；关闭后重进保持。
- 底部胶囊文字在浅色主题下仍可读（`--pill-text` 生效）。

**Step 4: 横屏与遮挡**

- iPhone SE / 小屏横屏下，顶部分段控件右边缘与右上原生胶囊至少留 20px。
- 右下角「重置 / 开始」与底部胶囊行不重叠；倒计时「时间到」提示不被遮挡。
- 设置面板弹出时，蒙层覆盖全屏，面板居中。

**Step 5: 计时回归（确认未受影响）**

- 正计时跑 10 秒对表无漂移；暂停/继续/重置正确。
- 倒计时到 0 震动 + 「时间到」闪烁；再点开始可重跑。
- 切后台再回来，定时器正确停止与恢复。

**Step 6: 最终提交（用户手动执行）**

如前面任务逐次提交可跳过；否则：

```bash
git add miniprogram/pages/index/index.ts miniprogram/pages/index/index.wxml miniprogram/pages/index/index.scss docs/plans/2026-10-25-layout-swap-design.md docs/plans/2026-10-25-layout-swap-implementation.md
git commit -m "feat(index): swap top/bottom controls and add style cycle"
```

---

## 风险与回滚

- **风险：分段控件过宽压到原生胶囊。** 处置：降 `font-size` 或左右内边距；两处都在 `.mode-item`。
- **风险：`styleLabel` 未在初始化时赋值。** 默认值已写死为 `'白色'`，与 `style: 'white'` 一致；`_loadPersisted` 会在有存储时覆盖。
- **回滚**：三个文件都在 git 中，`git checkout -- <file>` 即可回到改动前（注意当前工作区尚未提交，首次 commit 前的回滚会丢失其他未提交改动，执行前先 `git status` 确认）。
