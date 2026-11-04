#!/bin/bash
# tools/mktest.sh SRC DST — lay THE test page, https://clanfire.online/test145/,
# into the checkout DST from the working tree SRC (CLAUDE.md, THE TEST BUILD).
#
# There is ONE test URL and it never changes (operator, 2026-11-04: "One stable
# test URL and one stable production url"): every test build overwrites
# test145/ in place. Bump the code version first (the shared ?v= on the script
# tags) — that, not the folder's name, is what makes a phone that cached the
# last test build fetch the new scripts.
#
#   1. bump + commit the build on the working branch
#   2. git worktree add --detach DST origin/main
#   3. tools/mktest.sh . DST
#   4. commit ONLY test145/ in DST, push it to main, merge main into the branch
#
# The folder is the build's own index.html (under <base href="../">, noindex,
# its scripts pointed at test145/js/) and a copy of js/, so every picture,
# font and sound is the live site's own file. A picture REDRAWN under a name
# the live page already ships must ride in the folder instead, or the live
# page would wear it before its release: ROUTE below lists those pictures and
# the test copy's js/assets.js is pointed at test145/ for them. Edit ROUTE (and
# the URL builders it patches) when another shipped picture is redrawn; once
# the build carrying it is released the routing is harmless (same pictures).
set -e
SRC=${1:?usage: tools/mktest.sh SRC DST}; DST=${2:?usage: tools/mktest.sh SRC DST}
T=test145
rm -rf "$DST/$T"; mkdir -p "$DST/$T"
cp -r "$SRC/js" "$DST/$T/js"
python3 - "$SRC/index.html" "$DST/$T/index.html" "$T" <<'PY'
import sys
src, dst, t = sys.argv[1:4]
s = open(src).read()
assert '<head>\n' in s, 'index.html: no <head> line'
s = s.replace('<head>\n', '<head>\n<base href="../">\n<meta name="robots" content="noindex">\n', 1)
n = s.count('src="js/')
s = s.replace('src="js/', 'src="' + t + '/js/')
open(dst, 'w').write(s)
print('index.html:', n, 'script tags into', t + '/js/')
PY
# ROUTE: the tower pictures redrawn in build 146 (the free-standing Watchtower
# and the wall towers, every state) are fetched from the test folder
python3 - "$DST/$T/js/assets.js" "$T" <<'PY'
import sys
p, t = sys.argv[1:3]; s = open(p).read()
pre = "(id === 'tower' ? '" + t + "/' : '') + "
reps = [
  ("artUrl(id, lv) { return this.ART_DIR +", "artUrl(id, lv) { return " + pre + "this.ART_DIR +"),
  ("stageUrl(id, lv, n) { return this.ART_DIR +", "stageUrl(id, lv, n) { return " + pre + "this.ART_DIR +"),
  ("img.src = this.ART_DIR + (String(id) + '-l' + lv + '-d' + k", "img.src = " + pre + "this.ART_DIR + (String(id) + '-l' + lv + '-d' + k"),
  ("fortUrl(lv, piece) { return this.FORT_DIR +", "fortUrl(lv, piece) { return (piece === 'tower' ? '" + t + "/' : '') + this.FORT_DIR +"),
  ("img.src = this.FORT_DIR + (piece + '-l' + lv + '-' + st", "img.src = (piece === 'tower' ? '" + t + "/' : '') + this.FORT_DIR + (piece + '-l' + lv + '-' + st"),
]
for a, b in reps:
  assert s.count(a) == 1, ('assets.js changed — re-point ROUTE', a, s.count(a))
  s = s.replace(a, b)
open(p, 'w').write(s); print('assets.js: tower pictures from', t + '/')
PY
mkdir -p "$DST/$T/assets/buildings" "$DST/$T/assets/fort"
cp "$SRC"/assets/buildings/tower-l*.png "$DST/$T/assets/buildings/"
cp "$SRC"/assets/fort/tower-l*.png "$DST/$T/assets/fort/"
echo "$T: $(find "$DST/$T/assets" -name '*.png' | wc -l) routed pictures, build $(grep -o 'js/config.js?v=[0-9]*' "$DST/$T/index.html" | head -1 | cut -d= -f2)"
