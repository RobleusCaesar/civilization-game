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
  /* WHERE THEY STAND, per drawn tower, in fractions of the art: the
     parapet's top (`cy`) — below it the tower is laid back over the bows, so
     the front rail stands in front of their legs (BODY, below, puts half of
     each man over it) — and its middle (`px`) and half-width (`ph`) at that
     row, which the two men stand inside, each against his end. Measured off
     the shipped roofless art. */
  ANCHOR: {
    free: [{ cy: 48 / 114, px: 44 / 88, ph: 27 / 88 }, { cy: 48 / 116, px: 42 / 84, ph: 26 / 84 }, { cy: 13 / 113, px: 42.5 / 84, ph: 30.5 / 84 }],
    wall: [{ cy: 45 / 90, px: 34 / 68, ph: 27 / 68 }, { cy: 47 / 91, px: 29 / 58, ph: 26 / 58 }, { cy: 13 / 85, px: 33.5 / 65, ph: 30.5 / 65 }],
    proc: { cy: 0.20, px: 0.5, ph: 0.4 },
  },
  // how far in from the parapet's end a bow stands, in boxes: his outer
  // shoulder just over the end, as a man at the corner of a small lookout
  HALF_W: 0.17,
  anchorOf(spr, b) {
    const li = Math.min(b.level || 1, 3) - 1;
    if (!spr || !spr._cfArt) return this.ANCHOR.proc;
    return (spr._cfArt.fort ? this.ANCHOR.wall : this.ANCHOR.free)[li];
  },
  // the tower's drawn rect and its anchor (world px)
  frame(b) {
    const TL = CFG.TILE, bw = Bld.size(b) * TL, bx = b.x * TL, by = b.y * TL;
    const spr = R.wornSprite(b);
    if (!spr) return null;
    const r = spr._cfArt ? R.artRect(spr, bx, by, bw, bw) : { x: bx, y: by, w: bw, h: bw };
    return { spr, r, a: this.anchorOf(spr, b), bx, by, bw };
  },
  /* A BOW STANDS HALF ABOVE THE PARAPET (operator, build 146: "Archers are
     too small. They should be 50% bigger and look like they're standing on
     the platform, so half their body should be above the tower's protective
     fence"). The figure is drawn at `drawScale` (1 — half again the first
     cut's 0.66) and the parapet's top (the anchor's `cy`) cuts its body at
     `BODY.above` of its height: the head and chest over the rail, the legs
     behind it. A bow's frame fills its box from `BODY.top` to `BODY.foot`
     (measured off the shipped archer, longbow and marksman frames: 3 and 31
     px of 32), so the feet stand that far below the cut. */
  BODY: { top: 3 / 32, foot: 31 / 32, above: 0.5 },
  // a bow's place on the platform, world px: x, the feet (y), the parapet's
  // top (cut), the top of the head, the box's foot and the box itself
  spot(u, f) {
    const b = Bld.get(u.perch);
    f = f || (b && this.frame(b));
    if (!f) return null;
    const crew = S.units.filter(o => o.perch === u.perch).sort((p, q) => p.id - q.id);
    const n = crew.length, i = Math.max(0, crew.indexOf(u));
    const Bd = this.BODY, B = R.unitBox(u) * this.cfg().drawScale, body = (Bd.foot - Bd.top) * B;
    const mid = f.r.x + f.r.w * f.a.px, reach = f.r.w * f.a.ph;
    const off = n < 2 ? 0 : Math.max(0, reach - this.HALF_W * B) * (i === 0 ? -1 : 1);
    const cut = f.r.y + f.r.h * f.a.cy, y = cut + body * (1 - Bd.above);
    return { x: mid + off, y, cut, head: y - body, bot: y + (1 - Bd.foot) * B, B, l: mid - reach, r: mid + reach };
  },
  // where a tap or an arrow finds him: the middle of what shows over the rail
  aim(u) {
    const s = this.spot(u);
    return s && { x: s.x, y: (s.head + s.cut) / 2 };
  },
  // the arrow leaves from the bow's chest, up on the platform (tiles above u.y)
  shotLift(u) {
    const a = this.aim(u);
    if (!a) return 0.6;
    return Math.max(0.3, u.y - a.y / CFG.TILE);
  },
  /* drawn by the building pass right after the tower (and again by
     R._redrawPic, so a man walking behind the tower never lands over them):
     each bow at its slot, then the parapet laid back over its feet */
  draw(g, b) {
    if (!S.units.length || b.key !== 'tower') return;
    let crew = null;
    for (const u of S.units) if (u.perch === b.id) (crew || (crew = [])).push(u);
    if (!crew) return;
    if (b.owner !== 'P' && !G.visibleAt(b.x, b.y)) return;
    const f = this.frame(b);
    if (!f) return;
    const TL = CFG.TILE, k = this.cfg().drawScale;
    const cut = f.r.y + f.r.h * f.a.cy;
    let x0 = Infinity, x1 = -Infinity;
    const spots = [];
    for (const u of crew.sort((p, q) => p.id - q.id)) {
      const s = this.spot(u, f);
      const img = R.unitSprite(u);
      const D = R.frameBox(u, img, R.unitBox(u)) * k;
      // a man on the platform shows over the rail; below it nothing of him
      // reaches past the parapet's ends (a bow's leg hung beside the tower)
      g.save();
      g.beginPath();
      g.rect(s.x - D, s.bot - 2 * D, 2 * D, cut - (s.bot - 2 * D));
      g.rect(s.l, cut, s.r - s.l, s.bot - cut + 1);
      g.clip();
      g.drawImage(img, s.x - D / 2, s.bot - D, D, D);
      g.restore();
      x0 = Math.min(x0, s.x - D / 2); x1 = Math.max(x1, s.x + D / 2);
      spots.push([u, s]);
    }
    // the parapet in front of their legs: the tower again, below its top —
    // only over the band their legs were drawn in (the parapet's span, down
    // to their feet), never over what the building pass laid after the tower
    // (the hedge at its foot, the curtain's walk)
    if (x1 > x0 && spots.length) {
      const s0 = spots[0][1];
      let foot = cut;
      for (const [, s] of spots) foot = Math.max(foot, s.bot);
      g.save();
      g.beginPath(); g.rect(s0.l, cut, s0.r - s0.l, foot - cut + 1); g.clip();
      R.blitBld(g, f.spr, f.bx, f.by, f.bw, f.bw);
      g.restore();
    }
    // the selection ring rides the rail at his waist (at his feet it would sit
    // behind the parapet), and the health bar over his head
    const sel = UI.sel;
    const selIds = sel ? (sel.type === 'unit' ? [sel.id] : sel.type === 'group' ? sel.ids : null) : null;
    for (const [u, s] of spots) {
      if (selIds && selIds.indexOf(u.id) >= 0) {
        g.strokeStyle = '#e8c15a'; g.lineWidth = 1.2;
        g.beginPath(); g.ellipse(s.x, s.cut, 0.3 * s.B, 0.11 * s.B, 0, 0, Math.PI * 2); g.stroke();
      }
      if (u.hp < u.maxhp) R.bar(g, s.x - (TL - 16) / 2, s.head - 4, TL - 16, 2.5, u.hp / u.maxhp,
        u.owner === 'P' ? '#7dbb5e' : '#e06550');
    }
  },
  // a tap at (wx, wy) — tiles — measured to the bow drawn on the platform
  hit(u, wx, wy) {
    const a = this.aim(u);
    if (!a) return Infinity;
    const TL = CFG.TILE;
    return Math.hypot(a.x / TL - wx, a.y / TL - wy) / this.cfg().drawScale;
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
    const TL = CFG.TILE;
    if (this.falls.length > 8) this.falls.shift();
    this.falls.push({
      x: s.x, y0: s.bot, y1: (b.y + 1) * TL + 3, t: 0, bx: b.x, by: b.y,
      spr: R.unitSprite(u), D: R.frameBox(u, R.unitSprite(u), R.unitBox(u)) * this.cfg().drawScale,
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
