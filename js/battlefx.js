"use strict";
/* ============================ BATTLE FX ============================
   (build 160 — tests/battle-fx.mjs. Operator, 2026-11-07: "Add more sprites
   to fights so the animations are smoother… 1-2 unique fighting animations
   per fighter type… dying sprites… leave the bodies on the ground for a few
   seconds… very very mild blood… arrows sticking out of the ground when shots
   are missed… small craters where siege shots crash into the ground… tiny
   animations when they hit the ground… small explosions, if they're on
   fire… more pixels and sprites for siege shots, especially when they crash
   against buildings… increase the quality of the experience and look.")

   Everything here is a PICTURE of the fight the sim already resolves. Five
   rules hold it to that, the same five every effects layer in this game
   keeps:
   - RENDER STATE ONLY. Nothing is written to S and nothing rides a save; the
     pools are module state, cleared by R.onNewGame (the R.collapses rule).
   - NO RUN RNG. Every jitter is BattleFX.rnd (its own xorshift) or a hash of
     a position — a G.rand draw, or one from the shared Math.random stream the
     seeded contracts replay, would re-deal a seeded combat.
   - FOG-HONEST. A body, a stain, a crater or a burst is drawn only on ground
     the player can see right now (G.visibleAt) — a blow struck in the black
     is not written on the map.
   - NOTHING IN THE BLACK. Every pass is clipped to the board (R.clipBoard).
   - CAPPED. Every pool has a ceiling; a twenty-a-side melee is a scene, not
     a slideshow.

   THE STRIKE LANDS ON THE BLOW. A fight strip used to loop on the unit's own
   clock whatever the sim was doing, so the spear came out at random against
   the damage. Now the strip is read off the unit's attack cooldown (u.cd):
   the frame where the weapon connects — measured per strip and facing,
   STRIKE_AT below — is on screen the instant the blow is dealt, the frames
   before it are the wind-up, the ones after the follow-through, and a slow
   weapon (a longbow, a brute, an engine) holds its ready frame between blows.
   And a fighter with more than one strike (fight2 / fight3) picks one per
   blow, so a line of spearmen is not twelve copies of one loop.

   DEATH IS DRAWN. A fighter killed in battle plays its own `die` strip (the
   same character, generated for this build) and lies on its last frame for
   BODY_S seconds before it goes; a kind with no strip yet tips over from its
   own sprite. Hulls sink, engines break up, wild beasts go over before the
   carcass the hunting ground keeps. A little blood — a few dark specks where
   a blow lands, a small pool under the dead — and the arrows that missed
   stand in the ground; siege stones leave craters, burning ones burst. */

const BattleFX = {
  ON: true,                 // the kill switch: false draws nothing and changes no strike
  STRIKE_FPS: 12,           // a strike plays no slower than this (12 frames = the 1.0 s blow)
  DIE_FPS: 12,
  BODY_S: 7,                // a body lies this long…
  BODY_FADE_S: 0.8,         // …then fades out over this
  BODY_MAX: 48,
  STAIN_S: 12,              // blood specks and pools outlast the body a little
  STAIN_MAX: 90,
  ARROW_S: 9,               // a stuck arrow stands this long
  ARROW_MAX: 90,
  CRATER_S: 26,
  CRATER_MAX: 30,
  CHIP_MAX: 220,
  BURST_MAX: 24,
  FLASH_S: 0.11,            // the white hit flash
  SPATTER_GAP: 0.6,         // seconds between two spatters off one unit
  // the blood: dark, muted, never the bright berry red of the forage
  BLOOD: ['#3e1513', '#561a19', '#6c2422'],

  KICK_MAX: 40,              // hoof dust off a charging horse: a few puffs in the air at once
  KICK_S: 0.5,
  KICK_GAP: 0.11,            // seconds between two puffs off one horse

  bodies: [], stains: [], arrows: [], craters: [], chips: [], bursts: [], falls: [], kicks: [],
  _kick: new WeakMap(),      // horse -> { x, y, at } — where it was last frame, and its puff clock
  _hit: new WeakMap(),       // unit -> performance.now() of the last blow taken
  _spat: new WeakMap(),      // unit -> last spatter time
  _blow: new WeakMap(),      // unit -> { cd, n } — the blow counter the variants ride
  _white: new WeakMap(),     // frame -> its white silhouette
  _fall: new WeakMap(),      // frame -> procedural fall sheet
  _ink: new WeakMap(),       // frame -> ink bounding box (null when unreadable)
  _cache: {},

  reset() {
    this.bodies = []; this.stains = []; this.arrows = []; this.craters = [];
    this.chips = []; this.bursts = []; this.falls = []; this._bHit = new Map();
    this.kicks = []; this._kick = new WeakMap();
    this._hit = new WeakMap(); this._spat = new WeakMap(); this._blow = new WeakMap();
  },

  now() { return performance.now() / 1000; },
  /* THE PICTURE DRAWS ITS OWN DICE: every scatter here comes from this
     xorshift, never Math.random — the hooks run inside Units.update and
     Combat.update, and a draw count that hung on the wall clock (the spatter
     gap) or on what the player can see would shift the seeded contracts'
     shared stream (combat.js keeps an unused draw for that very stream). */
  _rs: 0x2545f491,
  rnd() { let x = this._rs | 0; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this._rs = x; return (x >>> 0) / 4294967296; },
  seen(x, y) { return typeof G !== 'undefined' && G.visibleAt && G.visibleAt(x | 0, y | 0); },
  hash(a, b, c) {
    let h = (a * 374761393 + b * 668265263 + (c || 0) * 2246822519) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  },
  // a living thing that bleeds (never a hull, an engine or a ghost)
  organic(u) {
    if (!u || u.spectral) return false;
    if (typeof Units !== 'undefined' && Units.isNaval && Units.isNaval(u)) return false;
    return !(u.kind === 'catapult' || u.kind === 'trebuchet' || u.kind === 'ballista' || u.kind === 'siegetower');
  },
  engine(u) { return u && (u.kind === 'catapult' || u.kind === 'trebuchet' || u.kind === 'ballista' || u.kind === 'siegetower'); },
  mounted(u) { return u && (u.kind === 'rider' || u.kind === 'lancer' || u.kind === 'horsearcher'); },

  /* ---------------- THE STRIKE LANDS ON THE BLOW ----------------
     STRIKE_AT[file key][pose][facing] = the 0-based frame where the weapon
     connects (the spear fully out, the blade home, the arrow leaving the
     bow, the arm of an engine at release). Measured off the shipped strips
     (the frame least like the ready stance) — each facing was generated on
     its own, so each keeps its own timing. A strip not in the table strikes
     at 55% of its length. */
  STRIKE_AT: {
    'archer': {"fight":[8,8,9,7,7,8,8,6],"fight2":[9,7,10,10,10,10,10,11]},
    'axeman': {"fight":[5,3,3,5,5,4,5,3],"fight2":[4,6,6,5,5,7,6,7],"fight3":[5,4,3,8,6,4,3,5]},
    'ballista': {"fight":[3,3,3,4,5,4,4,2]},
    'barb-broken-brute': {"fight":[6,7,9,6,4,6,9,7]},
    'barb-broken-raider-f': {"fight":[8,6,5,5,8,5,5,6]},
    'barb-broken-raider-m': {"fight":[7,5,8,6,7,6,8,5]},
    'barb-flint-brute': {"fight":[6,9,9,3,8,3,9,9]},
    'barb-flint-raider-f': {"fight":[7,3,6,4,3,4,6,3]},
    'barb-flint-raider-m': {"fight":[7,7,9,4,7,4,9,7]},
    'barb-sea-brute': {"fight":[9,7,3,5,9,5,3,7]},
    'barb-sea-raider-f': {"fight":[8,9,9,9,3,9,9,9]},
    'barb-sea-raider-m': {"fight":[8,9,7,7,6,7,7,9]},
    'barb-woad-brute': {"fight":[9,9,7,4,9,4,7,9]},
    'barb-woad-raider-f': {"fight":[5,7,8,6,7,6,8,7]},
    'barb-woad-raider-m': {"fight":[6,7,6,5,6,5,6,7]},
    'barb-wolf-brute': {"fight":[5,3,5,5,5,5,5,3],"fight2":[7,6,8,6,8,6,8,6]},
    'barb-wolf-raider-f': {"fight":[5,3,3,5,2,5,3,3],"fight2":[6,7,6,8,8,8,6,7]},
    'barb-wolf-raider-m': {"fight":[9,7,5,7,9,7,5,7],"fight2":[6,5,7,6,8,6,7,5]},
    'bear': {"fight":[5,4,5,4,5,4,4,4]},
    'bombard': {"fight":[4,6,3,4,3,3,3,2]},
    'catapult': {"fight":[5,4,4,6,2,3,3,7]},
    'defender': {"fight":[3,3,3,3,3,3,3,3],"fight2":[6,6,6,7,8,7,8,null],"fight3":[11,10,13,10,9,12,null,null]},
    'elite': {"fight":[4,5,5,5,5,3,3,5],"fight2":[6,6,7,7,7,7,7,8],"fight3":[3,9,7,8,8,null,10,10]},
    'fireship': {"fight":[5,7,7,7,7,6,7,6]},
    'horsearcher': {"fight":[7,7,7,7,5,7,7,7]},
    'lancer': {"fight":[5,6,6,6,2,5,5,4]},
    'longbow': {"fight":[10,9,9,10,8,9,8,9],"fight2":[12,10,null,11,12,10,12,12]},
    'marksman': {"fight":[7,7,7,8,9,9,9,8],"fight2":[9,11,10,11,9,7,11,12]},
    'rider': {"fight":[5,4,6,5,3,7,6,5]},
    'trebuchet': {"fight":[6,5,5,6,5,5,5,4]},
    'wolf': {"fight":[5,5,4,4,4,5,6,6]},
  },
  // the file key a unit's art came from (the table's key)
  fileKey(u, artKey) {
    if (!artKey) return u.kind;
    if (artKey.startsWith('barb-')) return artKey;
    const v = /^villager-[pa]-[a-z]+-(l\d-[mf])$/.exec(artKey);
    if (v) return 'villager-' + v[1];
    const s = /^sapper-[pa]-[a-z]+-(l\d)$/.exec(artKey);
    if (s) return 'sapper-' + s[1];
    return u.kind;
  },
  impactAt(fk, pose, face, n) {
    const t = this.STRIKE_AT[fk] && this.STRIKE_AT[fk][pose];
    // the table is in Assets.UNIT_DIRS8 order: a facing NAME is its column
    const i = typeof face === 'number' ? face : (window.Assets && Assets.UNIT_DIRS8 ? Assets.UNIT_DIRS8.indexOf(face) : -1);
    const k = t && i >= 0 && t[i] != null ? t[i] : Math.round(n * 0.55);
    return Math.max(1, Math.min(n - 1, k));
  },
  /* a character's battle strips are fetched the first time one of them is
     drawn (Assets.loadBattleArt, background tier) — asked by R.sheetFrames
     for every sheet unit, a Set lookup a frame once asked */
  _wanted: new Set(),
  want(u, artKey) {
    if (!this.ON || !artKey || this._wanted.has(artKey)) return;
    if (typeof Screens !== 'undefined' && Screens._demo) return;       // the title's demo world asks for nothing (and marks nothing asked)
    this._wanted.add(artKey);
    if (!window.Assets || !Assets.loadBattleArt || !Assets.unitArt || !Assets.unitArt[artKey]) { this._wanted.delete(artKey); return; }
    const fk = this.fileKey(u, artKey);
    if (!Assets.BATTLE_ART[fk]) return;
    // a dyed key carries its tunic (the village's colour, swapped once at install)
    const dyed = artKey !== fk && !artKey.startsWith('barb-');
    const tunic = dyed && typeof G !== 'undefined' && G.tunicOf ? G.tunicOf(u.owner) : undefined;
    Assets.loadBattleArt(artKey, fk, tunic);
  },
  // who strikes in time with the sim (people, cavalry, engines, hulls) — never
  // the wild (the Animal Strife drives its own tempo) or a bow on a platform's variants
  synced(u) {
    if (!this.ON || !u || u.strife) return false;
    if (u.owner === 'W') return false;
    if (window.Assets && Assets.UNIT_ART && Assets.UNIT_ART[u.kind] &&
        !(typeof Units !== 'undefined' && Units.isNaval && Units.isNaval(u))) return false;   // the beasts
    return !!(CFG.UNITS[u.kind] && CFG.UNITS[u.kind].atk);
  },
  cdOf(u) { return CFG.ATTACK_COOLDOWN * ((CFG.UNITS[u.kind] && CFG.UNITS[u.kind].cdMult) || 1); },
  /* the blow counter: a cooldown that jumped UP is a blow just dealt. Each
     blow remembers the strike it was dealt with (`cur`), and the one being
     wound up for the next (`next`) is chosen once, never equal to `cur` —
     so a fighter never throws the same strike twice running, and the strike
     seen winding up is the one that lands. */
  blowOf(u) {
    let b = this._blow.get(u);
    if (!b) { b = { cd: u.cd || 0, n: (u.id * 7) % 5, cur: -1, next: -1, prev: -1 }; this._blow.set(u, b); return b; }
    if ((u.cd || 0) > b.cd + 0.02) { b.n++; b.prev = b.cur; b.cur = b.next; b.next = -1; }
    b.cd = u.cd || 0;
    return b;
  },
  blowN(u) { return this.blowOf(u).n; },
  _choose(u, b, L, prev) {
    let i = (this.hash(u.id, b.n, 11) * L) | 0;
    if (prev >= 0 && L > 1 && i === prev % L) i = (i + 1 + ((this.hash(u.id, b.n, 17) * (L - 1)) | 0)) % L;
    return i;
  },
  /* called by R.sheetFrames for a fight/guard pose: chooses this blow's strike
     among the facing's strips and remembers its impact frame for unitSprite.
     Returns the frames to play. */
  pickStrike(u, d, fr, pose, face, artKey) {
    if (!this.synced(u)) return { fr, k: null };
    const opts = [];
    if (pose === 'fight') {
      if (d.fight) opts.push(['fight', d.fight]);
      if (!u.perch) {                       // a bow on a platform keeps the strip the fence was fitted to
        if (d.fight2) opts.push(['fight2', d.fight2]);
        if (d.fight3) opts.push(['fight3', d.fight3]);
      }
    }
    if (!opts.length) opts.push([pose, fr]);
    let o = opts[0], wind = false;
    const b = this.blowOf(u);
    if (opts.length > 1) {
      const L = opts.length;
      if (b.cur < 0) b.cur = this._choose(u, b, L, b.prev);
      // the strike being WOUND UP belongs to the next blow
      const cd = this.cdOf(u), s = Math.max(0, cd - Math.max(0, u.cd || 0));
      const first = opts[b.cur % L][1].length;
      const tail = (first - this.impactAt(this.fileKey(u, artKey), opts[b.cur % L][0], face, first)) / Math.max(this.STRIKE_FPS, first / cd);
      if (s > tail || !(u.cd > 0)) {
        if (b.next < 0) { b.n++; b.next = this._choose(u, b, L, b.cur); b.n--; }
        o = opts[b.next % L]; wind = true;
      } else o = opts[b.cur % L];
    }
    if (!o[1] || !o[1].length) return { fr, k: null };
    return { fr: o[1], k: this.impactAt(this.fileKey(u, artKey), o[0], face, o[1].length), wind };
  },
  /* the frame of a synced strike: the impact frame k on the blow itself, the
     follow-through after it, the wind-up of the next before it, and the
     ready frame between (a slow weapon). Coiled (k-1) while the cooldown is
     spent and no blow has come — the moment before it lands. */
  strikeIndex(u, n, k, wind) {
    const cd = this.cdOf(u);
    if (!(u.cd > 0)) return Math.max(0, k - 1);
    const fps = Math.max(this.STRIKE_FPS, n / cd);
    // the NEXT strike winding up (pickStrike's switch): only its frames before
    // the blow, timed to the blow — never the follow-through of a strike not yet thrown
    if (wind) return Math.max(0, Math.min(k - 1, Math.floor(k - u.cd * fps)));
    const s = Math.max(0, cd - u.cd);
    const f = k + s * fps;
    if (f < n) return f | 0;
    const tw = s - (cd - k / fps);
    if (tw >= 0) return Math.min(k - 1, (tw * fps) | 0);
    return 0;
  },

  /* ---------------- A BLOW LANDS ----------------
     From Units.damage, before the death check: the hit flash, and — on a
     living thing the player can see — a few dark specks off the wound. */
  onHit(u, amt, attacker) {
    if (!this.ON || !u) return;
    // the first blow of a fight asks for the crater pictures (four small
    // files), so the first stone to land digs the drawn crater, not the stand-in
    if (!this._craterWarm && !(typeof Screens !== 'undefined' && Screens._demo)) { this._craterWarm = 1; for (const k of ['s', 'l']) for (const f of [0, 1]) this.craterPic({ big: k === 'l', fire: f, r: 0.3, v: 0 }); }
    const t = this.now();
    this._hit.set(u, t);
    if (!this.organic(u) || u.perch || u.climb || !this.seen(u.x, u.y)) return;
    const last = this._spat.get(u);
    if (last != null && t - last < this.SPATTER_GAP) return;
    this._spat.set(u, t);
    const at = this.drawnAt(u);
    let dx = 0, dy = 0;
    if (attacker) { dx = u.x - attacker.x; dy = u.y - attacker.y; }
    const dl = Math.hypot(dx, dy) || 1;
    dx /= dl; dy /= dl;
    if (!attacker) { const a = this.rnd() * Math.PI * 2; dx = Math.cos(a); dy = Math.sin(a); }
    // VERY MILD (the operator's words): a speck or two off one blow in three —
    // a heavy blow (a brute's, an engine's) always marks the ground
    if (amt < 14 && this.rnd() > 0.34) return;
    const n = amt >= 14 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      if (this.chips.length >= this.CHIP_MAX) break;
      const sp = 0.7 + this.rnd() * 0.9, side = (this.rnd() - 0.5) * 0.9;
      this.chips.push({
        x: at.x + (this.rnd() - 0.5) * 0.12, y: at.y + 0.06, z: 0.42 + this.rnd() * 0.12,
        vx: (dx + -dy * side) * sp, vy: (dy + dx * side) * sp * 0.7, vz: 0.6 + this.rnd() * 0.9,
        g: 6.5, sz: this.rnd() < 0.4 ? 1.5 : 1, col: this.BLOOD[1 + (i % 2)], t: 0, life: 1.2,
        blood: true, rest: 0, bounce: 0,
      });
    }
  },
  flashOf(u) {
    const t = this._hit.get(u);
    if (t == null) return 0;
    const k = (this.now() - t) / this.FLASH_S;
    return k >= 1 ? 0 : 0.55 * (1 - k);
  },
  whiteOf(img) {
    let w = this._white.get(img);
    if (w) return w;
    w = document.createElement('canvas'); w.width = img.width; w.height = img.height;
    const g = w.getContext('2d');
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#fff6e8'; g.fillRect(0, 0, w.width, w.height);
    this._white.set(img, w);
    return w;
  },
  // drawn by the unit pass right over the sprite it just drew
  drawFlash(g, u, img, x, y, w, h) {
    const a = this.flashOf(u);
    if (a <= 0 || !img || !img.width) return;
    const ga = g.globalAlpha;
    g.globalAlpha = ga * a;
    g.drawImage(this.whiteOf(img), x, y, w, h);
    g.globalAlpha = ga;
  },

  /* ---------------- A FIGHTER FALLS ----------------
     From Units.damage's death branch, BEFORE the unit leaves S.units (its
     facing, frame and art key are read off it). */
  onDeath(u, attacker, attackerOwner) {
    if (!this.ON || !u || typeof R === 'undefined') return;
    // burnT is defined from the dragon's first breath on, and stays (at 0) once
    // it has run: a burned man is ash, never a body
    if (u.perch || u.climb || u.spectral || u.krakenTaken || u.burnT != null || u.dieT > 0) return;
    const at = this.drawnAt(u);
    if (!this.seen(at.x, at.y)) return;                // a death in the fog leaves nothing to find
    try {
      if (typeof Units !== 'undefined' && Units.isNaval && Units.isNaval(u)) return this.sink(u);
      const B = R.unitBox(u);
      const cur = R.unitSprite(u);
      const key = R._sheetKey, face = R._sheetFace || 's';
      const beast = !!(window.Assets && Assets.UNIT_ART && Assets.UNIT_ART[u.kind]);
      if (u.owner === 'W') {
        // a wild beast goes over before the carcass the hunting ground keeps
        if (this.falls.length >= 16) this.falls.shift();
        this.falls.push({ x: at.x, y: at.y, t: 0, sheet: this.fallSheet(cur, 'c'), B, D: R.frameBox(u, cur, B), flip: false, organic: true });
        return;
      }
      const ua = !beast && window.Assets && Assets.unitArt && key ? Assets.unitArt[key] : null;
      const d = ua && ua.dirs[face];
      let frames = d && d.die && d.die.length ? d.die : null;
      let base = null;
      if (ua) { const s = ua.dirs.s || ua.dirs[face]; base = s && ((s.walk && s.walk[0]) || (s.idle && s.idle[0])); }
      let proc = false, D;
      if (!frames) {
        // a band's beast or a war-wolf sinks onto its side as the wild do and lies
        // as a body (no carcass takes it over); a man tips about his heels, one way
        // or the other by his id — never his mirror, which would turn his face
        const mode = this.engine(u) ? 'e' : (beast || this.mounted(u)) ? 'c' : ((Math.imul(u.id | 0, 2654435761) >>> 15) & 1 ? 'pl' : 'p');
        frames = this.fallSheet(cur, mode); proc = true;
        // the size he was drawn at (a strike frame is a bigger box), on the same feet
        D = R.frameBox(u, cur, B) * frames[0].width / cur.width;
      } else D = base && base.width ? B * frames[0].width / base.width : B;
      if (this.bodies.length >= this.BODY_MAX) this.bodies.shift();
      const body = {
        x: at.x, y: at.y, t: 0, frames, B, D, proc, kind: u.kind, owner: u.owner,
        flip: false, organic: this.organic(u), engine: this.engine(u), mounted: this.mounted(u) || beast,
        seed: u.id, pooled: false, arrows: null,
      };
      // the arrow that killed him stays in him: a bow's, or a tower's volley
      // (Combat's tower loop says so) — never a star, a dragon or a stone
      const ak = attacker && CFG.UNITS[attacker.kind], vo = this._volley;
      if (body.organic && ((ak && ak.rng && !ak.proj) || (!attacker && vo))) {
        const dx = attacker ? u.x - attacker.x : (vo.x != null ? u.x - vo.x : 0.7),
          dy = attacker ? u.y - attacker.y : (vo.y != null ? u.y - vo.y : 0.4);
        body.arrows = [{ ang: Math.atan2(dy, dx), r1: this.rnd(), r2: this.rnd() }];
        if (this.rnd() < 0.35) body.arrows.push({ ang: Math.atan2(dy, dx) + 0.3, r1: this.rnd(), r2: this.rnd() });
      }
      this.bodies.push(body);
      if (body.engine) this.breakUp(u, B);
    } catch (e) { /* a picture that cannot be cut never takes the death down */ }
  },
  // where the unit is DRAWN: a builder or a soldier battering a wall leans to it
  drawnAt(u) {
    const lp = typeof R !== 'undefined' && R.workLean ? R.workLean(u) : null;
    return lp ? { x: lp.x, y: lp.y } : { x: u.x, y: u.y };
  },
  // a tower's volley in flight (set round its Units.damage by Combat): the arrows stay in the dead
  _volley: null,
  // a death the world takes back (a villager the Woadkin carry off is no body)
  forget(id) { this.bodies = this.bodies.filter(b => b.seed !== id); },
  // a wild fall still playing over this spot: the carcass waits for it
  falling(x, y) {
    for (const f of this.falls) if (Math.abs(f.x - x) < 0.01 && Math.abs(f.y - y) < 0.01) return true;
    return false;
  },
  /* the procedural fall for a kind with no `die` strip: cut from its own
     sprite, tipped about its heels until it lies there — and it STAYS lying
     (R.deathSheet fades out; a body holds). An engine sags and splays
     instead of tipping. */
  fallSheet(base, mode) {
    const key = mode || 'p', engine = key === 'e';
    let m = this._fall.get(base);
    if (m && m[key]) return m[key];
    if (!m) { m = {}; this._fall.set(base, m); }
    const N = 8, W0 = base.width, H0 = base.height, out = [];
    // a man tipped about his heels lies a body's length to one side: his frame
    // is a square TWICE his own, he stands at its bottom middle (the same feet,
    // R.frameBox's rule), and the size he is drawn at doubles with it
    const tip = key === 'p' || key === 'pl';
    const W = tip ? W0 * 2 : W0, H = tip ? H0 * 2 : H0, ox = (W - W0) / 2, oy = H - H0;
    const pivX = W0 * 0.5, pivY = H0 * 0.86;           // in the man's own frame
    for (let i = 0; i < N; i++) {
      const p = i / (N - 1);
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
      g.save();
      g.translate(ox, oy);
      if (engine) {
        // the timbers give: it sags, leans and spreads as it breaks
        const sq = 1 - 0.42 * Math.min(1, p * 1.3);
        g.translate(pivX, pivY); g.rotate(0.12 * Math.min(1, p * 1.5)); g.scale(1 + 0.12 * p, sq); g.translate(-pivX, -pivY);
        g.drawImage(base, 0, 0);
        g.globalCompositeOperation = 'source-atop';
        g.fillStyle = 'rgba(20,14,8,' + (0.5 * p) + ')'; g.fillRect(0, 0, W0, H0);
      } else if (key === 'c') {
        // a horse goes down where it stood: it buckles, sinks onto its side
        // and lies there (tipped about its hooves it stood on its haunches)
        const q = Math.min(1, Math.pow(p / 0.85, 1.6));
        g.translate(pivX, pivY); g.rotate((p < 0.3 ? -0.06 : 0.1) * Math.min(1, q * 1.5)); g.scale(1 + 0.1 * q, 1 - 0.5 * q); g.translate(-pivX, -pivY);
        g.drawImage(base, 0, 0);
      } else {
        const ang = (key === 'pl' ? -1.5 : 1.5) * Math.min(1, Math.pow(p / 0.8, 1.8));
        g.translate(pivX, pivY); g.rotate(ang); g.translate(-pivX, -pivY);
        g.drawImage(base, 0, Math.round((W0 / 32) * 2 * Math.sin(Math.min(1, p / 0.8) * Math.PI)));
      }
      g.restore();
      out.push(c);
    }
    m[key] = out;
    return out;
  },
  /* a hull goes down: it lists, settles and slides under its own waterline,
     the sea closing over it in rings, a few planks left drifting */
  sink(u) {
    const B = R.unitBox(u), spr = R.unitSprite(u);
    if (this.bodies.length >= this.BODY_MAX) this.bodies.shift();
    this.bodies.push({ x: u.x, y: u.y, t: 0, sink: true, spr, B, D: R.frameBox(u, spr, B), seed: u.id, flip: (u.id & 1) === 1 });
    for (let i = 0; i < 7 && this.chips.length < this.CHIP_MAX; i++) {
      const a = this.rnd() * Math.PI * 2, s = 0.3 + this.rnd() * 0.6;
      this.chips.push({ x: u.x, y: u.y, z: 0.2, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6, vz: 0.6 + this.rnd() * 0.6,
        g: 5, sz: 2, len: 3 + (this.rnd() * 3 | 0), col: ART.PALETTE.wood[1 + (i % 2)], t: 0, life: 6, float: true, rest: 0, bounce: 0 });
    }
  },
  // an engine breaks up: timbers thrown, a crack of splinters, smoke
  breakUp(u, B) {
    const W = ART.PALETTE.wood;
    for (let i = 0; i < 14 && this.chips.length < this.CHIP_MAX; i++) {
      const a = -Math.PI * this.rnd(), s = 0.8 + this.rnd() * 1.6;
      this.chips.push({ x: u.x + (this.rnd() - 0.5) * 0.4, y: u.y, z: 0.3 + this.rnd() * 0.3,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.5, vz: 1 + this.rnd() * 1.6, g: 7,
        sz: 1.5, len: 2 + (this.rnd() * 4 | 0), col: W[1 + (i % 3)], t: 0, life: 6, rest: 0, bounce: 0, spin: this.rnd() * 6 });
    }
    this.burst(u.x, u.y - 0.2, 'dust', 1.1);
  },

  /* ---------------- AN ARROW LANDS ----------------
     From Combat's shot expiry: a fumbled shaft stands in the ground where it
     overshot (a splash on water), and one loosed at a building sticks in its
     face for a few seconds. */
  arrowLanded(s) {
    if (!this.ON || !s || s.fire) return;
    const wet = this.wetAt(s.x2, s.y2);
    if (s.miss) {
      if (!this.seen(s.x2, s.y2)) return;
      if (wet) { this.burst(s.x2, s.y2, 'ripple', 0.5); return; }
      if (this.onBld(s.x2, s.y2)) return;              // a shaft never stands on a roof
      if (this.arrows.length >= this.ARROW_MAX) this.arrows.shift();
      this.arrows.push({ x: s.x2, y: s.y2, ang: Math.atan2(s.y2 - s.y1, s.x2 - s.x1), t: 0, life: this.ARROW_S, seed: this.rnd() });
      return;
    }
    if (s.bld) {
      const b = Bld.get(s.bld);
      if (!b || !this.seen(Bld.cx(b), Bld.cy(b))) return;
      const sz = Bld.size(b);
      if (this.arrows.length >= this.ARROW_MAX) this.arrows.shift();
      this.arrows.push({ x: Bld.cx(b) + (this.rnd() - 0.5) * sz * 0.7, y: b.y + sz - 0.08, bid: b.id,
        lift: 0.15 + this.rnd() * 0.45 * sz, ang: Math.atan2(s.y2 - s.y1, s.x2 - s.x1), t: 0, life: 5, wall: true, seed: this.rnd() });
    }
  },
  // a building's footprint (its art is drawn under the ground layer's marks)
  onBld(x, y) { return typeof Bld !== 'undefined' && !!Bld.at(x | 0, y | 0); },
  wetAt(x, y) {
    if (typeof S === 'undefined' || !S.map) return false;
    if (!MapGen.inB(x | 0, y | 0)) return false;
    // a bridge's deck, or a lowered drawbridge's, is dry ground for a stone or a shaft
    if (typeof Bld !== 'undefined' && ((Bld.bridgeAt && Bld.bridgeAt(x | 0, y | 0)) || (Bld.deckAt && Bld.deckAt(x | 0, y | 0)))) return false;
    const t = S.map.terrain[MapGen.idx(x | 0, y | 0)];
    return t === T.WATER || t === T.MOAT;
  },

  /* ---------------- A SIEGE SHOT LANDS ----------------
     From Combat.impact, beside the dust R.impact already throws. A stone into
     the ground digs a crater and throws clods; a burning ball bursts into a
     small explosion and scorches its crater; a shot into a building smashes
     against its FACE, throws chips of what it is built of, and the building
     flinches (bldJolt / drawBldFlash). A ballista's bolt is left alone (the operator: not needed). */
  siegeLanded(p, b) {
    if (!this.ON || !p || p.kind === 'bolt') return;
    const fire = p.kind === 'flame', big = p.fx === 'firestorm' || p.fx === 'blast';
    if (b) return this.hitBuilding(b, p, fire, big);
    const x = p.x2, y = p.y2;
    if (!this.seen(x, y)) return;
    if (this.wetAt(x, y)) { this.burst(x, y, 'splash', big ? 1.3 : 1); return; }
    const scar = !this.onBld(x, y);                    // over a plot or a site: dust and clods, no crater on its art
    if (scar) {
      if (this.craters.length >= this.CRATER_MAX) this.craters.shift();
      this.craters.push({ x, y, t: 0, r: big ? 0.42 : 0.3, big, fire: fire || p.fx === 'blast', v: (this.rnd() * 3) | 0, flip: this.rnd() < 0.5 });
    }
    this.burst(x, y, 'crown', big ? 1.3 : 1);
    if (fire || p.fx === 'blast') this.burst(x, y - 0.1, 'boom', big ? 1.25 : 0.8);
    this.clods(x, y, big ? 12 : 8);
  },
  hitBuilding(b, p, fire, big) {
    const sz = Bld.size(b);
    // the face: somewhere across the front of the building, part way up it
    const hx = Bld.cx(b) + (this.rnd() - 0.5) * sz * 0.55;
    const hy = b.y + sz - 0.18;
    const lift = 0.2 + this.rnd() * Math.min(0.9, 0.35 * sz + 0.2);
    if (!this.seen(hx, hy - 0.5)) return;
    const mat = this.material(b);
    const n = big ? 18 : 13;
    for (let i = 0; i < n && this.chips.length < this.CHIP_MAX; i++) {
      const a = Math.PI * (0.15 + this.rnd() * 0.7);   // out of the face, toward the viewer
      const s = 0.8 + this.rnd() * 1.9;
      const piece = mat[(this.rnd() * mat.length) | 0];
      this.chips.push({ x: hx + (this.rnd() - 0.5) * 0.2, y: hy + 0.04, z: lift,
        vx: Math.cos(a) * s * (this.rnd() < 0.5 ? -1 : 1), vy: Math.sin(a) * s * 0.45, vz: 0.4 + this.rnd() * 1.4,
        g: 7.5, sz: piece.sz, len: piece.len || 0, col: piece.col, t: 0, life: 4.5, rest: 0, bounce: 0, spin: this.rnd() * 6 });
    }
    this.burst(hx, hy - lift, 'smash', big ? 1.25 : 1);
    if (fire || p.fx === 'blast') this.burst(hx, hy - lift, 'boom', big ? 1.15 : 0.75);
    // the building itself takes the blow: a white flinch and a one-pixel jolt
    this._bHit.set(b.id, { t: this.now(), dir: hx < Bld.cx(b) ? 1 : -1 });
  },
  /* THE STRUCK BUILDING FLINCHES (asked by R.draw's building pass around the
     finished sprite's one blit): for BHIT_S after a siege stone lands it is
     shoved a world pixel away from the blow and back, and its own white
     silhouette flashes over it — the unit hit flash, on stone and timber. */
  BHIT_S: 0.16,
  _bHit: new Map(),
  bldJolt(b) {
    if (!this.ON || !this._bHit.size) return 0;
    const h = this._bHit.get(b.id);
    if (!h) return 0;
    const k = (this.now() - h.t) / this.BHIT_S;
    if (k >= 1) { this._bHit.delete(b.id); return 0; }
    return k < 0.45 ? h.dir : 0;
  },
  drawBldFlash(g, b, spr, x, y, w) {
    if (!this.ON || !this._bHit.size || !spr || !spr.width) return;
    const h = this._bHit.get(b.id);
    if (!h) return;
    const k = (this.now() - h.t) / this.BHIT_S;
    if (k >= 1) return;
    const r = spr._cfArt ? R.artRect(spr, x, y, w, w) : { x, y, w, h: w };
    const ga = g.globalAlpha;
    g.globalAlpha = ga * 0.55 * (1 - k);
    g.drawImage(this.whiteOf(spr), r.x, r.y, r.w, r.h);
    g.globalAlpha = ga;
  },
  // what a building is made of, by kind and storey: the chips it throws
  material(b) {
    const P = ART.PALETTE, lv = b.level || 1;
    const stone = [{ col: P.stone[1], sz: 2.5 }, { col: P.stone[2], sz: 3 }, { col: P.stone[3], sz: 2 }, { col: P.stone[1], sz: 2 }];
    const wood = [{ col: P.wood[1], sz: 1.5, len: 4 }, { col: P.wood[2], sz: 1.5, len: 5 }, { col: P.wood[3], sz: 1.5, len: 3 }];
    const thatch = [{ col: P.thatch[1], sz: 1, len: 4 }, { col: P.thatch[2], sz: 1, len: 3 }, { col: P.thatch[3] || P.thatch[2], sz: 1, len: 3 }];
    if (b.key === 'wall' || b.key === 'gate' || b.key === 'tower') return lv >= 2 ? stone.concat(lv === 2 ? wood : []) : wood;
    if (lv >= 3) return stone.concat(wood.slice(0, 1));
    if (lv === 2) return wood.concat(stone.slice(0, 2));
    return wood.concat(thatch);
  },
  clods(x, y, n) {
    const S2 = ART.PALETTE.soil;
    for (let i = 0; i < n && this.chips.length < this.CHIP_MAX; i++) {
      const a = this.rnd() * Math.PI * 2, s = 0.6 + this.rnd() * 1.5;
      this.chips.push({ x, y, z: 0.05, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6, vz: 1 + this.rnd() * 1.6,
        g: 8, sz: 1.5 + this.rnd(), col: S2[(this.rnd() * 3) | 0], t: 0, life: 3.2, rest: 0, bounce: 0 });
    }
  },
  burst(x, y, kind, scale) {
    if (this.bursts.length >= this.BURST_MAX) this.bursts.shift();
    this.bursts.push({ x, y, kind, s: scale || 1, t: 0, seed: this.rnd() });
  },

  /* ---------------- THE FRAME ----------------
     beginFrame advances every pool once; drawGround lays the stains and
     craters under everyone; flush(y) is asked by the unit pass at each unit's
     feet and draws the bodies and stuck arrows standing north of them (so a
     man in front of a body is in front of it); drawAir throws the chips and
     the bursts over the fight. */
  beginFrame(dt) {
    if (!this.ON) return;
    if (typeof S !== 'undefined' && S.paused) dt = 0;
    dt = Math.min(0.1, dt || 0);
    const kill = (arr, life) => {
      for (let i = arr.length - 1; i >= 0; i--) { arr[i].t += dt; if (arr[i].t >= (arr[i].life || life)) arr.splice(i, 1); }
    };
    for (let i = this.bodies.length - 1; i >= 0; i--) {
      const b = this.bodies[i];
      b.t += dt;
      const life = b.sink ? 2.6 : this.dieDur(b) + this.BODY_S + this.BODY_FADE_S;
      if (b.t >= life) { this.bodies.splice(i, 1); continue; }
      // the pool spreads once the body is down
      if (b.organic && !b.pooled && b.t >= this.dieDur(b) * 0.75) {
        b.pooled = true;
        const at = this.torso(b);
        if (!this.seen(at.x, at.y) || this.wetAt(at.x, at.y) || this.onBld(at.x, at.y)) continue;
        if (this.stains.length >= this.STAIN_MAX) this.stains.shift();
        this.stains.push({ x: at.x + (this.hash(b.seed, 1) - 0.5) * 0.06, y: at.y, pool: true, r: 0.13 + this.hash(b.seed, 2) * 0.04,
          t: 0, life: this.BODY_S + this.BODY_FADE_S + 5, seed: b.seed });
      }
    }
    kill(this.stains, this.STAIN_S);
    kill(this.arrows, this.ARROW_S);
    if (this.arrows.length && typeof Bld !== 'undefined')
      this.arrows = this.arrows.filter(a => a.bid == null || Bld.get(a.bid));   // the wall fell: so do its shafts
    if (this._bHit.size) { const now = this.now(); for (const [id, h] of this._bHit) if (now - h.t > this.BHIT_S) this._bHit.delete(id); }
    kill(this.craters, this.CRATER_S);
    for (let i = this.falls.length - 1; i >= 0; i--) { this.falls[i].t += dt; if (this.falls[i].t >= 0.7) this.falls.splice(i, 1); }
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i]; b.t += dt;
      if (b.t >= this.BURST_LIFE[b.kind]) this.bursts.splice(i, 1);
    }
    this.kickTick(dt);
    for (let i = this.chips.length - 1; i >= 0; i--) {
      const c = this.chips[i];
      c.t += dt;
      if (c.t >= c.life) { this.chips.splice(i, 1); continue; }
      if (c.rest) continue;
      c.vz -= c.g * dt;
      c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
      if (c.spin) c.spin += dt * 9;
      if (c.z <= 0) {
        c.z = 0;
        if (c.blood) {                       // a drop lands: a speck on the ground
          if (this.seen(c.x, c.y) && !this.wetAt(c.x, c.y) && !this.onBld(c.x, c.y)) {
            if (this.stains.length >= this.STAIN_MAX) this.stains.shift();
            this.stains.push({ x: c.x, y: c.y, t: 0, life: this.STAIN_S, sz: c.sz, col: c.col });
          }
          this.chips.splice(i, 1); continue;
        }
        if (c.float || this.wetAt(c.x, c.y)) {
          c.float = true; c.vx *= 0.2; c.vy *= 0.2; c.vz = 0; c.rest = 0; c.g = 0;
          continue;
        }
        if (c.bounce < 1 && c.vz < -1.2) { c.bounce++; c.vz = -c.vz * 0.3; c.vx *= 0.5; c.vy *= 0.5; }
        else { c.rest = 1; c.vx = c.vy = c.vz = 0; c.spin = c.spin ? Math.round(c.spin) : 0; }
      }
    }
  },
  /* THE CHARGE RAISES DUST: a horse at the gallop with a mark to ride at
     (a unit or a building) kicks a puff of dry earth up behind its hooves
     every KICK_GAP seconds — what tells a charge from a canter. Where it
     was is a WeakMap (render state, never in S); on ground nobody sees, nothing. */
  kickTick(dt) {
    for (let i = this.kicks.length - 1; i >= 0; i--) { this.kicks[i].t += dt; if (this.kicks[i].t >= this.KICK_S) this.kicks.splice(i, 1); }
    if (!dt || typeof S === 'undefined' || !S.units) return;
    for (const u of S.units) {
      if (!this.mounted(u)) continue;
      const k = this._kick.get(u);
      if (!k) { this._kick.set(u, { x: u.x, y: u.y, at: 0 }); continue; }
      const dx = u.x - k.x, dy = u.y - k.y, d = Math.hypot(dx, dy);
      k.x = u.x; k.y = u.y; k.at += dt;
      if (d / dt < 1.5 || d > 1 || k.at < this.KICK_GAP) continue;     // a gallop (a jump is a teleport, not a stride)
      if (!(u.tUnit || u.tBld) || this.wetAt(u.x, u.y) || !this.seen(u.x, u.y)) continue;
      k.at = 0;
      if (this.kicks.length >= this.KICK_MAX) this.kicks.shift();
      this.kicks.push({ x: u.x - dx / d * 0.28 + (this.rnd() - 0.5) * 0.12, y: u.y - dy / d * 0.14 + 0.16,
        dx: -dx / d, dy: -dy / d, t: 0, seed: this.rnd() });
    }
  },
  dieDur(b) { return b.sink ? 2.6 : b.frames ? b.frames.length / this.DIE_FPS : 0.6; },
  /* where the body lies, in tiles: the middle of the last frame's ink, a
     little above its lowest row (the pool spreads under the torso, never
     off the head). A frame that cannot be read (a page from disk) is
     estimated: a tipped body lies about four tenths of its frame to the
     side its head fell, a drawn death about where it stood. */
  torso(b) {
    const TL = CFG.TILE, last = b.frames[b.frames.length - 1], D = b.D;
    const x0 = b.x * TL - D / 2, y0 = R.frameTop(b.y, b.B, D);
    const box = this.inkBox(last);
    if (box) {
      const sx = D / last.width;
      let px = x0 + (box.x0 + box.x1 + 1) / 2 * sx;
      if (b.flip) px = 2 * b.x * TL - px;
      const py = y0 + (box.y0 + (box.y1 - box.y0) * 0.9) * sx;
      return { x: px / TL, y: py / TL };
    }
    const side = b.proc && !b.mounted && !b.engine ? (b.flip ? -1 : 1) * 0.38 * D / TL : 0;
    return { x: b.x + side, y: b.y - 0.04 };
  },
  BURST_LIFE: { crown: 0.55, smash: 0.6, boom: 0.65, dust: 0.9, splash: 0.7, ripple: 0.8 },

  // the ground pass: blood specks and pools, craters — under everyone
  drawGround(g) {
    if (!this.ON || !(this.stains.length || this.craters.length || this.kicks.length)) return;
    const TL = CFG.TILE;
    R.clipBoard(g, () => {
      for (const c of this.craters) {
        if (!this.seen(c.x, c.y)) continue;
        const img = this.craterPic(c);
        const a = Math.min(1, c.t * 8) * (c.t > this.CRATER_S - 4 ? (this.CRATER_S - c.t) / 4 : 1);
        g.globalAlpha = a;
        const w = img.width / 2, h = img.height / 2;
        if (c.flip) { g.save(); g.translate(c.x * TL, 0); g.scale(-1, 1); g.translate(-c.x * TL, 0); }
        g.drawImage(img, Math.round(c.x * TL - w / 2), Math.round(c.y * TL - h / 2), w, h);
        if (c.flip) g.restore();
        // a burning shot's crater glows for its first seconds
        if (c.fire && c.t < 5) {
          const now = performance.now() / 160;
          const E = ART.PALETTE.fire;
          for (let i = 0; i < 6; i++) {
            const h1 = this.hash(i, c.v, 5), h2 = this.hash(i, c.v, 9);
            if (((now + i * 1.7) | 0) % 3 === 0) continue;
            g.globalAlpha = a * (1 - c.t / 5);
            g.fillStyle = E[(i % 2) + 1];
            g.fillRect(c.x * TL + (h1 - 0.5) * c.r * TL * 1.2, c.y * TL + (h2 - 0.5) * c.r * TL * 0.7, 1, 1);
          }
        }
      }
      // hoof dust: a few specks of dry earth thrown up and back, thinning
      const P = ART.PALETTE, KC = [P.soil[3], P.bone[1], P.soil[2]];
      for (const k of this.kicks) {
        if (!this.seen(k.x, k.y)) continue;
        const f = k.t / this.KICK_S, sn = (k.seed * 10000) | 0;
        for (let i = 0; i < 8; i++) {
          const h = this.hash(i, sn, 21), h2 = this.hash(i, sn, 22);
          const back = TL * (0.05 + 0.24 * Math.sqrt(f)) * (0.5 + h);
          const side = TL * (h2 - 0.5) * 0.22 * (0.4 + f);
          const up = TL * 0.18 * Math.sin(Math.min(1, f * 1.3) * Math.PI * 0.9) * (0.4 + h2);
          const x = k.x * TL + k.dx * back - k.dy * side, y = k.y * TL + k.dy * back * 0.5 + k.dx * side * 0.5 - up;
          const z = Math.max(1, Math.round((2.4 - 1.4 * f) * (0.6 + h)));
          g.globalAlpha = Math.max(0, 0.7 * (1 - f * f));
          g.fillStyle = KC[i % 3];
          g.fillRect(Math.round(x - z / 2), Math.round(y - z / 2), z, z);
        }
      }
      g.globalAlpha = 1;
      for (const s of this.stains) {
        if (!this.seen(s.x, s.y)) continue;
        const life = s.life || this.STAIN_S;
        const fade = s.t > life - 3 ? Math.max(0, (life - s.t) / 3) : 1;
        if (s.pool) {
          const grow = Math.min(1, s.t / 1.6);
          const img = this.poolArt(s.seed);
          const w = img.width / 2 * (s.r / 0.2) * (0.45 + 0.55 * grow), h = img.height / 2 * (s.r / 0.2) * (0.45 + 0.55 * grow);
          g.globalAlpha = 0.78 * fade;
          g.drawImage(img, s.x * TL - w / 2, s.y * TL - h / 2, w, h);
        } else {
          g.globalAlpha = 0.85 * fade;
          g.fillStyle = s.col || this.BLOOD[1];
          const z = s.sz || 1;
          g.fillRect(s.x * TL - z / 2, s.y * TL - z / 2, z, z * 0.8);
        }
      }
      g.globalAlpha = 1;
    });
  },
  // the y-sorted pass: bodies and stuck arrows, in the units' own order
  _order: null, _oi: 0,
  prepFlush() {
    if (!this.ON || !(this.bodies.length || this.arrows.length)) { this._order = null; return; }
    const o = [];
    for (const b of this.bodies) o.push(b);
    for (const a of this.arrows) o.push(a);
    o.sort((a, b) => a.y - b.y);
    this._order = o; this._oi = 0;
  },
  flush(g, uptoY) {
    const o = this._order;
    if (!o) return;
    while (this._oi < o.length && o[this._oi].y <= uptoY) {
      const e = o[this._oi++];
      if (e.frames || e.sink) {
        this.drawBody(g, e);
        // a body north of a wall, or in a gate's passage, lies behind it as a man would stand
        if (R.occludeByForts && this.seen(e.x, e.y)) R.occludeByForts(g, { x: e.x, y: e.y, kind: e.kind, owner: e.owner });
      } else this.drawArrow(g, e);
    }
  },
  drawBody(g, b) {
    const TL = CFG.TILE;
    if (!this.seen(b.x, b.y)) return;
    if (b.sink) return this.drawSink(g, b);
    const dur = this.dieDur(b);
    const f = Math.min(b.frames.length - 1, (b.t * this.DIE_FPS) | 0);
    const end = dur + this.BODY_S;
    const a = b.t > end ? Math.max(0, 1 - (b.t - end) / this.BODY_FADE_S) : 1;
    if (a <= 0) return;
    const img = b.frames[f];
    const D = b.D, x0 = b.x * TL - D / 2, y0 = R.frameTop(b.y, b.B, D);
    R.clipBoard(g, () => {
      g.globalAlpha = a;
      if (b.flip) { g.save(); g.translate(b.x * TL, 0); g.scale(-1, 1); g.translate(-b.x * TL, 0); }
      g.drawImage(img, x0, y0, D, D);
      if (b.flip) g.restore();
      // the arrows that killed him, once he is down
      if (b.arrows && b.t >= dur) {
        const box = this.inkBox(b.frames[b.frames.length - 1]);
        if (box) for (const ar of b.arrows) {
          const sx = D / img.width;
          let px = x0 + (box.x0 + (box.x1 - box.x0) * (0.25 + ar.r1 * 0.5)) * sx;
          if (b.flip) px = 2 * b.x * TL - px;
          const py = y0 + (box.y0 + (box.y1 - box.y0) * (0.2 + ar.r2 * 0.5)) * sx;
          this.shaft(g, px, py, ar.ang, 4.5);
        }
      }
      g.globalAlpha = 1;
    });
  },
  drawSink(g, b) {
    const TL = CFG.TILE, k = Math.min(1, b.t / 2.6);
    const D = b.D, x0 = b.x * TL - D / 2, y0 = R.frameTop(b.y, b.B, D);
    const drop = Math.pow(k, 1.6) * D * 0.62;
    const waterY = b.y * TL + TL * 0.32;          // the hull's own waterline
    R.clipBoard(g, () => {
      g.save();
      g.beginPath(); g.rect(x0 - D, y0 - D, D * 3, waterY - (y0 - D)); g.clip();
      g.translate(b.x * TL, waterY);
      g.rotate((b.flip ? -1 : 1) * 0.35 * Math.min(1, k * 1.4));
      g.translate(-b.x * TL, -waterY);
      g.drawImage(b.spr, x0, y0 + drop, D, D);
      g.restore();
      // the sea closing over it: rings of foam, spreading
      for (let i = 0; i < 3; i++) {
        const kk = (k * 1.4 - i * 0.22);
        if (kk <= 0 || kk >= 1) continue;
        g.globalAlpha = 0.55 * (1 - kk);
        g.strokeStyle = '#dceef4'; g.lineWidth = 1;
        const rr = TL * (0.25 + kk * 0.7);
        g.beginPath(); g.ellipse(b.x * TL, waterY, rr, rr * 0.4, 0, 0, Math.PI * 2); g.stroke();
      }
      g.globalAlpha = 1;
    });
  },
  drawArrow(g, a) {
    const TL = CFG.TILE;
    if (!this.seen(a.x, a.y)) return;
    const life = a.life || this.ARROW_S;
    const al = a.t > life - 1.5 ? Math.max(0, (life - a.t) / 1.5) : 1;
    R.clipBoard(g, () => {
      g.globalAlpha = al;
      const px = a.x * TL, py = a.y * TL - (a.lift || 0) * TL;
      if (!a.wall) {                                  // a little lip of earth where it went in
        g.fillStyle = ART.PALETTE.soil[0];
        g.fillRect(px - 1, py, 2, 1);
      }
      this.shaft(g, px, py, a.ang, a.wall ? 4 : 5.5);
      g.globalAlpha = 1;
    });
  },
  /* one arrow stuck in something, tip buried at (px,py): the shaft leans back
     the way it came and up out of the ground, a pale fletch at its end —
     drawn a world pixel at a time so it reads as pixel art, not a vector */
  shaft(g, px, py, ang, len) {
    const back = ang + Math.PI;
    const ux = Math.cos(back), uy = Math.sin(back) * 0.55 - 0.75;
    const ul = Math.hypot(ux, uy) || 1;
    const dx = ux / ul, dy = uy / ul;
    const W = ART.PALETTE.wood;
    for (let i = 0; i <= len; i++) {
      g.fillStyle = i < 1 ? W[0] : W[2];
      g.fillRect(Math.round(px + dx * i) - 0.5, Math.round(py + dy * i) - 0.5, 1, 1);
    }
    g.fillStyle = ART.PALETTE.bone[2];
    g.fillRect(Math.round(px + dx * len) - 1, Math.round(py + dy * len) - 1, 2, 1);
    g.fillRect(Math.round(px + dx * (len - 1)) - 1, Math.round(py + dy * (len - 1)), 1, 1);
  },
  inkBox(img) {
    if (this._ink.has(img)) return this._ink.get(img);
    let box = null;
    try {
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const cg = c.getContext('2d', { willReadFrequently: true }); cg.drawImage(img, 0, 0);
      const d = cg.getImageData(0, 0, c.width, c.height).data;
      let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++)
        if (d[(y * c.width + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 >= 0) box = { x0, y0, x1, y1 };
    } catch (e) { box = null; }       // a tainted page (file://) keeps no arrows in its dead
    this._ink.set(img, box);
    return box;
  },
  // the air pass: the wild falls, the chips and the bursts, over everyone
  drawAir(g) {
    if (!this.ON) return;
    if (!(this.chips.length || this.bursts.length || this.falls.length)) return;
    const TL = CFG.TILE;
    R.clipBoard(g, () => {
      for (const f of this.falls) {
        if (!this.seen(f.x, f.y)) continue;
        const k = Math.min(1, f.t / 0.6), idx = Math.min(f.sheet.length - 1, (k * (f.sheet.length - 1)) | 0);
        const D = f.D, x0 = f.x * TL - D / 2, y0 = R.frameTop(f.y, f.B, D);
        if (f.flip) { g.save(); g.translate(f.x * TL, 0); g.scale(-1, 1); g.translate(-f.x * TL, 0); }
        g.drawImage(f.sheet[idx], x0, y0, D, D);
        if (f.flip) g.restore();
      }
      for (const c of this.chips) {
        if (!this.seen(c.x, c.y)) continue;
        const fade = c.t > c.life - 1 ? Math.max(0, c.life - c.t) : 1;
        g.globalAlpha = fade;
        g.fillStyle = c.col;
        const px = c.x * TL, py = (c.y - c.z) * TL;
        if (c.len) {
          // a splinter or a straw: a short stick, turning as it flies
          const a = c.spin || 0, ex = Math.cos(a) * c.len / 2, ey = Math.sin(a) * c.len / 2 * 0.6;
          const steps = Math.max(2, c.len);
          for (let i = 0; i <= steps; i++)
            g.fillRect(Math.round(px - ex + ex * 2 * i / steps), Math.round(py - ey + ey * 2 * i / steps), c.sz, c.sz);
        } else g.fillRect(px - c.sz / 2, py - c.sz / 2, c.sz, c.sz);
        if (c.z > 0.02 && !c.blood && c.sz >= 1.5) {      // a speck of shadow under what is still in the air
          g.globalAlpha = 0.25 * fade; g.fillStyle = '#1a140c';
          g.fillRect(px - c.sz / 2, c.y * TL, c.sz, 1);
        }
      }
      g.globalAlpha = 1;
      for (const b of this.bursts) {
        if (!this.seen(b.x, b.y)) continue;
        this.drawBurst(g, b);
      }
      g.globalAlpha = 1;
    });
  },
  /* the bursts are pixel art drawn a world pixel at a time from a hashed
     scatter — the world's dust stays pixel dust (the effects ruling keeps
     smooth light for the cards' acts; a thrown clod is a thing, not light) */
  drawBurst(g, b) {
    const TL = CFG.TILE, life = this.BURST_LIFE[b.kind], k = b.t / life;
    const px = b.x * TL, py = b.y * TL, s = b.s;
    const P = ART.PALETTE;
    const seedN = (b.seed * 10000) | 0;
    if (b.kind === 'crown' || b.kind === 'smash' || b.kind === 'dust') {
      // a crown of dust thrown up and out, rolling and thinning
      const n = b.kind === 'dust' ? 14 : 18;
      const col = b.kind === 'smash' ? [P.stone[3], P.bone[1], P.stone[2]] : [P.soil[3], P.bone[1], P.soil[2]];
      for (let i = 0; i < n; i++) {
        const h = this.hash(i, seedN, 1), h2 = this.hash(i, seedN, 2);
        const ang = (i / n) * Math.PI * 2 + h * 0.6;
        const rad = TL * s * (0.15 + 0.55 * Math.sqrt(k)) * (0.6 + 0.5 * h2);
        const rise = TL * s * (b.kind === 'smash' ? 0.25 : 0.32) * Math.sin(Math.min(1, k * 1.2) * Math.PI * 0.85) * (0.4 + h);
        const x = px + Math.cos(ang) * rad, y = py + Math.sin(ang) * rad * 0.45 - rise;
        const sz = Math.max(1, Math.round((2.6 - 1.6 * k) * s * (0.7 + h2)));
        g.globalAlpha = Math.max(0, 0.85 * (1 - k * k));
        g.fillStyle = col[i % 3];
        g.fillRect(Math.round(x - sz / 2), Math.round(y - sz / 2), sz, sz);
      }
      // the flash of the stone striking home, one beat
      if (b.kind !== 'dust' && k < 0.18) {
        g.globalAlpha = 0.9 * (1 - k / 0.18);
        g.fillStyle = '#fff1d0';
        const r = Math.round(2 + 3 * s);
        g.fillRect(Math.round(px - r), Math.round(py - 1), r * 2, 2);
        g.fillRect(Math.round(px - 1), Math.round(py - r * 0.7), 2, Math.round(r * 1.4));
      }
    } else if (b.kind === 'boom') {
      // a small fireball: a white-hot core, an orange body, licks of flame, then smoke
      const F = P.fire;
      const n = 22;
      for (let i = 0; i < n; i++) {
        const h = this.hash(i, seedN, 7), h2 = this.hash(i, seedN, 8);
        const ang = h * Math.PI * 2;
        const rad = TL * s * 0.42 * Math.pow(k, 0.55) * (0.3 + 0.7 * h2);
        const x = px + Math.cos(ang) * rad, y = py + Math.sin(ang) * rad * 0.7 - TL * s * 0.35 * k;
        const heat = 1 - k * 1.3 - h2 * 0.4;
        const col = heat > 0.6 ? F[3] : heat > 0.3 ? F[2] : heat > 0.0 ? F[1] : heat > -0.35 ? F[0] : (h > 0.5 ? '#4a423a' : '#5e564c');
        const sz = Math.max(1, Math.round((3.4 - 1.4 * k) * s * (0.6 + h)));
        g.globalAlpha = k > 0.7 ? Math.max(0, (1 - k) / 0.3) : 1;
        g.fillStyle = col;
        g.fillRect(Math.round(x - sz / 2), Math.round(y - sz / 2), sz, sz);
      }
      if (k < 0.2) {
        g.globalAlpha = 1 - k / 0.2;
        g.fillStyle = F[3];
        const r = Math.round(3 * s);
        g.fillRect(Math.round(px - r), Math.round(py - r), r * 2, r * 2);
      }
    } else if (b.kind === 'splash') {
      // a stone into the water: a column of spray and a ring
      for (let i = 0; i < 16; i++) {
        const h = this.hash(i, seedN, 3), h2 = this.hash(i, seedN, 4);
        const ang = (i / 16) * Math.PI * 2;
        const rad = TL * s * 0.35 * k * (0.5 + h);
        const up = TL * s * 0.6 * Math.sin(Math.min(1, k * 1.1) * Math.PI) * (0.3 + h2);
        g.globalAlpha = Math.max(0, 0.9 * (1 - k));
        g.fillStyle = i % 3 ? '#dceef4' : '#9fcfe0';
        g.fillRect(Math.round(px + Math.cos(ang) * rad), Math.round(py + Math.sin(ang) * rad * 0.4 - up), 2, 2);
      }
      g.globalAlpha = 0.5 * (1 - k);
      g.strokeStyle = '#dceef4'; g.lineWidth = 1;
      g.beginPath(); g.ellipse(px, py, TL * s * (0.2 + 0.5 * k), TL * s * (0.08 + 0.2 * k), 0, 0, Math.PI * 2); g.stroke();
    } else if (b.kind === 'ripple') {
      g.globalAlpha = 0.6 * (1 - k);
      g.strokeStyle = '#dceef4'; g.lineWidth = 1;
      g.beginPath(); g.ellipse(px, py, TL * (0.08 + 0.25 * k), TL * (0.03 + 0.1 * k), 0, 0, Math.PI * 2); g.stroke();
    }
    g.globalAlpha = 1;
  },

  /* ---------------- THE SIEGE SHOT IN FLIGHT ----------------
     A boulder is a pixel stone with its own light and shade, turning as it
     flies; a burning ball is that stone wrapped in fire with a tail of embers
     and smoke; a bombard's shell is a dark iron ball with a fuse spark.
     Returns false for a kind it does not draw (the bolt keeps its shaft). */
  drawProjectile(g, p, px, py, k) {
    if (!this.ON || p.kind === 'bolt') return false;
    const TL = CFG.TILE;
    const fire = p.kind === 'flame', shell = p.fx === 'blast', big = p.fx === 'firestorm';
    const size = shell ? 6 : fire ? (big ? 7 : 6) : 8;
    const spin = ((p.t * (shell ? 0 : 11)) | 0) % 4;
    const img = this.stoneArt(size, spin, shell);
    // the trail first
    if (fire) {
      /* a COMET of fire, not confetti: graded pixel discs strung back along
         the shot's true heading (the arc's own slope), white-hot at the
         head through yellow and orange to a dull red tail, each disc
         breathing a pixel on the burning-town beat; smoke rolls off behind */
      const F = ART.PALETTE.fire;
      const vx = p.x2 - p.x1, vy = (p.y2 - p.y1) - Math.cos(k * Math.PI) * Math.PI * p.arc;
      const vl = Math.hypot(vx, vy) || 1, ux = vx / vl, uy = vy / vl;
      const beat = (performance.now() / 60) | 0;
      for (let j = 3; j >= 1; j--) {                 // smoke first, under the fire
        const kk = Math.max(0, k - j * 0.06);
        const tx = (p.x1 + (p.x2 - p.x1) * kk) * TL, ty = (p.y1 + (p.y2 - p.y1) * kk - Math.sin(kk * Math.PI) * p.arc) * TL;
        g.globalAlpha = 0.42 - j * 0.09;
        g.fillStyle = j % 2 ? '#4e4740' : '#5f5850';
        this.disc(g, tx, ty - j * 1.5, (big ? 3.4 : 2.6) + j * 0.7);
      }
      g.globalAlpha = 1;
      const N = big ? 9 : 7, R0 = big ? 4 : 3.1, step = big ? 2 : 1.7;
      const ramp = [F[2], F[3], F[2], F[2], F[1], F[1], F[0], F[0], '#7a2e14', '#5a2410'];
      for (let i = N - 1; i >= 0; i--) {
        const f = i / N;
        const r = Math.max(0.6, R0 * Math.pow(1 - f, 0.75) + ((this.hash(beat, i, 3) * 3) | 0) * 0.5 - 0.5);
        const wob = (this.hash(beat, i, 5) - 0.5) * 1.2 * f;
        g.fillStyle = ramp[Math.min(ramp.length - 1, Math.round(f * (ramp.length - 1)))];
        this.disc(g, px - ux * i * step - uy * wob * 2, py - uy * i * step + ux * wob * 2, r);
      }
      // sparks flicked off the tail
      for (let i = 0; i < 3; i++) {
        const h = this.hash(beat, i, 9);
        if (h < 0.4) continue;
        const d = (N * step) * (0.6 + h * 0.6), side = (this.hash(beat, i, 13) - 0.5) * 6;
        g.fillStyle = F[(i % 2) + 2];
        g.fillRect(Math.round(px - ux * d - uy * side), Math.round(py - uy * d + ux * side), 1, 1);
      }
    } else if (shell) {
      // the fuse spark trailing a line of thin smoke
      for (let j = 1; j <= 4; j++) {
        const kk = Math.max(0, k - j * 0.04);
        const tx = (p.x1 + (p.x2 - p.x1) * kk) * TL, ty = (p.y1 + (p.y2 - p.y1) * kk - Math.sin(kk * Math.PI) * p.arc) * TL;
        g.globalAlpha = 0.45 - j * 0.08; g.fillStyle = '#8a8276';
        g.fillRect(Math.round(tx - 1), Math.round(ty - 1), 2, 2);
      }
      g.globalAlpha = 1;
    } else {
      // a faint streak of dust off a heavy stone
      const kk = Math.max(0, k - 0.05);
      const tx = (p.x1 + (p.x2 - p.x1) * kk) * TL, ty = (p.y1 + (p.y2 - p.y1) * kk - Math.sin(kk * Math.PI) * p.arc) * TL;
      g.globalAlpha = 0.3; g.fillStyle = ART.PALETTE.bone[1];
      g.fillRect(Math.round(tx - 1), Math.round(ty - 1), 2, 2);
      g.globalAlpha = 1;
    }
    const w = img.width / 2;
    g.drawImage(img, Math.round(px - w / 2), Math.round(py - w / 2), w, w);
    if (fire) {
      // the head of the flame laps over the stone's trailing side
      const F = ART.PALETTE.fire;
      const vx = p.x2 - p.x1, vy = (p.y2 - p.y1) - Math.cos(k * Math.PI) * Math.PI * p.arc;
      const vl = Math.hypot(vx, vy) || 1;
      g.fillStyle = F[3];
      this.disc(g, px - vx / vl * w * 0.5, py - vy / vl * w * 0.5, Math.max(1, w * 0.22));
      g.fillStyle = '#fff6d8';
      g.fillRect(Math.round(px - vx / vl * w * 0.5), Math.round(py - vy / vl * w * 0.5), 1, 1);
    } else if (shell && ((performance.now() / 90) | 0) % 2) {
      g.fillStyle = ART.PALETTE.fire[3];
      g.fillRect(Math.round(px + w * 0.35), Math.round(py - w * 0.55), 1, 1);
    }
    return true;
  },
  // a filled pixel disc at world-pixel grain (a row of rects per line)
  disc(g, cx, cy, r) {
    const x0 = Math.round(cx), y0 = Math.round(cy), rr = r * r, n = Math.ceil(r);
    for (let y = -n; y <= n; y++) {
      const w = Math.floor(Math.sqrt(Math.max(0, rr - y * y)) + 0.35);
      if (w < 0 || (w === 0 && Math.abs(y) > r)) continue;
      g.fillRect(x0 - w, y0 + y, w * 2 + 1, 1);
    }
  },
  // a pixel stone at twice the world's density: an outline, a lit top-left,
  // a shaded underside and a crack, in four turns
  stoneArt(size, turn, shell) {
    const key = 'st' + size + ':' + turn + ':' + (shell ? 1 : 0);
    if (this._cache[key]) return this._cache[key];
    const N = size * 2, c = document.createElement('canvas'); c.width = N; c.height = N;
    const g = c.getContext('2d');
    const P = shell ? ['#141414', '#24262a', '#3a3d42', '#5a5e66', '#8a8f98'] : ART.PALETTE.stone;
    const cx = (N - 1) / 2, cy = (N - 1) / 2, R0 = N / 2 - 0.6;
    const ca = Math.cos(turn * Math.PI / 2 * 0.5), sa = Math.sin(turn * Math.PI / 2 * 0.5);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = x - cx, dy = y - cy;
      // a lumpy stone (a shell is round)
      const ang = Math.atan2(dy, dx);
      const lump = shell ? 0 : (Math.sin(ang * 3 + turn * 1.3) * 0.08 + Math.sin(ang * 5 + turn) * 0.05) * R0;
      const d = Math.hypot(dx, dy);
      if (d > R0 + lump) continue;
      let col;
      if (d > R0 + lump - 1.1) col = shell ? '#0a0a0a' : '#2a2620';           // the outline
      else {
        const l = (-dx * 0.7 - dy * 0.7) / R0;                               // light from the top-left
        col = l > 0.45 ? P[4] : l > 0.1 ? P[3] : l > -0.3 ? P[2] : P[1];
        // a crack, turning with the stone
        if (!shell) { const rx = dx * ca - dy * sa, ry = dx * sa + dy * ca; if (Math.abs(ry - rx * 0.4) < 0.5 && rx > -R0 * 0.5 && rx < R0 * 0.3) col = P[0]; }
      }
      g.fillStyle = col; g.fillRect(x, y, 1, 1);
    }
    if (shell) { g.fillStyle = '#c8ccd4'; g.fillRect(Math.round(cx - R0 * 0.45), Math.round(cy - R0 * 0.5), 2, 1); }
    return (this._cache[key] = c);
  },
  /* THE CRATER IS DRAWN ART (assets/fx/crater-{s,l}[-fire].png, made in
     PixelLab and mapped onto the soil and the charcoal ramps): the small pit
     for a catapult stone, the large for the trebuchet's firestorm and the
     bombard's blast, scorched where the shot burned. At the units' density
     (two art pixels a world pixel); fetched the first time a stone lands;
     until it decodes — or if it never does — the procedural crater stands in. */
  _craterImg: {},
  craterPic(c) {
    const key = 'crater-' + (c.big ? 'l' : 's') + (c.fire ? '-fire' : '');
    let im = this._craterImg[key];
    if (!im) {
      im = this._craterImg[key] = new Image();
      im.src = 'assets/fx/' + key + '.png?v=' + ((typeof CFG !== 'undefined' && CFG.ART_V) || 1);
    }
    return im.complete && im.naturalWidth ? im : this.craterArt(c.r, c.fire, c.v);
  },
  // a crater at twice the world's density: thrown earth round a dark pit
  craterArt(r, fire, v) {
    const key = 'cr' + r + ':' + (fire ? 1 : 0) + ':' + v;
    if (this._cache[key]) return this._cache[key];
    const TL = CFG.TILE;
    const RX = Math.round(r * TL * 2), RY = Math.round(r * TL * 2 * 0.6);
    const W = RX * 2 + 8, H = RY * 2 + 8;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const S2 = ART.PALETTE.soil;
    const cx = W / 2, cy = H / 2;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const nx = (x - cx) / RX, ny = (y - cy) / RY;
      const ang = Math.atan2(ny, nx);
      const wob = 1 + Math.sin(ang * 4 + v * 2) * 0.08 + Math.sin(ang * 7 + v) * 0.05;
      const d = Math.hypot(nx, ny) / wob;
      const h = this.hash(x, y, v + (fire ? 50 : 0));
      let col = null;
      if (d < 0.55) {
        // the pit: its upper-left wall in shadow, the lower-right lit
        const wall = (nx + ny) / 1.4;
        col = d < 0.32 ? (fire ? '#140c06' : '#1e150b') : wall > 0.1 ? S2[1] : '#2a1e10';
        if (fire && d < 0.5 && h < 0.08) col = '#3a2412';
      } else if (d < 0.78) {
        col = h < 0.5 ? S2[2] : S2[3];                        // the rim of thrown earth
        if (fire && h < 0.4) col = '#3a2614';
      } else if (d < 1.15 && h < 0.26 * (1.15 - d) / 0.37) {
        col = h < 0.12 ? S2[1] : S2[2];                       // clods strewn round it
        if (fire && h < 0.12) col = '#2e2014';
      }
      if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); }
    }
    return (this._cache[key] = c);
  },
  // a pool of blood at twice the world's density: an irregular dark blot
  // with a darker rim and one dull highlight — small, muted, never bright
  poolArt(seed) {
    const v = (seed * 7) % 4;
    const key = 'pool' + v;
    if (this._cache[key]) return this._cache[key];
    const W = 28, H = 16, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const cx = W / 2, cy = H / 2;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const nx = (x - cx) / (W / 2 - 1), ny = (y - cy) / (H / 2 - 1);
      const ang = Math.atan2(ny, nx);
      const wob = 1 + Math.sin(ang * 3 + v * 1.7) * 0.14 + Math.sin(ang * 5 + v) * 0.07;
      const d = Math.hypot(nx, ny) / wob;
      if (d > 1) continue;
      let col = d > 0.82 ? this.BLOOD[0] : this.BLOOD[1];
      if (d < 0.5 && nx < -0.05 && ny < -0.1 && d > 0.3) col = this.BLOOD[2];
      g.fillStyle = col; g.fillRect(x, y, 1, 1);
    }
    return (this._cache[key] = c);
  },
};
window.BattleFX = BattleFX;
