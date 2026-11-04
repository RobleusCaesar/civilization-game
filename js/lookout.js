/* ============================================================
   THE TOWER LOOKOUT (CFG.LOOKOUT, tests/tower-garrison.mjs).

   Operator, 2026-11-04: "A player can man a tower with up to 2 archers.
   While garrisoned, an archer's sight AND attack radius are doubled… mount /
   dismount… garrisoned archers render standing on the now-open platform…
   The garrison is destroyed if the archers are on the tower when the tower
   is destroyed… 1 second to garrison, and un-garrison… The archers should
   disappear for that second… If an archer is killed on a tower, create a
   sprite where they fall to their death off the tower."

   THE BOW STAYS A UNIT. A manned archer never leaves S.units — so it counts
   against the population, eats, saves and loads with nothing new to do —
   and wears two fields:
     u.perch  the tower's id while it stands on the platform
     u.climb  {bid, t, up, then} while it is on the stairs inside (hidden,
              out of everyone's reach: Combat.canEngage)
   A perched bow is PINNED to its tower's tile (Units.update hands it to
   Lookout.tick and goes no further), never chases (Combat's tUnit/tBld
   branches drop a mark past its doubled reach, or — on an ORDER — take the
   stairs down and go), sees and shoots over walls (Combat.sees), is drawn
   on the platform by the building pass (Lookout.draw), and can be struck
   only by bows and engines.

   ORDERS FOLLOW THE TRANSPORT'S PATTERN: select bows, tap your own tower and
   they walk to its door and climb (the group or the one); the tower's panel
   and the bow's own carry a Climb down; and any other order given to a bow
   on the platform takes the stairs down first and then is carried out.
   ============================================================ */
const Lookout = {
  cfg() { return CFG.LOOKOUT; },
  canMan(u) {
    const c = this.cfg();
    return !!(c && u && c.kinds.indexOf(u.kind) >= 0 && !u.spectral && !Units.isNaval(u));
  },
  // a tower that can take a bow: the owner's, finished, standing, not in works
  isPost(b, owner) {
    return !!(b && b.key === 'tower' && b.hp > 0 && !(b.construction > 0) && !(b.upgrading > 0) &&
      (!owner || b.owner === owner));
  },
  // who is up there (or on the stairs going up)
  crew(b) {
    if (!b) return [];
    return S.units.filter(u => u.perch === b.id || (u.climb && u.climb.up && u.climb.bid === b.id));
  },
  // …and who has been sent: the crew plus every bow walking to the door
  claimed(b, except) {
    let n = 0;
    for (const u of S.units) {
      if (u === except) continue;
      if (u.perch === b.id || (u.climb && u.climb.up && u.climb.bid === b.id) ||
          (u.task && u.task.type === 'mantower' && u.task.id === b.id)) n++;
    }
    return n;
  },
  room(b, except) { return this.isPost(b) ? Math.max(0, this.cfg().cap - this.claimed(b, except)) : 0; },
  // the doorstep: open ground beside the tower, the south side first (the
  // stair door faces the camera), else the side nearest `from`
  door(b, from) {
    const own = b.owner;
    const ok = (x, y) => MapGen.onBoard(x, y) && Path.passable(x, y, own) && !Bld.at(x, y);
    const sides = [[0, 1], [-1, 0], [1, 0], [0, -1], [-1, 1], [1, 1], [-1, -1], [1, -1]];
    let best = null, bd = Infinity;
    for (let i = 0; i < sides.length; i++) {
      const x = b.x + sides[i][0], y = b.y + sides[i][1];
      if (!ok(x, y)) continue;
      const d = (from ? Math.hypot(x + 0.5 - from.x, y + 0.5 - from.y) : 0) + i * 0.05 + (i > 3 ? 1.5 : 0);
      if (d < bd) { bd = d; best = { x, y }; }
    }
    return best || MapGen.findNear(b.x, b.y, 3, ok);
  },
  // at the door: within a step of the tower, on a tile beside it
  atDoor(u, b) {
    return Math.abs((u.x | 0) - b.x) <= 1 && Math.abs((u.y | 0) - b.y) <= 1 &&
      Math.hypot(u.x - (b.x + 0.5), u.y - (b.y + 0.5)) <= 1.6;
  },

  /* ---- orders ---- */
  // send one bow to man the tower; false (and nothing changed) when it cannot
  order(u, b) {
    if (!this.canMan(u) || !this.isPost(b, u.owner)) return false;
    if (u.perch === b.id || (u.climb && u.climb.up && u.climb.bid === b.id)) return true;
    if (this.room(b, u) <= 0) return false;
    const spot = this.door(b, u);
    if (!spot) return false;
    u.tUnit = 0; u.tBld = 0; u.tBridge = null;
    u.defend = false; u.assault = false; u.strat = null; u.siegePost = null; u.jobs = null;
    u.task = { type: 'mantower', id: b.id };
    // a bow up another tower takes those stairs down first (tick replays the order)
    if (u.perch || u.climb) return true;
    if (this.atDoor(u, b)) { this.up(u, b); return true; }
    Units.setPath(u, spot.x, spot.y);
    return true;
  },
  // a party's order: the bows that fit go up, the rest stand by the door
  orderMany(units, b) {
    let up = 0, left = 0;
    for (const u of units) {
      if (!this.canMan(u)) continue;
      if (this.order(u, b)) up++; else left++;
    }
    return { up, left };
  },
  // the walk to the door (Units.update's task chain)
  walk(u, dt) {
    const b = Bld.get(u.task.id);
    if (!this.isPost(b, u.owner)) {
      u.task = null; u.path = null;
      if (u.owner === 'P') G.log('The tower is no longer there to man', true, undefined, true);
      return;
    }
    if (this.atDoor(u, b)) {
      if (this.room(b, u) <= 0) {
        u.task = null; u.path = null;
        if (u.owner === 'P') G.log('The tower is full — two bows is all its platform holds', true, undefined, true);
        return;
      }
      this.up(u, b);
      return;
    }
    if (Units.moving(u)) { Units.followPath(u, dt); return; }
    if ((u.repathT || 0) > 0) { u.repathT -= dt; return; }
    u.repathT = 0.8;
    const spot = this.door(b, u);
    if (!spot || !Units.setPath(u, spot.x, spot.y)) {
      u.task = null;
      if (u.owner === 'P') G.log('No way through to the tower door', true, undefined, true);
    }
  },
  // into the stairs: out of sight for climbS seconds
  up(u, b) {
    u.climb = { bid: b.id, t: this.cfg().climbS, up: true };
    u.task = null; u.path = null; u.pathI = 0;
    u.tUnit = 0; u.tBld = 0;
    for (const o of S.units) if (o.tUnit === u.id) { o.tUnit = 0; Units.resolveAfterFight(o); }
    if (u.owner === 'P' && typeof Sound !== 'undefined' && Sound.place) {
      try { if (Sound.place(u.x, u.y)) Sound.play('tick'); } catch (e) {}
    }
  },
  /* down the stairs, then `then` — the order that called them down, kept
     whole and carried out at the door: {task}, {tUnit} or {tBld} */
  down(u, then) {
    const b = Bld.get(u.perch || (u.climb && u.climb.bid));
    const hint = then && then.task && then.task.x != null ? { x: then.task.x + 0.5, y: then.task.y + 0.5 }
      : then && then.tUnit && Units.get(then.tUnit) ? Units.get(then.tUnit)
      : then && then.tBld && Bld.get(then.tBld) ? { x: Bld.cx(Bld.get(then.tBld)), y: Bld.cy(Bld.get(then.tBld)) }
      : null;
    const spot = (b && this.door(b, hint)) ||
      MapGen.findNear(u.x | 0, u.y | 0, 4, (x, y) => Path.passable(x, y, u.owner) && !Bld.at(x, y));
    if (spot) { u.x = spot.x + 0.5; u.y = spot.y + 0.5; }
    u.perch = 0;
    u.climb = { bid: b ? b.id : 0, t: this.cfg().climbS, up: false, then: then || null };
    u.path = null; u.pathI = 0; u.tUnit = 0; u.tBld = 0;
    u.task = null;
    for (const o of S.units) if (o.tUnit === u.id) { o.tUnit = 0; Units.resolveAfterFight(o); }
  },
  // every bow off a tower at once (the tower's own panel)
  downAll(b) {
    let n = 0;
    for (const u of S.units) {
      if (u.perch === b.id) { this.down(u, null); n++; }
      else if (u.climb && u.climb.up && u.climb.bid === b.id) { u.climb.up = false; u.climb.then = null; n++; }
      else if (u.task && u.task.type === 'mantower' && u.task.id === b.id) { u.task = null; u.path = null; }
    }
    return n;
  },
  // out at once, no stairs: the tower is being torn down by its own hands
  evict(b) {
    for (const u of S.units) {
      const on = u.perch === b.id || (u.climb && u.climb.bid === b.id);
      if (on) {
        const spot = this.door(b, null) ||
          MapGen.findNear(b.x, b.y, 4, (x, y) => Path.passable(x, y, u.owner) && !Bld.at(x, y));
        if (spot) { u.x = spot.x + 0.5; u.y = spot.y + 0.5; }
        u.perch = 0; u.climb = null; u.path = null; u.task = null;
      } else if (u.task && u.task.type === 'mantower' && u.task.id === b.id) { u.task = null; u.path = null; }
    }
  },
  /* THE TOWER FALLS AND TAKES ITS LOOKOUT WITH IT (Bld.damage's destroy
     branch, before the tower leaves the list): every bow on the platform
     falls to its death, and one on the stairs dies inside. A kill like any
     other — credited to whoever brought the tower down. */
  towerFalls(b, by) {
    for (const u of S.units.slice()) {
      if (u.perch === b.id || (u.climb && u.climb.bid === b.id)) {
        if (u.climb) u.climb.lost = true;            // no fall: the stairs went with the tower
        Units.damage(u, u.hp + 1e6, 0, by);
      } else if (u.task && u.task.type === 'mantower' && u.task.id === b.id) { u.task = null; u.path = null; }
    }
  },
  /* the per-frame step for a bow on the stairs or the platform (Units.update
     hands it here and goes no further: nothing else may walk it about) */
  tick(u, dt) {
    if (u.climb) {
      u.path = null;
      u.climb.t -= dt;
      if (u.climb.t > 0) return;
      const c = u.climb;
      u.climb = null;
      if (c.up) {
        const b = Bld.get(c.bid);
        if (this.isPost(b, u.owner) && this.crew(b).length < this.cfg().cap) {
          // his place up there is the one the other man left free, and he keeps it
          const other = S.units.find(o => o !== u && o.perch === b.id);
          u.perchSlot = other && other.perchSlot === 0 ? 1 : 0;
          u.perch = b.id;
          u.x = b.x + 0.5; u.y = b.y + 0.5;
          u.anchor = { x: u.x, y: u.y };
          return;
        }
        // the tower changed under them: they come back out at the door
        const spot = b ? this.door(b, null) : null;
        if (spot) { u.x = spot.x + 0.5; u.y = spot.y + 0.5; }
        return;
      }
      u.anchor = { x: u.x, y: u.y };
      const then = c.then;
      if (!then) return;
      if (then.task) {
        u.task = then.task;
        if (then.task.type === 'move' && then.task.x != null) Units.setPath(u, then.task.x, then.task.y);
        else if (then.task.type === 'mantower') {
          const b2 = Bld.get(then.task.id);
          if (b2 && !this.order(u, b2)) u.task = null;
        }
      } else if (then.tUnit && Units.get(then.tUnit)) {
        u.task = { type: 'attack', on: then.tUnit }; u.tUnit = then.tUnit; u.assault = true;
      } else if (then.tBld && Bld.get(then.tBld)) {
        u.assault = true; Units.orderAttackBuilding(u, Bld.get(then.tBld));
      }
      return;
    }
    const b = Bld.get(u.perch);
    if (!b || b.hp <= 0) {                           // gone without a fall (a save, a removal): ground
      const spot = MapGen.findNear(u.x | 0, u.y | 0, 4, (x, y) => Path.passable(x, y, u.owner) && !Bld.at(x, y));
      if (spot) { u.x = spot.x + 0.5; u.y = spot.y + 0.5; }
      u.perch = 0;
      return;
    }
    if (b.upgrading > 0 || b.construction > 0) { this.down(u, null); return; }   // the masons need the stairs
    const t = u.task;
    if (t && t.type !== 'attack' && t.type !== 'attackBld') { this.down(u, { task: t }); return; }
    // pinned: a leash, a guard post or a doctrine may have set a road; it is not taken
    u.path = null; u.pathI = 0;
    u.x = b.x + 0.5; u.y = b.y + 0.5;
    u.strat = null; u.siegePost = null;
  },

  /* ---- the picture ---- */
  /* THE BOWS STAND INSIDE THE PLATFORM (operator, build 147: "The archers
     have to fit inside the tower… follow the physical constraints of the
     tower top… It also looks unnatural having half their body cut off.
     Remember how we had villagers looking more natural walking under the
     gate…"). A man up there is drawn WHOLE, standing on the platform's
     floor; and the parts of the tower that stand IN FRONT of him — the
     front rail or wattle, the front corner posts, a ladder's top, the
     merlons and the crenels' sills — hide him, as a gatehouse hides a man
     in its passage (R.occludeByForts). What hides him is the tower's own
     pixels, never a ruler line.
     HIS SIZE IS A MAN'S, HIS BODY STAYS INSIDE THE FENCE (operator, build
     148: "make them 40% bigger, but make sure the physics of them staying
     inside the fence at the top of the tower remains… They just look so so
     small relative to the villagers… It's okay if the archers are a little
     squished next to each other, as long as their bodies stay inside the
     fence"). He stands 40% taller than the first cut (38 art px → 53): on
     a free tower about seven tenths of a villager, on a wall tower, whose
     art is denser, about nine tenths. His places are as far apart as his
     body allows: at rest, whichever way he faces and in every frame, no
     part of him (his bow aside) passes the platform's outer posts; drawing
     his bow, his arm may reach over the side rail by at most a sixth of his
     height, as an archer leans out to shoot. Two up there stand a little
     squeezed together, side by side.

     PLAT, per drawn tower, in the art's own pixels (measured off the shipped
     roofless PNGs — tests/tower-garrison.mjs reads them back off the files):
       front  the row each column's front begins, as runs 'x0-x1:row' (a
              column not listed is front from its top: the tower under the
              platform, the mound). Above it — the back fence, the back
              posts, the floor you see — stands behind a man up there.
       man    a man's height, feet to crown: a fence comes to his knee
       feet   the row his feet stand on, on the floor behind the front rail
       slots  where two stand (the first up keeps his place), as far apart
              as his body at rest allows inside the outer posts; solo, one
       art    the picture's size the rest was measured on
     A tower without that picture (the procedural stand-in while the PNG is
     missing, or art redrawn at another size — measure it again) takes PROC,
     in fractions of its rect: a straight front at `cy`. */
  PLAT: {
    free: [
      { front: '15:41 16-17:39 18:40 19-21:45 22:49 23:50 24:51 25-27:50 28:51 29:49 30:48 31:49 32:51 33:52 34-35:54 36-51:55 52-54:54 55:51 56:49 57:48 58:49 59:51 60-62:50 63:51 64:50 65:49 66-68:45 69:40 70-71:39 72:41',
        man: 53, feet: 60, slots: [32, 55], solo: 34, art: [88, 114] },
      { front: '15:38 16-18:37 19:40 20:42 21-61:48 62:42 63:40 64-67:37 68:38',
        man: 53, feet: 58, slots: [32, 51], solo: 42, art: [84, 116] },
      { front: '12:8 13-19:7 20-21:12 22-23:18 24:14 25-30:12 31:13 32-36:18 37:13 38-45:12 46:13 47-51:18 52:13 53-58:12 59:13 60-61:18 62:13 63-64:12 65-71:7 72:8',
        man: 53, feet: 27, slots: [29, 55], solo: 34, art: [84, 113] },
    ],
    wall: [
      { front: '5:37 6:36 7:35 8-9:34 10:35 11:36 12:35 13-20:44 21-22:45 23-27:44 28-29:45 30-32:46 33-38:45 39-45:44 46-47:45 48-54:44 55:36 56:35 57-58:34 59:35 60:36 61:37',
        man: 53, feet: 57, slots: [22, 44], solo: 34, art: [68, 90] },
      { front: '1:38 2:37 3-4:36 5:37 6:38 7-8:39 9-17:47 18:48 19-49:47 50-51:39 52:37 53-54:36 55:37 56:38',
        man: 53, feet: 57, slots: [18, 39], solo: 29, art: [58, 91] },
      { front: '3:8 4-8:7 9-12:12 13-14:18 15:14 16-21:12 22:13 23-27:18 28:13 29-36:12 37:13 38-42:18 43:13 44-50:12 51-52:18 53:11 54-58:12 59-62:7 63:8',
        man: 53, feet: 27, slots: [20, 46], solo: 25, art: [65, 85] },
    ],
  },
  PROC: { cy: 0.22, man: 0.59, feet: 0.34, slots: [0.33, 0.67], solo: 0.5 },
  // a bow's frame fills its box from `top` to `foot` (the shipped archer,
  // longbow and marksman frames: rows 3 and 31 of 32)
  BODY: { top: 3 / 32, foot: 31 / 32 },
  /* HIS FEET STAND ON HIS PLACE, NOT HIS FRAME'S MIDDLE. The bow sheets do
     not centre their man: facing south an archer stands 8 of his frame's 64
     px left of its middle, a longbow facing south-west 12 right. Drawn by
     the frame, a man hopped a third of the platform as he turned to shoot,
     and on the stone towers stood at a merlon beside the crenel his place
     is. Measured once per pose — the middle of the lowest rows' ink, the
     mean over the pose's frames, so the stance is anchored and the
     animation's own sway kept — as a share of the frame's width; a picture
     that cannot be read (a page from disk) keeps the frame's middle. Render
     state only, keyed by the frames themselves. */
  _feet: new WeakMap(),
  _fc: null,
  feetAt(u, img) {
    const fr = R.sheetFrames ? R.sheetFrames(u) : null;
    const key = fr && fr.indexOf(img) >= 0 ? fr : img;
    let v = this._feet.get(key);
    if (v !== undefined) return v;
    v = 0.5;
    try {
      const c = this._fc || (this._fc = document.createElement('canvas'));
      const q = c.getContext('2d', { willReadFrequently: true });
      let sum = 0, n = 0;
      for (const im of key === img ? [img] : key) {
        const w = im.width, h = im.height;
        if (!w || !h) continue;
        if (c.width < w || c.height < h) { c.width = Math.max(c.width, w); c.height = Math.max(c.height, h); }
        q.clearRect(0, 0, w, h);
        q.drawImage(im, 0, 0);
        const d = q.getImageData(0, 0, w, h).data;
        let top = -1, bot = -1;
        for (let y = 0; y < h && top < 0; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 128) { top = y; break; }
        for (let y = h - 1; y >= 0 && bot < 0; y--) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 128) { bot = y; break; }
        if (top < 0) continue;
        let sx = 0, m = 0;
        for (let y = Math.floor(bot - (bot - top) * 0.12); y <= bot; y++)
          for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 128) { sx += x; m++; }
        if (m) { sum += (sx / m + 0.5) / w; n++; }
      }
      if (n) v = sum / n;
    } catch (e) { v = 0.5; }
    this._feet.set(key, v);
    return v;
  },
  // the picture of a man up there: his frame and the box it is drawn in,
  // his feet on his place and his box's foot on the floor (a frame bigger
  // than the kind's box is a bigger picture on the same feet, R.frameBox)
  pic(u, s) {
    const img = R.unitSprite(u);
    if (!img) return null;
    const D = R.frameBox ? R.frameBox(u, img, s.B) : s.B;
    return { img, x: s.x - D * this.feetAt(u, img), y: s.top + s.B - D, D };
  },
  // the tower's drawn rect (world px) and the platform it carries
  frame(b) {
    const TL = CFG.TILE, bw = Bld.size(b) * TL, bx = b.x * TL, by = b.y * TL;
    const spr = R.wornSprite(b);
    if (!spr || !spr.width) return null;
    const r = spr._cfArt ? R.artRect(spr, bx, by, bw, bw) : { x: bx, y: by, w: bw, h: bw };
    const li = Math.min(b.level || 1, 3) - 1;
    let P = spr._cfArt ? (spr._cfArt.fort ? this.PLAT.wall : this.PLAT.free)[li] : null;
    if (P && (P.art[0] !== spr.width || P.art[1] !== spr.height)) P = null;
    return { spr, r, P, bx, by, bw };
  },
  // a profile's runs, parsed once: f[x] = the first row of column x in front
  _prof: new Map(),
  profile(P) {
    let f = this._prof.get(P.front);
    if (f) return f;
    f = [];
    for (const run of P.front.split(' ')) {
      const m = run.match(/^(\d+)(?:-(\d+))?:(\d+)$/);
      if (!m) continue;
      for (let x = +m[1]; x <= +(m[2] || m[1]); x++) f[x] = +m[3];
    }
    this._prof.set(P.front, f);
    return f;
  },
  /* what stands in front of a man up there, as a clip in the art's own
     pixels: every column from its front row down (a column not listed, from
     its top). draw() cuts the tower's OWN picture, drawn through it, out of
     the men — the same image in the same rect, so the edge of what hides
     him is the tower's own to the last bit (a copy on a canvas resamples a
     hair differently, and relaying the front over him laid the tower's
     edges twice). A battered or burning tower cuts with its own picture, so
     a broken rail shows the man behind it. Cached per profile; no pixel is
     read. */
  _clips: new Map(),
  _scr: null,                                        // the scratch layer the men are cut on (render state)
  frontClip(P, W, H, cut) {
    const key = (P ? P.front : 'proc:' + cut) + '|' + W + 'x' + H;
    let path = this._clips.get(key);
    if (path) return path;
    path = new Path2D();
    if (P) {
      const f = this.profile(P);
      for (let x = 0; x < W;) {
        const row = f[x] || 0;
        let x1 = x + 1;
        while (x1 < W && (f[x1] || 0) === row) x1++;
        path.rect(x, row, x1 - x, H - row);
        x = x1;
      }
    } else path.rect(0, cut, W, H - cut);
    this._clips.set(key, path);
    return path;
  },
  /* where a bow stands, world px: his x, the row his feet are on (y), the
     top of his head, the box he is drawn in (B, at `left`/`top`), and the
     front of the tower at his middle (`rail`: where his visible part ends) */
  spot(u, f) {
    const b = Bld.get(u.perch);
    f = f || (b && this.frame(b));
    if (!f) return null;
    const crew = S.units.filter(o => o.perch === u.perch);
    const { r, P } = f, Bd = this.BODY;
    let s, man, feet, x, rail;
    if (P) {
      s = r.w / f.spr.width;                             // world px per art px
      man = P.man * s; feet = r.y + P.feet * s;
      let ax = P.solo;
      if (crew.length > 1) ax = P.slots[this.slotOf(u, crew)];
      x = r.x + (ax + 0.5) * s;
      const pf = this.profile(P), col = Math.max(0, Math.min(f.spr.width - 1, Math.floor(ax)));
      rail = r.y + (pf[col] || P.feet) * s;
    } else {
      const C = this.PROC;
      man = C.man * r.w; feet = r.y + C.feet * r.w; rail = r.y + C.cy * r.h;
      x = r.x + r.w * (crew.length > 1 ? C.slots[this.slotOf(u, crew)] : C.solo);
    }
    const B = man / (Bd.foot - Bd.top);
    const top = feet - Bd.foot * B;
    return { x, y: feet, head: feet - man, rail: Math.min(rail, feet), B, left: x - B / 2, top, k: B / R.unitBox(u) };
  },
  // which of the two places is his: the one he took, else by who came first
  slotOf(u, crew) {
    const o = crew.find(c => c !== u);
    if (!o) return 0;
    if ((u.perchSlot === 0 || u.perchSlot === 1) && u.perchSlot !== o.perchSlot) return u.perchSlot;
    return u.id < o.id ? 0 : 1;
  },
  // where a tap or an arrow finds him: the middle of what shows over the rail
  aim(u) {
    const s = this.spot(u);
    return s && { x: s.x, y: (s.head + s.rail) / 2 };
  },
  // the arrow leaves from the bow's chest, up on the platform (tiles above u.y)
  shotLift(u) {
    const a = this.aim(u);
    if (!a) return 0.6;
    return Math.max(0.3, u.y - a.y / CFG.TILE);
  },
  /* drawn by the building pass right after the tower (and again by
     R._redrawPic, so a man walking behind the tower never lands over them):
     each bow whole at his place, then the tower's front laid back over them —
     only within their own pictures, never over what the pass laid after the
     tower (the hedge at its foot, the curtain's walk) */
  draw(g, b) {
    if (!S.units.length || b.key !== 'tower') return;
    let crew = null;
    for (const u of S.units) if (u.perch === b.id) (crew || (crew = [])).push(u);
    if (!crew) return;
    if (b.owner !== 'P' && !G.visibleAt(b.x, b.y)) return;
    const f = this.frame(b);
    if (!f) return;
    const TL = CFG.TILE, spots = [];
    for (const u of crew) { const s = this.spot(u, f); if (s) spots.push([u, s]); }
    spots.sort((p, q) => p[1].y - q[1].y || p[1].x - q[1].x);
    if (!spots.length) return;
    /* the men are drawn on a scratch layer at the world's own device pixels,
       the tower's front is cut out of them there, and what is left is laid
       over the tower — so the tower is drawn once, as ever, and nothing of it
       is laid twice (an edge laid twice darkens) */
    const pics = [];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [u, s] of spots) {
      const p = this.pic(u, s);
      if (!p) continue;
      const { img, x, y, D } = p;
      pics.push([img, x, y, D]);
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + D); y1 = Math.max(y1, y + D);
    }
    const m = g.getTransform();
    const dx0 = Math.floor(m.a * x0 + m.e) - 2, dy0 = Math.floor(m.d * y0 + m.f) - 2;
    const w = Math.ceil(m.a * x1 + m.e) + 2 - dx0, h = Math.ceil(m.d * y1 + m.f) + 2 - dy0;
    if (pics.length && w > 0 && h > 0 && w < 4096 && h < 4096) {
      const c = this._scr || (this._scr = document.createElement('canvas'));
      if (c.width < w) c.width = w;
      if (c.height < h) c.height = h;
      const q = c.getContext('2d');
      q.setTransform(1, 0, 0, 1, 0, 0);
      q.globalCompositeOperation = 'source-over';
      q.clearRect(0, 0, w + 1, h + 1);
      q.setTransform(m.a, m.b, m.c, m.d, m.e - dx0, m.f - dy0);
      for (const [img, x, y, D] of pics) {
        // a frame shrunk onto the platform is resampled, never decimated (R.blitBld's rule)
        const down = img.width > D * 1.02;
        q.imageSmoothingEnabled = down; if (down) q.imageSmoothingQuality = 'high';
        q.drawImage(img, x, y, D, D);
      }
      // the tower's front, cut out of them: its own picture, through its front's clip
      const W = f.spr.width, H = f.spr.height, k = f.r.w / W;
      q.save();
      q.globalCompositeOperation = 'destination-out';
      q.translate(f.r.x, f.r.y); q.scale(k, f.r.h / H);
      q.clip(this.frontClip(f.P, W, H, Math.round(this.PROC.cy * H)));
      q.scale(1 / k, H / f.r.h); q.translate(-f.r.x, -f.r.y);
      R.blitBld(q, f.spr, f.bx, f.by, f.bw, f.bw);
      q.restore();
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(c, 0, 0, w, h, dx0, dy0, w, h);
      g.restore();
    }
    // the selection ring rides the rail in front of him (at his feet it would
    // sit behind the parapet), a man wide; the health bar over his head, and
    // over the tower's own bar when that one is up too (by - 4, R.draw)
    const sel = UI.sel;
    const selIds = sel ? (sel.type === 'unit' ? [sel.id] : sel.type === 'group' ? sel.ids : null) : null;
    const towerBar = b.hp < b.maxhp ? f.by - 4 : Infinity;
    for (const [u, s] of spots) {
      if (selIds && selIds.indexOf(u.id) >= 0) {
        g.strokeStyle = '#e8c15a'; g.lineWidth = 1;
        g.beginPath(); g.ellipse(s.x, s.rail, 0.2 * s.B, 0.07 * s.B, 0, 0, Math.PI * 2); g.stroke();
      }
      if (u.hp < u.maxhp) {
        const w = Math.max(8, s.B * 0.62);
        let y = s.head - 3.5;
        if (y + 2 > towerBar - 0.5 && y < towerBar + 3.5) y = towerBar - 3;
        R.bar(g, s.x - w / 2, y, w, 2, u.hp / u.maxhp, u.owner === 'P' ? '#7dbb5e' : '#e06550');
      }
    }
  },
  // a tap at (wx, wy) — tiles — measured to the bow drawn on the platform, in
  // the units the tap contract's thresholds are written in (his own box)
  hit(u, wx, wy) {
    const s = this.spot(u);
    if (!s) return Infinity;
    const TL = CFG.TILE;
    return Math.hypot(s.x / TL - wx, (s.head + s.rail) / 2 / TL - wy) / Math.max(0.35, s.k);
  },

  /* ---- THE FALL (operator: "a sprite where they fall to their death off
     the tower and disappear when they hit the ground") ---- render state
     only, never in S: the body drops from its place on the platform to the
     foot of the tower, tumbling, gathering speed, and is gone in a puff of
     dust where it lands */
  falls: [],
  startFall(u) {
    const b = Bld.get(u.perch);
    const s = b && this.spot(u);
    if (!s) return;
    const TL = CFG.TILE, p = this.pic(u, s);
    if (!p) return;
    if (this.falls.length > 8) this.falls.shift();
    // from where he was drawn (his box's middle over its foot), at that size
    this.falls.push({
      x: p.x + p.D / 2, y0: p.y + p.D, y1: (b.y + 1) * TL + 3, t: 0, bx: b.x, by: b.y,
      spr: p.img, D: p.D,
      dir: (u.id & 1) ? 1 : -1, land: false,
    });
  },
  drawFalls(g, dt) {
    if (!this.falls.length) return;
    const T = this.cfg().fallS, P = 0.28;              // the fall, then the dust where they land
    for (let i = this.falls.length - 1; i >= 0; i--) {
      const f = this.falls[i];
      f.t += dt;
      if (f.t >= T + P) { this.falls.splice(i, 1); continue; }
      if (!G.visibleAt(f.bx, f.by)) continue;
      if (f.t < T) {
        const p = f.t / T, e = p * p;                   // gravity: slow off the edge, fast at the end
        const y = f.y0 + (f.y1 - f.y0) * e;
        const x = f.x + f.dir * 7 * p;                  // thrown a little clear of the wall
        const D = f.D * (1 + 0.25 * p);
        g.save();
        g.translate(x, y - D / 2);                      // the figure's middle over its box's foot
        g.rotate(f.dir * (0.4 + p * 2.6));              // tumbling
        g.drawImage(f.spr, -D / 2, -D / 2, D, D);
        g.restore();
      } else {
        const q = (f.t - T) / P, xg = f.x + f.dir * 7;
        g.fillStyle = 'rgba(150,128,96,' + (0.55 * (1 - q)).toFixed(3) + ')';
        for (let k = 0; k < 5; k++) {
          const ox = (k - 2) * (3 + q * 5), r = 2 + q * 2.5 - Math.abs(k - 2) * 0.5;
          g.beginPath(); g.ellipse(xg + ox, f.y1 - 1 - q * 2, r, r * 0.6, 0, 0, Math.PI * 2); g.fill();
        }
      }
    }
  },
  onWorldChange() { this.falls = []; },

  /* ---- the panels (ui.js asks these, guarded on the method) ---- */
  towerLine(b) {
    if (!this.isPost(b, 'P') && !this.crew(b).length) return '';
    const n = this.crew(b).length, cap = this.cfg().cap;
    return n ? `🏹 ${n}/${cap} archers on the lookout — twice the sight and reach`
      : 'Select archers, then tap the tower to man it';
  },
  towerButtons(b) {
    if (b.owner !== 'P') return '';
    const n = S.units.filter(u => u.perch === b.id || (u.climb && u.climb.up && u.climb.bid === b.id)).length;
    return n ? `<button class="abtn" data-act="lookoutdown">⬇ Archers down<small>${n} on the tower — a second on the stairs</small></button>` : '';
  },
  unitButton(u) {
    if (u.owner !== 'P' || !u.perch) return '';
    return `<button class="abtn" data-act="lookoutdown">⬇ Climb down<small>a second on the stairs</small></button>`;
  },
  workReport(u) {
    if (u.climb) return { icon: '🪜', what: u.climb.up ? 'Climbing the tower' : 'Climbing down', rate: null, working: false };
    if (u.perch) return { icon: '🏹', what: 'On the tower lookout', rate: null, working: true };
    if (u.task && u.task.type === 'mantower') return { icon: '🚶', what: 'Heading up the tower', rate: null, working: false };
    return null;
  },
};
window.Lookout = Lookout;
