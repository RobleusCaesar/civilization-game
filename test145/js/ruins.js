/* THE RUINS A BUILDING LEAVES (tests/ruins.mjs — operator, build 156: "when
   the barbarians village is destroyed, or actually any building for that
   matter, the destroyed tile square is also still low pixel count and
   bland… different destruction tile types for different buildings… a wall
   or tower, maybe it's a more visual rubble pile, although still walkable").

   The ground under a razed building is still T.RUIN — the rule is untouched:
   walkable, buildable once the ash cools, on its own RUIN_FADE_DAYS clock
   back to grass. What changed is the PICTURE. The tile itself paints only a
   ragged scorch on the living ground (R.ruinScorch, inside the terrain
   cache), and the building's own remains are drawn over it as ART: each a
   PixelLab edit of the shipped building it stands for (the burnt roundhouse,
   the collapsed stone house, the fallen hall), or a heap made in the same
   style (masonry rubble for a stone wall or tower, a tangle of charred
   stakes for a palisade). Drawn through the building art's own anchoring
   (the building art's rule: bottom-centre on the footprint, scaled to its width), so the
   ruin lies exactly where the building stood.

   A PICTURE, NEVER A RULE: a record is {x, y, sz, c, v, m, day} in S.ruins
   (in every save; loadJSON backfills []). Nothing reads it but the draw. It
   is drawn while any of its footprint is still T.RUIN and no building stands
   on it, and pruned once the ground has healed. No RNG is drawn: the variant
   and the mirror hash off the position. A missing PNG draws nothing — the
   scorch alone stands, as the ground did before. */
const Ruins = {
  /* the classes and how many drawn variants each ships
     (assets/ruins/ruin-{class}-{n}.png, n from 1) */
  SETS: { timber: 2, stonehouse: 1, rubble: 4, stakes: 4, yard: 2, hall: 2 },
  FORTS: { wall: 1, gate: 1, tower: 1 },
  _img: {},
  classOf(b) {
    const lv = b.level || 1, sz = (typeof Bld !== 'undefined' && Bld.size) ? Bld.size(b) : 1;
    if (this.FORTS[b.key]) return lv >= 2 ? 'rubble' : 'stakes';
    if (b.key === 'raidercamp') return 'yard';
    if (sz >= 2) return (lv >= 3 || (b.key === 'tc' && lv >= 2) || b.key === 'wonder') ? 'hall' : 'yard';
    return lv >= 3 ? (this.hash(b.x, b.y, 7) < 0.5 ? 'stonehouse' : 'rubble') : 'timber';
  },
  hash(x, y, s) {
    let h = (x * 374761393 + y * 668265263 + (s || 0) * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  },
  /* a building came down (Bld.removeToRuin, never a clean call-off): its
     remains go on the ground it stood on */
  note(b) {
    if (typeof S === 'undefined' || !S || !b) return;
    if (!S.ruins) S.ruins = [];
    const c = this.classOf(b), n = this.SETS[c] || 1;
    // a camp is one tile in a 3x3 yard: its remains spread over the yard
    const sz = b.key === 'raidercamp' ? 1 : Bld.size(b);
    const r = { x: b.x, y: b.y, sz, c, v: 1 + Math.floor(this.hash(b.x, b.y, 3) * n), m: this.hash(b.x, b.y, 5) < 0.5 ? 1 : 0, day: S.day };
    if (b.key === 'raidercamp') r.big = 2;
    // a newer ruin on the same ground replaces the older
    S.ruins = S.ruins.filter(o => !(o.x === r.x && o.y === r.y));
    S.ruins.push(r);
    if (S.ruins.length > 160) S.ruins.splice(0, S.ruins.length - 160);
    this.want(c, r.v);
  },
  img(c, v) {
    const k = c + '-' + v, im = this._img[k];
    if (im) return im.complete && im.naturalWidth ? im : null;
    this.want(c, v);
    return null;
  },
  want(c, v) {
    const k = c + '-' + v;
    if (this._img[k] || typeof Image === 'undefined') return;
    const im = new Image();
    im.decoding = 'async';
    im.onerror = () => { im._bad = true; };
    im.src = 'assets/ruins/ruin-' + k + '.png?v=' + ((typeof CFG !== 'undefined' && CFG.ART_V) || 1);
    this._img[k] = im;
  },
  // ask for every ruin a world already holds (newGame / loadJSON)
  warm() { if (S && S.ruins) for (const r of S.ruins) this.want(r.c, r.v); },
  // is this record still a ruin worth drawing: ground still rubble, nothing built on it
  live(r) {
    let any = false;
    for (let dy = 0; dy < r.sz; dy++) for (let dx = 0; dx < r.sz; dx++) {
      if (!MapGen.inB(r.x + dx, r.y + dy)) continue;
      if (S.map.terrain[MapGen.idx(r.x + dx, r.y + dy)] === T.RUIN) any = true;
      if (Bld.at(r.x + dx, r.y + dy)) return false;
    }
    return any;
  },
  // is a drawn ruin standing on this tile (the ash heap stands down for it)
  covers(x, y) {
    if (!S.ruins) return false;
    for (const r of S.ruins) if (r.x === x && r.y === y) return !!this.img(r.c, r.v);
    return false;
  },
  // the daily sweep (G.dayTick): a healed or built-over ruin is gone for good
  prune() {
    if (!S || !S.ruins || !S.ruins.length) return;
    S.ruins = S.ruins.filter(r => this.live(r));
  },
  /* drawn by R.draw in the ground-decal pass (after the corpses, before the
     ash and every building), on explored memory like the corpses: a ruin you
     have seen is a ruin you remember. Culled to the camera. */
  draw(g, R) {
    if (!S.ruins || !S.ruins.length) return;
    const TL = CFG.TILE, v = R.viewTiles ? R.viewTiles() : null;
    for (const r of S.ruins) {
      if (v && (r.x + r.sz + 2 < v.x0 || r.x - 2 > v.x1 || r.y + r.sz + 1 < v.y0 || r.y - 3 > v.y1)) continue;
      if (!R.rememberedAt(MapGen.idx(r.x, r.y))) continue;
      if (R.collapseAt && R.collapseAt(r.x, r.y)) continue;   // the tower still falling owns its ground
      if (!this.live(r)) continue;
      const im = this.img(r.c, r.v);
      if (!im) continue;
      const big = r.big || r.sz, off = (big - r.sz) / 2;
      const x = (r.x - off) * TL, y = (r.y - off) * TL, w = big * TL;
      const dw = w, dh = dw * im.height / im.width;
      const dx = x, dy = y + w - dh;
      g.save();
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      if (r.m) { g.translate(dx + dw, dy); g.scale(-1, 1); g.drawImage(im, 0, 0, dw, dh); }
      else g.drawImage(im, dx, dy, dw, dh);
      g.restore();
    }
  },
};
window.Ruins = Ruins;
