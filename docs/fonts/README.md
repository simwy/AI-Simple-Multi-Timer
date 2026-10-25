# 计时器数字字体

## 来源与授权

- 字体：**Inter Regular**（静态实例 `wght=400, opsz=14`），来自 [google/fonts](https://github.com/google/fonts/tree/main/ofl/inter)。
- 授权：**SIL Open Font License 1.1**，全文见同目录 `OFL.txt`。
- 未使用 SF Pro / SF Mono / DIN Alternate：这些是 Apple 授权字体，不允许打包进跨平台分发的小程序。
- `TimerDigits.ttf` 只保留 `0-9`、`:`、`.` 共 12 个字形；并把 10 个数字的步进宽度统一为 `1300/2048 em`，字形居中。这样即使渲染器不支持 `font-variant-numeric: tabular-nums`，秒数跳动也不会左右抖。

## 文件说明

| 文件 | 用途 | 是否进入小程序包 |
| --- | --- | --- |
| `docs/fonts/TimerDigits.ttf` | 子集字体源文件（4.1KB） | 否 |
| `docs/fonts/OFL.txt` | 字体授权全文 | 否 |
| `miniprogram/utils/font.ts` | TTF 的 base64 Data URL，供 `wx.loadFontFace` 使用 | 是（约 5.7KB） |
| `miniprogram/app.scss` | 同内容的 `@font-face`，供 WebView 渲染 | 是（约 5.6KB） |

两份内联是刻意的双保险：

- `@font-face` + base64 在 WebView 渲染下稳定生效。
- `wx.loadFontFace` 覆盖 Skyline / 原生侧；`scopes: ['webview', 'skyline']` 不包含 `native`，避免 Data URL 在 Canvas 2D 下报错并拖垮整次加载。
- 任一路径失败都会回退到 `index.scss` 里的 `"SF Mono", "DIN Alternate", Menlo, Consolas, monospace`。

## 重新生成

需要 `fonttools`（含 `pyftsubset` / `varLib.instancer`）：

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

然后用下面的脚本把数字步进宽度统一并居中（`target` 取 `1300`，与 Inter 的 `0` 宽度接近）：

```python
from fontTools.ttLib import TTFont

f = TTFont("TimerDigits.ttf")
glyf, hmtx = f["glyf"], f["hmtx"]
cmap = f.getBestCmap()
digits = [cmap[ord(c)] for c in "0123456789"]
target = 1300

for name in digits:
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

最后同步更新两处 base64（内容必须完全一致，可通过解码后比对 TTF 验证）：

```bash
B64=$(base64 -i TimerDigits.ttf | tr -d '\n')
# 1) miniprogram/utils/font.ts  -> data:font/ttf;charset=utf-8;base64,${B64}
# 2) miniprogram/app.scss      -> @font-face 的 src: url('data:...${B64}')
```

## 已知限制

- 社区反馈显示 Skyline 的自定义字体支持不稳定（`loadFontFace` 在部分 Android / IDE 上不生效）。本项目的 `app.json` **未设置 `"renderer": "skyline"`**，默认走 WebView，因此当前路径应正常；若后续显式启用 Skyline，请优先在真机验证字体是否生效。
- 真机验证时，确保微信基础库 ≥ 3.7.9（`loadFontFace` 支持 Data URL 的最低版本）。DevTools 的调试基础库可在「详情 → 本地设置」中切到最新。
- 如果字体未生效，页面会自动回退到等宽字体，不会出现布局崩坏；可检查 Console 中的 `[font] TimerDigits 加载失败` 日志。
