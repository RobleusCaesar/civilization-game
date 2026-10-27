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
  // the link is read FIRST, whatever the switch says: with CFG.CARDS.ON
  // thrown, ?cards=all must still deal its test deck (a short-circuit here
  // would never read the address at all once the cards ship)
  on() { const dev = this.devOn(); return !!(typeof CFG !== 'undefined' && CFG.CARDS && CFG.CARDS.ON) || dev; },
  devOn() {
    if (this._dev == null) {
      let q = '';
      try { q = String(location.search || ''); } catch (e) {}
      if (/[?&]cards=(1|all)\b/.test(q)) this._set('neo-cards-dev', '1');
      if (/[?&]cards=0\b/.test(q)) {
        this._del('neo-cards-dev');
        /* …and forgets the TEST deck with it: ?cards=all's toy collection
           queues nothing for the cloud and reports nothing (the `test` mark),
           so a device left holding one would never sync again. Leaving the
           test link leaves its toys and gives back the REAL collection the
           link put aside (dealAll's REAL_KEY — its cards, its run ledger and
           the cloud ops still waiting in its queue), exactly as it was plus
           any card EARNED meanwhile (settle's _stashGrant: a real win on a
           toy deck is still a real win); a device that had none and earned
           nothing starts afresh. A real collection standing in the slot is
           never touched. */
        let c = null;
        try { c = JSON.parse(this._get(this.KEY) || 'null'); } catch (e) { c = null; }
        if (c && c.test) {
          const real = this._get(this.REAL_KEY);
          if (real) this._set(this.KEY, real); else this._del(this.KEY);
          this._del(this.REAL_KEY);
          this._col = null;
        }
      }
      /* THE TEST LINK: ?cards=all turns the deck on for the device AND, on
         every load that carries it, deals a fresh TEST deck — one of every
         card in the catalog (ensureStarter, the door every screen passes) —
         so all 36 can be played on a phone over the live site without first
         being earned. */
      this._all = /[?&]cards=all\b/.test(q);
      this._dev = this._get('neo-cards-dev') === '1';
    }
    return this._dev;
  },
  _dev: null,
  _all: false,

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
    const raw = this._get(this.KEY);
    try { c = JSON.parse(raw || 'null'); } catch (e) { c = null; }
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
    this._colRaw = raw;   // what the disk held when read — another tab's write shows as a difference (Deck.sync)
    return c;
  },
  _colRaw: null,
  saveCol() {
    const c = this.col();
    // the run ledger only needs to outlive a reload of the end screen
    const keys = Object.keys(c.runs);
    if (keys.length > 60) for (const k of keys.slice(0, keys.length - 60)) delete c.runs[k];
    if (c.queue.length > CFG.CARDS.QUEUE_MAX) c.queue.splice(0, c.queue.length - CFG.CARDS.QUEUE_MAX);
    this._set(this.KEY, JSON.stringify(c));
    // what the disk now READS (a write refused by a full disk leaves the old)
    this._colRaw = this._get(this.KEY);
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
  _queue(op) { const c = this.col(); if (c.test) return; c.queue.push(Object.assign({ at: Date.now() }, op)); },

  /* THE STARTER HAND: every player without a collection gets three Stone
     cards once — including today's players, the day the switch is thrown. */
  ensureStarter() {
    if (!this.on()) return false;
    if (this._all) { this._all = false; this.dealAll(); }
    const c = this.col();
    if (c.starter) return false;
    c.starter = Date.now();
    for (const id of CFG.CARDS.STARTER) if (this.card(id)) this._add(id, 1);
    this._queue({ op: 'starter', cards: CFG.CARDS.STARTER.slice() });
    this.saveCol();
    return true;
  },

  /* THE TEST DECK (?cards=all): the collection RESET — counts, the run
     ledger, the pity count and the cloud queue cleared, the starter hand
     marked as given so it adds no three more — then one of every card in the
     catalog. It is marked `test`: a test deck is the tester's toy, never the
     player's record, so nothing it grants or plays is queued for the cloud
     from it or reported as telemetry (_queue, track) — and the cloud must
     neither overwrite it nor be written from it (Deck.sync asks
     Deck.isTest()). A card EARNED while it is held is the one exception:
     that grant is banked in the set-aside real collection too, with its op
     in that collection's own queue (settle → _stashGrant).
     A REAL collection is never thrown away to make room: a deal over it
     puts it aside, exactly as stored (its queue of unsynced ops included),
     under REAL_KEY, and ?cards=0 gives it back (devOn); a later deal over a
     test deck leaves the stash alone. A device that had no collection gets
     a fresh starter hand after ?cards=0. */
  REAL_KEY: 'neo-deck-real',
  dealAll() {
    const c = this.col();
    if (!c.test) {
      // the slot holds the device's real collection (or nothing at all — then
      // there is nothing to give back, and no older stash may come back either)
      const raw = this._get(this.KEY);
      if (raw) this._set(this.REAL_KEY, raw); else this._del(this.REAL_KEY);
    }
    c.counts = {}; c.seen = {}; c.runs = {}; c.queue = []; c.pity = 0;
    c.starter = c.starter || Date.now();
    c.test = Date.now();
    for (const card of this.CATALOG) this._add(card.id, 1);
    this.saveCol();
    return this.total();
  },
  isTest() { return !!this.col().test; },

  /* ---------------- who EARNS a card ---------------- */
  /* THE DEEDS (the earn rule, operator: "if they lose, we need something
     better than time — not a card for doing nothing, but a player decimated
     on Hard in five minutes should still get one"). A deed is something
     ONLY THE PLAYER'S OWN HAND STARTS: a building they raised that stood
     finished, a unit they trained, an upgrade, an enemy work their own
     soldiers pulled down, and — capped — the hand-gathering of their
     villagers (one deed per CFG.CARDS.DEED_GATHER, at most DEED_GATHER_CAP)
     and the kills their EXPLICIT attack orders made (one per DEED_KILLS, at
     most DEED_KILL_CAP: a player who only fights has fought). Measured,
     every one of them reads ZERO for a player who touches nothing on Hard,
     origin card, start package and all. What is NOT a deed, and why:
       other kills  towers, the hall's own arrows, a Defend stance and an
                  assault's next mark score kills for a player who never gives
                  an order — only the foe the player SENT a soldier at counts
       S.stats.razed     counts every rival work that falls — a barbarian's
                  torch, and a camp the RIVAL burned — so it read up to 15 on
                  passive Hard runs; handRazed is the player's soldiers alone
       S.stats.gathered  counts a fishing boat's nets, and the Mariner origin
                  puts boats out unasked (up to 1,537 food on a passive run)
       walls      one drag lays ten sections; a gesture is not ten deeds
       a card     no card buys a card (its effects add none of the above)
     Read off S.stats (or a stats object handed in). */
  deeds(st) {
    st = st || (typeof S !== 'undefined' && S && S.stats) || {};
    const D = CFG.CARDS;
    const parts = {
      built: Math.max(0, st.built | 0),
      trained: Math.max(0, st.trained | 0),
      upgrades: Math.max(0, st.upgrades | 0),
      razed: Math.max(0, st.handRazed | 0),
      gathered: Math.min(D.DEED_GATHER_CAP, Math.max(0, Math.floor((+st.handGathered || 0) / D.DEED_GATHER))),
      fought: Math.min(D.DEED_KILL_CAP, Math.max(0, Math.floor((st.handKills | 0) / D.DEED_KILLS))),
    };
    let n = 0;
    for (const k in parts) n += parts[k];
    return { n, parts };
  },
  /* The finished run, read off S at the end screen. `subtotal` is the score
     BEFORE the difficulty multiplier; `deeds` what a defeat is judged on. */
  report(win, cause) {
    let sub = 0;
    try { sub = Score.compute(!!win).subtotal || 0; } catch (e) {}
    // the run's OWN id first: it rides the save and outlives the end, while
    // Backend.lastRunId can be stale (a pre-stamp save, a logRunEnd that threw)
    const runId = S.runId || (window.Backend && (Backend.lastRunId || Backend.runId)) || null;
    return {
      win: !!win, cause: cause || (win ? 'win' : 'unknown'),
      mode: S.mode, day: S.day, seconds: Math.round(S.playtime || 0), subtotal: sub,
      deeds: this.deeds().n, actDays: Math.max(0, (S.stats && S.stats.actDays) | 0),
      runId, key: runId || ('seed:' + S.seed + ':' + S.day + ':' + (win ? 'w' : 'l')),
    };
  },
  /* WHO EARNS: a WIN, always — however long it took, whatever it scored. A
     DEFEAT at the world's hands, when the player fought it: CFG.CARDS.
     LOSS_DEEDS deeds or more, given across LOSS_DAYS game days or more
     (G.noteAct — a burst in the first twenty seconds and then nothing is not
     a fight). A struck banner or a closed tab is not a finish; the "No way
     back" offer's own Resign IS one ('doomed' — the village was already
     lost, and accepting the truth must not cost the card). A defeat that
     falls short says so kindly, with the count of whatever is missing. */
  eligible(rep) {
    if (!rep) return { ok: false, why: 'No game to reward.' };
    if (rep.cause === 'struck_banner' || rep.cause === 'closed_tab') return { ok: false, why: 'A banner struck earns no card.' };
    if (rep.win) return { ok: true };
    const C = CFG.CARDS, need = C.LOSS_DEEDS, have = Math.max(0, rep.deeds | 0);
    const needD = C.LOSS_DAYS, days = Math.max(0, rep.actDays | 0);
    const dShort = have < need, tShort = days < needD;
    if (!dShort && !tShort) return { ok: true };
    const out = { ok: false, short: true, deeds: have, need, days, needDays: needD,
      // the row of pips counts whatever is missing — the deeds first
      pips: dShort ? { n: have, of: need } : { n: days, of: needD } };
    out.why = dShort
      ? `Build, train, gather, upgrade or raze to earn a card from a defeat — ${have} of ${need} deeds` +
        (tShort ? `, orders given on ${days} of ${needD} days.` : '.')
      : `Keep up the fight across the days to earn a card from a defeat — orders given on ${days} of ${needD} days.`;
    return out;
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
    // a TEST deck held: the earning is real all the same (_stashRead, below)
    const real = col.test ? this._stashRead() : null;
    if (real && real.runs[rep.key]) {
      // banked before (a re-dealt toy deck forgot it): the record is never paid twice
      col.runs[rep.key] = real.runs[rep.key].map(x => Object.assign({}, x));
      this.saveCol();
      return { ok: true, again: true, cards: col.runs[rep.key].map(x => Object.assign({}, x)), great: col.runs[rep.key].length > 1 };
    }
    const w = this.table(rep), great = this.great(rep);
    const cards = [];
    let forced = false;
    // the pity that may force a legend is the REAL collection's when a toy
    // deck is held — the record's count, and the one the server re-derives
    const pity = real ? real.pity : col.pity;
    for (let i = 0; i < (great ? 2 : 1); i++) {
      let tier;
      if (i === 0 && rep.win && pity >= CFG.CARDS.PITY) { tier = 'enlight'; forced = true; }
      else tier = this.rollTier(w, rng);
      cards.push({ id: this.rollCard(tier, rng), tier, bonus: i > 0 });
    }
    for (const c of cards) this._add(c.id, 1);
    if (cards.some(c => c.tier === 'enlight')) col.pity = 0;
    else if (rep.win) col.pity++;
    col.runs[rep.key] = cards.map(c => ({ id: c.id, tier: c.tier, bonus: c.bonus }));
    // the cause and the deeds ride the op, so the server can re-run the earn
    // rule (Deck.eligible) on the grant itself as well as on the run's row
    const op = { op: 'grant', run: rep.runId, key: rep.key, outcome: rep.win ? 'win' : 'loss', mode: rep.mode,
      cause: rep.cause, deeds: rep.deeds | 0, act_days: rep.actDays | 0, cards: cards.map(c => c.id), great, pity: forced };
    this._queue(op);
    if (real) this._stashGrant(real, rep, cards, op);
    this.saveCol();
    for (const c of cards) this.track('card_granted', { card: c.id, tier: c.tier, outcome: rep.win ? 'win' : 'loss', difficulty: rep.mode, bonus: c.bonus, run: rep.runId });
    return { ok: true, cards, great, pity: forced };
  },
  /* EARNED IS EARNED (tests/deck-core.mjs — the playtest's test-link slice).
     ?cards=all's toy deck outlives the link on purpose (a phone relaunched
     from the home screen drops the query, and the tester's deck must still
     be there), so a PLAIN visit can still be holding it — and a card won on
     that visit used to be granted into the toy alone, queued nowhere, and
     wiped at ?cards=0 with the rest of the toys. A real win is not a toy:
     a grant settled while a test deck is held ALSO lands in the set-aside
     real collection (REAL_KEY) — the cards, their first-seen, the run's
     line in its ledger and its pity — with the cloud op queued in the
     STASH'S OWN queue, behind whatever it was already waiting to send, so
     it syncs the moment ?cards=0 gives the real collection back. A device
     that had no real collection gets one made: the starter hand marked as
     given (the test deck's own mark — the record's reconcile takes it off
     again if the cloud never claimed it) and the grant. The toy deck still
     shows the card too, and still queues nothing of its own. */
  _stashRead() {
    let s = null;
    try { s = JSON.parse(this._get(this.REAL_KEY) || 'null'); } catch (e) { s = null; }
    if (!s || typeof s !== 'object') s = { v: 1, counts: {}, seen: {}, pity: 0, starter: this.col().starter || Date.now(), runs: {}, queue: [], medians: {} };
    if (!s.counts || typeof s.counts !== 'object') s.counts = {};
    if (!s.seen || typeof s.seen !== 'object') s.seen = {};
    if (!(s.pity >= 0)) s.pity = 0;
    if (!s.runs || typeof s.runs !== 'object') s.runs = {};
    if (!Array.isArray(s.queue)) s.queue = [];
    if (!s.medians || typeof s.medians !== 'object') s.medians = {};
    return s;
  },
  _stashGrant(s, rep, cards, op) {
    for (const c of cards) {
      s.counts[c.id] = (s.counts[c.id] || 0) + 1;
      if (!s.seen[c.id]) s.seen[c.id] = Date.now();
    }
    if (cards.some(c => c.tier === 'enlight')) s.pity = 0;
    else if (rep.win) s.pity++;
    s.runs[rep.key] = cards.map(c => ({ id: c.id, tier: c.tier, bonus: c.bonus }));
    s.queue.push(Object.assign({ at: Date.now() }, op));
    // capped as the slot is (saveCol)
    const keys = Object.keys(s.runs);
    if (keys.length > 60) for (const k of keys.slice(0, keys.length - 60)) delete s.runs[k];
    if (s.queue.length > CFG.CARDS.QUEUE_MAX) s.queue.splice(0, s.queue.length - CFG.CARDS.QUEUE_MAX);
    this._set(this.REAL_KEY, JSON.stringify(s));
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
  /* THE LESSON HAS THE FLOOR (operator ruling 12): while the tutorial's
     spine runs (S.tut on, phase 1) the deck is not in the game — DeckUI
     builds no button and no sheet (DeckUI.tutHides asks this), and the door
     refuses as a backstop. The moment the spine is done (the capstone
     answered, or the lesson skipped) the deck walks in, in the same run. */
  lessonHolds() {
    /* …except for a TEST deck (?cards=all): a tester on a fresh device or a
       private tab gets the lesson switched on by itself for the first two
       games, and a test link whose deck then hides for the whole spine reads
       as broken. Theirs stands from the first morning; the note still rings
       it once the spine is done. */
    return typeof S !== 'undefined' && !!S && !!S.tut && !!S.tut.on && S.tut.phase === 1 && !this.isTest();
  },
  /* A CARD HAS THE FLOOR (tests/tutorial.mjs §15 — the five-player
     playtest, on the operator's own path: a fresh device arms the tutorial by
     itself, and its held note came back 0.2–1 s after every landing, dimming
     the act under its spotlight, sitting over the result toast and running
     the WHOLE ACT at its ×0.2 slow motion — the dragon's 3 s took 15). The
     deck only had the floor while its sheet, aim or flight was up, and the
     acts run for seconds after that. ONE predicate for "a card is being
     played, or its act is still running", so the tutorial — and anything
     else that would talk over a card — asks the same question:
       the deck's own floor  the sheet, the aim, the flight (DeckUI.hasFloor)
       a card's moment       R.cardShows (every show is a few seconds), a
                             summons' light (R.summons) and a fallen star's
                             sky still settling (R._cardSky)
       the acts on SIM time  a strike in the sky (S.deck.strike), the kraken
                             risen (S.deck.kraken), the card's dragon on the
                             wing (S.dragon.ev.card) and the view it borrowed,
                             until that view is handed back
     A read and nothing else: no RNG, nothing written. The world's OWN dragon
     or kraken (rolled, not played) is no card's act and holds nothing here.
     Guarded throughout — a page without the renderer or the deck UI simply
     answers from what it has. */
  acting() {
    try {
      if (window.DeckUI && DeckUI.hasFloor && DeckUI.hasFloor()) return true;
      const Rr = window.R;
      if (Rr && ((Rr.cardShows && Rr.cardShows.length) || (Rr.summons && Rr.summons.length) || Rr._cardSky)) return true;
      if (typeof S === 'undefined' || !S) return false;
      const d = S.deck;
      if (d && (d.strike || d.kraken)) return true;
      if (S.dragon && S.dragon.ev && S.dragon.ev.card) return true;
      const DF = this.FX && this.FX.dragonfire, cam = DF && DF._cam;
      return !!(cam && cam.map === S.map);
    } catch (e) { return false; }
  },
  canPlay(id) {
    if (!this.on()) return { ok: false, why: 'Cards are not available.' };
    const c = this.card(id);
    if (!c) return { ok: false, why: 'Unknown card.' };
    if (this.count(id) < 1) return { ok: false, why: 'You hold no such card.' };
    if (typeof S === 'undefined' || !S || !S.map || S.over) return { ok: false, why: 'Play it in a game.' };
    if (window.Screens && Screens._demo) return { ok: false, why: 'Play it in a game.' };
    if (this.lessonHolds()) return { ok: false, why: 'Finish the lesson first — your deck opens when it ends.' };
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
      if (this.isTest()) return;   // a test deck's plays are nobody's analytics
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
  /* THE NAME FITS ITS PLATE. The plate (PLATE: 144 x 42 authored, 6 a side
     of padding) sets the name at 9.5 per authored pixel, never under 7.5px —
     and on the sheet's smallest face (a 320px phone, 88px wide) that floor
     is half the plate: THE SWALLOWED SUN broke into three lines and spilled
     over the plate's rim, ENLIGHTENMENT (one word) ran past both its ends.
     So a name is FITTED: the largest size, in quarter-pixel steps from the
     plate's own, at which every word fits the plate's width and the name
     takes at most two lines that fit its height (an inline font-size only
     when it has to step down — everything else keeps the stylesheet's).
     Measured in the plate's own face (Cinzel, bold, capitals, with its
     letter-spacing); before Cinzel has loaded, at a conservative 0.8em a
     capital (its widest word runs 0.78). Pure: same name, same width, same
     answer. */
  NM: { size: 9.5, min: 7.5, floor: 5, pad: 6, lh: 1.1, ls: 0.5 },
  _nmCtx: null,
  _nmWidth(text, fs) {
    try {
      if (!document.fonts || document.fonts.check('700 ' + fs + 'px Cinzel')) {
        const q = this._nmCtx || (this._nmCtx = document.createElement('canvas').getContext('2d'));
        q.font = '700 ' + fs + 'px Cinzel, "Times New Roman", Georgia, serif';
        return q.measureText(text).width;
      }
    } catch (e) { /* a measure that cannot be taken falls to the estimate */ }
    return text.length * fs * 0.8;
  },
  nmFit(name, u) {
    const N = this.NM, P = this.PLATE, base = Math.max(N.size * u, N.min);
    const W = (P.w - 2 * N.pad) * u - 1, H = P.h * u, ls = N.ls * u;
    const words = String(name).toUpperCase().split(/\s+/).filter(Boolean);
    const fits = fs => {
      const wd = w => this._nmWidth(w, fs) + ls * w.length, sp = this._nmWidth(' ', fs) + ls;
      let lines = 1, cur = 0;
      for (const w of words) {
        const ww = wd(w);
        if (ww > W) return false;
        if (!cur) cur = ww;
        else if (cur + sp + ww <= W) cur += sp + ww;
        else { lines++; cur = ww; }
      }
      return lines <= 2 && lines * fs * N.lh <= H;
    };
    if (fits(base)) return null;
    for (let fs = Math.floor(base * 4) / 4 - 0.25; fs > N.floor; fs -= 0.25) if (fits(fs)) return fs;
    return N.floor;
  },
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
    // a name stepped down to fit its plate (nmFit) — null keeps the stylesheet's
    const nmSt = s => { const fs = this.nmFit(s, u); return fs ? ` style="font-size:${fs}px"` : ''; };
    el.innerHTML =
      `<div class="cc-in">` +
        `<div class="cc-f">` +
          `<i class="cc-art" style="${attr(art)}"></i><i class="cc-fr"></i>` +
          `<i class="cc-ico" style="${attr('background-image:' + this.glyphUrl(c.cat, '#f3e2b4'))}"></i>` +
          `<span class="cc-nm"${opts.unknown ? '' : nmSt(c.name)}>${opts.unknown ? '?' : esc(c.name)}</span>` +
          (c.tier === 'enlight' && !opts.unknown ? '<i class="cc-foil"></i>' : '') +
        `</div>` +
        `<div class="cc-b">` +
          `<i class="cc-paper"></i><i class="cc-fr"></i>` +
          `<div class="cc-txt"><b class="cc-tier">${esc(t.name)} · ${esc(t.rarity)}</b>` +
          `<b class="cc-bn">${esc(c.name)}</b><p class="cc-eff">${esc(c.text)}</p>` +
          `<p class="cc-fl">${esc(c.flavor)}</p><p class="cc-ch">${chips.map(esc).join(' · ')}</p></div>` +
          `<span class="cc-nm"${nmSt(t.name)}>${esc(t.name)}</span>` +
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
/* THE FOIL RUNS ON THE GOLD, NEVER ON THE NAME PLATE (playtest earn, f-sheen):
   masked by the frame alone, the sheen crossed the plate too — and inside the
   mask's own isolated group its overlay blend had nothing to blend with, so
   over the dark plate it was a hard-edged grey slab every 3.2 s that read as
   a rendering fault. The mask is now the frame MINUS the plate (Deck.PLATE,
   exclude), and the band is three hard steps of light rather than a soft
   vector gradient. */
.ccard .cc-foil { inset: 0; overflow: hidden; pointer-events: none;
  -webkit-mask-image: var(--fr), linear-gradient(#000, #000); mask-image: var(--fr), linear-gradient(#000, #000);
  -webkit-mask-size: 100% 100%, calc(var(--u) * 144) calc(var(--u) * 42); mask-size: 100% 100%, calc(var(--u) * 144) calc(var(--u) * 42);
  -webkit-mask-position: 0 0, calc(var(--u) * 16) calc(var(--u) * 184); mask-position: 0 0, calc(var(--u) * 16) calc(var(--u) * 184);
  -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;
  -webkit-mask-composite: xor; mask-composite: exclude; }
.ccard .cc-foil::before { content: ""; position: absolute; top: -10%; bottom: -10%; left: -60%; width: 60%;
  background: linear-gradient(105deg, transparent 0 30%, rgba(255,250,225,.2) 30% 40%, rgba(255,250,225,.42) 40% 60%,
    rgba(255,250,225,.2) 60% 70%, transparent 70%);
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

/* ================= THE CLOUD: Deck.sync (tests/deck-sync.mjs) =================
   The collection lives on the device so it reads at once and plays offline;
   the cloud is the RECORD once it answers. Every change the device makes is
   queued (starter / grant / consume, above) and this block delivers the
   queue through the doors of supabase/migrations/0008_cards.sql, then
   reconciles the mirror against my_cards(). The rules:

   THE SWITCH    off (CFG.CARDS.ON false, no ?cards=1), sync does NOTHING —
                 no listener, no read, no request.
   THE SITE      only the shipped site talks to the cloud (Backend's own
                 telemetryAllowed gate; the test mock is exempt). A page from
                 disk, a local server and ?dev= stay on the device — and so
                 does a TEST deck (?cards=all / slice, or a mirror marked
                 `test`), whose cards were never earned and which the record
                 must never take back mid-playtest.
   IN ORDER, AND ONLY WHAT WAS ANSWERED LEAVES THE QUEUE. Answered ok — or
                 ok + already, a DUPLICATE (an answer lost on the way back) —
                 the op is done. Refused for good (not earned, not a card that
                 ending can roll, none left) it is dropped, and the reconcile
                 shows what the server holds. Not REACHED (offline, a 5xx, the
                 migration not yet applied, signed out, the hourly cap) it is
                 kept and the drain stops there, to try again with backoff.
                 'no_run' — the run_end row is still in flight, or was lost and
                 is being resent (Backend.flushEnds) — keeps the grant and
                 holds back only the plays of ITS cards; everything else goes.
                 A grant that has said no_run for NO_RUN_DAYS and NO_RUN_TRIES
                 is given up: its evidence is never coming.
   A POISONED OP NEVER BLOCKS THE QUEUE. A 4xx that is not "not yet" (401
                 signed out, 404 the migration not applied, 408, 429) is the
                 server refusing THAT op's shape — a type error, a forbidden
                 call, a unique violation. It is stepped past (its cards'
                 plays held, as for no_run), and given up after BAD_TRIES and
                 BAD_DAYS — but only once the server is seen answering
                 something else, so a fault that refuses EVERY op (a missing
                 grant) never throws a day's earnings away.
   THE RECORD    with the queue empty, my_cards() REPLACES the device's counts
                 (and merges what was seen, the pity count, the winning
                 medians). An answer that comes back after anything was queued,
                 or for a player no longer signed in, is thrown away. A card the
                 record does not hold although the ceremony granted it is SAID,
                 once, in the game's voice (Deck.tellLost) — in the event log if
                 a game is being played, else on the collection screen.
   ONE MIRROR PER PLAYER  neo-deck carries the uid it belongs to (an unowned
                 mirror is the first signed-in player's). A different player
                 signing in on this device parks it under neo-deck@<uid> and
                 brings back theirs — or nothing: nobody inherits a collection.
   TWO TABS, ONE DISK. Each tab mirrors neo-deck in memory, and a tab that
                 saved its stale copy over another's would erase that tab's
                 unsent grant or play. Another tab's write drops this tab's
                 copy (the 'storage' event), a drain re-reads a disk that moved
                 while it slept, and a drain that finds the disk moved under it
                 saves NOTHING and runs again from the disk — what it delivered
                 meanwhile comes back a duplicate, which is done.
   It never blocks the game and never throws: everything is async, nothing
   awaits it, and every failure is an op kept for later. It reads nothing
   about the run (no S at all) — except to say a lost card in a live game. */
Object.assign(Deck, {
  SYNC: {
    WAIT_MS: [5000, 15000, 45000, 135000, 600000],   // the retry after a drain that kept something
    NO_RUN_DAYS: 7,                                   // a grant whose evidence never lands…
    NO_RUN_TRIES: 8,                                  // …is given up after this long AND this many asks
    BAD_DAYS: 1,                                      // an op the server refuses by its shape (a 4xx)…
    BAD_TRIES: 8,                                     // …is given up after this long AND this many asks
    MOVED_MAX: 3,                                     // drains in a row another tab's write may restart at once
    LOST_KEEP: 10,                                    // lost-card notes kept for the telling
  },
  _sy: null,
  _syncState() {
    return this._sy || (this._sy = { busy: null, again: false, timer: 0, nudge: 0, fails: 0, moves: 0, armed: false, last: null, seenUid: null });
  },
  /* the listeners, installed once and only while the switch is on: a new op
     queued (a grant, a play, the starter hand), the network coming back, a
     player signing in (Backend's own status event), and another tab writing
     the mirror */
  syncArm() {
    const st = this._syncState();
    if (st.armed || !this.on()) return false;
    st.armed = true;
    try {
      this.onChange(() => this._syncNudge());
      window.addEventListener('online', () => this.sync('online'));
      /* a SIGN-IN, not every status word: the transport emits backend-status
         on every request that fails, so answering each one with a sync made
         an offline device chase its own failures — the failing drain's emit
         asked for another drain, which failed and emitted again, forever.
         Only a uid this deck has not yet seen (the boot's sign-in, a
         recovery token, the second chance) is news. */
      window.addEventListener('backend-status', e => {
        const uid = e && e.detail && e.detail.uid;
        if (!uid || uid === st.seenUid) return;
        st.seenUid = uid;
        this.sync('signin');
      });
      /* ANOTHER TAB WROTE THE MIRROR: this tab's copy is stale. Drop it (the
         next read is the disk's), let the badge and the collection repaint,
         and a drain in flight runs again from the disk. Never a save here —
         two tabs answering each other's writes with writes would ping-pong. */
      window.addEventListener('storage', e => {
        if (!e || (e.key !== this.KEY && e.key !== null)) return;
        this._col = null;
        if (st.busy) st.again = true;
        this._changed();
      });
    } catch (e) { /* headless */ }
    return true;
  },
  // only a NEW op asks for a delivery: the sync's own saves (an op's try
  // count) must never re-trigger it, or an offline device spins
  _syncNudge() {
    try {
      const st = this._syncState();
      // mid-drain, the drain itself looks for new ops when it finishes
      if (st.busy || st.nudge) return;
      if (!this.col().queue.some(op => !op.q)) return;
      st.nudge = setTimeout(() => { st.nudge = 0; this.sync('change'); }, 40);
    } catch (e) {}
  },
  /* A TEST DECK is the tester's toy, never the player's record: the review
     links (?cards=all deals one of every card, ?cards=slice the gate's five)
     and any mirror marked `test` (Deck.dealAll stamps it, and it outlives
     the link) neither deliver nor reconcile — the cloud would otherwise
     take the dealt cards back at the first answer, mid-playtest. */
  _testDeck() {
    let q = '';
    try { q = String(location.search || ''); } catch (e) {}
    if (/[?&]cards=(slice|all)\b/.test(q)) return true;
    try { return !!this.col().test; } catch (e) { return false; }
  },
  // '' when this device may talk to the cloud now, else the reason it may not
  _syncGate() {
    if (!this.on()) return 'off';
    const B = window.Backend;
    if (!B || !B.rpc) return 'no_backend';
    if (this._testDeck()) return 'test';
    if (!B.configured) return 'not_configured';
    if (!B.mock && !(B.telemetryAllowed && B.telemetryAllowed())) return 'not_site';
    if (!B.isReady() || !B.uid) return 'not_ready';
    return '';
  },
  /* THE ONE ENTRY: deliver what is queued, then reconcile. Resolves to
     { ok, why, sent, done, dropped, kept, reconciled }; a call while one is
     in flight joins it and runs once more after. */
  sync(why) {
    try {
      if (!this.on()) return Promise.resolve({ ok: false, why: 'off' });
      this.syncArm();
      const st = this._syncState();
      if (st.busy) { st.again = true; return st.busy; }
      st.busy = this._syncRun(why)
        .catch(() => ({ ok: false, why: 'error' }))
        .then(r => {
          st.busy = null; st.last = r;
          if (st.again) { st.again = false; return this.sync('again'); }
          return r;
        });
      return st.busy;
    } catch (e) { return Promise.resolve({ ok: false, why: 'error' }); }
  },
  // the disk holds something other than what this tab last read or wrote:
  // another tab has written the mirror
  _diskMoved() { return this._col != null && this._get(this.KEY) !== this._colRaw; },
  async _syncRun(why) {
    const out = { ok: false, why: '', sent: 0, done: 0, dropped: 0, kept: 0, reconciled: false };
    out.why = this._syncGate();
    if (out.why) return out;          // not_ready: the sign-in's status event brings us back
    const B = window.Backend, uid = B.uid, st = this._syncState();
    // a tab that slept through another's write (frozen in the background,
    // its storage event never delivered) reads the disk again first
    if (this._diskMoved()) this._col = null;
    this._syncAdopt(uid);
    // the EVIDENCE first: a run_end the game could not send goes up before
    // the grant that waits on it
    if (B.flushEnds) { try { await B.flushEnds(); } catch (e) {} }
    const c = this.col();
    const mine = () => this._col === c && B.uid === uid && !this._diskMoved();
    const lost = () => (B.uid !== uid ? 'switched' : 'moved');
    if (!mine()) return this._syncMoved(out, lost(), c);
    for (const op of c.queue) op.q = 1;
    const held = {};   // card id → its adding op is waiting (its run_end, or a refused shape)
    const bad = [];    // ops the server refused by their shape this drain
    let stop = '', heard = false;
    for (const op of c.queue.slice()) {
      if (op.op === 'consume' && held[op.card]) continue;
      const v = await this._syncDeliver(op);
      if (!mine()) { stop = lost(); break; }
      if (v.asked) out.sent++;
      op.n = (op.n || 0) + 1;
      op.why = v.why;
      if (v.verdict === 'wait' && op.op === 'grant') {
        op.wait = op.wait || Date.now();
        if (op.n >= this.SYNC.NO_RUN_TRIES && Date.now() - op.wait > this.SYNC.NO_RUN_DAYS * 864e5) {
          v.verdict = 'drop';
          v.why = op.why = 'no_run_expired';
        }
      }
      // the server answered in its own words: it is up, and it can be heard
      if (v.verdict === 'done' || v.verdict === 'wait' || (v.verdict === 'drop' && v.asked)) heard = true;
      if (v.verdict === 'done' || v.verdict === 'drop') {
        const i = c.queue.indexOf(op);
        if (i >= 0) c.queue.splice(i, 1);
        if (v.verdict === 'done') out.done++;
        else { out.dropped++; this._syncNote(op, v.why); }
      } else if (v.verdict === 'wait') {
        for (const id of (op.cards || [])) held[id] = 1;
      } else if (v.verdict === 'bad') {
        op.bad = op.bad || Date.now();
        if (op.op === 'grant') for (const id of (op.cards || [])) held[id] = 1;
        bad.push(op);
      } else { stop = v.why || 'network'; break; }
    }
    /* A POISONED OP is given up only once it is old AND the server is seen
       answering: a drain where something else was answered, or failing that
       one look at the record. A refusal of EVERYTHING (a lost grant on the
       door) is the server's fault, not the op's, and gives up nothing. */
    if (!stop) {
      const due = bad.filter(op => op.n >= this.SYNC.BAD_TRIES && Date.now() - op.bad > this.SYNC.BAD_DAYS * 864e5);
      if (due.length) {
        if (!heard) {
          let r = null;
          try { r = await B.rpc('my_cards', {}); } catch (e) {}
          heard = !!(r && r.ok && r.data && r.data.ok === true);
          if (!mine()) stop = lost();
        }
        if (heard && !stop) for (const op of due) {
          const i = c.queue.indexOf(op);
          if (i >= 0) c.queue.splice(i, 1);
          out.dropped++;
          this._syncNote(op, op.why);
        }
      }
    }
    if (stop === 'moved' || stop === 'switched') return this._syncMoved(out, stop, c);
    st.moves = 0;
    out.kept = c.queue.length;
    this._syncSave(c);
    // the retry first: a reconcile that finds the disk moved schedules its own
    this._syncLater(c.queue.length > 0);
    if (!stop && !c.queue.length && mine()) out.reconciled = await this._syncReconcile(c, uid);
    out.ok = !stop && !c.queue.length;
    out.why = stop || (c.queue.length ? 'held' : '');
    // an op queued while this drain was in flight goes out right behind it
    if (mine() && c.queue.some(op => !op.q)) st.again = true;
    return out;
  },
  /* the mirror moved under a drain: another player signed in (their sign-in
     brings its own sync), or ANOTHER TAB wrote the disk — then this drain
     saves nothing (its copy is stale) and runs again from the disk at once,
     a few times in a row at most before it waits its turn like any retry */
  _syncMoved(out, why, c) {
    out.why = why;
    out.kept = c ? c.queue.length : 0;
    if (why !== 'moved') return out;
    this._col = null;
    const st = this._syncState();
    if (st.moves < this.SYNC.MOVED_MAX) { st.moves++; st.again = true; }
    else { st.moves = 0; this._syncLater(true); }
    return out;
  },
  /* one op through its door. 'done' (answered ok, or a duplicate), 'drop'
     (refused for good), 'wait' (no_run: ask again later, hold its cards'
     plays), 'bad' (refused by its shape: step past it), 'stop' (not reached
     — keep it and everything behind it) */
  async _syncDeliver(op) {
    const B = window.Backend;
    let name, args;
    if (op.op === 'starter') { name = 'claim_starter_hand'; args = {}; }
    else if (op.op === 'grant') {
      // a run with no id (a save from before the run id rode in it) can
      // never be checked against its ending, so it can never be granted
      if (!op.run) return { verdict: 'drop', why: 'no_run_id' };
      name = 'grant_card';
      args = { p_run_id: String(op.run), p_cards: (op.cards || []).slice(0, 2), p_outcome: op.outcome || null };
    } else if (op.op === 'consume') {
      name = 'consume_card';
      args = { p_card_key: op.card, p_play_id: op.play, p_run_id: op.run || null,
        p_day: Math.max(0, Math.min(100000, op.day | 0)) };
    } else return { verdict: 'drop', why: 'unknown_op' };
    let r;
    try { r = await B.rpc(name, args); } catch (e) { r = null; }
    const v = this._syncVerdict(r);
    v.asked = true;
    return v;
  },
  // the 4xx that mean "not yet", never "not this op": signed out, the door
  // not there yet (0008 unapplied), a timeout, the rate limit
  NOT_YET: [401, 404, 408, 429],
  _syncVerdict(r) {
    if (!r || !r.ok) {
      const code = r && r.error && r.error.code;
      // refused by its SHAPE (a type error, forbidden, a unique violation):
      // the op itself, which no retry mends — stepped past, never a wall
      if (typeof code === 'number' && code >= 400 && code < 500 && this.NOT_YET.indexOf(code) < 0)
        return { verdict: 'bad', why: 'http_' + code };
      // not reached: offline, a 5xx, a 404 (0008 not applied yet), signed out
      return { verdict: 'stop', why: String(code || 'network') };
    }
    const d = r.data;
    // an answer that is not one of ours is no answer (an unmocked RPC reads
    // { ok:true, data:null } in a test — a silent pass, if it were believed)
    if (!d || typeof d !== 'object' || typeof d.ok !== 'boolean') return { verdict: 'stop', why: 'no_answer' };
    if (d.ok) return { verdict: 'done', why: d.already ? 'duplicate' : 'ok' };
    const why = String(d.reason || 'refused');
    if (why === 'no_run') return { verdict: 'wait', why };
    // KEPT, never dropped: signed out, and the hourly cap — a grant past the
    // cap dropped here would leave the collection at the next reconcile
    if (why === 'not_authenticated' || why === 'slow_down') return { verdict: 'stop', why };
    if (why === 'duplicate' || why === 'already') return { verdict: 'done', why: 'duplicate' };
    return { verdict: 'drop', why };
  },
  // the refusals, kept short on the mirror for whoever comes looking (and
  // weighed at the next reconcile: a granted card the record does not hold)
  _syncNote(op, why) {
    try {
      const c = this.col();
      if (!Array.isArray(c.refused)) c.refused = [];
      c.refused.push({ at: Date.now(), op: op.op, card: op.card || (op.cards || []).join(','), run: op.run || null,
        outcome: op.outcome || null, why });
      if (c.refused.length > 20) c.refused.splice(0, c.refused.length - 20);
    } catch (e) {}
  },
  /* ONE MIRROR PER PLAYER: an unowned mirror is adopted by the first player
     to sign in on this device; a mirror owned by someone else is parked under
     its owner's uid and the newcomer's own (or a bare one) comes back */
  _syncAdopt(uid) {
    if (!uid) return '';
    const c = this.col();
    if (!c.uid) { c.uid = uid; this._syncSave(c); return 'adopted'; }
    if (c.uid === uid) return '';
    try {
      this._set(this.KEY + '@' + c.uid, JSON.stringify(c));
      const theirs = this._get(this.KEY + '@' + uid);
      this._del(this.KEY + '@' + uid);
      this._set(this.KEY, theirs || JSON.stringify({ uid }));
    } catch (e) {}
    this._col = null;
    const n = this.col();
    n.uid = uid;
    this._syncSave(n);    // the badge and the collection repaint for the player now signed in
    return 'switched';
  },
  /* THE RECORD: my_cards() replaces the counts once nothing is waiting */
  async _syncReconcile(c, uid) {
    let r;
    try { r = await window.Backend.rpc('my_cards', {}); } catch (e) { return false; }
    if (!r || !r.ok || !r.data || r.data.ok !== true) return false;
    const d = r.data;
    // still about THIS mirror: the same player, the same disk, and nothing
    // queued meanwhile (a card played while the answer was in flight would
    // come back to life, and another tab's op would be saved over)
    if (this._col !== c || window.Backend.uid !== uid || (d.uid && d.uid !== uid) || c.queue.length) return false;
    if (this._diskMoved()) { this._syncMoved({}, 'moved'); return false; }
    const before = Object.assign({}, c.counts);
    const counts = {};
    const src = (d.counts && typeof d.counts === 'object') ? d.counts : {};
    for (const id of Object.keys(src)) {
      const n = Math.min(999, Math.floor(+src[id] || 0));
      if (this.card(id) && n > 0) counts[id] = n;
    }
    c.counts = counts;
    const seen = (d.seen && typeof d.seen === 'object') ? d.seen : {};
    for (const id of Object.keys(seen)) if (this.card(id) && !c.seen[id]) c.seen[id] = +seen[id] || Date.now();
    for (const id of Object.keys(counts)) if (!c.seen[id]) c.seen[id] = Date.now();
    /* the starter hand as the RECORD has it: claimed there, it is claimed
       here; NOT claimed there with nothing waiting (its op lost to the
       queue's cap), the mark comes off so the next ensureStarter deals the
       hand again and its op claims it — the record never claims three
       cards the device was shown and the cloud was not */
    if (d.starter === true) c.starter = c.starter || +d.starter_at || Date.now();
    else if (d.starter === false && c.starter) delete c.starter;
    if (d.pity >= 0) c.pity = Math.floor(+d.pity);
    if (d.medians && typeof d.medians === 'object') {
      const m = { at: Date.now() };
      for (const k of ['calm', 'moderate', 'hard']) if (+d.medians[k] > 0) m[k] = Math.round(+d.medians[k]);
      c.medians = m;
    }
    this._syncLost(c, before);
    c.synced = Date.now();
    this._syncSave(c);
    this._tellLost();
    return true;
  },
  /* THE CARD THE RECORD DOES NOT HOLD. The ceremony granted it, the player
     watched it land, and the server refused the grant (not earned, an
     ending that never arrived, a shape it would not take): the reconcile
     takes it off the device, and a card that simply VANISHES reads as a
     bug and breaks "earned". So a count the record lowered, where a refused
     grant had raised it, is written down once (c.lost) and told once. */
  _syncLost(c, before) {
    const ref = Array.isArray(c.refused) ? c.refused : [];
    const drop = {};
    for (const id in before) {
      const n = (before[id] || 0) - (c.counts[id] || 0);
      if (n > 0) drop[id] = n;
    }
    for (const r of ref) {
      if (r.weighed) continue;
      r.weighed = 1;
      if (r.op !== 'grant') continue;
      for (const id of String(r.card || '').split(',')) {
        if (!(drop[id] > 0) || !this.card(id)) continue;
        drop[id]--;
        if (!Array.isArray(c.lost)) c.lost = [];
        c.lost.push({ at: Date.now(), card: id, outcome: r.outcome || null, why: r.why || '' });
      }
    }
    if (Array.isArray(c.lost) && c.lost.length > this.SYNC.LOST_KEEP) c.lost.splice(0, c.lost.length - this.SYNC.LOST_KEEP);
  },
  // the lost cards not yet told
  lostNotes() { const l = this.col().lost; return Array.isArray(l) ? l.filter(x => x && !x.told) : []; },
  lostLine(x) {
    const c = this.card(x.card);
    const from = x.outcome === 'win' ? 'that victory' : x.outcome === 'loss' ? 'that defeat' : 'that game';
    const why = /^no_run/.test(x.why || '') ? 'its ending never reached the record' : 'it never counted';
    return `The record does not hold your ${c ? c.name : 'card'} from ${from} — ${why}.`;
  },
  // tells every lost card not yet told: answers their lines and marks them
  // told (once, wherever it was said)
  tellLost() {
    const notes = this.lostNotes();
    if (!notes.length) return [];
    const lines = notes.map(x => this.lostLine(x));
    for (const x of notes) x.told = Date.now();
    this.saveCol();
    return lines;
  },
  // in a game being PLAYED, the event log says it at once; anywhere else it
  // waits for the collection screen (DeckScreens.openCollection)
  _tellLost() {
    try {
      if (!this.lostNotes().length || typeof S === 'undefined' || !S || !S.map || S.over || !S.played) return 0;
      if (!window.Screens || Screens._demo || Screens.current !== 'playing' || typeof G === 'undefined' || !G.log) return 0;
      const lines = this.tellLost();
      for (const l of lines) G.log('📜 ' + l);
      return lines.length;
    } catch (e) { return 0; }
  },
  _syncSave(c) { if (this._col === c) this.saveCol(); },
  // the retry, backing off while ops are kept; nothing pending, no timer
  _syncLater(kept) {
    const st = this._syncState();
    if (st.timer) { clearTimeout(st.timer); st.timer = 0; }
    if (!kept) { st.fails = 0; return; }
    const W = this.SYNC.WAIT_MS;
    const ms = W[Math.min(st.fails, W.length - 1)];
    st.fails++;
    st.timer = setTimeout(() => { st.timer = 0; this.sync('retry'); }, ms);
  },
});
/* at boot the deck asks for a delivery and arms its listeners — registered
   only when the deck is already on as the script parses: with the switch
   off there is not even an inert listener (the house rule) */
try { if (Deck.on()) window.addEventListener('load', () => { if (Deck.on()) Deck.sync('boot'); }); } catch (e) {}
