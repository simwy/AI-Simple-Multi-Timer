# 字体体系、番茄阶段交互与客服入口实现计划

> **REQUIRED SUB-SKILL:** 本计划按任务逐步执行；每个任务完成后先自检，再做下一项。
>
> **执行约束（项目规则优先）：**
> - 本项目没有 npm scripts、lint、测试框架，TypeScript 与 Sass 由微信开发者工具编译。所有 UI 改动以 DevTools 手测为准。
> - **不要自动 `git add` / `git commit` / `git push`**。每个任务末尾不提交，留给用户统一检查后手动提交。
> - 字体生成与内嵌可以用本机 Python 验证，但必须用带 fontTools 的解释器：
>   `/Library/Frameworks/Python.framework/Versions/3.8/bin/python3`

**Goal:** 按 `docs/plans/2026-10-25-typography-pomodoro-ux-design.md` 落地超大字号、三档字体、渐变、青蓝配色、番茄结束态、60 秒分组提示音、客服入口与设置栏下移。

**Architecture:** 字体用 fontTools 本地生成两个子集 TTF，沿用现有 base64 + `wx.loadFontFace` 双路径注册；页面继续负责视觉与编排，四个计时组件只补报 `started` 和番茄阶段信息；提示音循环与客服弹层放在页面层。

**Tech Stack:** 微信小程序（WebView 渲染）、TypeScript、Sass、fontTools 4.51、Pillow（仅本地预览）。

---

## Task 1：生成七段与圆角字体

**Files:**
- Create: `docs/fonts/generate_fonts.py`
- Create: `docs/fonts/TimerSeven.ttf`（脚本产物）
- Create: `docs/fonts/TimerRounded.ttf`（脚本产物）
- Create: `docs/fonts/preview-seven.png`、`docs/fonts/preview-rounded.png`（本地预览，不进包）

**Step 1: 写生成脚本**

创建 `docs/fonts/generate_fonts.py`，内容如下（已在 /tmp 验证可生成、可渲染）：

```python
#!/usr/bin/env python3
"""生成 TimerSeven.ttf 与 TimerRounded.ttf。

用法（需 fontTools 4.x）：
  /Library/Frameworks/Python.framework/Versions/3.8/bin/python3 docs/fonts/generate_fonts.py
"""
import math
import os

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'TimerDigits.ttf')
UPM = 2048
NAMES = ['zero', 'one', 'two', 'three', 'four',
         'five', 'six', 'seven', 'eight', 'nine']


def read_metrics():
    f = TTFont(SRC)
    cmap = f.getBestCmap()
    glyf, hmtx = f['glyf'], f['hmtx']
    g = glyf[cmap[ord('0')]]
    g.recalcBounds(glyf)
    return {
        'ink_w': g.xMax - g.xMin,
        'ink_h': g.yMax - g.yMin,
        'y0': g.yMin,
        'adv': hmtx[cmap[ord('0')]][0],
        'colon_adv': hmtx[cmap[ord(':')]][0],
        'period_adv': hmtx[cmap[ord('.')]][0],
    }


M = read_metrics()


# ================= 七段数码管 =================
T = 0.13          # 段厚
BEV = 0.045       # 段端 45° 切角
SLOPE = -0.03     # 横段轻微斜切（左低右高）
HX0, HX1 = T / 2, 1 - T / 2


def octagon(x0, y0, x1, y1, bev, slope=0.0):
    def sy(x, y):
        return y + slope * (x - 0.5)
    return [
        (x0 + bev, sy(x0 + bev, y0)), (x1 - bev, sy(x1 - bev, y0)),
        (x1, sy(x1, y0 + bev)), (x1, sy(x1, y1 - bev)),
        (x1 - bev, sy(x1 - bev, y1)), (x0 + bev, sy(x0 + bev, y1)),
        (x0, sy(x0, y1 - bev)), (x0, sy(x0, y0 + bev)),
    ]


SEGMENTS = {
    'a': lambda: octagon(HX0, 1 - T, HX1, 1, BEV, SLOPE),
    'b': lambda: octagon(1 - T, 0.5 + T / 2, 1, 1 - T / 2, BEV),
    'c': lambda: octagon(1 - T, T / 2, 1, 0.5 - T / 2, BEV),
    'd': lambda: octagon(HX0, 0, HX1, T, BEV, SLOPE),
    'e': lambda: octagon(0, T / 2, T, 0.5 - T / 2, BEV),
    'f': lambda: octagon(0, 0.5 + T / 2, T, 1 - T / 2, BEV),
    'g': lambda: octagon(HX0, 0.5 - T / 2, HX1, 0.5 + T / 2, BEV, SLOPE),
}
DIGITS = {
    '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc',
    '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg',
}


def map_xy(x, y):
    x0 = (M['adv'] - M['ink_w']) / 2
    return (round(x0 + x * M['ink_w']), round(M['y0'] + y * M['ink_h']))


def poly_glyph(polys):
    pen = TTGlyphPen(None)
    for pts in polys:
        p = [map_xy(x, y) for x, y in pts]
        pen.moveTo(p[0])
        for q in p[1:]:
            pen.lineTo(q)
        pen.closePath()
    return pen.glyph()


def dot_units(cx, cy, r):
    return [(cx + r * math.cos(2 * math.pi * i / 12),
             cy + r * math.sin(2 * math.pi * i / 12)) for i in range(12)]


def unit_glyph(polys):
    pen = TTGlyphPen(None)
    for pts in polys:
        p = [(round(x), round(y)) for x, y in pts]
        pen.moveTo(p[0])
        for q in p[1:]:
            pen.lineTo(q)
        pen.closePath()
    return pen.glyph()


def build_seven(path):
    glyphs = {'.notdef': TTGlyphPen(None).glyph()}
    order = ['.notdef']
    metrics = {'.notdef': (M['adv'], 0)}

    for ch, name in zip('0123456789', NAMES):
        glyphs[name] = poly_glyph([SEGMENTS[s]() for s in DIGITS[ch]])
        order.append(name)
        metrics[name] = (M['adv'], round((M['adv'] - M['ink_w']) / 2))

    r = round(0.09 * M['ink_w'])
    colon = [dot_units(M['colon_adv'] / 2, M['y0'] + 0.34 * M['ink_h'], r),
             dot_units(M['colon_adv'] / 2, M['y0'] + 0.72 * M['ink_h'], r)]
    period = [dot_units(M['period_adv'] / 2, M['y0'] + 0.10 * M['ink_h'], r)]
    glyphs['colon'] = unit_glyph(colon)
    order.append('colon')
    metrics['colon'] = (M['colon_adv'], round(M['colon_adv'] / 2 - r))
    glyphs['period'] = unit_glyph(period)
    order.append('period')
    metrics['period'] = (M['period_adv'], round(M['period_adv'] / 2 - r))
    glyphs['space'] = TTGlyphPen(None).glyph()
    order.append('space')
    metrics['space'] = (round(M['adv'] / 2), 0)

    fb = FontBuilder(UPM, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap({
        ord(c): n for c, n in zip(
            '0123456789:. ', NAMES + ['colon', 'period', 'space'])
    })
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(
        ascent=round(M['y0'] + M['ink_h'] + 100),
        descent=round(M['y0'] - 100),
    )
    fb.setupNameTable({
        'familyName': 'TimerSeven',
        'styleName': 'Regular',
        'uniqueFontIdentifier': 'TimerSeven-Regular',
        'fullName': 'TimerSeven Regular',
        'psName': 'TimerSeven-Regular',
        'version': 'Version 1.0',
    })
    fb.setupOS2(
        sTypoAscender=round(M['y0'] + M['ink_h']),
        sTypoDescender=round(M['y0']),
        sTypoLineGap=0,
        usWinAscent=round(M['y0'] + M['ink_h'] + 100),
        usWinDescent=round(100 - M['y0']),
        sxHeight=round(M['ink_h'] * 0.5),
        sCapHeight=round(M['ink_h']),
    )
    fb.setupPost()
    fb.save(path)


# ================= Inter 圆角化 =================
ROUND_R = 115
ROUND_THRESHOLD = 18  # 度


def norm(v):
    length = math.hypot(*v)
    return (v[0] / length, v[1] / length) if length else (0, 0)


def parse_contours(pen):
    contours, cur, start, pos = [], None, None, None
    for op, args in pen.value:
        if op == 'moveTo':
            if cur:
                contours.append(cur)
            pos = start = args[0]
            cur = []
        elif op == 'lineTo':
            p = args[0]
            cur.append({'kind': 'line', 'start': pos, 'end': p})
            pos = p
        elif op == 'qCurveTo':
            pts = list(args)
            end = pts[-1] if pts[-1] is not None else start
            ctrls = pts[:-1] if pts[-1] is not None else pts
            prev = pos
            for i, c in enumerate(ctrls):
                if i + 1 < len(ctrls):
                    nxt = ((c[0] + ctrls[i + 1][0]) / 2,
                           (c[1] + ctrls[i + 1][1]) / 2)
                else:
                    nxt = end
                cur.append({'kind': 'quad', 'start': prev, 'ctrl': c, 'end': nxt})
                prev = nxt
            pos = end
        elif op == 'closePath':
            if cur:
                if pos != start:
                    cur.append({'kind': 'line', 'start': pos, 'end': start})
                contours.append(cur)
                cur = None
    if cur:
        contours.append(cur)
    return contours


def fillet(contours):
    for segs in contours:
        n = len(segs)
        if n < 3:
            continue
        hits = []
        for i in range(n):
            seg, nxt = segs[i], segs[(i + 1) % n]
            if seg['kind'] != 'line' or nxt['kind'] != 'line':
                continue
            p = seg['end']
            if p != nxt['start']:
                continue
            ax, ay = seg['start']
            bx, by = p
            cx, cy = nxt['end']
            vin = norm((bx - ax, by - ay))
            vout = norm((cx - bx, cy - by))
            dot = max(-1, min(1, vin[0] * vout[0] + vin[1] * vout[1]))
            if math.degrees(math.acos(dot)) < ROUND_THRESHOLD:
                continue
            lin = math.hypot(bx - ax, by - ay)
            lout = math.hypot(cx - bx, cy - by)
            r = min(ROUND_R, 0.45 * lin, 0.45 * lout)
            if r < 2:
                continue
            a = (bx - vin[0] * r, by - vin[1] * r)
            b = (bx + vout[0] * r, by + vout[1] * r)
            seg['end'] = a
            nxt['start'] = b
            hits.append((i, a, p, b))
        for i, a, p, b in reversed(hits):
            segs.insert(i + 1, {'kind': 'quad', 'start': a, 'ctrl': p, 'end': b})
    return contours


def draw_contours(contours):
    pen = TTGlyphPen(None)
    for segs in contours:
        if not segs:
            continue
        pen.moveTo(tuple(round(v) for v in segs[0]['start']))
        for s in segs:
            if s['kind'] == 'line':
                pen.lineTo(tuple(round(v) for v in s['end']))
            else:
                pen.qCurveTo(tuple(round(v) for v in s['ctrl']),
                             tuple(round(v) for v in s['end']))
        pen.closePath()
    return pen.glyph()


def build_rounded(path):
    font = TTFont(SRC)
    glyph_set = font.getGlyphSet()
    glyf = font['glyf']
    names = NAMES + ['colon', 'period']

    for name in names:
        pen = DecomposingRecordingPen(glyph_set)
        glyph_set[name].draw(pen)
        contours = fillet(parse_contours(pen))
        glyf[name] = draw_contours(contours)
        glyf[name].recalcBounds(glyf)

    for name_id, value in [
        (1, 'TimerRounded'), (3, 'TimerRounded-Regular-1.0'),
        (4, 'TimerRounded Regular'), (6, 'TimerRounded-Regular'),
        (16, 'TimerRounded'),
    ]:
        font['name'].setName(value, name_id, 3, 1, 0x409)

    font['maxp'].recalc(font)
    font.save(path)


# ================= 校验与预览 =================
def assert_font(path):
    f = TTFont(path)
    cmap = f.getBestCmap()
    for ch in '0123456789:.':
        assert ord(ch) in cmap, (path, ch)
    advances = {f['hmtx'][cmap[ord(c)]][0] for c in '0123456789'}
    assert len(advances) == 1, (path, advances)
    print(os.path.basename(path), 'ok', os.path.getsize(path), 'bytes',
          'digit advance', advances.pop())


def previews():
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        print('Pillow 未安装，跳过预览图')
        return
    for filename, out in [
        ('TimerSeven.ttf', 'preview-seven.png'),
        ('TimerRounded.ttf', 'preview-rounded.png'),
    ]:
        path = os.path.join(HERE, filename)
        img = Image.new('RGB', (1400, 260), '#000')
        draw = ImageDraw.Draw(img)
        draw.text((30, 30), '00:25:00.00',
                  font=ImageFont.truetype(path, 120), fill='#e6e6e6')
        draw.text((30, 180), '12:34:56.78',
                  font=ImageFont.truetype(path, 60), fill='#22d3ee')
        img.save(os.path.join(HERE, out))
        print('preview', out)


if __name__ == '__main__':
    seven = os.path.join(HERE, 'TimerSeven.ttf')
    rounded = os.path.join(HERE, 'TimerRounded.ttf')
    build_seven(seven)
    build_rounded(rounded)
    assert_font(seven)
    assert_font(rounded)
    previews()
```

**Step 2: 运行脚本**

Run:
```bash
/Library/Frameworks/Python.framework/Versions/3.8/bin/python3 docs/fonts/generate_fonts.py
```

Expected:
```text
TimerSeven.ttf ok 2xxx bytes digit advance 1300
TimerRounded.ttf ok 4xxx bytes digit advance 1300
preview preview-seven.png
preview preview-rounded.png
```

**Step 3: 目测预览图**

用图片查看器打开 `docs/fonts/preview-seven.png`：
- `0 8 2` 段与段相连，横段轻微斜切，冒号是圆点；
- `00:25:00.00` 可读，数字等宽。

打开 `docs/fonts/preview-rounded.png`：
- `1 / 4 / 7` 的尖角变圆，`0 / 8` 保持圆润；
- 冒号存在（复合字形已分解）。

若七段太粗/太细，调 `T`；若斜切太重，调 `SLOPE`，然后重跑脚本。

**Step 4: 不提交**

按项目规则，本任务结束不执行 git 命令。

---

## Task 2：内嵌字体并注册

**Files:**
- Create: `docs/fonts/embed_fonts.py`
- Modify: `miniprogram/app.scss`（把现有单个 `@font-face` 换成生成标记块）
- Generated: `miniprogram/utils/font.ts`
- Modify: `miniprogram/app.ts:1-25`

**Step 1: 写内嵌脚本**

创建 `docs/fonts/embed_fonts.py`：

```python
#!/usr/bin/env python3
"""把三款字体写入 miniprogram/utils/font.ts 与 app.scss 的标记块。"""
import base64
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
FONT_TS = os.path.join(ROOT, 'miniprogram', 'utils', 'font.ts')
APP_SCSS = os.path.join(ROOT, 'miniprogram', 'app.scss')

FONTS = [
    ('TIMER_FONT', 'TimerDigits', 'TimerDigits.ttf'),
    ('TIMER_SEVEN', 'TimerSeven', 'TimerSeven.ttf'),
    ('TIMER_ROUNDED', 'TimerRounded', 'TimerRounded.ttf'),
]


def data_uri(filename):
    with open(os.path.join(HERE, filename), 'rb') as f:
        return ('data:font/ttf;charset=utf-8;base64,'
                + base64.b64encode(f.read()).decode())


def main():
    ts = [
        '// 自动生成：计时器数字字体（Inter 子集 / 七段 / 圆角，OFL-1.1）',
        '// 生成方式见 docs/fonts/README.md，请勿手工编辑 base64',
    ]
    entries = []
    for prefix, family, filename in FONTS:
        ts.append(f"export const {prefix}_FAMILY = '{family}'")
        ts.append(f"export const {prefix}_SOURCE =\n  '{data_uri(filename)}'")
        entries.append((prefix, family))
    ts.append('')
    ts.append('export const TIMER_FONTS = [')
    for prefix, _family in entries:
        ts.append(f'  {{ family: {prefix}_FAMILY, source: {prefix}_SOURCE }},')
    ts.append(']')
    with open(FONT_TS, 'w') as f:
        f.write('\n'.join(ts) + '\n')

    faces = []
    for _prefix, family, filename in FONTS:
        faces.append(
            "@font-face {\n"
            f"  font-family: '{family}';\n"
            f"  src: url('{data_uri(filename)}') format('truetype');\n"
            "  font-weight: 400;\n"
            "  font-style: normal;\n"
            "}"
        )
    block = ('/* ==== generated fonts:begin ==== */\n'
             + '\n'.join(faces)
             + '\n/* ==== generated fonts:end ==== */')
    scss = open(APP_SCSS).read()
    scss = re.sub(
        r'/\* ==== generated fonts:begin ==== \*/.*?/\* ==== generated fonts:end ==== \*/',
        block, scss, flags=re.S)
    with open(APP_SCSS, 'w') as f:
        f.write(scss)
    print('font.ts and app.scss updated')


if __name__ == '__main__':
    main()
```

**Step 2: 把 app.scss 的旧字体块换成标记**

Run:
```bash
python3 - <<'PY'
p = 'miniprogram/app.scss'
s = open(p).read()
s = s.split('/* ===== 计时器数字字体')[0].rstrip()
s += '\n\n/* ==== generated fonts:begin ==== */\n/* ==== generated fonts:end ==== */\n'
open(p, 'w').write(s)
PY
```

Expected: `miniprogram/app.scss` 只剩 `.container` 和两行标记。

**Step 3: 运行内嵌脚本**

Run:
```bash
python3 docs/fonts/embed_fonts.py
```

Expected: `font.ts and app.scss updated`

**Step 4: 校验 base64 与字体数量**

Run:
```bash
python3 - <<'PY'
import base64, re
s = open('miniprogram/utils/font.ts').read()
for fam in ['TimerDigits', 'TimerSeven', 'TimerRounded']:
    assert f"'{fam}'" in s, fam
uris = re.findall(r"base64,([A-Za-z0-9+/=]+)", s)
assert len(uris) == 3, len(uris)
for u in uris:
    b = base64.b64decode(u)
    assert b[:4] == b'\x00\x01\x00\x00', b[:4]
scss = open('miniprogram/app.scss').read()
assert scss.count('@font-face') == 3
print('3 fonts embedded ok')
PY
```

Expected: `3 fonts embedded ok`

**Step 5: 改 app.ts 注册**

把 `miniprogram/app.ts` 顶部 import 与 `onLaunch` 里的单字体注册改成：

```ts
import { TIMER_FONTS } from './utils/font'

App<IAppOption>({
  globalData: {},
  onLaunch() {
    // 注册三款计时器数字字体（WebView 与 Skyline 各占一条路径，任一成功即可）
    TIMER_FONTS.forEach(({ family, source }) => {
      wx.loadFontFace({
        family,
        source: `url("${source}")`,
        global: true,
        scopes: ['webview', 'skyline'],
        fail: err => console.warn(`[font] ${family} 加载失败`, err),
      })
    })

    // 以下保留原有 logs 与 login 逻辑
```

**Step 6: DevTools 检查**

在微信开发者工具编译，Console 不应出现 `[font] ... 加载失败`；若出现，先确认 `font.ts` 的 base64 是否完整。此时页面还未使用新字体，属正常。

**Step 7: 不提交。**

---

## Task 3：页面字体、字号、青蓝与渐变设置

**Files:**
- Modify: `miniprogram/pages/index/index.ts`（类型、常量、data、事件、持久化）
- Modify: `miniprogram/pages/index/index.wxml`（class、字体/渐变胶囊）
- Modify: `miniprogram/pages/index/index.scss`（字号档、字体族、青蓝、渐变）

**Step 1: index.ts 类型与常量**

把第 5–8 行的类型改成：

```ts
type Mode = 'clock' | 'stopwatch' | 'countdown' | 'pomodoro'
type StyleKey = 'white' | 'green' | 'amber' | 'cyan'
type FontSizeKey = 's' | 'm' | 'l' | 'xl'
type FontFamilyKey = 'seven' | 'rounded' | 'classic'
type EditUnit = 'h' | 'm' | 's'
```

把 `STYLE_ORDER` / `STYLE_LABELS` 改为：

```ts
const STYLE_ORDER: StyleKey[] = ['white', 'green', 'amber', 'cyan']
const STYLE_LABELS: Record<StyleKey, string> = {
  white: '白色',
  green: '绿色',
  amber: '琥珀',
  cyan: '青蓝',
}
```

把字号常量改为，并新增字体常量：

```ts
const FONT_SIZE_ORDER: FontSizeKey[] = ['s', 'm', 'l', 'xl']
const FONT_SIZE_LABELS: Record<FontSizeKey, string> = {
  s: '小',
  m: '中',
  l: '大',
  xl: '超大',
}

const FONT_FAMILY_ORDER: FontFamilyKey[] = ['seven', 'rounded', 'classic']
const FONT_FAMILY_LABELS: Record<FontFamilyKey, string> = {
  seven: '数码管',
  rounded: '圆角',
  classic: '经典',
}
```

**Step 2: data 增加字段**

在 `showCentis: true,` 后加：

```ts
fontFamily: 'seven' as FontFamilyKey,
fontFamilyLabel: FONT_FAMILY_LABELS.seven,
gradient: false,
```

**Step 3: 新增切换方法**

在 `onCycleFontSize` 后加：

```ts
onCycleFontFamily() {
  const current = FONT_FAMILY_ORDER.indexOf(this.data.fontFamily)
  const fontFamily = FONT_FAMILY_ORDER[(current + 1) % FONT_FAMILY_ORDER.length]
  this.setData({ fontFamily, fontFamilyLabel: FONT_FAMILY_LABELS[fontFamily] })
  wx.setStorageSync('timer.fontFamily', fontFamily)
},
onToggleGradient() {
  const gradient = !this.data.gradient
  this.setData({ gradient })
  wx.setStorageSync('timer.gradient', gradient)
},
```

**Step 4: 持久化**

在 `_loadPersisted()` 里 `fontSize` 校验后加：

```ts
if (fontSize === 's' || fontSize === 'm' || fontSize === 'l' || fontSize === 'xl') {
  updates.fontSize = fontSize
  updates.fontSizeLabel = FONT_SIZE_LABELS[fontSize as FontSizeKey]
}
```

（替换原有只认 `s/m/l` 的三行。）

再把 style 校验扩成四种：

```ts
if (style === 'white' || style === 'green' || style === 'amber' || style === 'cyan') {
  updates.style = style
  updates.styleLabel = STYLE_LABELS[style as StyleKey]
}
```

最后加：

```ts
const fontFamily = wx.getStorageSync('timer.fontFamily')
const gradient = wx.getStorageSync('timer.gradient')
if (fontFamily === 'seven' || fontFamily === 'rounded' || fontFamily === 'classic') {
  updates.fontFamily = fontFamily
  updates.fontFamilyLabel = FONT_FAMILY_LABELS[fontFamily as FontFamilyKey]
}
if (typeof gradient === 'boolean') updates.gradient = gradient
```

**Step 5: WXML 主时间 class**

把：

```html
<view class="main-time style-{{style}} font-{{fontSize}} {{finished ? 'is-finished' : ''}}">
```

改为：

```html
<view class="main-time style-{{style}} size-{{fontSize}} ff-{{fontFamily}} {{gradient ? 'is-gradient' : ''}} {{finished ? 'is-finished' : ''}}">
```

**Step 6: WXML 工具栏加两枚胶囊**

在「背景颜色」后插入：

```html
<view class="toolbar-btn" bindtap="onCycleFontFamily">
  <text class="toolbar-btn__desc">字体</text>
  <text class="toolbar-btn__value">{{fontFamilyLabel}}</text>
</view>
```

在「精度」后插入：

```html
<view class="toolbar-btn" bindtap="onToggleGradient">
  <text class="toolbar-btn__desc">渐变</text>
  <text class="toolbar-btn__value">{{gradient ? '开' : '关'}}</text>
</view>
```

**Step 7: index.scss 字号与字体族**

把 `.main-time` 的 `font-family` 改成：

```css
font-family: var(--digit-font, 'TimerDigits', "SF Mono", "DIN Alternate", Menlo, Consolas, monospace);
```

把 `.main-time.font-s` / `.font-l` 整段替换为：

```css
.main-time.size-s {
  --main-font-size: 8.5vw;
}
.main-time.size-m {
  --main-font-size: 10.5vw;
}
.main-time.size-l {
  --main-font-size: 13vw;
}
.main-time.size-xl {
  --main-font-size: 15.5vw;
  /* 安全区感知：按可用宽度反推字号。最长内容为 8 位数字 + 2 冒号 + 1 点
     ≈ 5.94em（三款字体advance一致），两侧各留 12px 余量。
     旧客户端若不支持 min()，本条整句失效，回退到上面的 15.5vw。 */
  font-size: calc(min(15.5vw, (100vw - env(safe-area-inset-left) - env(safe-area-inset-right) - 24px) / 5.96));
}
.main-time.size-xl .main-time__value,
.main-time.size-xl .edit-time {
  font-size: calc(min(15.5vw, (100vw - env(safe-area-inset-left) - env(safe-area-inset-right) - 24px) / 5.96));
  letter-spacing: 0;
  line-height: 1.1;
}

/* 字体族 */
.main-time.ff-seven {
  --digit-font: 'TimerSeven', "SF Mono", Menlo, Consolas, monospace;
}
.main-time.ff-rounded {
  --digit-font: 'TimerRounded', "SF Pro Rounded", "PingFang SC", sans-serif;
}
.main-time.ff-classic {
  --digit-font: 'TimerDigits', "SF Mono", "DIN Alternate", Menlo, Consolas, monospace;
}
```

把 `.main-time__value` 和 `.edit-time` 里的 `font-family` 改成：

```css
font-family: var(--digit-font, 'TimerDigits', "SF Mono", Menlo, Consolas, monospace);
```

**Step 8: 青蓝与渐变**

在 `.main-time.style-amber` 后加：

```css
.main-time.style-cyan {
  --digit-color: #22d3ee;
  --digit-glow: rgba(34, 211, 238, 0.45);
  --grad-from: #22d3ee;
  --grad-to: #8b7cf6;
}
.theme-light .main-time.style-cyan {
  --digit-color: #0891b2;
  --digit-glow: rgba(8, 145, 178, 0.3);
  --grad-from: #0891b2;
  --grad-to: #6d5ce7;
}
```

给现有三种样式补渐变变量：

```css
.main-time.style-white { --grad-from: #e6e6e6; --grad-to: #22d3ee; }
.main-time.style-green { --grad-from: #34d058; --grad-to: #22d3ee; }
.main-time.style-amber { --grad-from: #ffb020; --grad-to: #ff6b6b; }
.theme-light .main-time.style-white { --grad-from: #111111; --grad-to: #0891b2; }
.theme-light .main-time.style-green { --grad-from: #1a9c3a; --grad-to: #0891b2; }
.theme-light .main-time.style-amber { --grad-from: #b06a00; --grad-to: #d93a3a; }
```

在 `.main-time__value` 规则后加：

```css
/* 渐变数字：左下 → 右上 */
.main-time.is-gradient .main-time__value,
.main-time.is-gradient .edit-time {
  background-image: linear-gradient(to top right, var(--grad-from), var(--grad-to));
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
}
/* 编辑态的分段是 flex item（blockified），父级 background-clip:text 覆盖不到它们的字形，
   因此每个分段各自挂同一渐变，避免「文字透明却无背景」 */
.main-time.is-gradient .edit-time .edit-seg,
.main-time.is-gradient .edit-time .edit-colon,
.main-time.is-gradient .edit-time .edit-frac {
  background-image: linear-gradient(to top right, var(--grad-from), var(--grad-to));
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
}

/* 结束态优先于渐变 */
.main-time.is-gradient.is-finished .main-time__value {
  background-image: none;
  -webkit-background-clip: border-box;
  background-clip: border-box;
  -webkit-text-fill-color: var(--digit-color);
  color: var(--digit-color);
}
```

**Step 9: DevTools 验证**

- 字号胶囊循环 小 → 中 → 大 → 超大，超大档数字横向明显变宽、左右留边。
- 字体胶囊循环 数码管 → 圆角 → 经典，三种字形明显不同，切换时不左右跳。
- 颜色胶囊循环到青蓝，深浅色都可见；渐变开关打开后四种颜色都是左下→右上渐变。
- 结束态仍是纯红闪烁，不是渐变。
- 刷新页面后字体/渐变/字号/颜色都保持。

**Step 10: 不提交。**

---

## Task 4：设置栏下移与安全区

**Files:**
- Modify: `miniprogram/pages/index/index.scss`（`.toolbar`、`.toolbar-btn`、`.stage`）

**Step 1: 设置栏下移**

把 `.toolbar` 的：

```css
gap: 6px;
padding: 12px 0 24px;
```

改为：

```css
gap: 6px;
padding: 10px 0 calc(4px + env(safe-area-inset-bottom));
```

**Step 2: 胶囊收窄**

把 `.toolbar-btn` 的 `padding: 4px 10px;` 改为 `padding: 4px 9px;`。

**Step 3: 主舞台避让横屏安全区**

在 `.stage` 里加：

```css
padding-left: env(safe-area-inset-left);
padding-right: env(safe-area-inset-right);
box-sizing: border-box;
```

**Step 4: DevTools 验证**

- 最窄横屏（iPhone SE / 568×320）下，8 枚胶囊单行不换行、不压操作组。
- 设置栏比改动前更靠近屏幕底部，但不被 home 指示条遮挡。
- 超大字号下数字左右不进入刘海区。

**Step 5: 不提交。**

---

## Task 5：`started` 上报与「继续」按钮

**Files:**
- Modify: `miniprogram/components/countdown-timer/countdown-timer.ts`（`_emitState`）
- Modify: `miniprogram/components/pomodoro-timer/pomodoro-timer.ts`（`_emitState`）
- Modify: `miniprogram/components/stopwatch-timer/stopwatch-timer.ts`（新增 `started`）
- Modify: `miniprogram/components/clock-timer/clock-timer.ts`（`_emitState`）
- Modify: `miniprogram/pages/index/index.ts`（data、`onStateChange`）
- Modify: `miniprogram/pages/index/index.wxml`（开始按钮文案与禁用）
- Modify: `miniprogram/pages/index/index.scss`（`.is-disabled`）

**Step 1: countdown 上报 started**

在 `countdown-timer.ts` 的 `_emitState()` 的 `triggerEvent` 对象里，`finished` 后加：

```ts
started,
```

（模块级 `started` 已存在。）

**Step 2: pomodoro 上报 started**

在 `pomodoro-timer.ts` 的 `_emitState()` 里，`finished` 后加：

```ts
started,
```

**Step 3: stopwatch 新增 started**

顶部模块变量加：

```ts
let started = false
```

`attached()` 重置里加 `started = false`；`reset()` 里加 `started = false`；`_start()` 里加 `started = true`。

`_emitState()` 里 `finished` 后加：

```ts
started,
```

**Step 4: clock 补齐字段**

在 `clock-timer.ts` 的 `_emitState()` 里 `finished: false,` 后加：

```ts
started: false,
```

**Step 5: 页面 data**

在 `finished: false,` 后加：

```ts
started: false,
startLabel: '开始',
```

**Step 6: 页面 onStateChange 计算文案**

把 `const updates: any = {` 到 `}` 的对象改成：

```ts
const running = !!detail.running
const finished = !!detail.finished
const started = !!detail.started
const updates: any = {
  running,
  finished,
  started,
  startLabel: !running && started && !finished ? '继续' : '开始',
  subTime: detail.subTime || '',
  capabilities: detail.capabilities || NO_CAPABILITIES,
  actions: (detail.actions || []).map((a: ModeAction) => ({
    ...a,
    value: a.key === 'limit' && a.valueMs === 0 ? '不限' : formatDurationLabel(a.valueMs),
  })),
}
```

后续原有的 `if (this.data.running !== !!detail.running)` 可继续用，也可改成 `this.data.running !== running`。

**Step 7: 切模式时复位**

在 `onSwitchMode` 的 `setData` 对象里加：

```ts
started: false,
startLabel: '开始',
```

**Step 8: WXML 开始按钮**

把开始按钮改成：

```html
<view class="action-btn action-start {{(running || (mode === 'pomodoro' && finished)) ? 'is-disabled' : ''}}"
      wx:if="{{capabilities.toggle}}" bindtap="onStart">{{startLabel}}</view>
```

**Step 9: 禁用样式**

把 `.action-btn.is-disabled` 改为：

```css
.action-btn.is-disabled {
  opacity: 0.35;
  pointer-events: none;
}
```

**Step 10: DevTools 验证**

- 正计时/倒计时/番茄：未开始显示「开始」，暂停后显示「继续」，继续后从剩余时间接着走。
- 重置后回到「开始」。
- 倒计时结束后重新显示「开始」并可重新计时。

**Step 11: 不提交。**

---

## Task 6：番茄结束态与下一阶段提示

**Files:**
- Modify: `miniprogram/components/pomodoro-timer/pomodoro-timer.ts`（`nextText`、`phase`）
- Modify: `miniprogram/pages/index/index.ts`（`nextText`、`pomodoroPhase`、`onPomodoroNext`、按钮守卫）
- Modify: `miniprogram/pages/index/index.wxml`（下一阶段提示、暂停禁用）
- Modify: `miniprogram/pages/index/index.scss`（`.next-stage`）

**Step 1: pomodoro 导入与 nextText**

把顶部 import 改成：

```ts
import { formatDurationLabel, formatHMS, formatHMSxx } from '../../utils/time'
```

在 `_subTime()` 后加：

```ts
_nextText(): string {
  if (!this.data.finished) return ''
  const next = nextPhase(this.data.phase)
  const label = next === 'rest' ? '休息时间' : '工作时间'
  return `进入${label} ${formatDurationLabel(this._durationOf(next))}`
},
```

在 `_emitState()` 里 `started,` 后加：

```ts
phase: this.data.phase,
nextText: this._nextText(),
```

**Step 2: 页面 data**

在 `startLabel: '开始',` 后加：

```ts
pomodoroPhase: 'work' as 'work' | 'rest',
nextText: '',
```

**Step 3: 页面 onStateChange 接收**

在 `updates` 对象后加：

```ts
if (detail.phase === 'work' || detail.phase === 'rest') {
  updates.pomodoroPhase = detail.phase
}
if (typeof detail.nextText === 'string') {
  updates.nextText = detail.nextText
}
```

**Step 4: 切模式复位**

在 `onSwitchMode` 的 `setData` 里加：

```ts
pomodoroPhase: 'work',
nextText: '',
```

**Step 5: 按钮守卫与点提示进入**

把 `onStart` / `onPause` / `onReset` 改成（提示音的停止调用统一放到 Task 8，避免中间态引用尚未定义的方法）：

```ts
onStart() {
  if (activeMode === 'pomodoro' && this.data.finished) return
  const comp = this.selectComponent(MODE_COMPONENTS[activeMode])
  if (comp) comp.start()
},
onPause() {
  if (activeMode === 'pomodoro' && this.data.finished) return
  const comp = this.selectComponent(MODE_COMPONENTS[activeMode])
  if (comp) comp.pause()
},
onReset() {
  const comp = this.selectComponent(MODE_COMPONENTS[activeMode])
  if (comp) comp.reset()
},
onPomodoroNext() {
  const comp = this.selectComponent(MODE_COMPONENTS.pomodoro)
  if (comp) comp.start()
},
```

**Step 6: WXML 下一阶段提示**

在 `.main-time` 内、四个组件之后加：

```html
<!-- 番茄结束态：手动点提示进入下一阶段 -->
<view class="next-stage"
      wx:if="{{mode === 'pomodoro' && finished && !focusMode && nextText}}"
      catchtap="onPomodoroNext">{{nextText}}</view>
```

暂停按钮改成：

```html
<view class="action-btn action-pause {{(!running || (mode === 'pomodoro' && finished)) ? 'is-disabled' : ''}}"
      wx:if="{{capabilities.toggle}}" bindtap="onPause">暂停</view>
```

**Step 7: 样式**

在 `.edit-hint` 附近加：

```css
.next-stage {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-top: 8px;
  z-index: 2;
  padding: 4px 16px;
  border-radius: 999px;
  background: var(--pill-bg);
  color: var(--accent);
  font-family: -apple-system, "PingFang SC", "Helvetica Neue", sans-serif;
  font-size: 15px;
  line-height: 26px;
  letter-spacing: 1px;
  white-space: nowrap;
  text-shadow: none;
}
```

**Step 8: DevTools 验证**

- 工作结束后：显示 00:00:00.00 红闪 +「时间到」，下方出现「进入休息时间 05:00」。
- 此时开始/暂停置灰且点不动，重置可点。
- 点提示：提示音停、休息开始走表、按钮恢复可用。
- 休息结束：显示「进入工作时间 25:00」。
- 点提示后已完成数不重复增加。

**Step 9: 不提交。**

---

## Task 7：阶段徽标与全屏氛围光

**Files:**
- Modify: `miniprogram/components/pomodoro-timer/pomodoro-timer.ts`（`_subTime` 文案）
- Modify: `miniprogram/pages/index/index.wxml`（徽标、ambient）
- Modify: `miniprogram/pages/index/index.scss`（徽标、ambient）

**Step 1: pomodoro 文案**

把 `_subTime()` 改成：

```ts
_subTime(): string {
  const { phase, finished, completed } = this.data
  if (phase === 'work') {
    return finished
      ? `工作时间 · 已完成 ${completed} 个番茄`
      : `工作时间 · 第 ${completed + 1} 个番茄`
  }
  return `休息时间 · 已完成 ${completed} 个番茄`
},
```

**Step 2: WXML 徽标**

把：

```html
<view class="sub-time">{{subTime}}</view>
```

改成：

```html
<view class="sub-time">
  <view class="phase-badge phase-{{pomodoroPhase}}" wx:if="{{mode === 'pomodoro'}}">
    <view class="phase-dot"></view>
    <text>{{subTime}}</text>
  </view>
  <block wx:else>{{subTime}}</block>
</view>
```

**Step 3: WXML ambient**

在 `.page` 的第一个子元素位置加：

```html
<view class="ambient {{mode === 'pomodoro' && pomodoroPhase === 'rest' ? 'is-on' : ''}}"></view>
```

放在模式栏之前、客服入口之后均可；确保它在 DOM 里早于内容。

**Step 4: 样式**

在 `.sub-time` 后加：

```css
.phase-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 12px;
  border-radius: 999px;
  font-size: 17px;
  line-height: 24px;
  letter-spacing: 1px;
  border: 1px solid transparent;
}
.phase-work {
  color: #34d058;
  background: rgba(52, 208, 88, 0.12);
  border-color: rgba(52, 208, 88, 0.35);
}
.phase-rest {
  color: #22d3ee;
  background: rgba(34, 211, 238, 0.12);
  border-color: rgba(34, 211, 238, 0.4);
}
.theme-light .phase-work {
  color: #1a9c3a;
  background: rgba(26, 156, 58, 0.1);
  border-color: rgba(26, 156, 58, 0.28);
}
.theme-light .phase-rest {
  color: #0891b2;
  background: rgba(8, 145, 178, 0.1);
  border-color: rgba(8, 145, 178, 0.28);
}
.phase-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
}
```

在 `.page` 规则后加：

```css
.ambient {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 0;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.6s ease;
  background: radial-gradient(ellipse at center, transparent 45%, rgba(34, 211, 238, 0.16) 100%);
}
.ambient.is-on {
  opacity: 1;
}
.theme-light .ambient {
  background: radial-gradient(ellipse at center, transparent 50%, rgba(8, 145, 178, 0.08) 100%);
}
```

**Step 5: DevTools 验证**

- 工作态：绿色徽标「工作时间 · 第 1 个番茄」，屏幕无蓝光。
- 休息态：青蓝徽标「休息时间 · 已完成 1 个番茄」，四周淡蓝光 0.6s 淡入。
- 回工作态蓝光淡出。
- 非番茄模式仍显示原来的子时间，不出现徽标。

**Step 6: 不提交。**

---

## Task 8：60 秒分组提示音与振动

**Files:**
- Modify: `miniprogram/pages/index/index.ts`（模块变量、`_playAlert`、`_stopAlert`、停止条件）

**Step 1: 模块变量**

在 `let beepAudio ...` 后加：

```ts
let alertInterval: ReturnType<typeof setInterval> | undefined
let alertStopTimer: ReturnType<typeof setTimeout> | undefined
let alertStep = 0
```

**Step 2: 替换 `_playAlert` 并新增 `_stopAlert`**

把现有 `_playAlert()`：

```ts
_playAlert() {
  if (this.data.endAlert === 'vibrate' || this.data.endAlert === 'both') wx.vibrateLong()
  if (this.data.endAlert === 'sound' || this.data.endAlert === 'both') this._playSound()
},
```

替换为：

```ts
_playAlert() {
  this._stopAlert()
  const sound = this.data.endAlert === 'sound' || this.data.endAlert === 'both'
  const vibrate = this.data.endAlert === 'vibrate' || this.data.endAlert === 'both'
  alertStep = 0

  const tick = () => {
    // 3 声一组，组间 2 个空拍（约 1.2s），60s 后由 alertStopTimer 停止
    if (alertStep % 5 < 3) {
      if (sound) this._playSound()
      if (vibrate) wx.vibrateShort()
    }
    alertStep += 1
  }

  tick()
  alertInterval = setInterval(tick, 400)
  alertStopTimer = setTimeout(() => this._stopAlert(), 60000)
},
_stopAlert() {
  if (alertInterval) {
    clearInterval(alertInterval)
    alertInterval = undefined
  }
  if (alertStopTimer) {
    clearTimeout(alertStopTimer)
    alertStopTimer = undefined
  }
  alertStep = 0
  if (beepAudio) beepAudio.stop()
},
```

**Step 3: 停止条件**

在 `onStart` / `onPause` / `onReset` / `onPomodoroNext` 四个方法首行各加：

```ts
this._stopAlert()
```

`onSwitchMode` 第一行加：

```ts
this._stopAlert()
```

`lifetimes.detached()` 改为：

```ts
detached() {
  this._stopAlert()
  wx.setKeepScreenOn({ keepScreenOn: false })
},
```

`pageLifetimes.hide()` 改为：

```ts
hide() {
  this._stopAlert()
  wx.setKeepScreenOn({ keepScreenOn: false })
},
```

**Step 4: DevTools + 真机验证**

- 倒计时结束后：嘟—嘟—嘟，停约 1 秒，再嘟—嘟—嘟，持续约 60 秒后停止。
- 每声嘟同步短振动（真机）；切换「结束提醒」三态，振动/提示音行为分别正确。
- 点重置、点继续、点下一阶段提示、切模式、切后台，提示音立即停。
- 新一轮结束不会与上一轮叠加。

**Step 5: 不提交。**

---

## Task 9：左上角客服入口与弹层

**Files:**
- Modify: `miniprogram/pages/index/index.ts`（data 与四个方法）
- Modify: `miniprogram/pages/index/index.wxml`（入口、弹层）
- Modify: `miniprogram/pages/index/index.scss`（入口、图标、弹层）
- Asset（用户提供）: `miniprogram/assets/contact-qr.jpg`

**Step 1: 页面 data**

在 `nextText: '',` 后加：

```ts
contactPanelVisible: false,
contactQrVisible: true,
wechatId: 'chenshiming0802',
```

**Step 2: 页面方法**

在 `onToggleFocus()` 附近加：

```ts
openContactPanel() {
  this.setData({ contactPanelVisible: true, contactQrVisible: true })
},
closeContactPanel() {
  this.setData({ contactPanelVisible: false })
},
copyWechatId() {
  wx.setClipboardData({ data: this.data.wechatId })
},
onQrError() {
  this.setData({ contactQrVisible: false })
},
```

**Step 3: WXML 入口**

在 `.page` 内、模式栏之前加：

```html
<!-- 左上角客服入口 -->
<view class="contact-entry" wx:if="{{!focusMode}}" catchtap="openContactPanel">
  <view class="contact-icon"></view>
  <text>向我提需求</text>
</view>
```

**Step 4: WXML 弹层**

在计次弹层之后加：

```html
<!-- 10 联系我 -->
<view class="mask" wx:if="{{contactPanelVisible}}" catchtap="closeContactPanel"></view>
<view class="panel contact-panel" wx:if="{{contactPanelVisible}}" catchtap="noop">
  <view class="panel-title">联系我</view>
  <!-- 横屏高度有限：左侧文字与按钮，右侧二维码，避免竖排超屏 -->
  <view class="contact-body">
    <view class="contact-info">
      <view class="contact-tip">使用遇到问题，或想要新功能，直接加我微信</view>
      <text class="contact-id" selectable>{{wechatId}}</text>
      <view class="panel-actions">
        <button class="panel-btn" bindtap="copyWechatId">复制微信号</button>
        <button class="panel-btn secondary" bindtap="closeContactPanel">关闭</button>
      </view>
    </view>
    <image class="contact-qr" wx:if="{{contactQrVisible}}" src="/assets/contact-qr.jpg"
           mode="aspectFit" show-menu-by-longpress binderror="onQrError" />
  </view>
</view>
```

**Step 5: 样式**

在 `.mode-bar` 附近加：

```css
/* ===== 左上角客服入口 ===== */
.contact-entry {
  position: absolute;
  top: calc(env(safe-area-inset-top) + 10px);
  left: calc(env(safe-area-inset-left) + 12px);
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  padding: 0 11px;
  border-radius: 999px;
  background: var(--pill-bg);
  color: var(--pill-text);
  font-size: 12px;
  line-height: 30px;
  white-space: nowrap;
}
.contact-icon {
  position: relative;
  width: 15px;
  height: 12px;
  border: 1.5px solid currentColor;
  border-radius: 4px;
  box-sizing: border-box;
}
.contact-icon::after {
  content: '';
  position: absolute;
  left: 3px;
  bottom: -4px;
  width: 5px;
  height: 5px;
  border-left: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transform: rotate(-45deg);
}
```

在 `.panel` 相关样式后加：

```css
/* 横屏：左文右码，控制总高度 ≤ 300px */
.contact-panel {
  width: 520px;
  max-width: calc(100vw - 40px);
  padding: 22px;
}
.contact-panel .panel-title {
  font-size: 24px;
  margin-bottom: 12px;
}
.contact-body {
  display: flex;
  align-items: center;
  gap: 20px;
}
.contact-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.contact-tip {
  font-size: 17px;
  line-height: 1.4;
  color: var(--dim);
  margin-bottom: 10px;
}
.contact-id {
  display: block;
  padding: 8px 12px;
  margin-bottom: 12px;
  border-radius: 10px;
  background: var(--pill-bg);
  color: var(--fg);
  font-family: "SF Mono", Menlo, Consolas, monospace;
  font-size: 22px;
  line-height: 1.3;
  letter-spacing: 1px;
  text-align: center;
}
.contact-panel .panel-actions {
  gap: 10px;
}
.contact-panel .panel-btn {
  font-size: 20px;
  line-height: 2.2;
}
.contact-qr {
  display: block;
  flex: none;
  width: 150px;
  height: 150px;
  margin: 0;
  border-radius: 10px;
  background: #ffffff;
}
```

> 说明：初版竖排布局（说明 + 微信号 + 180px 二维码 + 按钮）实测高度约 460px，横屏 320–430px 会出屏，故改为左右两栏，整层约 266px。

**Step 6: 二维码资源**

用户已提供 `assets/images/qrcode.jpg`。执行时裁成纯二维码（保留扫码留白），保存为 `miniprogram/assets/contact-qr.jpg`（480×480，约 70KB）；弹层以 150px 展示（原图 480px，屏上缩小仍有足够扫码精度）。

若后续替换二维码，保持文件名与路径不变即可，无需改代码；图片加载失败时 `binderror` 会把 `contactQrVisible` 置 false，弹层只显示微信号和复制按钮。

**Step 7: DevTools 验证**

- 左上角出现气泡图标 +「向我提需求」，深浅色都可读。
- 点击弹层：显示微信号 `chenshiming0802`；长按可选中，点「复制微信号」剪贴板内容正确。
- 无二维码图片时弹层不出现破图。
- 有图片时长按可识别/保存。
- 点遮罩关闭；专注模式下入口隐藏；聚焦模式点空白仍能切换专注。
- 568px 横屏下入口不压到居中模式栏。
- 最矮 320px 横屏下弹层（左文右码）上下不出屏，二维码完整可见可扫。

**Step 8: 不提交。**

---

## Task 10：全量回归

**Files:** 无新增，只验证。

**Step 1: 编译检查**

微信开发者工具打开项目根目录，确认编译无 TypeScript/Sass 报错（本项目无 CLI 构建）。

**Step 2: 功能清单**

- [ ] 字号四档循环，超大档横向铺满、左右留边。
- [ ] 颜色四档循环，青蓝深浅色清晰。
- [ ] 字体三档循环，数码管为默认；圆角/经典可切换且不跳宽。
- [ ] 渐变开关对四色都正确，方向左下→右上；结束态纯红。
- [ ] 正计时/倒计时/番茄暂停后开始按钮显示「继续」。
- [ ] 番茄结束态：开始/暂停置灰，只能重置或点下一阶段提示。
- [ ] 工作/休息徽标颜色与文案正确；休息时全屏蓝光淡入。
- [ ] 60 秒分组提示音与振动同步；重置/继续/切模式/切后台立即停。
- [ ] 左上角客服入口与弹层、复制微信号正常。
- [ ] 设置栏下移，8 枚胶囊单行不换行，不压 home 指示条。
- [ ] 深浅色、专注模式、闹钟、计次、时长设置等既有功能未回归。

**Step 3: 真机**

重点验证：
- 三款字体在 iOS/Android 真机是否加载（Console 看 `[font]` 日志）。
- 渐变文字在真机 WebView 是否生效。
- 60 秒提示音与短振动节奏。
- 横屏刘海侧安全区。

**Step 4: 总结**

向用户输出变更文件、验证结果、待补项（二维码图片、真机结果）。按项目规则**不自动提交**，等用户检查后手动提交。

---

## 风险与兜底

| 风险 | 兜底 |
| --- | --- |
| 七段字形观感不佳 | 调 `generate_fonts.py` 的 `T` / `BEV` / `SLOPE` 后重跑 |
| 圆角化太轻微 | 调 `ROUND_R`（90–140）与 `ROUND_THRESHOLD`（12–24）；当前 115 |
| 字体加载失败 | 页面回退 `SF Mono, Menlo, monospace`，布局不崩 |
| 渐变文字不生效 | 回退纯色；不阻塞其他功能 |
| 8 枚胶囊在极窄屏换行 | 把「按钮位置」移到模式行或收进一步内边距 |
| 超大字号压到设置栏 | 15.5vw 降到 15vw，或 `line-height` 降到 1.05 |
| 超大字号伸进刘海安全区 | 已用 `min(15.5vw, (可用宽度)/5.96)` 反推；旧客户端不支持 `min()` 时回退 15.5vw |
| 联系我弹层竖排超屏 | 已改左右两栏（左文右码，约 266px）；若仍紧，二维码降到 130px |
| 二维码缺失 | `binderror` 隐藏图片，只显示微信号 |
