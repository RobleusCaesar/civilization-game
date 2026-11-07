#!/usr/bin/env python3.13
"""Compose a NEW pose (a strike variant or a death) for a character whose walk/idle
strips already ship, so the new frames stand on EXACTLY the shipped feet.

Input sheets are PixelLab workbench `join <refs> --as sheet --columns C` images
(1x, flat background 31,37,44, a title band on top, uniform cells, left to
right, top to bottom). Each --part names one sheet and the directions laid out
in it, in order, `per` cells each (the reference frame first):

    --part BLOB:CELLW:CELLH:COLS:PER:s,se      (one sheet, two directions)
    --part BLOB2:88:88:11:17:e                  (another sheet, one direction)

Frame 0 of every direction is the generation's reference (the character's
rotation). It is registered on the SHIPPED idle (else walk) frame 0 of the same
direction by alpha IoU over integer shifts, and every frame is cut into a
square window at the shipped density: the shipped window sits bottom-centre,
a bigger square (R.frameBox) only grows up and out round it. Pixels below the
shipped ground line are cropped (a body sinks no lower than its feet).

usage: tools/battle-compose.py --key defender --pose fight2 --part ... [--part ...]
         [--mirror] [--keep0] [--clean 45] [--maxw N] --out DIR [--review PNG]
Writes unit-{key}-{dir}-{pose}.png into --out and prints a JSON report.
"""
import argparse, json, os
import numpy as np
from PIL import Image

BG = np.array([31, 37, 44])
ap = argparse.ArgumentParser()
ap.add_argument('--key', required=True); ap.add_argument('--pose', required=True)
ap.add_argument('--part', action='append', required=True)
ap.add_argument('--mirror', action='store_true', help='write w/sw/nw as mirrors of e/se/ne when not generated')
ap.add_argument('--keep0', action='store_true', help='keep the reference frame as frame 0')
ap.add_argument('--clean', type=float, default=0, help='drop colours further than T from the character palette')
ap.add_argument('--maxw', type=int, default=0, help='largest square frame allowed (default 2x shipped)')
ap.add_argument('--assets', default=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'assets', 'units'))
ap.add_argument('--out', required=True)
ap.add_argument('--review', default='', help='write a 2x contact sheet of every direction here')
a = ap.parse_args()

frames = {}
for spec in a.part:
    blob, cw, ch, cols, per, dl = spec.rsplit(':', 5)
    cw, ch, cols, per = int(cw), int(ch), int(cols), int(per)
    dirs = dl.split(',')
    img = np.array(Image.open(blob).convert('RGBA')).astype(np.int16)
    n_cells = len(dirs) * per
    rows = -(-n_cells // cols)
    img = img[img.shape[0] - rows * ch:]
    isbg = (np.abs(img[:, :, :3] - BG).sum(2) == 0)
    rgba = img.astype(np.uint8).copy(); rgba[:, :, 3] = np.where(isbg, 0, 255); rgba[isbg] = 0
    cells = [rgba[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw] for r in range(rows) for c in range(cols)]
    for k, d in enumerate(dirs):
        frames[d] = [f.copy() for f in cells[k * per:(k + 1) * per]]

def shipped(d):
    for base in ('idle', 'walk'):
        p = os.path.join(a.assets, f'unit-{a.key}-{d}-{base}.png')
        if os.path.exists(p):
            s = np.array(Image.open(p).convert('RGBA'))
            return s[:, :s.shape[0]], s.shape[0], base
    raise SystemExit(f'no shipped idle/walk for {a.key} {d}')

def palette(d):
    pal = set()
    for base in ('idle', 'walk', 'fight'):
        p = os.path.join(a.assets, f'unit-{a.key}-{d}-{base}.png')
        if os.path.exists(p):
            s = np.array(Image.open(p).convert('RGBA'))
            c = s[s[:, :, 3] > 0][:, :3]; pal.update(map(tuple, c.tolist()))
    return np.array(sorted(pal), np.int32)

def register(ref, base):
    A = ref[:, :, 3] > 0; B = base[:, :, 3] > 0
    ya, xa = np.nonzero(A); yb, xb = np.nonzero(B)
    gx = int(round(xa.mean() - xb.mean())); gy = int(ya.max() - yb.max())
    best = (-1, 0, 0); H, W = B.shape
    for oy in range(gy - 6, gy + 7):
        for ox in range(gx - 6, gx + 7):
            m = np.zeros_like(B); ys, xs = ya - oy, xa - ox
            ok = (ys >= 0) & (ys < H) & (xs >= 0) & (xs < W)
            m[ys[ok], xs[ok]] = True
            iou = (m & B).sum() / max(1, (m | B).sum() + (~ok).sum())
            if iou > best[0]: best = (iou, ox, oy)
    return best

def despeck(f, mx=2):
    al = f[:, :, 3] > 0; h, w = al.shape; seen = np.zeros_like(al); n = 0
    for y0 in range(h):
        for x0 in range(w):
            if not al[y0, x0] or seen[y0, x0]: continue
            st = [(y0, x0)]; seen[y0, x0] = True; comp = []
            while st:
                y, x = st.pop(); comp.append((y, x))
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        yy, xx = y + dy, x + dx
                        if 0 <= yy < h and 0 <= xx < w and al[yy, xx] and not seen[yy, xx]:
                            seen[yy, xx] = True; st.append((yy, xx))
            if len(comp) <= mx:
                for y, x in comp: f[y, x] = 0
                n += len(comp)
    return n

report = {'key': a.key, 'pose': a.pose, 'dirs': {}}
os.makedirs(a.out, exist_ok=True)
written = {}
for d, fr in frames.items():
    fr = [f for f in fr if f[:, :, 3].any()]
    if not fr: report['dirs'][d] = {'error': 'no frames'}; continue
    base, W0, basepose = shipped(d)
    iou, ox, oy = register(fr[0], base)
    if not a.keep0: fr = fr[1:]
    cleaned = 0
    if a.clean:
        pal = palette(d)
        for f in fr:
            m = f[:, :, 3] > 0; c = f[m][:, :3].astype(np.int32)
            if not len(c): continue
            u, inv = np.unique(c, axis=0, return_inverse=True)
            dist = np.sqrt(((u[:, None, :] - pal[None, :, :]) ** 2).sum(2)).min(1)
            bad = (dist > a.clean)[inv.ravel()]
            ys, xs = np.nonzero(m); f[ys[bad], xs[bad]] = 0; cleaned += int(bad.sum())
    spk = sum(despeck(f) for f in fr)
    cx0 = W0 / 2.0; need = W0; below = 0
    reach = []
    for f in fr:
        ys, xs = np.nonzero(f[:, :, 3] > 0)
        if not len(xs): reach.append(0); continue
        sx, sy = xs - ox, ys - oy
        need = max(need, int(np.ceil(2 * max(cx0 - sx.min(), sx.max() + 1 - cx0))), int(W0 - sy.min()))
        below += int((sy > W0 - 1).sum())
        reach.append(float(np.max(np.hypot(sx - cx0, (sy - (W0 - 1)) * 0.6))))
    W = min((need + 3) // 4 * 4, a.maxw or 2 * W0)
    lost = 0
    strip = np.zeros((W, W * len(fr), 4), np.uint8)
    offx = (W - W0) // 2; offy = W - W0
    for i, f in enumerate(fr):
        ys, xs = np.nonzero(f[:, :, 3] > 0)
        tx = xs - ox + offx; ty = ys - oy + offy
        ok = (tx >= 0) & (tx < W) & (ty >= 0) & (ty < W)
        lost += int((~ok).sum())
        strip[ty[ok], i * W + tx[ok]] = f[ys[ok], xs[ok]]
    Image.fromarray(strip).save(os.path.join(a.out, f'unit-{a.key}-{d}-{a.pose}.png'), optimize=True)
    written[d] = strip
    report['dirs'][d] = {'iou': round(float(iou), 3), 'W': W, 'base': W0, 'frames': len(fr), 'lost': lost,
                         'below_ground': below, 'fx_cleaned': cleaned, 'specks': spk,
                         'reach_peak_frame': int(np.argmax(reach)) if reach else None}
if a.mirror:
    for d, twin in (('w', 'e'), ('sw', 'se'), ('nw', 'ne')):
        if d in frames or twin not in written: continue
        s = written[twin]; W = s.shape[0]; n = s.shape[1] // W
        m = np.concatenate([s[:, i * W:(i + 1) * W][:, ::-1] for i in range(n)], axis=1)
        Image.fromarray(m).save(os.path.join(a.out, f'unit-{a.key}-{d}-{a.pose}.png'), optimize=True)
        written[d] = m
        report['dirs'][d] = {'mirror_of': twin, 'W': W, 'frames': n}
if a.review and written:
    order = [d for d in ('s', 'se', 'e', 'ne', 'n', 'nw', 'w', 'sw') if d in written]
    Wmax = max(written[d].shape[1] for d in order); H = sum(written[d].shape[0] + 4 for d in order)
    sheet = Image.new('RGBA', (Wmax, H), (64, 92, 52, 255)); y = 0
    for d in order:
        s = written[d]; im = Image.fromarray(s)
        sheet.alpha_composite(im, (0, y)); y += s.shape[0] + 4
    sheet = sheet.resize((sheet.width * 2, sheet.height * 2), Image.NEAREST)
    if sheet.width > 4000: sheet = sheet.resize((sheet.width // 2, sheet.height // 2), Image.NEAREST)
    sheet.save(a.review)
    report['review'] = a.review
print(json.dumps(report))
