#!/usr/bin/env python3
# Summarize balance-sim jsonl files: outcome, first raid, hall fall, army at the raid.
import json, sys, statistics as st
def q(v, f):
    v = sorted(x for x in v if x is not None)
    if not v: return None
    return v[min(len(v) - 1, int(f * (len(v) - 1)))]
for path in sys.argv[1:]:
    rows = [json.loads(l) for l in open(path) if l.strip()]
    rows = [r for r in rows if not r.get('thrown')]
    thrown = sum(1 for l in open(path) if '"thrown"' in l)
    if not rows: print(path, 'no rows'); continue
    n = len(rows)
    won = sum(1 for r in rows if r['over'] == 'won'); lost = sum(1 for r in rows if r['over'] == 'lost'); und = n - won - lost
    raid = [r['marks']['raid'] or None for r in rows]; fell = [r['marks']['tcFell'] or None for r in rows]
    hit = [r['marks']['firstHit'] or None for r in rows]; wave = [r['marks']['wave'] or None for r in rows]
    def at(day, key):
        v = []
        for r in rows:
            h = [x for x in r.get('hist', []) if x['day'] == day]
            if h: v.append(h[0][key])
        return round(st.mean(v), 1) if v else None
    print(f"== {path.split('/')[-1]}  n={n} thrown={thrown}  {rows[0]['mode']}/{rows[0]['size']}/{rows[0]['style']}")
    print(f"   won {won}  lost {lost}  undecided {und}   ({100*won/n:.0f}% / {100*lost/n:.0f}% / {100*und/n:.0f}%)")
    print(f"   first rival raid day: p25 {q(raid,.25)} med {q(raid,.5)} p75 {q(raid,.75)}  (none in {sum(1 for x in raid if x is None)})   party {st.mean([r['marks']['raidN'] for r in rows if r['marks']['raid']]) if any(r['marks']['raid'] for r in rows) else None:.1f}")
    print(f"   first wave day: med {q(wave,.5)}   first hall hit: med {q(hit,.5)} (none in {sum(1 for x in hit if x is None)})   hall fell: med {q(fell,.5)} p25 {q(fell,.25)} (never in {sum(1 for x in fell if x is None)})")
    print(f"   at raid: player army {st.mean([r['marks']['pArmyAtRaid'] for r in rows if r['marks']['raid']] or [0]):.1f}  rival army {st.mean([r['marks']['aArmyAtRaid'] for r in rows if r['marks']['raid']] or [0]):.1f}  posture {sorted(set(r['marks']['raidPosture'] for r in rows if r['marks']['raid']))}")
    for d in (30, 60, 100, 150, 200):
        print(f"   day {d}: vil {at(d,'vil')} pArmy {at(d,'pArmy')} aArmy {at(d,'aArmy')} pBld {at(d,'pBld')} aBld {at(d,'aBld')} tcHp {at(d,'tcHp')}")
    per = {}
    for r in rows: per.setdefault(r['persona'], []).append(r['over'][0])
    print('   by persona:', {k: ''.join(v) for k, v in per.items()})
    lf = {}
    for r in rows: lf.setdefault(r['landform'], []).append(r['over'][0])
    print('   by landform:', {k: ''.join(v) for k, v in lf.items()})
    if any(r['marks'].get('wonderLaid') for r in rows): print('   wonder laid days:', [r['marks'].get('wonderLaid') for r in rows])
    if any(r['marks'].get('marched') for r in rows): print('   marched days:', [r['marks'].get('marched') for r in rows])
