"""Write Assets.BATTLE_ART and BattleFX.STRIKE_AT from the strips on disk
(build 160, js/battlefx.js; held by tests/battle-fx.mjs).
BATTLE_ART[fileKey][pose] = bitmask over UNIT_DIRS8 (s se e ne n nw w sw) of
the battle strips present (fight2 / fight3 / die).
STRIKE_AT[fileKey][pose] = [k per facing in UNIT_DIRS8 order] for fight /
fight2 / fight3: the frame least like the ready stance (frame 0), or an
override from the art reports (impact by eye) when one was given.
Usage: python3 tools/battle-tables.py [--write] [--reports DIR]
(needs Pillow and numpy; DIR holds the art agents' report JSONs, whose
by-eye impact frames replace the measured ones for the strips they made)"""
import glob, os, sys, json, re
import numpy as np
from PIL import Image
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = REPO + '/assets/units/'
DIRS = ['s', 'se', 'e', 'ne', 'n', 'nw', 'w', 'sw']
BATTLE = ['fight2', 'fight3', 'die']
STRIKES = ['fight', 'fight2', 'fight3']
REPORTS = sys.argv[sys.argv.index('--reports') + 1] if '--reports' in sys.argv else None

def impact_of(path):
    s = np.array(Image.open(path).convert('RGBA')); H = s.shape[0]; n = s.shape[1] // H
    fr = [s[:, i*H:(i+1)*H, 3] > 0 for i in range(n)]
    ref = fr[0]
    sc = [1 - (f & ref).sum() / max(1, (f | ref).sum()) for f in fr]
    # the frame least like ready, among the first 85% (the recovery is never the blow)
    lim = max(2, int(round(n * 0.85)))
    k = int(np.argmax(sc[:lim]))
    return n, max(1, min(n - 1, k))

def parse(path, pose):
    b = os.path.basename(path)[5:-len(pose) - 5]
    key, d = b.rsplit('-', 1)
    return key, d

# overrides by eye from the art agents' reports: {key: {pose: k}}
over = {}
exact = {}   # by-eye impact per facing (a new strip's report): taken as given
for rp in (glob.glob(REPORTS + '/*.json') if REPORTS else []):
    try: r = json.load(open(rp))
    except Exception: continue
    for key, c in (r.get('characters') or {}).items():
        for pose, p in (c.get('poses') or {}).items():
            if not isinstance(p, dict) or pose == 'die': continue
            if isinstance(p.get('impact_by_dir'), dict): exact.setdefault(key, {})[pose] = p['impact_by_dir']
            elif isinstance(p.get('impact'), int): over.setdefault(key, {})[pose] = p['impact']
        if isinstance(c.get('fight_impact'), int): over.setdefault(key, {})['fight'] = c['fight_impact']

# the by-eye frames live in the repo (tools/battle-impacts.json); a run with
# --reports refreshes them from the art agents' reports first
IMP = os.path.join(REPO, 'tools', 'battle-impacts.json')
if REPORTS:
    json.dump({'exact': exact, 'over': over}, open(IMP, 'w'), indent=1, sort_keys=True)
elif os.path.exists(IMP):
    d = json.load(open(IMP)); exact = d.get('exact', {}); over = d.get('over', {})

art = {}
for pose in BATTLE:
    for p in sorted(glob.glob(A + f'unit-*-{pose}.png')):
        key, d = parse(p, pose)
        if d not in DIRS: continue
        art.setdefault(key, {}).setdefault(pose, 0)
        art[key][pose] |= 1 << DIRS.index(d)

strike = {}
for pose in STRIKES:
    for p in sorted(glob.glob(A + f'unit-*-{pose}.png')):
        key, d = parse(p, pose)
        if d not in DIRS: continue
        n, k = impact_of(p)
        strike.setdefault(key, {}).setdefault(pose, [None] * 8)[DIRS.index(d)] = k
# a by-eye impact (reports) replaces the measure only where the measure strays from it by more than 2
for key, poses in over.items():
    for pose, k in poses.items():
        row = strike.get(key, {}).get(pose)
        if not row: continue
        for i, m in enumerate(row):
            if m is None or abs(m - k) > 2: row[i] = k

for key, poses in exact.items():
    for pose, byd in poses.items():
        row = strike.get(key, {}).get(pose)
        if not row: continue
        for d, k in byd.items():
            if d in DIRS and isinstance(k, int) and row[DIRS.index(d)] is not None: row[DIRS.index(d)] = k

def js_obj(d, ind):
    return json.dumps(d, separators=(',', ':')).replace('null', 'null')

art_js = '{\n' + ',\n'.join(f"    '{k}': {json.dumps(v, separators=(', ', ': '))}" for k, v in sorted(art.items())) + ',\n  }'
strike_js = '{\n' + ',\n'.join(f"    '{k}': {json.dumps(v, separators=(',', ':'))}" for k, v in sorted(strike.items())) + ',\n  }'
if '--write' in sys.argv:
    for f, name, body in ((REPO + '/js/assets.js', 'BATTLE_ART', art_js), (REPO + '/js/battlefx.js', 'STRIKE_AT', strike_js)):
        src = open(f).read()
        new, n = re.subn(r'(  ' + name + r': )(\{\}|\{\n.*?\n  \})(,)', lambda m: m.group(1) + body + m.group(3), src, count=1, flags=re.S)
        assert n == 1, name
        open(f, 'w').write(new)
    print('written', len(art), 'battle keys,', len(strike), 'strike keys')
else:
    print(art_js); print(strike_js)
