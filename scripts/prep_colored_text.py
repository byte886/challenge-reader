#!/usr/bin/env python3
"""彩色提示文字预处理：提取指定颜色像素 → 膨胀合并 → 去噪 → PCA 测角
→ 生成 ±两种转正候选（白底黑字）
用法: prep_colored_text.py <challenge.jpg> <outprefix> [--color yellow|green]
      [--rmin N --gmin N --bmax N ...]
输出 <outprefix>-a.png, <outprefix>-b.png，末行打印 JSON {"angle":x}
"""
import sys
import json
import argparse
import numpy as np
from PIL import Image
from collections import deque

PRESETS = {
    'yellow': dict(rmin=170, gmin=170, bmax=130, chroma_min=60),
    'green':  dict(gmin=170, rmax=140, bmax=140, chroma_min=None),
}


def dilate(m, it=2):
    H, W = m.shape
    for _ in range(it):
        out = m.copy()
        ys, xs = np.nonzero(m)
        for y, x in zip(ys.tolist(), xs.tolist()):
            out[max(0, y - 1):min(H, y + 2), max(0, x - 1):min(W, x + 2)] = True
        m = out
    return m


def big_components(m, minn=200):
    H, W = m.shape
    seen = np.zeros(m.shape, bool)
    keep = np.zeros(m.shape, bool)
    ys, xs = np.nonzero(m)
    pset = set(zip(ys.tolist(), xs.tolist()))
    for y, x in zip(ys.tolist(), xs.tolist()):
        if seen[y, x]:
            continue
        q = deque([(y, x)]); seen[y, x] = 1; cells = []
        while q:
            cy, cx = q.popleft(); cells.append((cy, cx))
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = cy + dy, cx + dx
                    if (ny, nx) in pset and not seen[ny, nx]:
                        seen[ny, nx] = 1; q.append((ny, nx))
        if len(cells) > minn:
            for cy, cx in cells:
                keep[cy, cx] = 1
    return keep


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('outprefix')
    ap.add_argument('--color', default='yellow', choices=list(PRESETS))
    ap.add_argument('--rmin', type=int); ap.add_argument('--rmax', type=int)
    ap.add_argument('--gmin', type=int); ap.add_argument('--gmax', type=int)
    ap.add_argument('--bmin', type=int); ap.add_argument('--bmax', type=int)
    ap.add_argument('--chroma-min', type=int)
    a = ap.parse_args()
    p = dict(PRESETS[a.color]); p.update({k: v for k, v in vars(a).items()
        if k in ('rmin', 'rmax', 'gmin', 'gmax', 'bmin', 'bmax', 'chroma_min') and v is not None})

    im = np.array(Image.open(a.src).convert('RGB')).astype(int)
    H, W, _ = im.shape
    R, G, B = im[:, :, 0], im[:, :, 1], im[:, :, 2]
    m = np.ones((H, W), bool)
    if p.get('rmin') is not None: m &= R > p['rmin']
    if p.get('rmax') is not None: m &= R < p['rmax']
    if p.get('gmin') is not None: m &= G > p['gmin']
    if p.get('gmax') is not None: m &= G < p['gmax']
    if p.get('bmin') is not None: m &= B > p['bmin']
    if p.get('bmax') is not None: m &= B < p['bmax']
    if p.get('chroma_min') is not None: m &= (R + G - 2 * B) > p['chroma_min']

    md = dilate(m, 2)
    keep = big_components(md)
    ys, xs = np.nonzero(keep)
    if len(xs) < 200:
        print("ERROR: too few colored pixels", file=sys.stderr); sys.exit(2)
    pts = np.column_stack([xs, ys]).astype(float)
    c = pts - pts.mean(0)
    w, v = np.linalg.eigh(np.cov(c.T))
    d = v[:, np.argmax(w)]
    ang = np.degrees(np.arctan2(d[1], d[0]))
    if ang > 45: ang -= 180
    if ang < -45: ang += 180

    canvas = np.full((H, W, 3), 255, np.uint8)
    canvas[keep] = 0
    base = Image.fromarray(canvas)
    for tag, aa in [('a', ang), ('b', -ang)]:
        pim = base.rotate(-aa, expand=True, fillcolor=(255, 255, 255),
                          resample=Image.BICUBIC)
        arr = np.array(pim.convert('L'))
        dark = np.nonzero(arr < 120)
        y0, y1, x0, x1 = dark[0].min(), dark[0].max(), dark[1].min(), dark[1].max()
        pad = 40
        pim = pim.crop((max(0, x0 - pad), max(0, y0 - pad),
                        min(pim.width, x1 + pad), min(pim.height, y1 + pad)))
        sc = min(1.5, 3000 / max(pim.size))
        if sc != 1:
            pim = pim.resize((int(pim.width * sc), int(pim.height * sc)),
                             Image.LANCZOS)
        pim.save(f'{a.outprefix}-{tag}.png')
        print(f'{a.outprefix}-{tag}.png rot={-aa:.2f} size={pim.size}')
    print(json.dumps({'angle': ang}))


if __name__ == '__main__':
    main()
