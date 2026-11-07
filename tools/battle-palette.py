#!/usr/bin/env python3.13
"""Snap the battle strips (fight2 / fight3 / die) onto their character's OWN palette.

Why: a dyed character (the player's and the rival's soldiers, villagers, sappers)
is recoloured at install by swapping two EXACT colours, Assets.TUNIC_KEY
(#3f6d99 body, #2c4e70 accent). The shipped walk/idle/fight strips wear exactly
those two blues on the tunic; a PixelLab re-animation of the same character
comes back with a ramp of near-blues (64,111,155 / 46,82,118 / 50,89,127 ...)
that the swap never touches, so a rival in red would strike and die in a blue
tunic. Every blue a new strip wears is moved to the nearest blue the
character's shipped strips wear: the shipped tunic is the two keys over a
few near-black shade blues, so a saturated blue at the keys' lightness takes
the body or the accent key by its lightness (the elite's shield face is key
blue too, and dyes with the tunic), and a darker one the nearest shipped shade.
Any other colour within a hair (SNAP) of a shipped colour is moved onto it, so
the new frames read as the same character's.

The barbarians are not dyed (their peoples wear their own colours) and are left alone.

usage: tools/battle-palette.py [--check] [filekey ...]      (no keys: every battle strip on disk)
  --check   change nothing; exit 1 if any strip would change
"""
import argparse, glob, os, re, sys
import numpy as np
from PIL import Image

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UNITS = os.path.join(REPO, 'assets', 'units')
DIRS = ('s', 'se', 'e', 'ne', 'n', 'nw', 'w', 'sw')
BATTLE = ('fight2', 'fight3', 'die')
SNAP = 12.0                      # a non-blue colour this close to a shipped one is drift

ap = argparse.ArgumentParser()
ap.add_argument('--check', action='store_true')
ap.add_argument('keys', nargs='*')
a = ap.parse_args()

pat = re.compile(r'^unit-(.+)-(' + '|'.join(DIRS) + r')-([a-z0-9]+)\.png$')
files = {}
for f in sorted(os.listdir(UNITS)):
    m = pat.match(f)
    if m: files.setdefault(m.group(1), []).append((m.group(2), m.group(3), f))

KB, KA = (0x3f, 0x6d, 0x99), (0x2c, 0x4e, 0x70)      # Assets.TUNIC_KEY body / accent
def lum(c): return 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]
LK = (lum(KB) + lum(KA)) / 2                          # the line between body and accent
DARK = 52                                             # under this a blue is shade, not cloth
def blue(c):                     # c: (...,3) int array → bool mask of the dyed (saturated) blue family
    r, g, b = c[..., 0].astype(int), c[..., 1].astype(int), c[..., 2].astype(int)
    return (b >= r + 40) & (b >= g)

keys = a.keys or sorted(k for k, fs in files.items() if any(p in BATTLE for _, p, _ in fs))
changed = 0
for key in keys:
    if key.startswith('barb-'): continue
    fs = files.get(key, [])
    shipped = [f for _, p, f in fs if p not in BATTLE]
    battle = [f for _, p, f in fs if p in BATTLE]
    if not shipped or not battle: continue
    pal = set()
    for f in shipped:
        px = np.array(Image.open(os.path.join(UNITS, f)).convert('RGBA'))
        pal.update(map(tuple, px[px[..., 3] > 0][:, :3].tolist()))
    P = np.array(sorted(pal), dtype=float)
    PB = P[blue(P.astype(int)) & (np.array([lum(c) for c in P]) < DARK)] if len(P) else P
    for f in battle:
        path = os.path.join(UNITS, f)
        im = Image.open(path).convert('RGBA'); px = np.array(im)
        on = px[..., 3] > 0
        cols = np.unique(px[on][:, :3], axis=0)
        remap = {}
        for c in cols:
            t = tuple(int(v) for v in c)
            if t in (KB, KA): continue
            if blue(c[None])[0]:
                if lum(t) >= DARK: remap[t] = KB if lum(t) >= LK else KA
                elif t not in pal and len(PB):
                    d = np.sqrt(((PB - c) ** 2).sum(1)); remap[t] = tuple(int(v) for v in PB[d.argmin()])
                continue
            if t in pal: continue
            else:
                d = np.sqrt(((P - c) ** 2).sum(1)); i = d.argmin()
                if d[i] <= SNAP: remap[t] = tuple(int(v) for v in P[i])
        if not remap: continue
        changed += 1
        n = 0
        flat = px.reshape(-1, 4)
        for src, dst in remap.items():
            m = (flat[:, 3] > 0) & (flat[:, 0] == src[0]) & (flat[:, 1] == src[1]) & (flat[:, 2] == src[2])
            n += int(m.sum()); flat[m, :3] = dst
        print(f'{f}: {len(remap)} colours, {n} px' + (' (would change)' if a.check else ''))
        if not a.check: Image.fromarray(px).save(path, optimize=True)
print(f'{changed} strip(s) {"to change" if a.check else "changed"}')
sys.exit(1 if a.check and changed else 0)
