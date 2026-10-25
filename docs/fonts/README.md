# 计时器数字字体（三款）

页面可切换三款数字字体：

| 字体族 | 名称 | 来源 | 特点 |
| --- | --- | --- | --- |
| `TimerSeven` | 数码管（默认） | 本项目脚本生成 | 七段、轻微斜切、段间相连 |
| `TimerRounded` | 圆角 | Inter Regular 子集自动圆角化 | 接近苹果圆角体 |
| `TimerDigits` | 经典 | Inter Regular 子集 | 等宽、几何感强 |

## 来源与授权

- **TimerDigits / TimerRounded**：基于 **Inter Regular**（静态实例 `wght=400, opsz=14`），来自 [google/fonts](https://github.com/google/fonts/tree/main/ofl/inter)。授权为 **SIL Open Font License 1.1**，全文见同目录 `OFL.txt`。`TimerRounded` 保留 Inter 的版权与许可信息，字体族名改为 `TimerRounded`，不使用 Inter 的保留名称。
- **TimerSeven**：由 `generate_fonts.py` 用几何多边形绘制，不包含第三方字形。
- 未使用 SF Pro / SF Mono / DIN Alternate：这些是 Apple 授权字体，不允许打包进跨平台分发的小程序。

`TimerDigits.ttf` 只保留 `0-9`、`:`、`.`，并把 10 个数字的步进宽度统一为 `1300/2048 em`、字形居中。这样即使渲染器不支持 `font-variant-numeric: tabular-nums`，秒数跳动也不会左右抖。

## 文件说明

| 文件 | 用途 | 是否进入小程序包 |
| --- | --- | --- |
| `docs/fonts/TimerDigits.ttf` | 经典字体源文件（4.1KB） | 否 |
| `docs/fonts/TimerSeven.ttf` | 七段字体源文件（2.4KB） | 否 |
| `docs/fonts/TimerRounded.ttf` | 圆角字体源文件（4.9KB） | 否 |
| `docs/fonts/generate_fonts.py` | 生成七段与圆角字体 | 否 |
| `docs/fonts/embed_fonts.py` | 把三款字体写入 `font.ts` / `app.scss` | 否 |
| `docs/fonts/OFL.txt` | 字体授权全文 | 否 |
| `miniprogram/utils/font.ts` | 三款 TTF 的 base64 Data URL，供 `wx.loadFontFace` 使用 | 是（约 16KB） |
| `miniprogram/app.scss` | 同内容的 `@font-face`，供 WebView 渲染 | 是（约 16KB） |

双内联是刻意的双保险：

- `@font-face` + base64 在 WebView 渲染下稳定生效。
- `wx.loadFontFace` 覆盖 Skyline / 原生侧；`scopes: ['webview', 'skyline']` 不包含 `native`，避免 Data URL 在 Canvas 2D 下报错并拖垮整次加载。
- 任一路径失败都会回退到 `index.scss` 里的 `"SF Mono", "DIN Alternate", Menlo, Consolas, monospace`。

## 生成参数

`generate_fonts.py` 从 `TimerDigits.ttf` 读取度量：数字墨迹 `1048×1530`、纵向起点 `-20`、步进 `1300`、冒号/小数点步进 `590`。

- **七段**：段厚 `T=0.13`，端部 45° 切角 `BEV=0.045`，横段斜切 `SLOPE=-0.03`；冒号/小数点是 12 边形圆点，半径 `0.09×墨迹宽`。
- **圆角**：只对直线-直线拐角做圆角，半径 `ROUND_R=115`（约 5.6% em），转角小于 `18°` 不处理；圆角半径最多取相邻边长的 45%，避免吞掉细笔画。冒号是复合字形，必须先 `DecomposingRecordingPen` 分解再圆角，否则会得到空字形。

## 重新生成

需要 `fonttools`（4.x）；Pillow 仅用于输出预览图。

### 1. 准备 TimerDigits.ttf（已有可跳过）

```bash
TMP=$(mktemp -d)
curl -L -o "$TMP/Inter-var.ttf" \
  "https://raw.githubusercontent.com/google/fonts/main/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf"
curl -L -o "$TMP/OFL.txt" \
  "https://raw.githubusercontent.com/google/fonts/main/ofl/inter/OFL.txt"

fonttools varLib.instancer "$TMP/Inter-var.ttf" wght=400 opsz=14 --output="$TMP/Inter-Regular.ttf"
pyftsubset "$TMP/Inter-Regular.ttf" \
  --text="0123456789:." \
  --output-file="$TMP/TimerDigits.ttf" \
  --no-hinting --layout-features="" --name-IDs="*"
```

然后把数字步进宽度统一为 `1300` 并居中：

```python
from fontTools.ttLib import TTFont

f = TTFont("TimerDigits.ttf")
glyf, hmtx = f["glyf"], f["hmtx"]
cmap = f.getBestCmap()
target = 1300

for c in "0123456789":
    name = cmap[ord(c)]
    g = glyf[name]
    g.recalcBounds(glyf)
    ink = g.xMax - g.xMin
    old_lsb = hmtx[name][1]
    new_lsb = round((target - ink) / 2)
    g.coordinates.translate((new_lsb - old_lsb, 0))
    g.recalcBounds(glyf)
    hmtx[name] = (target, new_lsb)

f.save("TimerDigits.ttf")
```

### 2. 生成七段与圆角字体

```bash
/Library/Frameworks/Python.framework/Versions/3.8/bin/python3 docs/fonts/generate_fonts.py
```

预期输出：

```text
TimerSeven.ttf ok 2484 bytes digit advance 1300
TimerRounded.ttf ok 4928 bytes digit advance 1300
preview preview-seven.png
preview preview-rounded.png
```

脚本同时输出 `preview-seven.png` / `preview-rounded.png`，改参数后先看预览图再内嵌。

### 3. 内嵌到小程序

```bash
python3 docs/fonts/embed_fonts.py
```

脚本会：

1. 重写 `miniprogram/utils/font.ts`，导出 `TIMER_FONT_*`、`TIMER_SEVEN_*`、`TIMER_ROUNDED_*` 与 `TIMER_FONTS` 数组；
2. 用三组 `@font-face` 替换 `miniprogram/app.scss` 里的 `/* ==== generated fonts:begin ==== */` 标记块。

校验三款字体都完整：

```bash
python3 - <<'PY'
import base64, re
s = open('miniprogram/utils/font.ts').read()
uris = re.findall(r"base64,([A-Za-z0-9+/=]+)", s)
assert len(uris) == 3, len(uris)
for u in uris:
    assert base64.b64decode(u)[:4] == b'\x00\x01\x00\x00'
assert open('miniprogram/app.scss').read().count('@font-face') == 3
print('3 fonts embedded ok')
PY
```

## 已知限制

- 社区反馈显示 Skyline 的自定义字体支持不稳定（`loadFontFace` 在部分 Android / IDE 上不生效）。本项目的 `app.json` **未设置 `"renderer": "skyline"`**，默认走 WebView，因此当前路径应正常；若后续显式启用 Skyline，请优先在真机验证字体是否生效。
- 真机验证时，确保微信基础库 ≥ 3.7.9（`loadFontFace` 支持 Data URL 的最低版本）。DevTools 的调试基础库可在「详情 → 本地设置」中切到最新。
- 如果字体未生效，页面会自动回退到等宽字体，不会出现布局崩坏；可检查 Console 中的 `[font] <family> 加载失败` 日志。
