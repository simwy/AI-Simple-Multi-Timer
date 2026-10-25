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
