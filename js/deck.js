"use strict";
/* THE CARD SYSTEM — the core (tests/deck-core.mjs, deck-*.mjs).

   Win or lose, every finished game grants a card. A card is kept forever
   until it is played, and then it is gone forever. This file owns what a card
   IS (the catalog), who EARNS one (the drop tables), WHERE it is kept (the
   collection, mirrored on the device and synced to the cloud) and the one
   door every card is PLAYED through. The effects live in js/deckfx.js, the
   in-game deck in js/deckui.js, the end screen and the collection in
   js/deckscreens.js. `Cards` was taken (the origin draft, js/cards.js), so
   the new system is `Deck`; S.deck is its run state.

   THE KILL SWITCH is CFG.CARDS.ON (js/config.js). Off, nothing here is ever
   reached by the game: no button, no screen, no write. `?cards=1` turns it
   on for one device.

   THREE RULES MAKE IT SAFE TO SHIP DARK AND SAFE TO SHIP AT ALL:
   1. A CARD IS CONSUMED ONLY WHEN ITS EFFECT APPLIES. Deck.play asks the
      effect first and takes the card only on success; a refusal hands it
      back with the reason, in as many words.
   2. NOTHING HERE DRAWS FROM THE RUN'S RNG. Drops roll on Math.random (or an
      injected stream in tests), never G.rand — a draw from S.rngState would
      re-deal every roll after it (the rule G.rollWonder keeps).
   3. NOTHING HERE TOUCHES A SAVE SLOT. The collection is the player's, not
      the run's: it lives on the device (and in the cloud), never in S. What
      a RUN remembers (cards played, live timers) rides in S.deck. */

const Deck = {
  /* ---------------- what a card IS ---------------- */
  TIERS: [
    { k: 'stone',    name: 'Stone',         rarity: 'Common',    col: '#9a968c', glow: 'rgba(200,196,186,0.55)', rank: 0 },
    { k: 'bronze',   name: 'Bronze',        rarity: 'Uncommon',  col: '#c98446', glow: 'rgba(232,150,80,0.6)',   rank: 1 },
    { k: 'iron',     name: 'Iron',          rarity: 'Rare',      col: '#7f9ab8', glow: 'rgba(140,180,230,0.65)', rank: 2 },
    { k: 'imperial', name: 'Imperial',      rarity: 'Epic',      col: '#e9dfc7', glow: 'rgba(255,236,170,0.7)',  rank: 3 },
    { k: 'enlight',  name: 'Enlightenment', rarity: 'Legendary', col: '#ffd45e', glow: 'rgba(255,214,94,0.85)',  rank: 4 },
  ],
  /* The 36 cards, exactly as approved at Gate 1 (assets/masters/cards/
     catalog-gate1.cjs carries the reasoning behind every number). `target`:
     'none' plays at once, 'any' aims at any point on the board, 'explored'
     at ground the player has seen. `days` marks a timed card (1 day = 10
     real seconds). `text` is the exact effect, `when` when it may be played. */
  CATALOG: [
    { id: "forager_cache", tier: "stone", cat: "econ", target: "none",
      name: "Forager's Cache",
      text: "+250 food.",
      flavor: "Someone buried it for the lean months, and never came back for it.",
      when: "Always." },
    { id: "fallen_timber", tier: "stone", cat: "econ", target: "none",
      name: "Fallen Timber",
      text: "+200 wood.",
      flavor: "The storm did the felling. All you have to do is carry it home.",
      when: "Always." },
    { id: "loose_stone", tier: "stone", cat: "econ", target: "none",
      name: "Loose Stone",
      text: "+150 stone.",
      flavor: "Already broken out of the hill, and nobody has claimed it yet.",
      when: "Always." },
    { id: "gold_nugget", tier: "stone", cat: "econ", target: "none",
      name: "Gold Nugget",
      text: "+60 gold.",
      flavor: "Thumb-sized, river-polished, and worth a quarrel.",
      when: "Always." },
    { id: "willing_hands", tier: "stone", cat: "army", target: "none",
      name: "Willing Hands",
      text: "+3 villagers at your Town Center. They may take you over the population cap; training waits until there is room again.",
      flavor: "Strangers at the fire, asking for a roof and a job. In that order.",
      when: "Your Town Center stands and there is open ground beside it." },
    { id: "scouts_fire", tier: "stone", cat: "intel", target: "any",
      name: "Scout's Fire",
      text: "Choose any point. The land within 9 tiles of it is revealed for good, and you keep watch there for 3 days.",
      flavor: "Light a fire on the far hill and see what the dark was keeping.",
      when: "Always. Any point on the board, explored or not." },
    { id: "quick_hands", tier: "stone", cat: "buff", target: "none", days: 6,
      name: "Quick Hands",
      text: "Construction and upgrades go twice as fast for 6 days.",
      flavor: "Everyone carries two, and nobody stops for lunch.",
      when: "Always." },
    { id: "mending", tier: "stone", cat: "buff", target: "none",
      name: "Mending",
      text: "Every building you have is repaired to full and its fires put out. Walls and gates included; work sites excluded.",
      flavor: "Daub, thatch and rope. The whole town patched by sundown.",
      when: "At least one of your buildings is damaged (otherwise greyed: “Nothing needs mending”)." },
    { id: "trade_caravan", tier: "bronze", cat: "econ", target: "none",
      name: "Trade Caravan",
      text: "+250 food, +250 wood and +100 gold.",
      flavor: "They came over the pass with too much to carry, and left with less.",
      when: "Always." },
    { id: "harvest_festival", tier: "bronze", cat: "buff", target: "none", days: 12,
      name: "Harvest Festival",
      text: "Everything your people gather or produce comes in 40% richer for 12 days.",
      flavor: "Sing loud enough and the fields seem to listen.",
      when: "Always." },
    { id: "war_band", tier: "bronze", cat: "army", target: "none",
      name: "War Band",
      text: "Five soldiers of your best infantry rank march out of your Town Center: Defenders, Axemen or Bronze Champions, by your best finished Barracks (Defenders with none).",
      flavor: "They have spears and nothing better to do. You have a use for both.",
      when: "Your Town Center stands." },
    { id: "hunters_pack", tier: "bronze", cat: "army", target: "none",
      name: "Hunter's Pack",
      text: "Three war-wolves join you at your Town Center: 70 health, 10 attack, fast. They fight beside you, stay near home, need no roof and eat nothing.",
      flavor: "Fed from the hand since they were pups. Now they hunt for you.",
      when: "Your Town Center stands." },
    { id: "watchfires", tier: "bronze", cat: "buff", target: "none", days: 6,
      name: "Watchfires",
      text: "Your towers and War Camps hit 50% harder and reach 50% farther for 6 days.",
      flavor: "Pitch on every tower. Let the night come and see what it gets.",
      when: "You have at least one finished tower or War Camp." },
    { id: "master_builders", tier: "bronze", cat: "buff", target: "none",
      name: "Master Builders",
      text: "The next 3 buildings you place stand complete the moment they are placed, at full strength. You still pay for them. (Not walls, gates or the Wonder.)",
      flavor: "Three halls, one morning, no arguments.",
      when: "Always." },
    { id: "pathfinders_map", tier: "bronze", cat: "intel", target: "none",
      name: "Pathfinder's Map",
      text: "Every tile of the world is revealed for good — land, water, ore and gold seams — and the lost relic is marked on your map. It does not show what stands on the land, and the relic still has to be dug up by someone who walks there.",
      flavor: "Drawn in charcoal on a hide, by someone who walked all of it.",
      when: "Some of the world is still unexplored, or the relic is unfound." },
    { id: "bountiful_land", tier: "bronze", cat: "buff", target: "none", days: 20,
      name: "Bountiful Land",
      text: "Within 8 tiles of your Town Center, everything gathered or produced comes in 50% richer for 20 days.",
      flavor: "The soil near the fire was always the good soil.",
      when: "Your Town Center stands." },
    { id: "swift_raiders", tier: "iron", cat: "army", target: "none",
      name: "Swift Raiders",
      text: "Five Horse Archers ride out of your Town Center.",
      flavor: "Five riders who shoot as if they were born in the saddle.",
      when: "Your Town Center stands." },
    { id: "iron_legion", tier: "iron", cat: "army", target: "none",
      name: "Iron Legion",
      text: "Six Bronze Champions march out of your Town Center.",
      flavor: "Six champions in bronze, and not one of them has lost yet.",
      when: "Your Town Center stands." },
    { id: "siege_train", tier: "iron", cat: "army", target: "none",
      name: "Siege Train",
      text: "A Catapult and a Ballista roll out of your Town Center.",
      flavor: "Ropes, timber, and two crews who argue about angles.",
      when: "Your Town Center stands." },
    { id: "veterans", tier: "iron", cat: "army", target: "none",
      name: "Veterans",
      text: "Every land soldier you have rises one rank. Base and second-rank soldiers become their hall’s champion (Bronze Champion, Fire Archer, Lancer; a Catapult becomes a Trebuchet). Champions and other engines become veterans: +25% health and attack.",
      flavor: "Every scar was a lesson. Today everyone graduates.",
      when: "You have at least one land soldier." },
    { id: "stone_skin", tier: "iron", cat: "buff", target: "none", days: 8,
      name: "Stone Skin",
      text: "Your buildings take half damage for 8 days — double their strength.",
      flavor: "Hit the walls as hard as you like. They have stopped noticing.",
      when: "Always." },
    { id: "spy_hall", tier: "iron", cat: "intel", target: "none", days: 10,
      name: "Spy in the Hall",
      text: "Every building the rival has standing is marked on your map for good, you learn the origin card they drafted, and for 10 days you see their people wherever they go.",
      flavor: "A guest at their fire, who listened more than he ate.",
      when: "Always." },
    { id: "blight", tier: "iron", cat: "curse", target: "none", days: 15,
      name: "Blight",
      text: "The rival’s gathering and production fall by 40% for 15 days.",
      flavor: "Their fields turn grey, and nobody there knows why.",
      when: "Always." },
    { id: "legion_marches", tier: "imperial", cat: "army", target: "none",
      name: "The Legion Marches",
      text: "Twelve elite soldiers march out of your Town Center: 5 Bronze Champions, 4 Fire Archers and 3 Lancers.",
      flavor: "Twelve of the best, marching in step. The ground notices.",
      when: "Your Town Center stands." },
    { id: "golden_age", tier: "imperial", cat: "buff", target: "none", days: 20,
      name: "Golden Age",
      text: "Everything your people gather or produce comes in 50% richer, and everything they build rises 50% faster, for 20 days.",
      flavor: "Twenty days when everything works and nobody asks why.",
      when: "Always." },
    { id: "age_of_marble", tier: "imperial", cat: "wonder", target: "none",
      name: "Age of Marble",
      text: "For the rest of this game your Wonder costs 25% less and rises twice as fast. Laid already? A quarter of its price comes back.",
      flavor: "The masons stopped arguing. Work has never gone faster.",
      when: "The Wonder is offered in this world (Calm) and is not finished." },
    { id: "trebuchet_battery", tier: "imperial", cat: "army", target: "none",
      name: "Trebuchet Battery",
      text: "Two Trebuchets and a Siege Tower roll out of your Town Center.",
      flavor: "Two arms long enough to reach over any wall built so far.",
      when: "Your Town Center stands." },
    { id: "starfall", tier: "imperial", cat: "strike", target: "explored",
      name: "Starfall",
      text: "A falling star strikes the chosen ground: 900 damage to every enemy building within 2 tiles (half at the edge) and 250 to every enemy unit within 3. Your own are spared. A rival Town Center loses at most 40% of its strength.",
      flavor: "You did not throw it. You only chose where it landed.",
      when: "Any explored point." },
    { id: "krakens_call", tier: "imperial", cat: "strike", target: "none",
      name: "Kraken's Call",
      text: "The kraken rises against the rival: it drags down up to 4 of their ships and batters every building of theirs within 2 tiles of open water for 600 damage. A rival Town Center loses at most 40% of its strength.",
      flavor: "Something answers from the deep, and it is hungry for their boats.",
      when: "The world has open sea (otherwise greyed: “Needs open water”)." },
    { id: "barbarian_pact", tier: "imperial", cat: "curse", target: "none",
      name: "Barbarian Pact",
      text: "The next 3 barbarian war bands march on the rival instead of you.",
      flavor: "Gold for the wolves, and a finger pointed at your neighbour.",
      when: "Always." },
    { id: "dragonfire", tier: "enlight", cat: "strike", target: "explored",
      name: "Dragonfire",
      text: "The black dragon answers: every enemy unit within 3 tiles of the chosen point burns to ash, every enemy building within 2.5 tiles takes 1,200 fire damage (a rival Town Center at most half its strength), and a line of fire burns on behind it.",
      flavor: "It owes you nothing. It is simply going where you point.",
      when: "Any explored point." },
    { id: "swallowed_sun", tier: "enlight", cat: "curse", target: "none", days: 4,
      name: "The Swallowed Sun",
      text: "The sun goes dark over the rival for 4 days: they see half as far, strike 30% softer, muster no war band, and every one of their people not already fighting stops to stare at the sky. Your people, forewarned, work on.",
      flavor: "Your seers warned you. Theirs did not.",
      when: "Always." },
    { id: "enlightenment", tier: "enlight", cat: "buff", target: "none",
      name: "Enlightenment",
      text: "Your Town Center rises one level at once, free (it skips the three-building rule). Then every building you have is raised at once, free, to the hall’s new level — your walls and gates too, if you have any. At hall Lv 3 it raises everything else to Lv 3.",
      flavor: "One night the whole town wakes up knowing how.",
      when: "Something can still be raised (otherwise greyed: “Everything stands at its height”)." },
    { id: "unbreakable_hall", tier: "enlight", cat: "buff", target: "none", days: 12,
      name: "Unbreakable Hall",
      text: "For 12 days your Town Center cannot fall: blows may scorch it, but it never drops below a sliver of strength.",
      flavor: "Whatever they throw at it, the hall stands.",
      when: "Your Town Center stands." },
    { id: "wonders_foundation", tier: "enlight", cat: "wonder", target: "none",
      name: "Wonder's Foundation",
      text: "Your Wonder gains 35% of its work — now if its site stands, or the moment you lay it. It never lays the last stone for you: the works stop at 95%.",
      flavor: "The first stones were already here, waiting under the grass.",
      when: "The Wonder is offered in this world (Calm) and is not finished." },
    { id: "ancestors_host", tier: "enlight", cat: "army", target: "none", days: 6,
      name: "Ancestors' Host",
      text: "Fifteen spectral Bronze Champions rise at your Town Center and fight for you for 6 days, then fade. They eat nothing and need no roof.",
      flavor: "Every chief who came before you, back for one more fight.",
      when: "Your Town Center stands." },
  ],
  _byId: null,
  card(id) {
    if (!this._byId) { this._byId = {}; for (const c of this.CATALOG) this._byId[c.id] = c; }
    return this._byId[id] || null;
  },
  tier(k) { return this.TIERS.find(t => t.k === k) || this.TIERS[0]; },
  ofTier(k) { return this.CATALOG.filter(c => c.tier === k); },

  /* ---------------- the kill switch ---------------- */
  on() { return !!(typeof CFG !== 'undefined' && CFG.CARDS && CFG.CARDS.ON) || this.devOn(); },
  devOn() {
    if (this._dev == null) {
      let q = '';
      try { q = String(location.search || ''); } catch (e) {}
      if (/[?&]cards=(1|slice)\b/.test(q)) this._set('neo-cards-dev', '1');
      if (/[?&]cards=0\b/.test(q)) this._del('neo-cards-dev');
      // GATE REVIEW ONLY (delete at launch): ?cards=slice also tops the hand
      // up to one of each card whose effect is built, so the slice can be
      // played on a phone without first earning it (ensureStarter deals it)
      this._slice = /[?&]cards=slice\b/.test(q);
      this._dev = this._get('neo-cards-dev') === '1';
    }
    return this._dev;
  },
  _dev: null,

  /* ---------------- device storage (iOS "Block All Cookies" throws) ---------------- */
  _mem: {},
  _get(k) { try { return localStorage.getItem(k); } catch (e) { return Object.prototype.hasOwnProperty.call(this._mem, k) ? this._mem[k] : null; } },
  _set(k, v) { try { localStorage.setItem(k, v); } catch (e) { this._mem[k] = v; } },
  _del(k) { try { localStorage.removeItem(k); } catch (e) {} delete this._mem[k]; },

  /* ---------------- the collection ----------------
     { v, counts: {id: n}, seen: {id: firstMs}, pity, starter, runs: {key: [ids]},
       queue: [ops], medians: {calm, moderate, hard, at} }
     Mirrored here for instant reads and offline play; the cloud is the record
     once it answers (Deck.sync, js/backend.js RPCs). */
  KEY: 'neo-deck',
  _col: null,
  col() {
    if (this._col) return this._col;
    let c = null;
    try { c = JSON.parse(this._get(this.KEY) || 'null'); } catch (e) { c = null; }
    if (!c || typeof c !== 'object') c = {};
    c.v = 1;
    if (!c.counts || typeof c.counts !== 'object') c.counts = {};
    if (!c.seen || typeof c.seen !== 'object') c.seen = {};
    if (!(c.pity >= 0)) c.pity = 0;
    if (!c.runs || typeof c.runs !== 'object') c.runs = {};
    if (!Array.isArray(c.queue)) c.queue = [];
    if (!c.medians || typeof c.medians !== 'object') c.medians = {};
    // drop anything the catalog no longer knows — a retired card must never
    // reach a renderer that would look it up and find nothing
    for (const id of Object.keys(c.counts)) if (!this.card(id) || !(c.counts[id] > 0)) delete c.counts[id];
    this._col = c;
    return c;
  },
  saveCol() {
    const c = this.col();
    // the run ledger only needs to outlive a reload of the end screen
    const keys = Object.keys(c.runs);
    if (keys.length > 60) for (const k of keys.slice(0, keys.length - 60)) delete c.runs[k];
    if (c.queue.length > CFG.CARDS.QUEUE_MAX) c.queue.splice(0, c.queue.length - CFG.CARDS.QUEUE_MAX);
    this._set(this.KEY, JSON.stringify(c));
    this._changed();
  },
  count(id) { return this.col().counts[id] || 0; },
  total() { let n = 0; const k = this.col().counts; for (const id in k) n += k[id]; return n; },
  seen(id) { return !!this.col().seen[id]; },
  owned() {   // highest tier first, then catalog order
    const k = this.col().counts;
    return this.CATALOG.filter(c => k[c.id] > 0)
      .sort((a, b) => this.tier(b.tier).rank - this.tier(a.tier).rank || this.CATALOG.indexOf(a) - this.CATALOG.indexOf(b))
      .map(c => ({ card: c, n: k[c.id] }));
  },
  _add(id, n) {
    const c = this.col();
    c.counts[id] = (c.counts[id] || 0) + n;
    if (!c.seen[id]) c.seen[id] = Date.now();
    if (c.counts[id] <= 0) delete c.counts[id];
  },
  // listeners (the HUD button's count, the collection screen) — never in S
  _subs: [],
  onChange(fn) { this._subs.push(fn); },
  _changed() { for (const f of this._subs) { try { f(); } catch (e) {} } },
  _queue(op) { this.col().queue.push(Object.assign({ at: Date.now() }, op)); },

  /* THE STARTER HAND: every player without a collection gets three Stone
     cards once — including today's players, the day the switch is thrown. */
  ensureStarter() {
    if (!this.on()) return false;
    const c = this.col();
    if (this._slice) {
      this._slice = false;
      let dealt = 0;
      for (const id of Object.keys(this.FX)) if (this.card(id) && this.count(id) < 1) { this._add(id, 1); dealt++; }
      if (dealt) this.saveCol();
    }
    if (c.starter) return false;
    c.starter = Date.now();
    for (const id of CFG.CARDS.STARTER) if (this.card(id)) this._add(id, 1);
    this._queue({ op: 'starter', cards: CFG.CARDS.STARTER.slice() });
    this.saveCol();
    return true;
  },

  /* ---------------- who EARNS a card ---------------- */
  /* The finished run, read off S at the end screen. `subtotal` is the score
     BEFORE the difficulty multiplier (the competition's gate). */
  report(win, cause) {
    let sub = 0;
    try { sub = Score.compute(!!win).subtotal || 0; } catch (e) {}
    // the run's OWN id first: it rides the save and outlives the end, while
    // Backend.lastRunId can be stale (a pre-stamp save, a logRunEnd that threw)
    const runId = S.runId || (window.Backend && (Backend.lastRunId || Backend.runId)) || null;
    return {
      win: !!win, cause: cause || (win ? 'win' : 'unknown'),
      mode: S.mode, day: S.day, seconds: Math.round(S.playtime || 0), subtotal: sub,
      runId, key: runId || ('seed:' + S.seed + ':' + S.day + ':' + (win ? 'w' : 'l')),
    };
  },
  /* who earns: a FINISHED game — won, or lost to the world — after ten real
     minutes and 500 score before the multiplier. A struck banner or a closed
     tab is not a finish. */
  eligible(rep) {
    if (!rep) return { ok: false, why: 'No game to reward.' };
    if (rep.cause === 'struck_banner' || rep.cause === 'closed_tab') return { ok: false, why: 'A banner struck earns no card.' };
    if (rep.seconds < CFG.CARDS.MIN_SECONDS) return { ok: false, why: `Play ${Math.round(CFG.CARDS.MIN_SECONDS / 60)} minutes to earn a card.` };
    const need = CFG.CARDS.MIN_SCORE;
    if (rep.subtotal < need) {
      const mult = (CFG.SCORE.mult && CFG.SCORE.mult[rep.mode]) || 1;
      return { ok: false, why: `Score ${Math.round(need * mult).toLocaleString()} to earn a card.` };
    }
    return { ok: true };
  },
  table(rep) { return CFG.CARDS.DROPS[rep.win ? rep.mode : 'loss'] || CFG.CARDS.DROPS.loss; },
  medianDay(mode) {
    const m = this.col().medians;
    return (m && m[mode] > 0) ? m[mode] : CFG.CARDS.MEDIAN_DAY[mode] || 9999;
  },
  // a Wonder win, any Hard win, or a win before the median winning day
  great(rep) {
    if (!rep.win) return false;
    return rep.cause === 'wonder' || rep.mode === 'hard' || rep.day < this.medianDay(rep.mode);
  },
  rollTier(w, rng) {
    const sum = w.reduce((a, x) => a + x, 0);
    let r = (rng || Math.random)() * sum;
    for (let i = 0; i < w.length; i++) { r -= w[i]; if (r < 0 && w[i] > 0) return this.TIERS[i].k; }
    for (let i = w.length - 1; i >= 0; i--) if (w[i] > 0) return this.TIERS[i].k;
    return 'stone';
  },
  rollCard(tier, rng) {
    const pool = this.ofTier(tier);
    return pool[Math.min(pool.length - 1, Math.floor((rng || Math.random)() * pool.length))].id;
  },
  /* THE GRANT, once per run (idempotent on rep.key): rolls the card(s),
     keeps them in the collection AT ONCE (a player who closes the tab before
     CLAIM still has the card — CLAIM is the ceremony, not the transaction),
     moves the pity count and queues the cloud write. Returns the record the
     end screen reveals: { ok, why, cards: [{id, tier, bonus}], great, pity }. */
  settle(rep, rng) {
    if (!this.on() || !rep) return { ok: false, why: '', cards: [] };
    const col = this.col();
    if (col.runs[rep.key]) return { ok: true, again: true, cards: col.runs[rep.key].map(x => Object.assign({}, x)), great: col.runs[rep.key].length > 1 };
    const el = this.eligible(rep);
    if (!el.ok) return { ok: false, why: el.why, cards: [] };
    const w = this.table(rep), great = this.great(rep);
    const cards = [];
    let forced = false;
    for (let i = 0; i < (great ? 2 : 1); i++) {
      let tier;
      if (i === 0 && rep.win && col.pity >= CFG.CARDS.PITY) { tier = 'enlight'; forced = true; }
      else tier = this.rollTier(w, rng);
      cards.push({ id: this.rollCard(tier, rng), tier, bonus: i > 0 });
    }
    for (const c of cards) this._add(c.id, 1);
    if (cards.some(c => c.tier === 'enlight')) col.pity = 0;
    else if (rep.win) col.pity++;
    col.runs[rep.key] = cards.map(c => ({ id: c.id, tier: c.tier, bonus: c.bonus }));
    this._queue({ op: 'grant', run: rep.runId, key: rep.key, outcome: rep.win ? 'win' : 'loss', mode: rep.mode,
      cards: cards.map(c => c.id), great, pity: forced });
    this.saveCol();
    for (const c of cards) this.track('card_granted', { card: c.id, tier: c.tier, outcome: rep.win ? 'win' : 'loss', difficulty: rep.mode, bonus: c.bonus, run: rep.runId });
    return { ok: true, cards, great, pity: forced };
  },

  /* ---------------- the RUN (S.deck rides in every save) ---------------- */
  fresh() { return { played: [], fx: [], charges: {} }; },
  run() {
    if (typeof S === 'undefined' || !S) return null;
    if (!S.deck || typeof S.deck !== 'object') S.deck = this.fresh();
    if (!Array.isArray(S.deck.played)) S.deck.played = [];
    if (!Array.isArray(S.deck.fx)) S.deck.fx = [];
    if (!S.deck.charges || typeof S.deck.charges !== 'object') S.deck.charges = {};
    // THE CARD-LIT MAP (js/deckfx-rival.js): a packed bitset, '' for none
    if (typeof S.deck.lit !== 'string') S.deck.lit = '';
    // …a kraken risen against the rival, mid-act (null for none)
    if (S.deck.kraken === undefined) S.deck.kraken = null;
    // …and the lost relic marked on the map by a pathfinder (false for none)
    if (typeof S.deck.relicMark !== 'boolean') S.deck.relicMark = false;
    return S.deck;
  },
  playedCount() { return (S && S.deck && S.deck.played) ? S.deck.played.length : 0; },
  // game time in fractional DAYS, so a timer freezes with the sim
  now() { return S.day + (S.dayT || 0) / CFG.DAY_MS; },

  /* ---------------- PLAYING a card ----------------
     Deck.FX[id] (js/deckfx.js) is { can(tgt) → {ok, why}, valid(x, y) → bool
     for a targeted card, apply(tgt) → {ok, why}, at: 'tc'|'bar'|'target' —
     where the play animation bursts, end(entry) for a timed card's expiry }. */
  FX: {},
  canPlay(id) {
    if (!this.on()) return { ok: false, why: 'Cards are not available.' };
    const c = this.card(id);
    if (!c) return { ok: false, why: 'Unknown card.' };
    if (this.count(id) < 1) return { ok: false, why: 'You hold no such card.' };
    if (typeof S === 'undefined' || !S || !S.map || S.over) return { ok: false, why: 'Play it in a game.' };
    if (window.Screens && Screens._demo) return { ok: false, why: 'Play it in a game.' };
    const fx = this.FX[id];
    if (!fx) return { ok: false, why: 'This card cannot be played yet.' };
    const r = fx.can ? fx.can() : { ok: true };
    return (r && r.ok) ? { ok: true } : { ok: false, why: (r && r.why) || 'Not now.' };
  },
  validTarget(id, x, y) {
    const fx = this.FX[id], c = this.card(id);
    if (!fx || !c || c.target === 'none') return true;
    if (typeof MapGen !== 'undefined' && !MapGen.onBoard(x | 0, y | 0)) return false;
    // 'explored' is ground the player's OWN people have seen — a card's map
    // or a spy's word charts it without eyes (Deck.eyesAt, js/deckfx-rival.js)
    if (c.target === 'explored' && !(this.eyesAt ? this.eyesAt(x | 0, y | 0)
      : (S.map.explored && S.map.explored[(y | 0) * CFG.W + (x | 0)]))) return false;
    return fx.valid ? !!fx.valid(x, y) : true;
  },
  /* THE ONE DOOR. Applies the effect and takes the card only if it applied. */
  play(id, tgt) {
    const ok = this.canPlay(id);
    if (!ok.ok) return ok;
    const c = this.card(id);
    if (c.target !== 'none' && (!tgt || !this.validTarget(id, tgt.x, tgt.y)))
      return { ok: false, why: c.target !== 'explored' ? 'Choose a point on the map.'
        : (tgt && this.litAt && this.litAt(tgt.x | 0, tgt.y | 0)) ? this.EYES_WHY : 'Choose ground you have explored.' };
    let r;
    try { r = this.FX[id].apply(tgt || null) || { ok: false }; }
    catch (e) { console.error('card effect failed', id, e); r = { ok: false, why: 'The card fizzled — it is still yours.' }; }
    if (!r.ok) return { ok: false, why: r.why || 'The card could not take hold — it is still yours.' };
    this._add(id, -1);
    const run = this.run();
    run.played.push({ id, day: S.day });
    const playId = this._uuid();
    this._queue({ op: 'consume', card: id, play: playId, run: S.runId || null, day: S.day });
    this.saveCol();
    this.track('card_played', { card: id, tier: c.tier, run: S.runId || null, day: S.day });
    return Object.assign({ ok: true }, r);
  },
  _uuid() {
    try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
    return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  },

  /* ---------------- TIMED effects (S.deck.fx) ----------------
     { id, from, until } in fractional game days. Playing a timed card that is
     already running EXTENDS it by its own length — the duration stacks, the
     strength never does. */
  addTimed(id, days, data) {
    const run = this.run(), now = this.now();
    const live = run.fx.find(e => e.id === id && e.until > now);
    if (live) { live.until += days; return live; }
    const e = Object.assign({ id, from: now, until: now + days }, data || {});
    run.fx.push(e);
    return e;
  },
  timed(id) {
    if (!S || !S.deck || !S.deck.fx.length) return null;
    const now = this.now();
    return S.deck.fx.find(e => e.id === id && e.until > now) || null;
  },
  timers() {   // for the HUD: [{id, left (days), frac}]
    if (!S || !S.deck || !S.deck.fx.length) return [];
    const now = this.now();
    return S.deck.fx.filter(e => e.until > now)
      .map(e => ({ id: e.id, left: e.until - now, frac: (e.until - now) / Math.max(1e-6, e.until - e.from) }));
  },
  // called from G.frame while the sim runs: expire what has run its course
  tick() {
    if (!S || !S.deck || !S.deck.fx.length) return;
    const now = this.now();
    for (let i = S.deck.fx.length - 1; i >= 0; i--) {
      const e = S.deck.fx[i];
      if (e.until > now) continue;
      S.deck.fx.splice(i, 1);
      const fx = this.FX[e.id];
      if (fx && fx.end) { try { fx.end(e); } catch (err) { console.error('card expiry failed', e.id, err); } }
    }
  },

  /* ---------------- telemetry ---------------- */
  track(kind, props) {
    try {
      if (!window.Backend || !Backend._emit) return;
      Backend._emit({ run_id: props.run || null, kind, mode: (typeof S !== 'undefined' && S && S.mode) || null,
        day: (typeof S !== 'undefined' && S && S.day) || 0, props });
    } catch (e) { /* analytics may never be felt in the game */ }
  },

  /* ---------------- THE CARD FACE (shared by every screen) ----------------
     Authored at 176 x 244 with a 152 x 168 window (assets/cards/frame-*.png);
     shown at a WHOLE multiple of device pixels so every art pixel stays square.
     fit(cssW) picks the largest whole scale that fits the width asked for. */
  W: 176, H: 244,
  WIN: { x: 12, y: 12, w: 152, h: 168 },
  PLATE: { x: 16, y: 184, w: 144, h: 42 },
  fit(cssW) {
    const dpr = Math.max(1, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1);
    const k = Math.max(1, Math.floor(cssW * dpr / this.W));
    return { w: this.W * k / dpr, h: this.H * k / dpr, k };
  },
  artUrl(id) { return 'assets/cards/art/' + id + '.png?v=' + CFG.ART_V; },
  frameUrl(tier) { return 'assets/cards/frame-' + tier + '.png?v=' + CFG.ART_V; },
  // one pixel glyph per kind of card, worn in the pennant (12 x 12 cells)
  GLYPHS: {
    econ:   ['....####....', '...######...', '..##.##.##..', '..##.##.....', '...######...', '.....##.##..', '..##.##.##..', '...######...', '....####....', '............', '............', '............'],
    army:   ['##........##', '.##......##.', '..##....##..', '...##..##...', '....####....', '.....##.....', '....####....', '...##..##...', '.###....###.', '.##......##.', '............', '............'],
    buff:   ['.....##.....', '..#..##..#..', '...#....#...', '.....##.....', '#.##.##.##.#', '...######...', '..########..', '...######...', '#.##.##.##.#', '............', '............', '............'],
    intel:  ['............', '....####....', '..##....##..', '.#..####..#.', '#..##..##..#', '#..##..##..#', '.#..####..#.', '..##....##..', '....####....', '............', '............', '............'],
    strike: ['.........###', '........####', '.......###..', '......###...', '.....###....', '..#####.....', '.#####......', '######......', '.####.......', '..##........', '............', '............'],
    curse:  ['....####....', '..###.......', '.###........', '.##.........', '###.........', '###.........', '.##.........', '.###........', '..###...#...', '....#####...', '............', '............'],
    wonder: ['.....##.....', '....####....', '..########..', '...#.##.#...', '...#.##.#...', '...#.##.#...', '...#.##.#...', '..########..', '.##########.', '............', '............', '............'],
  },
  _glyphCache: {},
  glyphUrl(cat, color) {
    const key = cat + color;
    if (this._glyphCache[key]) return this._glyphCache[key];
    const g = this.GLYPHS[cat] || this.GLYPHS.econ;
    let r = '';
    for (let y = 0; y < g.length; y++) for (let x = 0; x < g[y].length; x++) if (g[y][x] === '#') r += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 10" shape-rendering="crispEdges"><g fill="${color}">${r}</g></svg>`;
    return (this._glyphCache[key] = 'url("data:image/svg+xml;utf8,' + encodeURIComponent(svg) + '")');
  },
  TARGET_LABEL: { none: 'Plays at once', any: 'Aim anywhere', explored: 'Aim at explored ground' },
  /* face(id, opts): opts.w (CSS width wanted), opts.n (×N badge), opts.unknown
     (an undiscovered silhouette), opts.off (greyed + reason), opts.back
     (start flipped). Returns the element; .ccard.flip shows the back. */
  face(id, opts) {
    opts = opts || {};
    this.css();
    const c = this.card(id), t = this.tier(c.tier), sz = this.fit(opts.w || 176), u = sz.w / this.W;
    const el = document.createElement('div');
    el.className = 'ccard t-' + c.tier + (opts.unknown ? ' unknown' : '') + (opts.off ? ' off' : '') + (opts.back ? ' flip' : '');
    el.dataset.card = id;
    el.style.setProperty('--w', sz.w + 'px');
    el.style.setProperty('--h', sz.h + 'px');
    el.style.setProperty('--u', u + 'px');
    el.style.setProperty('--fr', `url("${this.frameUrl(c.tier)}")`);
    el.style.setProperty('--tc', t.col);
    el.style.setProperty('--tg', t.glow);
    const art = opts.unknown ? '' : `background-image:url("${this.artUrl(id)}"), ${this.glyphUrl(c.cat, 'rgba(255,255,255,0.18)')}, radial-gradient(ellipse at 50% 38%, ${t.col}66, #120d08 78%);`;
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // an ATTRIBUTE needs its quotes escaped too: every url("…") here carries
    // double quotes, and one left bare ends style="…" at the url's first quote —
    // the art, its placeholder and the pennant's glyph all silently dropped
    const attr = s => esc(s).replace(/"/g, '&quot;');
    const chips = [this.TARGET_LABEL[c.target]];
    if (c.days) chips.push(c.days + (c.days === 1 ? ' day' : ' days'));
    el.innerHTML =
      `<div class="cc-in">` +
        `<div class="cc-f">` +
          `<i class="cc-art" style="${attr(art)}"></i><i class="cc-fr"></i>` +
          `<i class="cc-ico" style="${attr('background-image:' + this.glyphUrl(c.cat, '#f3e2b4'))}"></i>` +
          `<span class="cc-nm">${opts.unknown ? '?' : esc(c.name)}</span>` +
          (c.tier === 'enlight' && !opts.unknown ? '<i class="cc-foil"></i>' : '') +
        `</div>` +
        `<div class="cc-b">` +
          `<i class="cc-paper"></i><i class="cc-fr"></i>` +
          `<div class="cc-txt"><b class="cc-tier">${esc(t.name)} · ${esc(t.rarity)}</b>` +
          `<b class="cc-bn">${esc(c.name)}</b><p class="cc-eff">${esc(c.text)}</p>` +
          `<p class="cc-fl">${esc(c.flavor)}</p><p class="cc-ch">${chips.map(esc).join(' · ')}</p></div>` +
          `<span class="cc-nm">${esc(t.name)}</span>` +
        `</div>` +
      `</div>` +
      (opts.n > 1 ? `<b class="cc-n">×${opts.n}</b>` : '') +
      (opts.off && opts.why ? `<b class="cc-why">${esc(opts.why)}</b>` : '');
    return el;
  },
  _css: false,
  css() {
    if (this._css || typeof document === 'undefined') return;
    this._css = true;
    const st = document.createElement('style');
    st.id = 'deckCss';
    st.textContent = `
.ccard { position: relative; width: var(--w); height: var(--h); flex: 0 0 auto; perspective: calc(var(--w) * 4); -webkit-tap-highlight-color: transparent; }
.ccard .cc-in { position: absolute; inset: 0; transform-style: preserve-3d; transition: transform .38s cubic-bezier(.3,1.35,.5,1); }
.ccard.flip .cc-in { transform: rotateY(180deg); }
.ccard .cc-f, .ccard .cc-b { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; }
.ccard .cc-b { transform: rotateY(180deg); }
.ccard i { position: absolute; display: block; image-rendering: pixelated; background-size: 100% 100%; background-repeat: no-repeat; }
.ccard .cc-art { left: calc(var(--u) * 12); top: calc(var(--u) * 12); width: calc(var(--u) * 152); height: calc(var(--u) * 168);
  background-position: center, center 40%, center; background-size: 100% 100%, 40% auto, 100% 100%; }
.ccard .cc-fr { inset: 0; background-image: var(--fr); }
.ccard .cc-ico { left: calc(var(--u) * 11); top: calc(var(--u) * 10); width: calc(var(--u) * 14); height: calc(var(--u) * 12); opacity: .92; }
.ccard .cc-nm { position: absolute; left: calc(var(--u) * 16); top: calc(var(--u) * 184); width: calc(var(--u) * 144); height: calc(var(--u) * 42);
  display: flex; align-items: center; justify-content: center; text-align: center; padding: 0 calc(var(--u) * 6); box-sizing: border-box;
  font-family: var(--menufont, 'Cinzel', Georgia, serif); font-weight: 700; text-transform: uppercase; line-height: 1.1;
  font-size: max(calc(var(--u) * 9.5), 7.5px); letter-spacing: calc(var(--u) * .5); color: #f3e2b4; text-shadow: 0 calc(var(--u) * 1) 0 #000; }
.ccard .cc-paper { left: calc(var(--u) * 12); top: calc(var(--u) * 12); width: calc(var(--u) * 152); height: calc(var(--u) * 168);
  background: radial-gradient(ellipse at 50% 30%, #2c2318, #17110b 85%); }
.ccard .cc-txt { position: absolute; left: calc(var(--u) * 22); top: calc(var(--u) * 37); width: calc(var(--u) * 130); height: calc(var(--u) * 139);
  display: flex; flex-direction: column; gap: calc(var(--u) * 3.5); overflow: hidden; color: #efe4cd; text-align: center;
  font-size: calc(var(--u) * 7.2); line-height: 1.28; }
.ccard .cc-txt p { margin: 0; }
.ccard .cc-tier { color: var(--tc); font-size: calc(var(--u) * 6); letter-spacing: calc(var(--u) * .6); text-transform: uppercase; }
.ccard .cc-bn { font-family: var(--menufont, 'Cinzel', Georgia, serif); color: #f3e2b4; font-size: calc(var(--u) * 9); text-transform: uppercase; letter-spacing: calc(var(--u) * .4); }
.ccard .cc-eff { font-weight: 700; }
.ccard .cc-fl { color: #b8a888; font-style: italic; margin-top: auto !important; }
.ccard .cc-ch { color: var(--tc); font-size: calc(var(--u) * 6.2); letter-spacing: calc(var(--u) * .3); }
.ccard .cc-n { position: absolute; right: calc(var(--u) * -4); top: calc(var(--u) * -6); min-width: calc(var(--u) * 26); padding: calc(var(--u) * 2) calc(var(--u) * 5);
  border-radius: 999px; background: #1c140c; border: 2px solid var(--tc); color: #f3e2b4; text-align: center; box-sizing: border-box;
  font: 800 calc(var(--u) * 10) / 1 var(--menufont, 'Cinzel', Georgia, serif); box-shadow: 0 2px 6px rgba(0,0,0,.6); }
.ccard.off .cc-f, .ccard.off .cc-b { filter: grayscale(.85) brightness(.55); }
.ccard .cc-why { position: absolute; left: 6%; right: 6%; top: 44%; padding: calc(var(--u) * 4); border-radius: calc(var(--u) * 4);
  background: rgba(10,8,5,.86); color: #f0c48a; text-align: center; font-size: calc(var(--u) * 8); line-height: 1.25; font-weight: 700; }
.ccard.unknown .cc-art { background: radial-gradient(ellipse at 50% 40%, #241b12, #0b0805 80%); }
.ccard.unknown .cc-f { filter: brightness(.42) saturate(.4); }
.ccard.unknown .cc-nm { font-size: calc(var(--u) * 16); }
.ccard .cc-foil { inset: 0; overflow: hidden; pointer-events: none; -webkit-mask-image: var(--fr); mask-image: var(--fr);
  -webkit-mask-size: 100% 100%; mask-size: 100% 100%; }
.ccard .cc-foil::before { content: ""; position: absolute; top: -10%; bottom: -10%; left: -60%; width: 60%;
  background: linear-gradient(105deg, transparent, rgba(255,255,240,.75) 50%, transparent); mix-blend-mode: overlay;
  animation: ccSheen 3.2s cubic-bezier(.4,.1,.3,1) infinite; }
@keyframes ccSheen { 0% { transform: translateX(0) } 60%, 100% { transform: translateX(380%) } }
@media (prefers-reduced-motion: reduce) {
  .ccard .cc-in { transition: none; }
  .ccard .cc-foil::before { animation: none; transform: translateX(150%); opacity: .5; }
}`;
    document.head.appendChild(st);
  },
};
window.Deck = Deck;
