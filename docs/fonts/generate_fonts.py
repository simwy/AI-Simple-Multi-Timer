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
SLOPE = 0.0      # 横段不斜切（正，无倾斜）
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
        glyph = poly_glyph([SEGMENTS[s]() for s in DIGITS[ch]])
        glyph.recalcBounds(glyphs)
        glyphs[name] = glyph
        order.append(name)
        # lsb 必须等于字形 xMin。七段字体的 1/3/7 墨迹不在居中位置，
        # 若统一写成居中偏移，部分渲染器会把整个字形左移（1 会靠左）。
        metrics[name] = (M['adv'], glyph.xMin)

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
