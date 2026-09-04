/* LAND CONTRACT — how the ground LOOKS, and the rules that keep it honest
   (architecture + tunables: CLAUDE.md "A living ground", ART_PLAN.md).

   1. DETERMINISM. The whole layer is seeded from S.seed — never Math.random,
      never S.rngState (a draw from the run's RNG would re-deal every roll
      after it). Same seed must mean the same land on a fresh load AND after
      a save/load round trip.

   2. INVALIDATION IS EXACT. Autotiled edges read a tile's neighbours and the
      decal scatter overhangs tile borders, so a terrain change is never
      confined to one tile. An incremental repaint must produce EXACTLY what
      a full rebake would — byte for byte, with no stale seam.

   3. SUPPLIED ART GETS THE SAME TREATMENT. A dropped-in assets/terrain/
      grass.png must still receive the tone layer and the decals, or the day
      someone adds custom ground art the whole layer silently flattens.

   4. DECALS ARE DECORATION. They never land on a building's footprint.

   5. IT ALL BAKES. Nothing here may cost the frame loop anything; a terrain
      edit must stay far under a frame.

   6. THE GROUND MAY NOT SPEAK THE RESOURCE LANGUAGE. gold / fire / berry are
      what the player scans for; a two-pixel decal in one of those ramps is a
      promise the ground cannot keep.

   7. THE COAST IS TRACED, NOT TILED — and it is a DRAWING of the water, never
      a DEFINITION of it. Passability, dock siting, dock orientation, fishing,
      naval movement and shallowness all still read the tile grid, and none of
      them may notice that the painted waterline left it.

   8. AND THE ROCK FIELD IS SCATTERED, NOT TILED. Stone is blitted in world
      space from a lattice that ignores the grid, so a deposit's outline
      wanders — and none of it may reach the rules, or move a pixel an
      incremental repaint would not also move.

   Run after touching: R.landTone / groundTint / cornerShade / landDecals /
   drawDecal / terrainEdges / paintWater / paintGround / rockMass / rockScree /
   denseEdge / waterRegions / chaikin / roughen / buildShoreLayer / blitShore /
   waterKey / rebuildTerrain / drawTileAt / drawTilesAt / clipBoard /
   clipTiles, Sprites.tree, Sprites.rockStamp and the forest/fertile sets, or
   the LAND constants.

     node tests/land.mjs      # exits non-zero on any regression */
let pw;
try { pw = (await import('playwright')).default ?? await import('playwright'); }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
import { writeFileSync, mkdirSync, unlinkSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(root, 'assets/terrain');
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });

// this suite's fixture seeds were tuned against the pre-variant generator;
// classic regenerates those worlds byte-identically (map.js FORCE_VARIANT note)
const classicWorlds = (pg) => pg.addInitScript(() => { window.__CLASSIC_WORLDS = 1; });
const page = async () => {
  const p = await b.newPage({ viewport: { width: 600, height: 500 } });
  p.on('pageerror', e => console.log('PAGEERROR', String(e).slice(0, 200)));
  await classicWorlds(p);
  await p.goto('file://' + join(root, 'index.html'));
  await p.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 20000 });
  return p;
};
const boot = `Boot.force(); G.newGame('verify7','moderate','xlarge');
  Screens._demo=false; Screens.show('playing'); S.paused=true;
  for (let i=0;i<S.map.explored.length;i++){S.map.explored[i]=1; if(S.map.seenTerrain)S.map.seenTerrain[i]=S.map.terrain[i];}
  R.rebuildTerrain();`;

const res = {}, fails = [];
const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };

// ---- 1. determinism across a full reload, and through save/load ----
{
  const sig = async (extra) => {
    const p = await page();
    const v = await p.evaluate(new Function(boot + (extra || '') + `
      const c=R.terrainCache, g=c.getContext('2d');
      const d=g.getImageData(0,0,Math.min(900,c.width),Math.min(900,c.height)).data;
      let h=0x811c9dc5; for(let i=0;i<d.length;i+=7){h^=d[i];h=Math.imul(h,0x01000193);}
      return (h>>>0).toString(16);`));
    await p.close(); return v;
  };
  const a = await sig(), b2 = await sig();
  ck('sameSeedSameLandOnReload', a === b2, a + ' vs ' + b2);
  const viaSave = await sig(`G.loadJSON(G.saveJSON());
     for (let i=0;i<S.map.explored.length;i++){S.map.explored[i]=1; if(S.map.seenTerrain)S.map.seenTerrain[i]=S.map.terrain[i];}
     R.rebuildTerrain();`);
  ck('andThroughSaveAndLoad', viaSave === a, viaSave + ' vs ' + a);
}

// ---- 2. a terrain edit repaints its whole ring, leaving no stale seam ----
{
  const p = await page();
  const v = await p.evaluate(new Function(boot + `
    const c=R.terrainCache, g=c.getContext('2d'), TL=CFG.TILE;
    // a grass tile with all-grass neighbours, well inside the map
    let at=null;
    for(let y=6;y<CFG.H-6&&!at;y++) for(let x=6;x<CFG.W-6&&!at;x++){
      let ok=S.map.terrain[MapGen.idx(x,y)]===T.GRASS;
      for(const[ox,oy]of NEIGH8) if(S.map.terrain[MapGen.idx(x+ox,y+oy)]!==T.GRASS) ok=false;
      if(ok) at={x,y};
    }
    const box=()=>g.getImageData((at.x-1)*TL,(at.y-1)*TL,3*TL,3*TL).data;
    const before=Array.from(box());
    // dig it out, exactly as a sapper would, then repaint through the normal path
    S.map.terrain[MapGen.idx(at.x,at.y)]=T.TRENCH;
    if(S.map.seenTerrain) S.map.seenTerrain[MapGen.idx(at.x,at.y)]=T.TRENCH;
    R.drawTileAt(at.x,at.y);
    const after=Array.from(box());
    // and what a FULL rebake would have produced for the same state
    R.rebuildTerrain();
    const truth=Array.from(box());
    let diffIncr=0, diffTruth=0;
    for(let i=0;i<after.length;i+=4){ if(after[i]!==before[i]) diffIncr++; if(after[i]!==truth[i]) diffTruth++; }
    return { changed: diffIncr, vsFullRebake: diffTruth, at: at.x+','+at.y };`));
  ck('aTerrainEditRepaintsItsRing', v.changed > 200, v.changed + ' px changed in the 3x3');
  ck('andMatchesAFullRebakeExactly', v.vsFullRebake === 0,
    v.vsFullRebake ? v.vsFullRebake + ' px of stale seam' : 'incremental == full');
  await p.close();
}

// ---- 3. dropped-in grass art still receives noise, shade and decals ----
{
  const p0 = await b.newPage({ viewport: { width: 200, height: 200 } });
  const url = await p0.evaluate(() => {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const g = c.getContext('2d'); g.fillStyle = '#808080'; g.fillRect(0, 0, 32, 32);
    return c.toDataURL('image/png');
  });
  mkdirSync(DIR, { recursive: true });
  writeFileSync(`${DIR}/grass.png`, Buffer.from(url.split(',')[1], 'base64'));
  await p0.close();

  const p = await page();
  const v = await p.evaluate(new Function(`Boot.force(); G.newGame('verify7','moderate','xlarge');
    Screens._demo=false; Screens.show('playing'); S.paused=true;
    for (let i=0;i<S.map.explored.length;i++){S.map.explored[i]=1; if(S.map.seenTerrain)S.map.seenTerrain[i]=S.map.terrain[i];}
    return new Promise(r=>setTimeout(()=>{
      R.rebuildTerrain();
      const c=R.terrainCache,g=c.getContext('2d'),TL=CFG.TILE;
      const means=[]; let nonGrey=0, sampled=0;
      for(let y=3;y<CFG.H-3;y++) for(let x=3;x<CFG.W-3;x++){
        let open=S.map.terrain[MapGen.idx(x,y)]===T.GRASS;
        for(const[ox,oy]of NEIGH8) if(S.map.terrain[MapGen.idx(x+ox,y+oy)]!==T.GRASS) open=false;
        if(!open) continue;
        const d=g.getImageData(x*TL+6,y*TL+6,TL-12,TL-12).data;
        let s=0,n=0;
        for(let i=0;i<d.length;i+=4){ s+=d[i+1]; n++; sampled++;
          if(Math.abs(d[i]-d[i+1])>14||Math.abs(d[i+1]-d[i+2])>14) nonGrey++; }
        means.push(s/n);
      }
      const m=means.reduce((a,b)=>a+b,0)/means.length;
      const sd=Math.sqrt(means.reduce((a,b)=>a+(b-m)*(b-m),0)/means.length);
      r({ hasArt: Assets.hasTerrainArt(T.GRASS), tiles: means.length,
          toneSd:+sd.toFixed(2), colouredPct:+(100*nonGrey/sampled).toFixed(2) });
    },1200));`));
  ck('droppedGrassArtIsUsed', v.hasArt, 'terrain override loaded');
  ck('andStillGetsTheToneLayer', v.toneSd > 0.6, 'across-tile sd ' + v.toneSd + ' on flat grey art');
  ck('andStillGetsDecals', v.colouredPct > 0.05,
    v.colouredPct + '% of the floor is non-grey (decals on flat grey art)');
  await p.close();
  unlinkSync(`${DIR}/grass.png`);
}

// ---- 4. decals never land on a building footprint ----
{
  const p = await page();
  const v = await p.evaluate(new Function(boot + `
    const b=S.buildings.find(x=>x.owner==='P');
    if(!b) return {skip:true};
    const sz=Bld.size(b), TL=CFG.TILE;
    let drew=0; const real=R.drawDecal.bind(R);
    R.drawDecal=(...a)=>{drew++;return real(...a);};
    const g=R.terrainCache.getContext('2d');
    for(let j=0;j<sz;j++) for(let i=0;i<sz;i++) R.landDecals(g,b.x+i,b.y+j,S.map.terrain);
    R.drawDecal=real;
    return { onFootprint: drew, key:b.key, sz };`));
  ck('noDecalsOnABuildingFootprint', v.skip || v.onFootprint === 0,
    v.skip ? 'no player building' : v.onFootprint + ' decals on ' + v.key);
  await p.close();
}

// ---- 5. perf: bake time for the largest map, and the frame loop untouched ----
{
  const p = await page();
  const v = await p.evaluate(new Function(boot + `
    const runs=[]; for(let k=0;k<5;k++){const t=performance.now();R.rebuildTerrain();runs.push(performance.now()-t);}
    runs.sort((a,b)=>a-b);
    const ft=[]; for(let k=0;k<40;k++){const t=performance.now();G.frame(performance.now());ft.push(performance.now()-t);}
    ft.sort((a,b)=>a-b);
    /* edits in batches of 20 through the real path, each batch followed by
       a 1x1 getImageData so the DEFERRED RASTER is paid inside the timing.
       Headless Chromium records canvas work and rasterizes later, in
       flushes of ~35ms every dozen-odd edits: an un-flushed single edit
       measures the flush cadence, not the cost, and this check flipped on
       whether 10 or 11 flushes landed among 200 edits (LAND_REFRESH Phase
       1 added ~100 rects to a water edit and tipped it). Raster included,
       a mixed water-and-grass edit on this patch is ~2.5ms flat. */
    const g0=R.terrainCache.getContext('2d');
    const one=[]; for(let b2=0;b2<10;b2++){const t=performance.now();for(let k=0;k<20;k++){const kk=b2*20+k;R.drawTileAt(20+(kk%9),20+((kk/9)|0)%9);}g0.getImageData(0,0,1,1);one.push((performance.now()-t)/20);}
    one.sort((a,b)=>a-b);
    return { bakeMed:+runs[2].toFixed(1), bakeMax:+runs[4].toFixed(1),
             frameMed:+ft[20].toFixed(2), frameP95:+ft[38].toFixed(2),
             editMed:+one[5].toFixed(2), editP95:+one[9].toFixed(2), tiles:CFG.W*CFG.H };`));
  Object.assign(res, { _perf: v });
  ck('theBakeStaysOffTheFrameLoop', v.frameP95 < 16, 'frame p95 ' + v.frameP95 + 'ms');
  ck('andATerrainEditIsCheap', v.editP95 < 8, '3x3 repaint, raster included: worst batch ' + v.editP95 + 'ms per edit');
  await p.close();
}

/* ---- 6. NOTHING WITH A TRUNK GROWS IN OPEN GRASS ----
   Depth is meant to come from the tone layer and the shading at forest
   edges, not from object count. Open ground therefore carries flat,
   ground-level decals ONLY; ferns and leaf litter are an undergrowth fringe
   and may appear only on a tile that actually touches forest. Measured by
   watching every decal the map draws and where it landed. */
{
  const p = await page();
  const v = await p.evaluate(new Function(boot + `
    const terr=S.map.terrain, g=R.terrainCache.getContext('2d');
    const bad=[], foliageOffFringe=[]; let open=0, fringe=0;
    const realDraw=R.drawDecal.bind(R), realLand=R.landDecals.bind(R);
    /* OPEN MEADOW means open: no wood, no water, no crag anywhere around it.
       Reeds by a lake and scree below a crag are context decals and belong
       where they are — the rule under test is about bare grassland. */
    let wood=0, near=0;
    R.landDecals=(gg,x,y,t)=>{
      wood=0; near=0;
      for(const[ox,oy]of NEIGH8){const nx=x+ox,ny=y+oy;
        if(!MapGen.inB(nx,ny)) continue;
        const v=t[MapGen.idx(nx,ny)];
        if(v===T.FOREST){wood++;near++;}
        else if(v===T.WATER||v===T.MOAT||v===T.HILLS||v===T.MOUNTAIN||v===T.PEBBLES||v===T.STUMPS) near++;
      }
      return realLand(gg,x,y,t);
    };
    R.drawDecal=(gg,dx,dy,kind,px,rnd)=>{
      if(wood>=1) fringe++;
      else if(near===0){
        open++;
        if(!R.DECAL_OPEN.has(kind) && bad.length<6) bad.push(kind);
      }
      if(R.DECAL_FOLIAGE.has(kind) && wood===0 && foliageOffFringe.length<6) foliageOffFringe.push(kind);
      return realDraw(gg,dx,dy,kind,px,rnd);
    };
    for(let y=0;y<CFG.H;y++) for(let x=0;x<CFG.W;x++) R.landDecals(g,x,y,terr);
    R.drawDecal=realDraw; R.landDecals=realLand;
    return { open, fringe, bad, foliageOffFringe, density: LAND.DECAL_DENSITY };`));
  ck('onlyFlatThingsGrowInOpenGrass', v.bad.length === 0,
    v.bad.length ? 'found ' + v.bad.join('/') + ' out in the meadow' : v.open + ' open-ground decals, all flat kinds');
  ck('andFoliageKeepsToTheForestFringe', v.foliageOffFringe.length === 0,
    v.foliageOffFringe.length ? v.foliageOffFringe.join('/') + ' with no forest neighbour'
      : v.fringe + ' fringe decals beside real wood');
  ck('andTheScatterHasOneDial', v.density > 0 && v.density <= 1, 'LAND.DECAL_DENSITY = ' + v.density);
  await p.close();
}

// ---- 7. the tone steps must NOT land on tile boundaries ----
{
  const p = await page();
  const v = await p.evaluate(new Function(boot + `
    const TL=CFG.TILE,g=R.terrainCache.getContext('2d');
    let gx=4,gy=4,best=-1;
    for(let y=4;y<CFG.H-10;y++) for(let x=4;x<CFG.W-10;x++){
      let n=0; for(let j=0;j<6;j++) for(let i=0;i<6;i++) if(S.map.terrain[MapGen.idx(x+i,y+j)]===T.GRASS) n++;
      if(n>best){best=n;gx=x;gy=y;}
    }
    const d=g.getImageData(gx*TL,gy*TL,6*TL,6*TL).data;
    const col=(cx)=>{let s=0;for(let yy=0;yy<6*TL;yy++){const i=(yy*6*TL+cx)*4;s+=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];}return s/(6*TL);};
    let e=0,en=0,m=0,mn=0;
    for(let t=1;t<6;t++){e+=col(t*TL)+col(t*TL-1);en+=2;}
    for(let t=0;t<6;t++){m+=col(t*TL+16);mn++;}
    return { bias:+Math.abs(e/en-m/mn).toFixed(3), pure:best };`));
  ck('theToneStepsDoNotDrawTheGrid', v.bias < 1.2,
    'tile-edge vs interior luminance differs by ' + v.bias);
  await p.close();
}

/* ---- 7a. A WOOD IS NOT ONE STAMP REPEATED ----------------------------
   At a crown of ten to sixteen pixels the eye files SILHOUETTE first and
   colour a distant second, so a forest of one shaded disc in three greens
   is a forest of one tree. The kinds must differ in OUTLINE, which is what
   this measures — on the alpha mask, with colour thrown away. ---- */
{
  const p = await page();
  const v = await p.evaluate(new Function(boot + `
    const N=Sprites.TREE_KINDS.length, W=40, H=44, RR=6;
    const mask=(k)=>{
      const c=document.createElement('canvas'); c.width=W; c.height=H;
      const g=c.getContext('2d');
      Sprites._treeProbe((x,y,w,h,col)=>{g.fillStyle=col;g.fillRect(x,y,w,h);}, 20, 24, RR, k);
      const d=g.getImageData(0,0,W,H).data, m=new Uint8Array(W*H);
      let x0=W,y0=H,x1=-1,y1=-1,n=0;
      for(let i=0;i<m.length;i++) if(d[i*4+3]>128){ m[i]=1; n++;
        const x=i%W,y=(i/W)|0; if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; }
      return { m, n, w:x1-x0+1, h:y1-y0+1, aspect:+((x1-x0+1)/(y1-y0+1)).toFixed(2) };
    };
    const ms=[]; for(let k=0;k<N;k++) ms.push(mask(k));
    const pairs=[];
    for(let a=0;a<N;a++) for(let b2=a+1;b2<N;b2++){
      let diff=0, both=0;
      for(let i=0;i<ms[a].m.length;i++){ const A=ms[a].m[i],B=ms[b2].m[i];
        if(A!==B) diff++; if(A||B) both++; }
      pairs.push({ a:Sprites.TREE_KINDS[a], b:Sprites.TREE_KINDS[b2], pct:+(100*diff/both).toFixed(1) });
    }
    // …and the shipped sets must genuinely differ tile to tile, not just
    // in theory: measure how much canopy each sparse tile carries.
    const set=Sprites.terrain[T.FOREST], cov=[];
    for(const img of set){
      const c=document.createElement('canvas'); c.width=c.height=32;
      const g=c.getContext('2d'); g.drawImage(img,0,0);
      const d=g.getImageData(0,0,32,32).data; let n=0;
      for(let i=3;i<d.length;i+=4) if(d[i]>128) n++;
      cov.push(n/1024);
    }
    const mean=cov.reduce((a,b2)=>a+b2,0)/cov.length;
    const sd=Math.sqrt(cov.reduce((a,b2)=>a+(b2-mean)*(b2-mean),0)/cov.length);
    return { kinds:Sprites.TREE_KINDS, pairs, aspects:ms.map(m=>m.aspect),
             worstPair:pairs.reduce((a,b2)=>a.pct<b2.pct?a:b2),
             setN:set.length, covSd:+sd.toFixed(3), covMean:+mean.toFixed(3) };`));
  ck('aWoodIsGrownFromSeveralTrees', v.kinds.length >= 4, v.kinds.join('/'));
  ck('andNoTwoOfThemShareASilhouette', v.worstPair.pct >= 20,
    'closest pair ' + v.worstPair.a + '/' + v.worstPair.b + ' differ over '
    + v.worstPair.pct + '% of the union of their masks (aspects '
    + v.aspects.join(', ') + ')');
  ck('andTheShippedTilesAreNotOneTile', v.covSd > 0.02,
    v.setN + ' fringe tiles, canopy coverage mean ' + v.covMean + ' sd ' + v.covSd);
  await p.close();
}

/* ---- 7b. THE GROUND MAY NOT SPEAK THE RESOURCE LANGUAGE ---------------
   `gold` is the seam, the resource bar and the +gold float; `fire` is a
   building burning, the only unprompted alarm in the game; `berry` is forage
   worth walking to. Ground texture in one of those ramps is a two-pixel
   promise the ground cannot keep.

   The audit covers EVERY ground-layer surface — decals, the core scatter and
   every terrain sprite — because the collisions found by eye were spread
   across all three: a wheat sheaf as bright as brass, orchard fruit in the
   FIRE ramp, a felled stump's cut face 20 units from gold, and bright yellow
   flowers on the one rare meadow tile.

   A colour that MEANS what it looks like is not a collision, so a surface may
   wear a ramp it genuinely is: the gold seam is allowed to look like gold and
   a berry bush is allowed to look like a berry. Those are the only two
   exemptions, and each is named — anything else wearing a reserved colour is
   a false promise. Measured on the DRAWN PIXELS, so a colour arrived at some
   other way is still caught. ---- */
{
  const p = await page();
  const v = await p.evaluate(new Function(boot + `
    const AP=ART.PALETTE;
    const hex=(r,g2,b)=>'#'+[r,g2,b].map(v=>v.toString(16).padStart(2,'0')).join('');
    const rgb=(h)=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
    const banned=[];
    for (const k of R.DECAL_RESERVED) AP[k].forEach((h,i)=>banned.push([k,h,rgb(h),i]));
    // the surface genuinely IS the thing its colour claims
    const TRUTHFUL={ 'coreScatter:GOLDORE':['gold'], 'terrain:GOLDORE':['gold'],
                     'terrain:FERTILE':['berry'] };
    const seenPx=(draw,w,h)=>{
      const c=document.createElement('canvas'); c.width=w; c.height=h;
      const g=c.getContext('2d'); draw(g);
      const d=g.getImageData(0,0,w,h).data, s=new Set();
      for(let i=0;i<d.length;i+=4) if(d[i+3]>200) s.add(hex(d[i],d[i+1],d[i+2]));
      return s;
    };
    const bad=[], ok=[];
    const check=(what,set)=>{
      const allow=TRUTHFUL[what]||[];
      // a colour that IS a member of a ramp this surface may wear is
      // legitimate, and how near it happens to sit to some OTHER ramp is then
      // beside the point — gold[2] is 26 from fire[2] because the palette's
      // two accent ramps neighbour each other, and a gold seam still has to
      // look like gold. The near test exists to catch a surface reaching for
      // a signal colour it has no right to, not to relitigate the palette.
      const owned = new Set();
      for (const ramp of allow) for (const h of AP[ramp]) owned.add(h);
      for(const h of set){ if (owned.has(h)) { ok.push(what+' '+h); continue; }
        const [r0,g0,b0]=rgb(h);
        for(const [ramp,bh,[br,bg,bb],idx] of banned){
          const d=Math.abs(r0-br)+Math.abs(g0-bg)+Math.abs(b0-bb);
          // the DARKEST step of every ramp is exempt from the near test: a
          // ramp's index 0 is its shadow, and every shadow in this palette is
          // the same dark earthy brown. What the eye reads is the bright end.
          const hit = d===0 || (idx>0 && d<=40);
          if(!hit) continue;
          (allow.includes(ramp) ? ok : bad).push(what+' '+h+' ~ '+ramp+'['+bh+'] d='+d);
        }
      }
    };
    for(const kind of [...R.DECAL_OPEN, ...R.DECAL_FOLIAGE, 'reed','damp'])
      check('decal:'+kind, seenPx(g=>{ let s=1;const rnd=()=>{s=(s*1103515245+12345)>>>0;return s/4294967296;};
        for(let k=0;k<24;k++) R.drawDecal(g,8,8,kind,2,rnd); },64,64));
    for(const t of [T.FERTILE,T.PEBBLES,T.GOLDORE]){
      const name=Object.keys(T).find(k=>T[k]===t);
      check('coreScatter:'+name, seenPx(g=>{
        const terr=new Array(CFG.W*CFG.H).fill(t);
        g.translate(-4*CFG.TILE,-4*CFG.TILE);
        for(let k=0;k<40;k++) R.coreScatter(g,4,4,terr,t);
      }, CFG.TILE, CFG.TILE));
    }
    for(const key in T){ const t=T[key];
      for(const set of [Sprites.terrain[t],(Sprites.terrainMed||{})[t],
                        (Sprites.terrainFull||{})[t],(Sprites.terrainRare||{})[t]]){
        if(!set) continue;
        for(const img of set) check('terrain:'+key, seenPx(g=>g.drawImage(img,0,0), img.width, img.height));
      }
    }
    const uniq=a=>[...new Set(a)];
    return { bad:uniq(bad), truthful:uniq(ok).length, reserved:R.DECAL_RESERVED };`));
  ck('noGroundSurfaceMakesAFalsePromise', v.bad.length === 0,
    v.bad.length ? v.bad.slice(0, 8).join('; ')
      : 'nothing in ' + v.reserved.join('/') + ' outside the ' + v.truthful
        + ' places the surface genuinely is that resource');
  await p.close();
}

/* ---- 8. THE TRACED SHORELINE -----------------------------------------
   A coastline drawn per-tile can only ever turn at 45 degrees, however
   pretty the band on each tile is. So the water is flooded into REGIONS,
   each region's boundary traced as a closed polygon, smoothed ABOVE tile
   scale (Chaikin) and then displaced BELOW it (noise) — and every band
   (shelf, foam, beach, shoal) is offset from that curve.

   The load-bearing rule is that this is a DRAWING OF the water, never a
   DEFINITION of it. Tile data is what passability, dock siting, dock
   orientation, fishing and naval movement read, and none of them may
   notice that the painted waterline no longer follows the grid. ---- */
const seaBoot = `Boot.force(); G.newGame('scenes1','moderate','xlarge');
  Screens._demo=false; Screens.show('playing'); S.paused=true;
  for (let i=0;i<S.map.explored.length;i++){S.map.explored[i]=1; if(S.map.seenTerrain)S.map.seenTerrain[i]=S.map.terrain[i];}
  R.rebuildTerrain();`;
{
  const p = await page();
  const v = await p.evaluate(new Function(seaBoot + `
    /* A STAIRCASE IS BEARINGS LOCKED TO MULTIPLES OF 45 DEGREES. Tile edges
       are axis-aligned by construction, so the untraced loops answer ~100%;
       an unbiased scatter of bearings would answer 8*12/360 = 27%. Some
       lock is HONEST — a coast that really does run east-west should read
       axis-aligned — so the bar is the distance from the raw control, not
       from 27. Measured on ~1-tile chords: shorter and it measures the
       noise, longer and it measures the bay. */
    const near45 = (a) => { const d=Math.abs(((a*180/Math.PI)%45+45)%45); return Math.min(d,45-d)<=6; };
    const scan = () => {
      let lock=0,n=0;
      for (const reg of R.waterRegions()) for (const loop of reg.loops) {
        const m=loop.length; if(m<40) continue;
        let per=0; for(let i=0;i<m;i++){const a=loop[i],c=loop[(i+1)%m];per+=Math.hypot(c[0]-a[0],c[1]-a[1]);}
        const step=Math.max(1,Math.round(m/per));
        for(let i=0;i<m;i+=step){const a=loop[i],c=loop[(i+step)%m];
          if(near45(Math.atan2(c[1]-a[1],c[0]-a[0]))) lock++; n++;}
      }
      return { pct:+(100*lock/n).toFixed(1), n };
    };
    const traced = scan();
    const sm=LAND.SHORE_SMOOTH, nz=LAND.SHORE_NOISE;
    LAND.SHORE_SMOOTH=0; LAND.SHORE_NOISE=0; R._shoreKey='';
    const raw = scan();
    LAND.SHORE_SMOOTH=sm; LAND.SHORE_NOISE=nz; R._shoreKey=''; R.waterRegions();
    return { traced, raw, regions:R.waterRegions().length };`));
  ck('theCoastIsTracedNotTiled', v.raw.pct > 90 && v.traced.pct < 60,
    v.traced.pct + '% of ' + v.traced.n + ' chords lock to a 45-degree step, against '
    + v.raw.pct + '% for the untraced tile loops');
  ck('andEveryBodyOfWaterGetsATracedOutline', v.regions >= 2, v.regions + ' regions traced');
  await p.close();
}
{
  /* THE TILE GRID STILL DECIDES EVERYTHING. Two halves: the tracer must not
     WRITE to any map array, and every rule that reads the map must answer
     the same with the drawn coast present as without it. */
  const p = await page();
  const v = await p.evaluate(new Function(seaBoot + `
    const sig = () => {
      const m=S.map, parts=[];
      for (const k of ['terrain','seenTerrain','explored','reclaimed','seenB'])
        if (m[k]) { let h=0x811c9dc5; for(let i=0;i<m[k].length;i++){h^=m[k][i];h=Math.imul(h,0x01000193);} parts.push(k+':'+(h>>>0)); }
      parts.push('fishBack:'+JSON.stringify(m.fishBack||{}));
      parts.push('bld:'+S.buildings.length+'/'+S.units.length);
      return parts.join('|');
    };
    // every water-adjacent answer the game actually asks, before and after
    const answers = () => {
      const out=[];
      for (let y=1;y<CFG.H-1;y++) for (let x=1;x<CFG.W-1;x++) {
        const t=S.map.terrain[MapGen.idx(x,y)];
        if (t!==T.WATER && t!==T.MOAT) continue;
        out.push(Bld.dockSiteOk(x,y,'P').code||'ok');
        out.push(Path.passable(x,y,'P')?1:0);
        out.push(Path.passable(x,y,'P',true)?1:0);
        out.push(Units.canFish?(Units.canFish(x,y)?1:0):0);
        out.push(MapGen.shallowWater(x,y)?1:0);
      }
      // and the ORIENTATION of a real dock, which is chosen from the shore
      const d=S.buildings.find(b=>b.key==='dock');
      out.push(d?Bld.dockShore(d):'none');
      return out.join(',');
    };
    const before = { sig: sig(), ans: answers() };
    R.waterRegions(); R.buildShoreLayer(); R.rebuildTerrain(); R.drawTileAt(4,4);
    const after = { sig: sig(), ans: answers() };
    // …and identical again with the drawn coast suppressed entirely
    const sm=LAND.SHORE_SMOOTH,nz=LAND.SHORE_NOISE,sa=LAND.SHELF_ALPHA,mx=LAND.SAND_MAX;
    LAND.SHELF_ALPHA=0; LAND.SAND_MAX=0; R._shoreKey=''; R.rebuildTerrain();
    const bare = { sig: sig(), ans: answers() };
    LAND.SHORE_SMOOTH=sm;LAND.SHORE_NOISE=nz;LAND.SHELF_ALPHA=sa;LAND.SAND_MAX=mx;
    R._shoreKey=''; R.rebuildTerrain();
    return { wrote: before.sig!==after.sig, moved: before.ans!==after.ans,
             movedBare: before.ans!==bare.ans, n: before.ans.length };`));
  ck('theTracerNeverWritesToTheMap', !v.wrote, 'map arrays unchanged across trace + bake');
  ck('andTheTileGridStillDecidesEverything', !v.moved && !v.movedBare,
    'dock siting, dock facing, land/naval passability, fishing and shallowness '
    + 'all identical with the drawn coast and without it (' + v.n + ' chars of answers)');
  await p.close();
}
{
  // regions are seeded land like everything else, and RE-TRACED ONLY when the
  // water itself moves — an ordinary edit must cost one blit, never a trace.
  const p = await page();
  const v = await p.evaluate(new Function(seaBoot + `
    const key = (rs) => rs.map(r=>r.id+':'+r.cells.length+':'+r.loops.map(l=>
      l.length+'@'+l[0][0].toFixed(3)+','+l[0][1].toFixed(3)).join(';')).join('|');
    const a = key(R.waterRegions());
    G.loadJSON(G.saveJSON());
    for (let i=0;i<S.map.explored.length;i++){S.map.explored[i]=1; if(S.map.seenTerrain)S.map.seenTerrain[i]=S.map.terrain[i];}
    R._shoreKey=''; const b2 = key(R.waterRegions());
    // an ordinary terrain edit (fell a stand) must not move the water key…
    const k0 = R.waterKey();
    let fx=-1,fy=-1;
    for(let y=3;y<CFG.H-3&&fx<0;y++)for(let x=3;x<CFG.W-3;x++)
      if(S.map.terrain[MapGen.idx(x,y)]===T.FOREST){fx=x;fy=y;break;}
    S.map.terrain[MapGen.idx(fx,fy)]=T.STUMPS; S.map.seenTerrain[MapGen.idx(fx,fy)]=T.STUMPS;
    const kFell = R.waterKey();
    // …but flooding one does
    S.map.terrain[MapGen.idx(fx,fy)]=T.MOAT; S.map.seenTerrain[MapGen.idx(fx,fy)]=T.MOAT;
    const kFlood = R.waterKey();
    return { stable: a===b2, fellSame: k0===kFell, floodDiff: k0!==kFlood };`));
  ck('theSameSeedTracesTheSameCoast', v.stable, 'region ids, cells and loops survive a save/load');
  ck('andOnlyWaterMovingReTracesIt', v.fellSame && v.floodDiff,
    'felling a stand leaves the water key alone; flooding a tile changes it');
  await p.close();
}

/* ---- 9. THE ROCK MASS IS A DRAWING, AND THE STREAM IS GONE -----------
   The stone field is scattered in WORLD space now (R.rockMass), not stamped
   per tile, so a boulder crosses tile borders freely and the deposit's
   outline wanders. None of that may reach the rules: a hill is exactly as
   passable, as buildable and as dockable as it was when it was three sprite
   sets.

   THE DECORATIVE STREAM WAS REMOVED, and this pins that it stays removed.
   It was measured at play zoom and only 10.8% of its pixels were bluer than
   they were green — mean (54,81,46) against real water's (39,88,118) — so it
   did not read as water at all; and every run on the reference seed sprang
   out of a rock field, because the source hunt scored high ground and high
   ground is where the crags are. The dilemma is structural rather than a
   tuning failure: subtle enough to be honest is an olive smear, and vivid
   enough to read as water is a lie about a tile nobody can fish, bridge or
   sail. This codebase already refuses to let the ground speak a resource's
   language when it is not that resource (noGroundSurfaceMakesAFalsePromise);
   a whole watercourse that is not water is the same fault, larger. ---- */
const wetBoot = `Boot.force(); G.newGame('verify7','moderate','xlarge');
  Screens._demo=false; Screens.show('playing'); S.paused=true;
  for (let i=0;i<S.map.explored.length;i++){S.map.explored[i]=1; if(S.map.seenTerrain)S.map.seenTerrain[i]=S.map.terrain[i];}
  R.rebuildTerrain();`;
{
  const p = await page();
  const v = await p.evaluate(new Function(wetBoot + `
    const W=CFG.W, H=CFG.H;
    // every tile a rock can reach: the deposits and two rings around them
    const on = new Set();
    for (let y=1;y<H-1;y++) for (let x=1;x<W-1;x++) {
      if (S.map.terrain[y*W+x] !== T.HILLS) continue;
      for (let oy=-2;oy<=2;oy++) for (let ox=-2;ox<=2;ox++) {
        const nx=x+ox, ny=y+oy;
        if (nx>0 && ny>0 && nx<W-1 && ny<H-1) on.add(ny*W+nx);
      }
    }
    const tiles = [...on].map(k => [k % W, (k / W) | 0]);
    const sig = () => {
      const m = S.map, parts = [];
      for (const k of ['terrain','seenTerrain','explored','reclaimed','seenB'])
        if (m[k]) { let h=0x811c9dc5; for(let i=0;i<m[k].length;i++){h^=m[k][i];h=Math.imul(h,0x01000193);} parts.push(k+':'+(h>>>0)); }
      return parts.join('|');
    };
    const answers = () => tiles.map(([x,y]) => [
      Path.passable(x,y,'P') ? 1 : 0,                    // land movement
      Path.passable(x,y,'P',true) ? 1 : 0,               // naval
      Path.passable(x,y,'A') ? 1 : 0,                    // …for the rival too
      Bld.dockSiteOk(x,y,'P').code || 'ok',              // dock siting
      Bld.tileFree ? (Bld.tileFree(x,y) ? 1 : 0) : 0,    // buildable ground
      Bld.canPlace('P','house',x,y,{noCost:1}).code || 'ok',
      Units.canFish ? (Units.canFish(x,y) ? 1 : 0) : 0,  // fishing
      MapGen.shallowWater(x,y) ? 1 : 0,
      Terraform && Terraform.bridgeable ? (Terraform.bridgeable(x,y) ? 1 : 0) : 0,
      Terraform && Terraform.diggable ? (Terraform.diggable(x,y) ? 1 : 0) : 0,
    ].join(',')).join(';');
    const before = { sig: sig(), ans: answers() };
    const rm = R.rockMass, rs = R.rockScree, os = R.oreSlabs;
    R.rockMass = () => {}; R.rockScree = () => {}; R.oreSlabs = () => {}; R.rebuildTerrain();
    const off = { sig: sig(), ans: answers() };
    R.rockMass = rm; R.rockScree = rs; R.oreSlabs = os; R.rebuildTerrain();
    // …and the stream is gone, machinery and tunables together
    const streamApi = ['streams','drawStreams','chaikinOpen','roughenOpen'].filter(k => typeof R[k] === 'function');
    const streamDials = Object.keys(LAND).filter(k => k.startsWith('STREAM'));
    return { tiles: tiles.length, wrote: before.sig !== off.sig, moved: before.ans !== off.ans,
             streamApi, streamDials };`));
  ck('theRockMassWritesToNoMapArray', !v.wrote, 'every map array identical');
  ck('andTheRockMassChangesNoRule', !v.moved,
    'land/naval/rival passability, dock siting, buildable ground, house placement, '
    + 'fishing, shallowness, bridgeability and diggability all identical over '
    + v.tiles + ' tiles with the stone drawn and with it off');
  ck('andTheDecorativeStreamIsGone', v.streamApi.length === 0 && v.streamDials.length === 0,
    v.streamApi.concat(v.streamDials).join(', ') || 'no stream drawing, no stream dials');
  await p.close();
}

/* ---- 9b. STONE READS AS STONE, AND ITS OUTLINE IS NOT THE TILE GRID ---
   The reported fault: rock fields read as pale rounded lumps of near-uniform
   value — bread rolls, not stone you would quarry — inside a region whose
   edge was a staircase of squares.

   Both halves are measured on the RENDERED MAP, and what counts as "rock" is
   established by DIFFING two bakes, one with R.rockMass stubbed out. That is
   (The deposit is drawn in TWO passes now — R.rockMass for the procedural
   boulder field and R.oreSlabs for the drawn stone kit, which runs after the
   wood so a crown never lands on top of a stone. Both have to be stubbed or
   the diff measures nothing at all and every deposit reads as 0% covered.)
   exact where a colour test is not: a deposit stands on the same painted
   grass floor as everything else, and half the map's other decoration is
   grey too. ---- */
{
  const p = await page();
  const v = await p.evaluate(new Function(wetBoot + `
    const W=CFG.W, H=CFG.H, TL=CFG.TILE, d=R.hillField();
    const px = W*TL;
    const g = R.terrainCache.getContext('2d');
    const on = g.getImageData(0,0,px,px).data;
    const rm = R.rockMass, rs = R.rockScree, os = R.oreSlabs;
    R.rockMass=()=>{}; R.rockScree=()=>{}; R.oreSlabs=()=>{}; R.rebuildTerrain();
    const off = R.terrainCache.getContext('2d').getImageData(0,0,px,px).data;
    R.rockMass=rm; R.rockScree=rs; R.oreSlabs=os; R.rebuildTerrain();
    const isRock = (x,y) => { const i=(y*px+x)*4;
      return on[i]!==off[i] || on[i+1]!==off[i+1] || on[i+2]!==off[i+2]; };
    // 1. THE CORE IS SOLID — no bare ground left showing through its heart
    const cover = {};
    for (let ty=1;ty<H-1;ty++) for (let tx=1;tx<W-1;tx++) {
      const dep = d[ty*W+tx]; if (!dep) continue;
      let n=0; for (let j2=0;j2<TL;j2++) for (let i2=0;i2<TL;i2++) if (isRock(tx*TL+i2, ty*TL+j2)) n++;
      const k = Math.min(dep,3);
      (cover[k]=cover[k]||{n:0,cov:0}); cover[k].n++; cover[k].cov += n/(TL*TL);
    }
    for (const k in cover) cover[k].cov = +(cover[k].cov/cover[k].n).toFixed(3);
    // 2. THE OUTLINE IS NOT THE GRID. Walk the left silhouette of the biggest
    //    deposit row by row: a tile-quantized edge holds the same x for a
    //    whole tile at a time, so the longest constant run gives it away.
    let bx=0, by=0, best=-1;
    for (let y=5;y<H-5;y++) for (let x=5;x<W-5;x++) {
      let c=0; for (let oy=-3;oy<=3;oy++) for (let ox=-3;ox<=3;ox++) if (S.map.terrain[(y+oy)*W+x+ox]===T.HILLS) c++;
      if (c>best){best=c;bx=x;by=y;}
    }
    const edge = [];
    for (let r=(by-4)*TL; r<(by+4)*TL; r++) {
      for (let c=(bx-6)*TL; c<(bx+6)*TL; c++)
        if (isRock(c,r)) { edge.push(c); break; }
    }
    let run=1, longest=1;
    for (let i=1;i<edge.length;i++) { if (edge[i]===edge[i-1]) { run++; if (run>longest) longest=run; } else run=1; }
    // 3. FIVE SILHOUETTES, THREE RAMPS, and real value contrast in the mass
    const kinds = Sprites.ROCK_KINDS, pals = Sprites.STONE_PALS;
    const lum = (r,gg,bb) => 0.299*r + 0.587*gg + 0.114*bb;
    let lo=999, hi=-1, n=0, sum=0;
    // sparse stone is measured across the deposit's HEART — the same 7x7 the
    // outline walk uses — not on its one centre tile, which at a stone per
    // five-odd tiles is as often bare as not and read back as NaN
    for (let y=(by-3)*TL; y<(by+4)*TL; y++) for (let x=(bx-3)*TL; x<(bx+4)*TL; x++) {
      if (!isRock(x,y)) continue;
      const i=(y*px+x)*4, l=lum(on[i],on[i+1],on[i+2]);
      if (l<lo) lo=l; if (l>hi) hi=l; sum+=l; n++;
    }
    const mask = (k) => {
      const st = Sprites.rockStamp(k, 10, 0, 1);
      const c2 = document.createElement('canvas'); c2.width=st.width; c2.height=st.height;
      const g2 = c2.getContext('2d'); g2.drawImage(st,0,0);
      const dd = g2.getImageData(0,0,st.width,st.height).data;
      const m=[]; for (let i=3;i<dd.length;i+=4) m.push(dd[i]>128?1:0);
      return m;
    };
    const ms=[]; for (let k=0;k<kinds;k++) ms.push(mask(k));
    let closest=1, pair='';
    for (let a=0;a<kinds;a++) for (let b2=a+1;b2<kinds;b2++) {
      let uni=0, diff=0;
      for (let i=0;i<Math.min(ms[a].length,ms[b2].length);i++) {
        if (ms[a][i]||ms[b2][i]) uni++;
        if (ms[a][i]!==ms[b2][i]) diff++;
      }
      const f = uni ? diff/uni : 0; if (f<closest){closest=f; pair=a+'/'+b2;}
    }
    // …and the MOUNTAIN rock, for the brightness comparison ore must win
    R.mtnStrips();                              // the layer builds lazily now
    let mMean = null;
    if (R._mtnArt && R._mtnArt.length) {
      const a = R._mtnArt.find(a2 => a2.kind === 'region') || R._mtnArt[0];
      const dd2 = a.c.getContext('2d').getImageData(0, 0, a.c.width, a.c.height).data;
      let ms = 0, mn = 0;
      for (let i = 0; i < dd2.length; i += 8) {
        if (dd2[i + 3] < 250) continue;
        ms += lum(dd2[i], dd2[i + 1], dd2[i + 2]); mn++;
      }
      if (mn) mMean = ms / mn;
    }
    return { cover, longest, kinds, pals, pair, closest:+closest.toFixed(3),
             range:+(hi-lo).toFixed(1), mean:+(sum/n).toFixed(1),
             mMean: mMean == null ? null : +mMean.toFixed(1), at:[bx,by],
             slabMode: !!(Assets._muted && (Assets._muted('stone-l') || []).length) };`));
  const core = v.cover['3'] || v.cover['2'];
  /* SCATTERED STONE, NOT A PAVED SHEET. The boulder field packs its heart to
     a solid heap (>= 96%). The DRAWN deposit does the opposite, on the
     referee's ruling: one stone to a tile at most, never two overlapping,
     sprinkled rather than laid. What is pinned is that a deposit shows stone
     at all and that it never closes into a sheet — the look that was
     rejected twice. */
  ck('aDepositIsScatteredStoneNotAPavedSheet',
    // sparse stone is measured across the DEPOSIT, not on one sampled tile:
    // at one stone per five-odd tiles the sampled core is as often bare as not
    (function () {
      const cs = [1, 2, 3].map(k => v.cover[k] && v.cover[k].cov).filter(c => c != null);
      if (!cs.length) return false;
      return v.slabMode ? (Math.max.apply(null, cs) > 0.02 && Math.max.apply(null, cs) < 0.80)
        : (core && core.cov >= 0.96);
    })(),
    'depth 1/2/3 tiles are ' + [1,2,3].map(k => v.cover[k] ? Math.round(v.cover[k].cov*100)+'%' : '-').join(' / ')
    + (v.slabMode ? ' stone — scattered, never paved (slab mode)' : ' stone — packed at the core, thinning at the fringe'));
  ck('andItsOutlineIsNotTheTileGrid', v.longest < 12,
    "the longest straight run down the deposit's silhouette is " + v.longest
    + 'px, against the 32px a tile-quantized edge gives');
  ck('andRockIsBuiltOfFiveFormsInThreeStones', v.kinds >= 5 && v.pals >= 3 && v.closest > 0.25,
    v.kinds + ' silhouettes (closest pair ' + v.pair + ' differs over ' + Math.round(v.closest*100)
    + '% of the union of their masks), ' + v.pals + ' stone ramps');
  /* Part B flipped this check's premise ON PURPOSE: the deposit is no longer
     "stone that reads as stone" — that language (angular, near-black
     crevices) moved to the MOUNTAINS, and ore now reads as TREASURE: round,
     bright, clean-outlined. So the bar is brightness and form, not a dark
     crevice: the deposit must sit clearly LIGHTER than the mountain rock
     (that contrast is what says "resource, not wall" at a glance) and still
     span real values from outline to highlight. */
  ck('andOreOutshinesTheMountainRock',
    v.range >= 70 && v.mean >= 115 && (v.mMean == null || v.mean > v.mMean + 25),
    'ore core mean ' + v.mean + ' (span ' + v.range + ') against mountain rock mean ' + v.mMean);
  await p.close();
}

/* ---- 10. HILLS ARE STILL ORDINARY GROUND -----------------------------
   The elevation hints are a DRAWING. A hill must stay exactly as passable
   and as buildable as it was before anything was shaded on it. ---- */
{
  const p = await page();
  const v = await p.evaluate(new Function(wetBoot + `
    const W=CFG.W, tiles=[];
    for (let y=1;y<CFG.H-1;y++) for (let x=1;x<CFG.W-1;x++)
      if (S.map.terrain[y*W+x] === T.HILLS) tiles.push([x,y]);
    const answers = () => tiles.map(([x,y]) => [
      Path.passable(x,y,'P')?1:0, Path.passable(x,y,'A')?1:0,
      Bld.tileFree ? (Bld.tileFree(x,y)?1:0) : 0,
      Bld.canPlace('P','house',x,y,{noCost:1}).code || 'ok',
    ].join(',')).join(';');
    const before = answers();
    const rel = R.hillRelief, sh = R.hillShadow;
    R.hillRelief=()=>{}; R.hillShadow=()=>{}; R.rebuildTerrain();
    const after = answers();
    R.hillRelief=rel; R.hillShadow=sh; R.rebuildTerrain();
    // …and the shading must actually be doing something
    const d = R.hillHeight();
    let deep=0; for (const [x,y] of tiles) if (d[y*W+x] > 1) deep++;
    return { n: tiles.length, same: before === after, deep, max: R._hillMax };`));
  ck('hillsAreStillOrdinaryGround', v.same,
    v.n + ' hill tiles: passability and buildability identical with the relief and without');
  ck('andTheHillFieldIsRealDepth', v.max >= 2 && v.deep > 0,
    'depth field runs to ' + v.max + ', ' + v.deep + ' tiles more than one deep');
  await p.close();
}

/* ---- 11. LEGIBILITY: BLOCKED GROUND MUST ANNOUNCE ITSELF --------------
   The governing rule of the readability pass: a player must be able to tell
   passable ground from impassable resource terrain instantly, without
   looking closely. That is a GAMEPLAY property, not a taste one, so it is
   measured rather than eyeballed — coverage of the tile by the resource, and
   how far the tile's pixels sit from bare decorated grass. ---- */
{
  const p = await page();
  const v = await p.evaluate(new Function(wetBoot + `
    const TL = 32;
    const lum = (r,g2,b) => 0.299*r + 0.587*g2 + 0.114*b;
    /* MEASURED ON THE RENDERED MAP, and COVERAGE IS A DIFF. The rock mass has
       no tile sprite any more — R.rockMass scatters stamps in world space —
       so asking Sprites.terrainFull[T.HILLS] would measure something the
       player never sees. And a colour test cannot stand in for the sprite's
       old alpha: a wood's canopy is as green as the grass it stands on, so
       "not grass-coloured" scores a dense forest at zero.

       So the map is baked twice, once with every resource's own drawing
       suppressed, and a pixel counts as occupied when the two differ. That is
       exact for all three, and it reads the same bake the player is looking
       at — blocked-ground shade and all. */
    const W = CFG.W, H = CFG.H, px = W*TL;
    /* AND THE PATCHES ARE PLANTED, not hunted for. The reference map has 24
       forest tiles on it and not one 3x3 block of them, so "find a core tile
       of this terrain" quietly measured nothing — which is exactly how the
       old sprite-sheet version of this check hid the fact that it was never
       looking at the map at all. A 5x5 patch of each kind is laid on open
       grass and the map baked around it, which is the real pipeline and is
       the same on every seed. */
    const spots = [];
    for (let y=6;y<H-7;y++) { if (spots.length>=3) break;
      for (let x=6;x<W-7;x++) {
        if (spots.length>=3) break;
        if (spots.some(s2 => Math.abs(s2[0]-x) < 10 && Math.abs(s2[1]-y) < 10)) continue;
        let clear = true;
        for (let oy=-3;oy<=3&&clear;oy++) for (let ox=-3;ox<=3;ox++)
          if (S.map.terrain[(y+oy)*W+x+ox] !== T.GRASS || (Bld.at && Bld.at(x+ox,y+oy))) { clear = false; break; }
        if (clear) spots.push([x,y]);
      }
    }
    if (spots.length < 3) return { tooCrowded: spots.length };
    const kindAt = {};
    ['FOREST','HILLS','FERTILE'].forEach((n2,i) => {
      const [x,y] = spots[i]; kindAt[n2] = [x,y];
      for (let oy=-2;oy<=2;oy++) for (let ox=-2;ox<=2;ox++) {
        S.map.terrain[(y+oy)*W+x+ox] = T[n2];
        if (S.map.seenTerrain) S.map.seenTerrain[(y+oy)*W+x+ox] = T[n2];
      }
    });
    R.rebuildTerrain();
    const on = R.terrainCache.getContext('2d').getImageData(0,0,px,px).data;
    const blank = (() => { const c=document.createElement('canvas'); c.width=c.height=TL; return [c]; })();
    const keep = {}, rm = R.rockMass, rs = R.rockScree, os = R.oreSlabs;
    for (const t of [T.FOREST, T.FERTILE]) {
      keep[t] = [Sprites.terrain[t], Sprites.terrainMed[t], Sprites.terrainFull[t], Sprites.terrainRare[t]];
      Sprites.terrain[t] = Sprites.terrainMed[t] = Sprites.terrainFull[t] = Sprites.terrainRare[t] = blank;
    }
    // …and the world-space stamps go dark the same way: with a catalog
    // installed the trees come from forestStampBand, not the tile sets
    const fsb = R.forestStampBand, fsn = R.forestStampsNear;
    R.forestStampBand = () => {}; R.forestStampsNear = () => {};
    R.rockMass=()=>{}; R.rockScree=()=>{}; R.oreSlabs=()=>{}; R.rebuildTerrain();
    const off = R.terrainCache.getContext('2d').getImageData(0,0,px,px).data;
    for (const t of [T.FOREST, T.FERTILE]) {
      [Sprites.terrain[t], Sprites.terrainMed[t], Sprites.terrainFull[t], Sprites.terrainRare[t]] = keep[t];
    }
    R.rockMass=rm; R.rockScree=rs; R.oreSlabs=os;
    R.forestStampBand = fsb; R.forestStampsNear = fsn;
    const sample = (n2) => {
      const at = kindAt[n2];
      if (!at) return { cov: 0, farPct: 0, meanDelta: 0, missing: 1 };
      const base = lum(...['1','3','5'].map(k=>parseInt(ART.PALETTE.grass[2].slice(+k,+k+2),16)));
      let cov = 0, far = 0, sum = 0;
      for (let j=0;j<TL;j++) for (let i2=0;i2<TL;i2++) {
        const k = ((at[1]*TL+j)*px + at[0]*TL+i2)*4;
        if (on[k]!==off[k] || on[k+1]!==off[k+1] || on[k+2]!==off[k+2]) cov++;
        const dl = Math.abs(lum(on[k],on[k+1],on[k+2]) - base);
        sum += dl; if (dl > 18) far++;
      }
      return { cov: cov/(TL*TL), farPct: far/(TL*TL), meanDelta: sum/(TL*TL) };
    };
    // a DECORATED open-grass tile, the thing blocked ground must out-shout
    const meadow = (() => {
      const c = document.createElement('canvas'); c.width = c.height = TL;
      const g = c.getContext('2d');
      g.fillStyle = ART.PALETTE.grass[2]; g.fillRect(0,0,TL,TL);
      /* a REALISTIC tile, not a stress test: the live scatter never puts more
         than LAND.DECAL_MAX decals on one tile, and packing two dozen in
         measures a density the player never sees. */
      let s2 = 99; const rnd = () => { s2=(s2*1103515245+12345)>>>0; return s2/4294967296; };
      const kinds = [...R.DECAL_OPEN];
      for (let i=0;i<LAND.DECAL_MAX;i++)
        R.drawDecal(g, 3 + rnd()*24, 3 + rnd()*24, kinds[(rnd()*kinds.length)|0], 2, rnd);
      const d = g.getImageData(0,0,TL,TL).data;
      const base = lum(...['1','3','5'].map(k=>parseInt(ART.PALETTE.grass[2].slice(+k,+k+2),16)));
      let far = 0, sum = 0;
      for (let i=0;i<d.length;i+=4){ const dl = Math.abs(lum(d[i],d[i+1],d[i+2]) - base);
        sum += dl; if (dl > 18) far++; }
      return { farPct: far/(TL*TL), meanDelta: sum/(TL*TL) };
    })();
    /* A DEPOSIT IS EXEMPT (the referee's ruling). This rule exists so that
       ground which blocks cannot read as walkable meadow, and a wood and a
       crop are walls of timber and stalk that genuinely fill their tile. A
       stone deposit is scattered rock with grass between — the referee chose
       that picture over a paved sheet, having rejected the sheet twice and
       every ground fill tried under it. It is the one blocked terrain the
       floor does not hold, and it is named here rather than quietly dropped
       so the exemption is a decision on the record and not an oversight. */
    const names = ['FOREST','FERTILE'];
    const blocked = names.map(n => Object.assign({ n }, sample(n)));
    // …and the cue itself must be DERIVED from the movement rule, not a list
    const cue = [];
    for (const key in T) {
      const t = T[key];
      const c = document.createElement('canvas'); c.width = c.height = TL;
      const g = c.getContext('2d');
      const terr = new Array(CFG.W*CFG.H).fill(t);
      g.translate(-5*TL, -5*TL);
      R.blockShade(g, 5, 5, terr);
      // getImageData ignores the transform — read where the PIXELS are
      const d = g.getImageData(0,0,TL,TL).data;
      let n2 = 0; for (let i=3;i<d.length;i+=4) if (d[i] > 0) n2++;
      cue.push({ key, shaded: n2 > 0, blocks: Path.blocksLand(t) });
    }
    return { blocked, meadow, cueMismatch: cue.filter(c2 => c2.shaded !== c2.blocks).map(c2=>c2.key) };`));
  const worst = v.blocked.reduce((a, b2) => a.cov < b2.cov ? a : b2);
  ck('impassableGroundIsVisiblyOccupied', worst.cov >= 0.80,
    v.blocked.map(b2 => b2.n + ' ' + Math.round(b2.cov*100) + '%').join(', ')
    + ' of the tile covered at the core');
  const quietest = v.blocked.reduce((a, b2) => a.meanDelta < b2.meanDelta ? a : b2);
  ck('andOutShoutsDecoratedGrass', quietest.meanDelta > v.meadow.meanDelta * 3,
    'quietest blocked terrain (' + quietest.n + ') sits ' + quietest.meanDelta.toFixed(1)
    + ' from bare grass; a fully decorated meadow tile only ' + v.meadow.meanDelta.toFixed(1));
  ck('andDecorationStaysBackground', v.meadow.farPct < 0.10,
    Math.round(v.meadow.farPct*100) + '% of a decorated meadow tile reads as anything but grass');
  ck('theBlockedCueIsDerivedFromTheMovementRule', v.cueMismatch.length === 0,
    v.cueMismatch.length ? 'disagrees on ' + v.cueMismatch.join(', ')
      : 'R.blockShade fires exactly where Path.blocksLand says a unit cannot walk');
  await p.close();
}

/* ---- 12. A FLOODED MOAT IS PART OF THE WATER IT CAME FROM -------------
   A sapper's channel that reaches a lake JOINS it, and must read as one
   continuous body: no beach running down the middle, and the same blue at
   both ends. Two things had to be true for that and neither was.

   The picture is drawn from a SETTLED state — floodMoats converts its whole
   connected channel and repaints once, where it used to convert and repaint
   tile by tile, so a tile could be painted while the ditch three along was
   still dry and nothing ever came back to it. And when the water MOVES the
   repaint covers the affected region's whole shore, because a band is offset
   from a curve and several things about that curve are properties of the
   loop, not of a point.

   And a MOAT IS A CUT: a ditch a sapper dug and let the water into, whose
   banks are spade-cut earth. It raises no shore of its own — the full
   beach/foam/shelf treatment along one put a rim of sand down both sides
   of the channel, and where the channel met the lake it fed out of, that
   rim read as a shoreline barring an open passage.

   The check that actually catches all of it: after digging and flooding,
   the incrementally-repainted cache must equal a full rebake, byte for
   byte. The sand is measured BEFORE and AFTER over the whole channel
   neighbourhood — the dig may not ADD a grain anywhere (the lake's own
   beach beside it is legitimate and pre-existing), and the channel proper
   must carry none at all. ---- */
{
  const p = await page();
  const v = await p.evaluate(new Function(wetBoot + `
    const W=CFG.W, H=CFG.H, TL=CFG.TILE;
    const wet=(x,y)=>{const t=S.map.terrain[y*W+x];return t===T.WATER||t===T.MOAT;};
    // a lake edge with a clear run of dry land leading away from it
    let sx=-1,sy=-1;
    for(let y=6;y<H-10&&sx<0;y++)for(let x=6;x<W-14;x++){
      if(!wet(x,y)) continue;
      let ok=true; for(let k=1;k<=8;k++) if(S.map.terrain[y*W+x+k]!==T.GRASS){ok=false;break;}
      if(ok){sx=x;sy=y;break;}
    }
    if(sx<0) return {skip:true};
    const sand=ART.PALETTE.bone[2];
    const sr=parseInt(sand.slice(1,3),16), sg=parseInt(sand.slice(3,5),16), sb=parseInt(sand.slice(5,7),16);
    const g2=R.terrainCache.getContext('2d');
    const sandAt=(x,y)=>{const d=g2.getImageData(x*TL,y*TL,TL,TL).data;let c=0;
      for(let i=0;i<d.length;i+=4) if(Math.abs(d[i]-sr)+Math.abs(d[i+1]-sg)+Math.abs(d[i+2]-sb)<30) c++;
      return c;};
    /* The sweep starts at the tile PAST the mouth. The lake's own tile keeps
       its own shore and that shore is re-derived when the channel joins the
       region — the loop is a different loop, so the roughening lands a few
       pixels elsewhere along it. That is the coast being one traced curve,
       not a beach appearing; what must not happen is sand arriving along
       the CHANNEL. */
    const sweep=()=>{const o=[];for(let k=1;k<=9;k++)for(let dy=-1;dy<=1;dy++)o.push(sandAt(sx+k,sy+dy));return o;};
    const pre=sweep();
    // dig and flood exactly as a sapper does (updateTile gates on visibility)
    const vis=G.visibleAt; G.visibleAt=()=>true;
    for(let k=1;k<=8;k++){ S.map.terrain[sy*W+sx+k]=T.TRENCH; R.updateTile(sx+k,sy); }
    Terraform.floodMoats(sx+1,sy);
    G.visibleAt=vis;
    const post=sweep();
    let added=0; for(let i=0;i<pre.length;i++) added+=Math.max(0,post[i]-pre[i]);
    // the channel proper — its own tiles, past the lake mouth — carries none
    let inChannel=0; for(let k=2;k<=8;k++) inChannel+=sandAt(sx+k,sy);
    const inc=R.terrainCache.getContext('2d').getImageData(0,0,W*TL,H*TL).data;
    R.rebuildTerrain();
    const full=R.terrainCache.getContext('2d').getImageData(0,0,W*TL,H*TL).data;
    let stale=0;
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      let d=0;
      for(let j=0;j<TL;j+=2)for(let i=0;i<TL;i+=2){
        const k=((y*TL+j)*W*TL+(x*TL+i))*4;
        if(inc[k]!==full[k]||inc[k+1]!==full[k+1]||inc[k+2]!==full[k+2]) d++;
      }
      if(d>4) stale++;
    }
    // …and the channel really is part of the lake now
    let moats=0; for(let i=0;i<S.map.terrain.length;i++) if(S.map.terrain[i]===T.MOAT) moats++;
    const regionOf=(x,y)=>R.waterRegions().findIndex(rg=>rg.cells.includes(y*W+x));
    const joined = regionOf(sx+4,sy) >= 0 && regionOf(sx+4,sy) === regionOf(sx,sy);
    return { stale, moats, joined, added, inChannel, at:[sx,sy] };`));
  ck('aFloodedMoatJoinsTheWaterItCameFrom', v.skip || (v.moats > 0 && v.joined),
    v.skip ? 'no lake with a dry run beside it' : v.moats + ' moat tiles, one region with the lake');
  /* `added` tolerates a HANDFUL of moved pixels: joining the channel makes a
     different loop, and the two-octave roughening (the straight-shore
     sawtooth fix) lets that re-deal reach a little further along the lake's
     own beach than the excluded mouth tile. That is the coast being one
     traced curve; what stays absolute is the channel itself carrying NO
     sand. */
  ck('andNoBeachRunsDownTheMiddleOfIt', v.skip || (v.added <= 8 && v.inChannel === 0),
    v.skip ? 'skipped' : 'the dig moved ' + v.added + ' sand pixels along the lake shore; the channel itself carries '
      + v.inChannel);
  ck('andDiggingItLeavesNoStaleShore', v.skip || v.stale === 0,
    v.skip ? 'skipped' : v.stale + ' tiles differ from a full rebake after the dig');
  await p.close();
}

/* ---- 12b. THE CACHE NEVER DRIFTS FROM THE BAKE ------------------------
   The day-108 lakeland report: after ~100 days of felling, depleting and
   building along the shores, every lake had curdled into opaque pale
   platforms with hard tile seams and comb-fold "planks" — while a reload
   looked perfect, because a reload rebakes. The shore bands are TRANSLUCENT,
   so any repaint that composites them over ground it did not just reset
   stacks the ribbons a step darker, forever; the wide band re-blit that
   compensated for decal restamps was exactly such a composite. The rules
   that close the class (all in drawTileAt / drawTilesAt / paintGround /
   hillsDirty): RESET ONCE, COMPOSITE ONCE — every pass paints clipped to the
   ground the same call erased; drawTile is box-exact (the grass blade used
   to write 2px into the tile below); a hills/pebbles membership change
   repaints its whole cluster (the rock scatter and relief are properties of
   the cluster's field, hillsDirty beside waterDirty); and the ground reset
   reaches ±2 with decals restamped from ±3, because a decal's look depends
   on terrain within one tile of its anchor and its paint reaches under one
   tile past it — a fern whose forest burned used to orphan its overhang one
   ring out where nothing ever erased it. The check is the disease's own
   shape: hammer every shore-adjacent land tile twice, then fell forest and
   quarry hills through the real updateTile path, and demand the cache equal
   a fresh rebake BYTE FOR BYTE. ---- */
{
  const p = await page();
  const v = await p.evaluate(new Function(boot + `
    const W=CFG.W,H=CFG.H,TL=CFG.TILE;
    const wet=t=>t===T.WATER||t===T.MOAT;
    const terr=S.map.terrain;
    // 1. the session hammer: repaint every land tile within 2 of water, twice
    const shore=[];
    for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
      if(wet(terr[y*W+x]))continue;
      let near=false;
      for(let oy=-2;oy<=2&&!near;oy++)for(let ox=-2;ox<=2;ox++){const nx=x+ox,ny=y+oy;
        if(nx>=0&&ny>=0&&nx<W&&ny<H&&wet(terr[ny*W+nx])){near=true;break;}}
      if(near)shore.push([x,y]);
    }
    for(let r=0;r<2;r++)for(const [x,y] of shore)R.drawTileAt(x,y);
    // 2. real terrain changes through the real path: fell forest (the fern
    //    orphan), quarry hills (the cluster field), deplete fertile
    const vis=G.visibleAt; G.visibleAt=()=>true;
    let flipped=0;
    const flip=(from,to,n)=>{let c=0;
      for(let i=0;i<W*H&&c<n;i++)if(terr[i]===from){terr[i]=to;R.updateTile(i%W,(i/W)|0);c++;flipped++;}};
    flip(T.FOREST,T.STUMPS,3); flip(T.HILLS,T.PEBBLES,3); flip(T.FERTILE,T.BARREN,3);
    G.visibleAt=vis;
    const inc=R.terrainCache.getContext('2d').getImageData(0,0,W*TL,H*TL).data;
    R.rebuildTerrain();
    const full=R.terrainCache.getContext('2d').getImageData(0,0,W*TL,H*TL).data;
    let bad=0;
    for(let k=0;k<inc.length;k+=4)
      if(inc[k]!==full[k]||inc[k+1]!==full[k+1]||inc[k+2]!==full[k+2])bad++;
    return {shore:shore.length,flipped,bad};`));
  ck('aSessionOfRepaintsNeverCurdlesTheWater', v.bad === 0,
    v.shore + ' shore tiles hammered twice, ' + v.flipped + ' terrain flips — '
      + v.bad + ' pixels drift from a fresh rebake');
  await p.close();
}

/* ---- 12. CALM WATER (a reported screenshot: "messy water… fake"). Three
   artifacts, three rules. THE SWELL DRAWS CRESTS ONLY: the navy trough
   pixels (water[0]) chained along the sine bands into diagonal SCRATCHES —
   open water may carry light crests and glints, never the darkest step.
   THE SHELF HAS NO DARK SPOKES: where the roughened base loop zigzags at
   point scale, a deep offset ring FOLDS, the fold cancels the nonzero
   winding, and an unpainted radial sliver is punched through every stacked
   ribbon at once — a comb of dark hairlines fanning out from the shore.
   The far offsets are relaxed (1-2-1, same point count) before filling;
   this measures the RESULT: no shelf sample darker than both its
   along-shore neighbours by more than a sliver's contrast. (The depth
   field is also slower and quieter over water — blobs at the land's
   frequency read as dirt smudges — but that is tuning, not a contract.) ---- */
{
  const p = await page();
  const v = await p.evaluate(new Function(boot + `
    // the spoke pin is about the SHELF's folded rings: the shore shadow's
    // dithered levels (Overhaul 2.3) are darker cells by design, so the
    // geometry is measured with the shadow off
    LAND.SHORE_SHADOW = 0; R.rebakeAll(); while (R.tickBake(1e9)) {}
    const W = CFG.W, TL = CFG.TILE, terr = S.map.terrain;
    const g = R.terrainCache.getContext('2d');
    const rgb = (h) => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
    const W0 = rgb(ART.PALETTE.water[0]);
    // deep water only: no land within 2 tiles, so shoals/kelp/shore bands are out
    let trough = 0, deepTiles = 0;
    for (let y = 3; y < CFG.H - 3; y++) for (let x = 3; x < CFG.W - 3; x++) {
      if (terr[y * W + x] !== T.WATER) continue;
      let deep = true;
      for (let oy = -2; oy <= 2 && deep; oy++) for (let ox = -2; ox <= 2; ox++)
        if (terr[(y + oy) * W + x + ox] !== T.WATER) { deep = false; break; }
      if (!deep) continue;
      deepTiles++;
      const d = g.getImageData(x * TL, y * TL, TL, TL).data;
      for (let i = 0; i < d.length; i += 4)
        if (d[i] === W0[0] && d[i+1] === W0[1] && d[i+2] === W0[2]) trough++;
    }
    // spokes: sample the shelf at half reach along the inward normal, and
    // compare with the same sample a few points along the shore either way
    const lum = (x, y) => { const d = g.getImageData(Math.round(x), Math.round(y), 1, 1).data;
      return (d[0] + d[1] + d[2]) / 3; };
    let spokes = 0, samples = 0;
    const reach = (0.8 * (LAND.SHELF_REACH || 11) * 0.5) / 16;
    for (const reg of R.waterRegions()) for (const loop of reg.loops) {
      const n = loop.length;
      if (n < 24) continue;
      for (let i = 0; i < n; i += 2) {
        const a = loop[(i - 1 + n) % n], b2 = loop[(i + 1) % n];
        let dx = b2[0] - a[0], dy = b2[1] - a[1];
        const dd = Math.hypot(dx, dy) || 1;
        const nx = -dy / dd, ny = dx / dd;              // water on the left-hand normal
        const at = (j) => { const q = loop[((j % n) + n) % n];
          const qa = loop[((j - 1) % n + n) % n], qb = loop[((j + 1) % n + n) % n];
          let ex = qb[0] - qa[0], ey = qb[1] - qa[1];
          const ed = Math.hypot(ex, ey) || 1;
          return lum((q[0] - ey / ed * reach) * TL, (q[1] + ex / ed * reach) * TL); };
        const c = at(i), l = at(i - 4), r2 = at(i + 4);
        samples++;
        if (Math.min(l, r2) - c > 14) spokes++;
      }
    }
    return { trough, deepTiles, spokes, samples };`));
  ck('openWaterCarriesNoNavyTroughs', v.deepTiles > 10 && v.trough === 0,
    v.trough + ' water[0] pixels over ' + v.deepTiles + ' deep tiles — the swell draws crests only');
  ck('andTheShelfHasNoDarkSpokes', v.samples > 200 && v.spokes <= Math.ceil(v.samples * 0.01),
    v.spokes + ' of ' + v.samples + ' shelf samples darker than both shore-wise neighbours' +
    ' (the folded offset rings used to punch a comb of them)');
  await p.close();
}

/* ---- 13. A SLICED BAKE IS THE SAME BAKE ----
   Founding a run marks the terrain bake DUE (R.deferBake) and pays it a slice
   at a time behind the draft screen, so the Begin press answers in the frame
   it happens in instead of freezing for most of a second. That is only sound
   while the sliced path and the all-at-once path paint the SAME PICTURE — and
   they do by construction, because both walk the one list R._bakeSteps
   returns. This is the check that keeps it that way: any future step that
   carries state between phases, or a band whose order stops mattering, shows
   up here as a difference and nowhere else. Byte for byte, like every other
   invalidation rule in this file. */
{
  const p = await page();
  const v = await p.evaluate(new Function(`
    const hash = () => { const c = R.terrainCache, g = c.getContext('2d');
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let h = 0x811c9dc5; for (let i = 0; i < d.length; i += 3) { h ^= d[i]; h = Math.imul(h, 0x01000193); }
      return (h >>> 0).toString(16); };
    Boot.force(); Screens._demo = false;
    // the all-at-once bake every other caller takes
    G.newGame('sliced1', 'moderate', 'large');
    Screens.show('playing'); S.paused = true;
    R.rebuildTerrain();
    const whole = hash();
    // …and the same world founded with the bake deferred, run out in slices
    R.deferBake = true; G.newGame('sliced1', 'moderate', 'large'); R.deferBake = false;
    const due = R._bakeDue, cacheHeld = !R.terrainCache;
    let slices = 0;
    while (R.tickBake(4)) { slices++; if (slices > 5000) break; }
    const sliced = hash();
    // …and a run that never ticks: draw() must still refuse to show a world
    // it has not finished painting (ensureTerrain, forced on the play screen)
    R.deferBake = true; G.newGame('sliced1', 'moderate', 'large'); R.deferBake = false;
    R.ensureTerrain();
    const forced = hash();
    return { whole, sliced, forced, due, cacheHeld, slices, steps: R._bakeSteps().length,
             planLeft: !!R._bake, dueLeft: R._bakeDue };`));
  ck('foundingARunMarksTheBakeDue', v.due && v.cacheHeld,
    'deferBake must leave it DUE and paint nothing — due ' + v.due + ', cache held ' + v.cacheHeld);
  /* The plan must genuinely DIVIDE. The step count is the structural half
     (bands of BAKE_ROWS rows across four passes, plus the one-off caches);
     the slice count is the measured half, and it is deliberately a loose
     bound — how many steps fit in 4ms is a fact about the machine, not about
     the code. A plan that collapsed back into one lump fails both. */
  ck('andThePlanReallyDivides', v.steps > 40 && v.slices > 3,
    v.steps + ' steps, ' + v.slices + ' slices at a 4ms budget');
  ck('aSlicedBakeIsTheSameBake', v.sliced === v.whole,
    'sliced ' + v.sliced + ' vs whole ' + v.whole);
  ck('andForcingItWholeIsTooCarries', v.forced === v.whole,
    'ensureTerrain ' + v.forced + ' vs whole ' + v.whole);
  ck('andTheBakeIsFinishedWhenItSaysSo', !v.planLeft && !v.dueLeft, '');
  await p.close();
}

/* ---- 15. A SPADEFUL DOES NOT FREEZE THE FRAME (R.tickRepaint) ----
   Reported: "I'm getting major game freezes… it always happens with the
   sapper." A dug tile that reaches water makes a new traced loop, so the whole
   region's shore is repainted (see waterDirty) — measured at ~300ms per tile
   on a desktop, seconds on a phone, once per tile of a trench LINE. The near
   ground is painted at once and the far tail drains over the following frames.
   This pins the cost, and that the tail really does finish. */
{
  const p2 = await b.newPage({ viewport: { width: 430, height: 880 } });
  await classicWorlds(p2);
  await p2.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
  await p2.waitForTimeout(900);
  const v = await p2.evaluate(() => {
    G.newGame('freeze1', 'moderate', 'large');
    Screens._demo = false; Screens.show('playing'); S.paused = true;
    G.freeVis = true; G.updateVisibility(); R.rebuildTerrain();
    const W = CFG.W, H = CFG.H, idx = MapGen.idx, terr = S.map.terrain;
    // a grass tile on a big lake's shore with room to dig inland
    let start = null, bestN = 0;
    for (let y = 3; y < H - 8; y++) for (let x = 3; x < W - 8; x++) {
      const i = idx(x, y); if (terr[i] !== T.GRASS) continue;
      let nw = 0;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
        if (terr[idx(x + ox, y + oy)] === T.WATER) nw++;
      if (!nw) continue;
      let ok = true;
      for (let k = 1; k <= 4; k++) if (terr[idx(x, y + k)] !== T.GRASS) { ok = false; break; }
      if (ok && nw > bestN) { bestN = nw; start = { x, y }; }
    }
    if (!start) return { skip: true };
    const t0 = performance.now();
    Terraform.dig(start.x, start.y);
    const digMs = performance.now() - t0;
    const queued = (R._repaintQ || []).length;
    // the tail drains under a budget, and it ENDS
    let slices = 0;
    while (R.tickRepaint(4) && slices < 400) slices++;
    return { skip: false, digMs, queued, slices, left: (R._repaintQ || []).length,
      flooded: S.map.terrain[idx(start.x, start.y)] === T.MOAT };
  });
  if (v.skip) ck('aSpadefulDoesNotFreezeTheFrame', true, 'no lakeside dig site on this map — skipped');
  else {
    ck('aSpadefulDoesNotFreezeTheFrame', v.digMs < 140,
      'one dug tile cost ' + v.digMs.toFixed(0) + 'ms (was ~300ms before the tail was sliced)');
    ck('andTheFarShoreIsQueuedNotPainted', !v.flooded || v.queued > 0,
      v.queued + ' tiles queued for the following frames');
    ck('andTheTailActuallyFinishes', v.left === 0,
      v.slices + ' slices, ' + v.left + ' tiles left');
  }
  await p2.close();
}

/* ---- 16. THE GROUND CAME BACK BLACK (R.cacheState / cacheReturned) ----
   Reported with a day-107 screenshot: every building and unit drawn, the whole
   map behind them empty. Nothing in the game clears the terrain cache — iOS
   Safari PURGES CANVAS BACKING STORES under memory pressure, most often while
   the tab is in the background, and hands back a canvas with its size and no
   pixels. So the loss is detected and the layers rebuilt.

   Served over HTTP on an ephemeral port, because a canvas that has had a PNG
   drawn into it from file:// is TAINTED and getImageData throws — which is
   also why cacheState has a third answer, and why 'unknown' must be treated
   as lost when the player comes back to the tab. */
{
  const dir = root;
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png',
    '.webp': 'image/webp', '.jpg': 'image/jpeg', '.css': 'text/css', '.json': 'application/json',
    '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
  const srv = createServer(async (rq, rs) => {
    try {
      const u = decodeURIComponent(rq.url.split('?')[0]);
      const f = join(dir, u === '/' ? 'index.html' : u.replace(/^\/+/, ''));
      if (!f.startsWith(dir)) { rs.writeHead(403); rs.end(); return; }
      const body = await readFile(f);
      const ext = f.slice(f.lastIndexOf('.'));
      rs.writeHead(200, { 'content-type': types[ext] || 'application/octet-stream' });
      rs.end(body);
    } catch (e) { rs.writeHead(404); rs.end(); }
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const p3 = await b.newPage({ viewport: { width: 430, height: 880 } });
  await classicWorlds(p3);
  await p3.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'domcontentloaded' });
  await p3.waitForTimeout(1200);
  const R_MIN_GUESS = 1500;
  const v = await p3.evaluate(() => {
    G.newGame('purge1', 'moderate', 'large');
    Screens._demo = false; Screens.show('playing'); S.paused = true;
    R.rebuildTerrain();
    // how much of a band across the middle of the screen is ground, not void
    const groundPct = () => {
      R.draw();
      const d = R.cv.getContext('2d').getImageData(0, (R.cv.height * 0.45) | 0, R.cv.width, 60).data;
      let lit = 0;
      for (let i = 0; i < d.length; i += 4)
        if (d[i] > 24 || d[i + 1] > 24 || d[i + 2] > 24) lit++;
      return +(lit / (d.length / 4) * 100).toFixed(1);
    };
    const before = groundPct(), healthy = R.cacheState();
    // exactly what iOS does: the canvas object lives, its pixels are gone
    for (const cv of [R.terrainCache, R.shoreLayer])
      if (cv) cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
    const afterPurge = groundPct(), state = R.cacheState();
    const revived = R.cacheReturned();          // what returning to the tab does
    return { before, healthy, afterPurge, state, revived, after: groundPct(),
      idle: R.cacheReturned() };                // a healthy cache must not rebake again
  });
  ck('aHealthyGroundReadsHealthy', v.healthy === 'ok' && v.before > 90,
    v.healthy + ', ' + v.before + '% ground');
  ck('aPurgedCanvasIsTheBlackMap', v.afterPurge < v.before - 40,
    v.before + '% -> ' + v.afterPurge + '% ground');
  ck('andItIsSeenForWhatItIs', v.state === 'lost', 'cacheState ' + v.state);
  ck('comingBackRebuildsTheGround', v.revived && v.after > 90,
    'revived ' + v.revived + ', ' + v.after + '% ground');
  ck('andAHealthyCacheIsLeftAlone', v.idle === false,
    'a needless rebake on every return is its own hitch');

  /* AND THE WATCHDOG MUST NOT BECOME THE DISEASE. Losing the ground is not
     always a one-off — a big fight is exactly when the renderer allocates the
     most new canvases, which is exactly when a phone is most likely to take
     some back. Un-paced, the revive rebaked 19 times in 20 seconds and pulled
     a DESKTOP down to 20fps. Each revive now at least doubles the wait before
     the next one. */
  const v2 = await p3.evaluate(async () => {
    G.newGame('purge2', 'moderate', 'large');
    Screens._demo = false; Screens.show('playing'); S.paused = true;
    R.rebuildTerrain();
    R._reviveAt = 0; R._reviveGap = 0; R._cacheCheckAt = 0;
    let rebakes = 0;
    const rb = R.rebuildTerrain;
    R.rebuildTerrain = function (...a) { rebakes++; return rb.apply(this, a); };
    // an OS that keeps taking the pixels back, and a heartbeat that keeps looking
    let now = 1e6;
    for (let i = 0; i < 40; i++) {
      for (const cv of [R.terrainCache, R.shoreLayer])
        if (cv) cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
      now += 700;                       // …0.7s apart, for 28 seconds
      R._cacheCheckAt = 0;              // the heartbeat is due every time
      R.watchCache(now);
    }
    R.rebuildTerrain = rb;
    return { rebakes, gap: R._reviveGap };
  });
  ck('aPurgeStormIsNotARebakeTreadmill', v2.rebakes <= 8,
    v2.rebakes + ' rebakes over 28s of relentless purging (was 40 un-paced)');
  ck('andTheWaitBacksOff', v2.gap > R_MIN_GUESS,
    'backoff reached ' + v2.gap + 'ms');
  await p3.close();
  await new Promise(r => srv.close(r));
}

/* ---- 17. FORMATIONS: multi-tile drawn artwork over terrain regions ------
   (js/formations.js, loaded via Assets.setFormationArt — ART_PLAN.md). The
   system is PURELY VISUAL and derived: no map array is written, placement
   is a pure function of (map seed, region signature, catalog), an edit
   re-solves only its own region, and a missing catalog leaves the
   procedural path byte-identical. Pieces here are stand-in canvases
   injected the way a decoded PNG is (the art-pipeline pattern), on a
   PLANTED pebbles region — planted, not hunted for, per section 11's rule.
   Mountains route through the strip layer instead; 17g pins that seam. */
{
  const p = await page();
  const v = await p.evaluate(new Function(boot + `
    const W = CFG.W, res = {};
    // -- stand-in pieces: solid 2x2 (64px overhang), L-shaped 2x2, 2x1 skirt, 1x1
    const mkP = (w, h, col, hole, over) => {
      const c = document.createElement('canvas');
      c.width = w * 128; c.height = h * 128 + (over || 0);
      const g = c.getContext('2d');
      g.fillStyle = col; g.fillRect(0, 0, c.width, c.height);
      if (hole) g.clearRect(hole[0] * 128, (over || 0) + hole[1] * 128, 128, 128);
      return c;
    };
    Assets.setFormationArt('pebbles', 'pebbles-2x2-blob-a', mkP(2, 2, '#ff00c8', null, 64), null);
    Assets.setFormationArt('pebbles', 'pebbles-2x2-blob-b', mkP(2, 2, '#c800ff', [1, 0]), null);
    Assets.setFormationArt('pebbles', 'pebbles-2x1-skirt-a', mkP(2, 1, '#00c8ff'), null);
    Assets.setFormationArt('pebbles', 'pebbles-1x1-crag-a', mkP(1, 1, '#c8ff00'), null);
    res.lMask = Formations.catalogs[T.PEBBLES]['pebbles-2x2-blob-b'].maskN;   // the alpha hole = 3 cells

    // -- plant TWO pebbles regions well apart (section 11's planting rule)
    const spots = [];
    for (let y = 6; y < CFG.H - 12 && spots.length < 2; y++) for (let x = 6; x < W - 12 && spots.length < 2; x++) {
      let ok = true;
      for (let oy = -1; oy < 7 && ok; oy++) for (let ox = -1; ox < 8 && ok; ox++)
        if (S.map.terrain[(y + oy) * W + x + ox] !== T.GRASS || Bld.at(x + ox, y + oy)) ok = false;
      if (ok && spots.every(s => Math.hypot(s.x - x, s.y - y) > 14)) spots.push({ x, y });
    }
    if (spots.length < 2) return { skip: 'no room to plant two regions' };
    const vis = G.visibleAt; G.visibleAt = () => true;
    const plant = (s, tail) => {
      for (let oy = 0; oy < 4; oy++) for (let ox = 0; ox < 4; ox++) {
        S.map.terrain[(s.y + oy) * W + s.x + ox] = T.PEBBLES;
        R.updateTile(s.x + ox, s.y + oy);
      }
      if (tail) for (const [ox, oy] of [[4, 1], [5, 1]]) {
        S.map.terrain[(s.y + oy) * W + s.x + ox] = T.PEBBLES;
        R.updateTile(s.x + ox, s.y + oy);
      }
    };
    plant(spots[0], true); plant(spots[1], false);
    G.visibleAt = vis;

    const regionAt = (s) => Formations.regionsFor(T.PEBBLES).find(r => r.set.has(s.y * W + s.x));
    const rA = regionAt(spots[0]), rB = regionAt(spots[1]);
    if (!rA || !rB) return { skip: 'planted regions not found' };
    const sA = Formations.solve(rA), sB = Formations.solve(rB);

    // -- 17a coverage + no-spill (data level: masks land only on region tiles)
    res.coveredPlusHoles = sA.covered.size + sA.holes.length === rA.area &&
                           sB.covered.size + sB.holes.length === rB.area;
    res.fullCover = sA.holes.length === 0 && sB.holes.length === 0;
    let spill = 0;
    for (const [r, s] of [[rA, sA], [rB, sB]])
      for (const pl of s.placements)
        for (const [dx, dy] of pl.piece.maskCells)
          if (!r.set.has((pl.ty + dy) * W + pl.tx + dx)) spill++;
    res.spill = spill;
    // the composed canvas stays inside bbox + the capped overhang band
    const rec = Formations.regionCanvas(rA, sA);
    res.canvasBounded = rec.x === rA.box[0] * 32 &&
      rec.c.width === (rA.box[2] - rA.box[0] + 1) * 32 &&
      rec.y === rA.box[1] * 32 - Math.ceil(1.5 * 32) &&
      rec.c.height === (rA.box[3] - rA.box[1] + 1) * 32 + Math.ceil(1.5 * 32);

    // -- 17b determinism: same signature, same placements, across cache drops
    const key = (s) => s.placements.map(pl => pl.stem + '@' + pl.tx + ',' + pl.ty).join('|');
    const kA = key(sA);
    Formations._solutions = new Map(); Formations._canvases = new Map();
    res.deterministic = key(Formations.solve(regionAt(spots[0]))) === kA;

    // -- 17c tile-data invariance: solving + drawing writes NO map array and
    // flips NO rule answer; the terrain cache itself is byte-untouched
    const sig = () => {
      let h = 0x811c9dc5;
      const mix = (x2) => { h ^= (x2 == null ? 251 : x2 & 255); h = Math.imul(h, 0x01000193); };
      for (const f of ['terrain', 'seenTerrain', 'explored']) for (const x2 of (S.map[f] || [])) mix(x2);
      for (const k2 of Object.keys(S.map.reclaimed || {}).sort()) mix(+k2);
      return h >>> 0;
    };
    const answers = () => {
      const out = [];
      for (const r of [rA, rB]) for (const k of r.cells) {
        const x2 = k % W, y2 = (k / W) | 0;
        out.push(Path.passable(x2, y2, 'P'), Path.passable(x2, y2, 'P', 'naval'),
          Bld.tileFree(x2, y2), Bld.canPlace('P', 'house', x2, y2, { noCost: 1 }).code);
      }
      return out.join(',');
    };
    const cacheHash = () => {
      const d = R.terrainCache.getContext('2d')
        .getImageData(rA.box[0] * 32 - 16, rA.box[1] * 32 - 16, 6 * 32, 6 * 32).data;
      let h = 0x811c9dc5;
      for (let i = 0; i < d.length; i += 5) { h ^= d[i]; h = Math.imul(h, 0x01000193); }
      return h >>> 0;
    };
    const before = { sig: sig(), ans: answers(), cache: cacheHash() };
    R.draw(1 / 60);                                     // layer really draws
    const cats = Formations.catalogs;
    Formations.catalogs = {}; R.rebuildTerrain(); R.draw(1 / 60);
    const off = { sig: sig(), ans: answers(), cache: cacheHash() };
    Formations.catalogs = cats; R.rebuildTerrain();
    res.mapUntouched = before.sig === off.sig;
    res.rulesUntouched = before.ans === off.ans;
    res.cacheUntouched = before.cache === off.cache && before.cache === cacheHash();

    // -- 17d single-region re-solve: an edit in A re-solves A alone, under
    // budget; B keeps its exact solution OBJECT (never re-shuffled)
    const sB1 = Formations.solve(regionAt(spots[1]));
    G.visibleAt = () => true;
    S.map.terrain[spots[0].y * W + spots[0].x] = T.GRASS;
    R.updateTile(spots[0].x, spots[0].y);
    G.visibleAt = vis;
    const rA2 = Formations.regionsFor(T.PEBBLES).find(r => r.set.has((spots[0].y + 1) * W + spots[0].x));
    res.editChangedSig = rA2 && rA2.sig !== rA.sig;
    const t0 = performance.now();
    const sA2 = Formations.solve(rA2);
    const resolveMs = performance.now() - t0;
    res.resolveUnderBudget = resolveMs < 5;
    res._resolveMs = resolveMs.toFixed(2);
    res.resolveCovers = sA2.holes.length === 0;
    res.neighbourUntouched = Formations.solve(regionAt(spots[1])) === sB1;

    // -- 17e absence degrades to procedural, exactly
    Assets.removeFormationArt('pebbles', 'pebbles-2x2-blob-a');
    Assets.removeFormationArt('pebbles', 'pebbles-2x2-blob-b');
    Assets.removeFormationArt('pebbles', 'pebbles-2x1-skirt-a');
    Assets.removeFormationArt('pebbles', 'pebbles-1x1-crag-a');
    res.emptyCatalogInert = !Formations.any();
    R.rebuildTerrain(); R.draw(1 / 60);
    res.noErrorsAfterRemoval = true;
    return res;
  `));
  if (v.skip) {
    ck('formationsSkipped', true, v.skip);
  } else {
    ck('anAlphaHoleShrinksTheMask', v.lMask === 3, 'L-piece maskN=' + v.lMask);
    ck('everyRegionTileIsCoveredOrprocedural', v.coveredPlusHoles, '');
    ck('aFullCatalogLeavesNoHoles', v.fullCover, '');
    ck('noPieceSpillsOffItsRegion', v.spill === 0, v.spill + ' mask cells astray');
    ck('theRegionCanvasIsBboxPlusOverhang', v.canvasBounded, '');
    ck('theSameSeedPacksTheSamePieces', v.deterministic, '');
    ck('formationsWriteToNoMapArray', v.mapUntouched, '');
    ck('andFlipNoRuleAnswer', v.rulesUntouched, '');
    ck('andNeverTouchTheTerrainCache', v.cacheUntouched, '');
    ck('anEditReSolvesItsOwnRegionOnly', v.editChangedSig && v.neighbourUntouched,
      'sig moved, neighbour solution object kept');
    ck('andTheReSolveIsUnderBudget', v.resolveUnderBudget, v._resolveMs + 'ms (budget 5)');
    ck('andStillCoversTheNewShape', v.resolveCovers, '');
    ck('anEmptyCatalogIsInert', v.emptyCatalogInert && v.noErrorsAfterRemoval, '');
  }
  await p.close();
}

/* ---- 17g. the MOUNTAIN consumer: formation pieces ride the strip layer —
   full occlusion kept — and a region the solver cannot fully cover keeps
   the whole procedural extrusion (the 'region' policy: one object, never a
   mix). scenes1 xlarge is the range-heavy fixture mountain.mjs uses. */
{
  const p = await page();
  const v = await p.evaluate(new Function(`
    Boot.force(); G.newGame('scenes1','moderate','xlarge');
    Screens._demo=false; Screens.show('playing'); S.paused=true;
    for (let i=0;i<S.map.explored.length;i++){S.map.explored[i]=1; if(S.map.seenTerrain)S.map.seenTerrain[i]=S.map.terrain[i];}
    R.rebuildTerrain();
    const res = {};
    res.proceduralStrips = R.mtnStrips().length;
    const mkP = (w, h, col, over) => {
      const c = document.createElement('canvas');
      c.width = w * 128; c.height = h * 128 + (over || 0);
      const g = c.getContext('2d');
      g.fillStyle = col; g.fillRect(0, 0, c.width, c.height);
      return c;
    };
    Assets.setFormationArt('mountain', 'mountain-2x2-peak-a', mkP(2, 2, '#666a75', 128), null);
    Assets.setFormationArt('mountain', 'mountain-2x1-skirt-a', mkP(2, 1, '#4b4f5a'), null);
    Assets.setFormationArt('mountain', 'mountain-1x2-ridge-a', mkP(1, 2, '#5a5f6a', 64), null);
    Assets.setFormationArt('mountain', 'mountain-1x1-crag-a', mkP(1, 1, '#83899a', 32), null);
    const strips = R.mtnStrips();
    res.allFormation = R._mtnArt.length > 0 && R._mtnArt.every(a => a.kind === 'formation');
    res.stripCount = strips.length;
    let sorted = true;
    for (let i = 1; i < strips.length; i++) if (strips[i].row < strips[i - 1].row) sorted = false;
    res.sorted = sorted;
    // cover is exactly the mountain cells — formations never spill onto
    // walkable ground, so the occluded-walkable set is empty
    res.coverExact = R._mtnCover.reduce((a, v2) => a + v2, 0) ===
                     R.mtnRegions().reduce((a, r) => a + r.cells.length, 0);
    res.occEmpty = R._mtnOcc.size === 0;
    // without the 1x1 some regions cannot fully cover -> those whole regions
    // revert to procedural; nothing renders half-and-half
    Assets.removeFormationArt('mountain', 'mountain-1x1-crag-a');
    R.mtnStrips();
    const kinds = new Set(R._mtnArt.map(a => a.kind || 'region'));
    res.mixedIsPerRegion = kinds.has('formation') && (kinds.has('region') || kinds.has('outcrop'));
    // full removal -> the procedural layer returns whole
    Assets.removeFormationArt('mountain', 'mountain-2x2-peak-a');
    Assets.removeFormationArt('mountain', 'mountain-2x1-skirt-a');
    Assets.removeFormationArt('mountain', 'mountain-1x2-ridge-a');
    res.proceduralReturns = R.mtnStrips().length === res.proceduralStrips;
    return res;
  `));
  ck('mountainFormationsRideTheStripLayer', v.allFormation && v.stripCount > 0 && v.sorted,
    v.stripCount + ' strips, sorted by ground row');
  ck('theCoverIsExactlyTheMountain', v.coverExact && v.occEmpty,
    'no spill, no occluded-walkable tiles');
  ck('aRegionIsFormationOrProceduralNeverBoth', v.mixedIsPerRegion, '');
  ck('removingTheCatalogRestoresTheExtrusion', v.proceduralReturns, '');
  await p.close();
}

/* ---- 18. THE PERF GATES (LAND_REFRESH.md) ----
   The hard ceilings every beautification phase is held to: the FIRST bake
   on the worst map we have (scenes1 xlarge, mountain-heavy) and on the
   standard xlarge fixture; a terrain edit through the real repaint path;
   the world pass of one frame at default zoom; and the static rule that
   nothing in R.draw's own body creates a canvas or reads pixels back.
   The bench (js/dev.js) is what tunes against these; this is what stops
   a tuning session from shipping a regression.

   HOW THE EDIT IS MEASURED, AND WHY THE OLD WAY COULD NOT FAIL.
   performance.now() is clamped — 0.1ms in headless Chromium, 1ms in
   WebKit — so timing ONE drawTileAt answers 0.6 or 0.7 and nothing between.
   And the old 9x9 patch at (20,20) on verify7 was half grass, half water:
   an open-ground edit is ~0.8ms here, an edit within two tiles of water is
   2–4ms (paintWaterIn clips to the whole map's water outline), and a
   per-call MEDIAN only ever saw the cheap half. With a 4x "CI multiplier"
   stacked on top, the gate had never been able to trip on merit.

   NOW: two NAMED workloads, each a 7x7 patch whose composition is asserted
   so a generator change fails loudly instead of silently re-baselining —
   open grass with no water within 8 tiles, and a shore patch of 15–34 water
   tiles. Each is timed as WHOLE BATCHES of 49 edits (mean per edit) after
   two warm-up batches, and the statistic is the MIN over 9 batches, which
   is the one that repeats: ±3% on grass, ±7% on the shore across fresh
   pages on the baseline machine. The gate is that baseline + 10%, with no
   multiplier. Machine noise is filtered the honest way — a failing gate is
   re-measured ONCE on a fresh page and the better run counts; a real
   regression fails both. Run it on a quiet machine. These are RECORDING
   costs — headless Chromium defers canvas raster — which is what the
   baseline measured too; §5 measures the same edits with the raster paid
   (a forced flush per batch), and §19 does the same for the frame's water.

   BASELINE, 2026-09-01: AMD Ryzen 7 7730U @ 2.0GHz (16 threads), 15.4GB,
   Windows 11 Home; Node 24.14.0; Playwright 1.62.1 headless Chromium 151.
   In THIS suite, at this point in the run (the harness state is part of
   the measurement — a cold standalone page reads ~8% lower): grass
   0.89–0.92ms, shore 2.27–2.33ms over three runs; standalone fresh pages
   read grass 0.82–0.84ms, shore 2.12–2.28ms. The gate is the in-suite
   worst + 10%. The nearest Safari proxy that runs here — Playwright WebKit
   26.5 on the same machine, a software-rasterised Canvas 2D — measured
   grass 1.1–1.5ms and shore 3.0–3.1ms; a data point, not a gate. The real
   target is the phone in hand, and the bench's "edit ms" button runs this
   exact measurement there (DevArt.benchEditCost), which is how the number
   gets re-baselined against the truth. */
{
  const LIVE = { bakeMs: 1300, frameP95: 1.5 };   // LAND_REFRESH's own ceilings, no multiplier
  const EDIT = { grassMs: 1.01, shoreMs: 2.88 };  // grass: baseline 0.92 + 10%. Shore: re-baselined 2026-09-02 for the SMOOTH fade default (the referee-picked mode paints more rects where depth varies fast): in-suite 2.42-2.62 across runs, worst + 10%
  const GRASS_AT = [12, 16], SHORE_AT = [41, 8];  // the two 7x7 workloads on verify7 xlarge
  const measure = async () => {
    const p = await page();
    const v = await p.evaluate(new Function(`
    const out = {};
    try {
      const bakeOf = (seed) => {
        G.newGame(seed, 'moderate', 'xlarge'); Screens._demo = false; Screens.show('playing'); S.paused = true;
        G.freeVis = true; G.updateVisibility();
        // the FIRST bake, cold: every derived key dropped, then the whole plan
        R.terrainCache = null;
        const t0 = performance.now();
        R.rebakeAll();
        while (R.tickBake(1e9)) {} while (R.tickRepaint && R.tickRepaint(1e9)) {}
        return performance.now() - t0;
      };
      out.bakeWorst = bakeOf('scenes1');
      out.bakeStd = bakeOf('verify7');
      // the two edit workloads, through the real path, on the standard map
      const W = CFG.W, H = CFG.H, terr = S.map.terrain;
      const patch = (x0, y0) => { let grass = 0, water = 0; for (let dy = 0; dy < 7; dy++) for (let dx = 0; dx < 7; dx++) { const t = terr[(y0 + dy) * W + x0 + dx]; if (t === T.GRASS) grass++; if (t === T.WATER) water++; } return { grass, water }; };
      const nearWater = (cx, cy, r) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = cx + dx, y = cy + dy; if (x >= 0 && y >= 0 && x < W && y < H && terr[y * W + x] === T.WATER) return true; } return false; };
      out.grassPatch = patch(${GRASS_AT[0]}, ${GRASS_AT[1]}); out.grassNearWater = nearWater(${GRASS_AT[0] + 3}, ${GRASS_AT[1] + 3}, 8);
      out.shorePatch = patch(${SHORE_AT[0]}, ${SHORE_AT[1]});
      const batch = (x0, y0) => { const t = performance.now(); for (let dy = 0; dy < 7; dy++) for (let dx = 0; dx < 7; dx++) R.drawTileAt(x0 + dx, y0 + dy); return (performance.now() - t) / 49; };
      const minOfMeans = (x0, y0) => { batch(x0, y0); batch(x0, y0); let m = Infinity; for (let k = 0; k < 9; k++) m = Math.min(m, batch(x0, y0)); return m; };
      out.editGrass = minOfMeans(${GRASS_AT[0]}, ${GRASS_AT[1]});
      out.editShore = minOfMeans(${SHORE_AT[0]}, ${SHORE_AT[1]});
      // the world pass at default zoom, framed on the town
      R.cam.z = 1.5; const tc = Bld.tcOf('P'); if (tc) R.centerOn(tc.x + 0.5, tc.y + 0.5);
      R.draw(0.016);                                // fog and any lazy layer settle first
      const ft = [];
      for (let k = 0; k < 60; k++) { const t = performance.now(); R.draw(0.016); ft.push(performance.now() - t); }
      ft.sort((a, b) => a - b);
      out.frameMed = ft[30]; out.frameP95 = ft[57];
      out.err = G.lastFrameError ? String(G.lastFrameError) : '';
    } catch (e) { out.thrown = String(e); }
    return out;`));
    await p.close();
    return v;
  };
  let v = await measure();
  const editsOk = (w) => !w.thrown && w.editGrass < EDIT.grassMs && w.editShore < EDIT.shoreMs;
  if (!editsOk(v)) {                              // one honest retry against machine noise
    const w = await measure();
    if (!w.thrown) v = Object.assign({}, w, { editGrass: Math.min(v.editGrass ?? Infinity, w.editGrass), editShore: Math.min(v.editShore ?? Infinity, w.editShore),
      bakeWorst: Math.min(v.bakeWorst ?? Infinity, w.bakeWorst), frameP95: Math.min(v.frameP95 ?? Infinity, w.frameP95), retried: true });
  }
  const f1 = (n) => (n == null ? '?' : (+n).toFixed(2));
  Object.assign(res, { _perfGates: { bakeWorstMs: f1(v.bakeWorst), bakeStdMs: f1(v.bakeStd),
    editGrassMs: f1(v.editGrass), editShoreMs: f1(v.editShore), frameMedMs: f1(v.frameMed), frameP95Ms: f1(v.frameP95),
    live: LIVE, edit: EDIT, retried: !!v.retried } });
  ck('theFirstBakeStaysUnderTheCeiling', !v.thrown && v.bakeWorst < LIVE.bakeMs,
    v.thrown || (f1(v.bakeWorst) + 'ms worst map (ceiling ' + LIVE.bakeMs + 'ms), ' + f1(v.bakeStd) + 'ms standard'));
  ck('theEditWorkloadsAreWhatTheyClaim', !v.thrown && v.grassPatch && v.grassPatch.grass === 49 && !v.grassNearWater
    && v.shorePatch && v.shorePatch.water >= 15 && v.shorePatch.water <= 34,
    v.thrown || ('grass patch ' + JSON.stringify(v.grassPatch) + (v.grassNearWater ? ' NEAR WATER' : '') + ', shore patch ' + JSON.stringify(v.shorePatch)));
  ck('anOpenGroundEditStaysWithinTenPercent', !v.thrown && v.editGrass < EDIT.grassMs,
    v.thrown || (f1(v.editGrass) + 'ms per edit (gate ' + EDIT.grassMs + 'ms = baseline 0.92 + 10%)'));
  ck('aShoreEditStaysWithinTenPercent', !v.thrown && v.editShore < EDIT.shoreMs,
    v.thrown || (f1(v.editShore) + 'ms per edit (gate ' + EDIT.shoreMs + 'ms = smooth-mode baseline 2.62 + 10%)'));
  ck('theWorldPassFrameStaysCheap', !v.thrown && v.frameP95 < LIVE.frameP95,
    v.thrown || (f1(v.frameP95) + 'ms p95 (ceiling ' + LIVE.frameP95 + 'ms)'));
  ck('andTheFrameLoopStaysClean', !v.thrown && !v.err, v.thrown || v.err);
  // the static rule: R.draw's own body — and the living-water pass it hands
  // the frame to — may not create a canvas or read pixels
  const src = readFileSync(join(root, 'js/render.js'), 'utf8');
  const d0 = src.indexOf('\n  draw(dt) {'), d1 = src.indexOf('this.drawMini(); }', d0);
  const w0 = src.indexOf('\n  drawLivingWater(g, dt) {'), w1 = src.indexOf('\n  draw(dt) {', w0);
  const body = (d0 >= 0 && d1 > d0 ? src.slice(d0, d1) : '') + (w0 >= 0 && w1 > w0 ? src.slice(w0, w1) : '');
  ck('nothingInTheFrameLoopMakesACanvasOrReadsPixels',
    body.length > 1000 && w0 >= 0 && !/createElement\('canvas'\)|getImageData\(/.test(body),
    body.length > 1000 && w0 >= 0 ? '' : 'could not isolate R.draw / R.drawLivingWater');
}

/* ---- 19. THE BASIN AND THE LIVING WATER (LAND_REFRESH Phase 1) ----
   1a: the body is banded from a baked distance-to-land field — land is 0,
   the first water tile is one tile (16 sixteenths), nothing exceeds the
   cap, and a MOAT is pinned shallow. NO BAND EDGE MAY FOLLOW THE TILE
   GRID: of every band change between horizontally adjacent 4px cells over
   the water, the share that lands exactly on a tile boundary must be
   about one cell in eight — the grid's own share — not most of them.
   DEPTH_AMP 0 must be the old flat body: no basin navy, no turquoise
   anywhere. 1e: with narrow inlets carved into the shores, not one
   shelf-coloured pixel of the shore layer may lie outside the traced
   water body. 1b–1d: the frame's water work, measured in isolation on the
   town view at default zoom — the living-water pass timed on its own, and
   the delta of all three motion features against the same frames with
   them dialled off — must fit LAND_REFRESH's 0.4ms; the fish gating
   expression is pinned verbatim, because shoal-often / open-water-rare is
   the fishing tell and it may not drift. ---- */
{
  const p = await page();
  const v = await p.evaluate(new Function(boot + `
    const out = {};
    try {
      const W = CFG.W, H = CFG.H, TL = CFG.TILE, terr = S.map.terrain;
      const wet = t => t === T.WATER || t === T.MOAT;
      // ---- the field ----
      // the step pins below are about the QUANTIZED machinery: hold fade 0
      if (LAND.WATER_FADE) { LAND.WATER_FADE = 0; R.rebakeAll(); while (R.tickBake(1e9)) {} }
      const D = R.waterDepth();
      out.len = D.length; out.max = Math.max.apply(null, Array.from(D)); out.cap16 = LAND.DEPTH_CAP * 16;
      out.edges = Array.from(R._deepEdges).map(e => +e.toFixed(2)); out.depthMax = R._depthMax;
      // land-adjacent water stays inside the shore steps however the
      // bathymetry warps it — a beach still reads as a beach
      let bad = 0, shoreOk = 0, shoreN = 0;
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        if (!wet(terr[i])) { if (D[i] !== 0) bad++; continue; }
        const touches = !wet(terr[i - 1]) || !wet(terr[i + 1]) || !wet(terr[i - W]) || !wet(terr[i + W]);
        if (touches) { shoreN++; if (D[i] >= 8 && D[i] <= LAND.DEEP_SHORE_END * 16) shoreOk++; }
        if (D[i] > LAND.DEPTH_CAP * 16) bad++;
      }
      out.bad = bad; out.shoreOk = shoreOk; out.shoreN = shoreN;
      // a moat is pinned shallow: flood one tile beside a lake and re-derive
      let mi = -1;
      for (let i = W + 1; i < W * (H - 1) - 1 && mi < 0; i++) if (terr[i] === T.GRASS && terr[i + 1] === T.WATER && terr[i - 1] === T.GRASS && terr[i - W] === T.GRASS && terr[i + W] === T.GRASS) mi = i;
      if (mi >= 0) { const was = terr[mi]; terr[mi] = T.MOAT; if (S.map.seenTerrain) S.map.seenTerrain[mi] = T.MOAT; out.moatD = R.waterDepth()[mi]; terr[mi] = was; if (S.map.seenTerrain) S.map.seenTerrain[mi] = was; R.waterDepth(); }
      // ---- no band edge on the grid ----
      const g = R.terrainCache.getContext('2d');
      const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
      const cols = R._deepCols().fill.map(hex), NC = cols.length;
      const img = g.getImageData(0, 0, W * TL, H * TL).data, RW = W * TL;
      const bandAt = (px, py) => { const o = (py * RW + px) * 4; for (let b = 0; b < NC; b++) if (img[o] === cols[b][0] && img[o + 1] === cols[b][1] && img[o + 2] === cols[b][2]) return b; return -1; };
      let changes = 0, onGrid = 0, bandsSeen = new Set();
      for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
        const i = y * W + x;
        if (!wet(terr[i]) || !wet(terr[i - 1])) continue;
        for (let cy = 0; cy < 8; cy++) for (let cx = 0; cx < 8; cx++) {
          const px = x * TL + cx * 4 + 2, py = y * TL + cy * 4 + 2;
          const b1 = bandAt(px, py), b0 = bandAt(px - 4, py);
          if (b1 >= 0) bandsSeen.add(b1);
          if (b1 < 0 || b0 < 0 || b1 === b0) continue;
          changes++; if (cx === 0) onGrid++;
        }
      }
      out.changes = changes; out.onGrid = onGrid; out.bands = [...bandsSeen].sort();
      // ---- AMP 0 is the flat body ----
      const ampWas = LAND.DEPTH_AMP; LAND.DEPTH_AMP = 0; R.rebakeAll(); while (R.tickBake(1e9)) {}
      const flat = g.getImageData(0, 0, W * TL, H * TL).data;
      const DR = ART.PALETTE.deep, probe = [hex(DR[0]), hex(DR[2]), hex(DR[5]), hex(DR[DR.length - 1])];
      let tinted = 0;
      for (let o = 0; o < flat.length; o += 16)
        for (const c of probe) if (flat[o] === c[0] && flat[o + 1] === c[1] && flat[o + 2] === c[2]) { tinted++; break; }
      out.tintedAtZero = tinted;
      LAND.DEPTH_AMP = ampWas; R.rebakeAll(); while (R.tickBake(1e9)) {}
      // ---- the bay pin: carve inlets, rebake, count shelf outside the body ----
      let carved = 0;
      for (let y = 6; y < H - 6 && carved < 6; y += 3) for (let x = 6; x < W - 6 && carved < 6; x += 5) {
        if (terr[y * W + x] !== T.WATER) continue;
        let ok = true;
        for (let k = 1; k <= 3 && ok; k++) for (let dx = -1; dx <= 1; dx++) if (terr[(y - k) * W + x + dx] !== T.GRASS) ok = false;
        if (!ok) continue;
        for (let k = 1; k <= 3; k++) { terr[(y - k) * W + x] = T.WATER; if (S.map.seenTerrain) S.map.seenTerrain[(y - k) * W + x] = T.WATER; }
        carved++;
      }
      out.carved = carved;
      R.rebakeAll(); while (R.tickBake(1e9)) {}
      const L = R.shoreLayer, lg = L.getContext('2d'); lg.setTransform(1, 0, 0, 1, 0, 0);
      const path = R.waterBodyPath(), sd = lg.getImageData(0, 0, L.width, L.height).data;
      let outside = 0, shelfPx = 0;
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        if (wet(terr[y * W + x])) continue;
        for (let py = 0; py < TL; py++) for (let px = 0; px < TL; px++) {
          const X = x * TL + px, Y = y * TL + py, o = (Y * L.width + X) * 4;
          if (!(sd[o] === 126 && sd[o + 1] === 192 && sd[o + 2] === 216 && sd[o + 3] > 0)) continue;
          shelfPx++;
          if (!lg.isPointInPath(path, X + 0.5, Y + 0.5)) outside++;
        }
      }
      out.shelfPxOnLand = shelfPx; out.shelfOutside = outside;
      // ---- the frame work, isolated: the living-water pass alone, WITH ITS
      // RASTER. Headless Chromium defers rasterization, so a recorded time is
      // not a cost (the first dashed-stroke cut recorded 0.02ms and cost 0.34);
      // every call here is followed by a 1x1 getImageData that forces the
      // flush, and the flush alone is subtracted. Town view at default zoom,
      // golden hour; then the water view for the record. ----
      R.cam.z = 1.5; const tc = Bld.tcOf('P'); if (tc) R.centerOn(tc.x + 0.5, tc.y + 0.5);
      G.freeVis = true; G.updateVisibility();
      S.day = 11; S.dayT = 0.16 * CFG.DAY_MS;              // dayF 10.16, the warm peak
      R.draw(0.016);
      const fg = R.g, zz = R.cam.z * R.dpr;
      const setT = () => fg.setTransform(zz, 0, 0, zz, -R.cam.x * zz, -R.cam.y * zz);
      const flush = () => { fg.setTransform(1, 0, 0, 1, 0, 0); fg.getImageData(0, 0, 1, 1); setT(); };
      const passMs = (n) => { setT(); R.drawLivingWater(fg, 0.016); flush(); const t = performance.now(); for (let k = 0; k < n; k++) { R.drawLivingWater(fg, 0.016); flush(); } return (performance.now() - t) / n; };
      const flushMs = (n) => { flush(); const t = performance.now(); for (let k = 0; k < n; k++) flush(); return (performance.now() - t) / n; };
      const base = Math.min(flushMs(40), flushMs(40));
      const was = { sa: LAND.SURF_ALPHA, ha: LAND.SHIM_ALPHA, fl: LAND.FOAM_LINE, wa: LAND.WAVE_ALPHA, t: LAND.FISH_TIME, s: LAND.SPARKLE_GOLD, r: LAND.RIPPLE };
      LAND.SURF_ALPHA = 0; LAND.SHIM_ALPHA = 0; LAND.FOAM_LINE = 0; LAND.WAVE_ALPHA = 0; LAND.FISH_TIME = 0; LAND.SPARKLE_GOLD = 1; LAND.RIPPLE = 0;
      const off = Math.min(passMs(60), passMs(60)) - base;
      LAND.SURF_ALPHA = was.sa; LAND.SHIM_ALPHA = was.ha; LAND.FOAM_LINE = was.fl; LAND.WAVE_ALPHA = was.wa; LAND.FISH_TIME = was.t; LAND.SPARKLE_GOLD = was.s; LAND.RIPPLE = was.r;
      // measure INSIDE a wave window (wt 0.2 → ~2.2 of WAVE_TIME 2.8 across the
      // runs), with the pick recomputed for THIS viewport — the default-motion
      // number must include an active roll or it is not the default's cost
      R.fishClock = LAND.WAVE_EVERY * 3 + 0.2; R._waveEpoch = -1;
      R._prof = { foam: 0, tiles: 0, scroll: 0, frames: 0 };
      const on = Math.min(passMs(60), passMs(60)) - base;
      const pr = R._prof; R._prof = null;
      out.flushMs = base; out.frameOff = off; out.frameOn = on; out.newWork = on - off;
      out.foamMs = pr.foam / pr.frames; out.tilesMs = pr.tiles / pr.frames; out.scrollMs = pr.scroll / pr.frames; out.livingMs = on;
      // …and framed on the water, where the shore is dense: reported, not gated at 0.4
      R.centerOn(41 + 3.5, 8 + 3.5); R.draw(0.016);
      R.fishClock = LAND.WAVE_EVERY * 5 + 0.2; R._waveEpoch = -1;
      const onW = Math.min(passMs(60), passMs(60)) - base;
      out.waterFrame = onW; out.waterLivingMs = onW; out.waveInWaterFrame = !!R._wavePick;
      setT();
      /* A FEW FISH, STAGGERED, ON THE WATER WORTH FISHING. Thirty fish
         leaping in lockstep on the same 2.4s clock was the reported
         silliness, and the first fix over-corrected to a single leap per
         thirty seconds picked from the WHOLE map — so the chosen water was
         almost never the water on screen and the referee reported the fish
         had gone. The map now shows up to FISH_N leaps per FISH_EVERY
         seconds, drawn from the fishing water in view, each on its own
         offset inside the epoch so no two share a frame. What is pinned is
         unchanged in substance: never every eligible tile, never in
         lockstep, always a shoal whose stock is a real share of the best
         one’s, and rotating between them. Walk the epochs and check.
         (R._fishPick became R._fishPicks when the count went above one.) */
      const spots = R.fishSpots();
      out.spots = spots.length;
      const seen = {}; let offShoal = 0, poor = 0, tooMany = 0, sameFrame = 0;
      const resA = S.map.resAmount;
      let best = 0;
      for (let i = 0; i < resA.length; i++) if (MapGen.shoal(i % CFG.W, (i / CFG.W) | 0) && resA[i] > best) best = resA[i];
      for (let e = 0; e < 30; e++) {
        R.fishClock = e * LAND.FISH_EVERY + 0.2; R._fishEpoch = -1;
        R.draw(0);
        const picks = R._fishPicks || [];
        if (picks.length > (LAND.FISH_N | 0)) tooMany++;
        const offs = {};
        for (const pk of picks) {
          seen[pk[0] + ',' + pk[1]] = 1;
          if (!MapGen.shoal(pk[0], pk[1])) offShoal++;
          if (resA[pk[1] * CFG.W + pk[0]] < best * LAND.FISH_STOCK) poor++;
          const key = pk[2].toFixed(3);
          if (offs[key]) sameFrame++; offs[key] = 1;
        }
      }
      out.distinctPicks = Object.keys(seen).length;
      out.offShoal = offShoal; out.poor = poor; out.tooMany = tooMany; out.sameFrame = sameFrame;
      out.noLockstep = !/hf % 5 < 2|hf % 31 === 0/.test(R.drawLivingWater.toString());
      /* A WAVE IS AN EVENT, PARALLEL TO ITS SHORE. Walk the wave epochs the
         way the fish epochs are walked: every pick must lie on beach (land
         behind it never water, moat, mountain or hills; water in front of it
         always open water — i.e. the crest's PUSH axis is the shore normal),
         picks must rotate along the shore, and a roll is at most three short
         crests, never a coastline. */
      const wseen = {}; let wbad = 0, wsegs = 0, wsplit = 0, wover = 0, wrolls = 0;
      for (let e = 0; e < 40; e++) {
        R.fishClock = e * LAND.WAVE_EVERY + 0.2; R._waveEpoch = -1;
        R.draw(0);
        const wp = R._wavePick;
        if (!wp) continue;
        wrolls++;
        if (wp.segs.length > 3) wover++;
        if (wp.segs.length > 1) wsplit++;
        for (const sg of wp.segs) {
          wsegs++;
          wseen[Math.round(sg.x / 16) + ',' + Math.round(sg.y / 16)] = 1;
          const lx = (sg.x + sg.nx * 10) / TL | 0, ly = (sg.y + sg.ny * 10) / TL | 0;
          const lt = S.map.terrain[ly * CFG.W + lx];
          if (lt === T.WATER || lt === T.MOAT || lt === T.MOUNTAIN || lt === T.HILLS) wbad++;
          const wx2 = (sg.x - sg.nx * 10) / TL | 0, wy2 = (sg.y - sg.ny * 10) / TL | 0;
          if (S.map.terrain[wy2 * CFG.W + wx2] !== T.WATER) wbad++;
        }
      }
      out.waveRolls = wrolls; out.waveSegs = wsegs; out.waveBad = wbad;
      out.waveDistinct = Object.keys(wseen).length; out.waveSplits = wsplit; out.waveOversize = wover;
      /* THE LAND CLAMP, CHECKED AGAINST THE PIXELS. For a handful of epochs
         the frame is drawn twice at the same clock — wave off, wave on — and
         every pixel the wave changed must sit on a wet tile or on the DRAWN
         beach: shoreLayer painted there, and painted warm (sand, bone, lip
         are r>b; the shelf blue and wet rock are not). This reads the real
         bake, not the clamp's own geometry, so a clip that admits one grass
         or tree pixel fails here. */
      const LS = R.shoreLayer, Ld = LS.getContext('2d').getImageData(0, 0, LS.width, LS.height).data;
      const cw = R.cv.width, ch = R.cv.height, zd = R.cam.z * R.dpr;
      let wavePx = 0, dryPx = 0, clampedEpochs = 0;
      out.drySamples = [];
      const wasWA = LAND.WAVE_ALPHA, wasPaused = S.paused;
      S.paused = true;                         // and the scan stays inside the
      for (let e = 2; e < 26 && clampedEpochs < 6; e += 3) {   // roll's own box, so
        R.fishClock = e * LAND.WAVE_EVERY + 1.1; R._waveEpoch = -1e9;   // nothing else
        LAND.WAVE_ALPHA = 0; R.draw(0);                                 // that animates
        const A = R.g.getImageData(0, 0, cw, ch).data;                  // pollutes the diff
        LAND.WAVE_ALPHA = wasWA; R._waveEpoch = -1e9; R.draw(0);
        const wp2 = R._wavePick;
        if (!wp2) continue;
        const B = R.g.getImageData(0, 0, cw, ch).data;
        clampedEpochs++;
        const MK = R._waveMaskC, Md = MK ? MK.getContext('2d').getImageData(0, 0, MK.width, MK.height).data : null;
        const SC = R._waveScratchC, Sd = SC ? SC.getContext('2d').getImageData(0, 0, SC.width, SC.height).data : null;
        let sx0 = 1e9, sy0 = 1e9, sx1 = -1e9, sy1 = -1e9;
        for (const sg of wp2.segs) {
          sx0 = Math.min(sx0, sg.x - 56); sx1 = Math.max(sx1, sg.x + 56);
          sy0 = Math.min(sy0, sg.y - 56); sy1 = Math.max(sy1, sg.y + 56);
        }
        const py0 = Math.max(0, Math.floor((sy0 - R.cam.y) * zd)), py1 = Math.min(ch - 1, Math.ceil((sy1 - R.cam.y) * zd));
        const px0 = Math.max(0, Math.floor((sx0 - R.cam.x) * zd)), px1 = Math.min(cw - 1, Math.ceil((sx1 - R.cam.x) * zd));
        for (let py = py0; py <= py1; py++) for (let px2 = px0; px2 <= px1; px2++) {
          const o = (py * cw + px2) * 4;
          /* foam at WAVE_ALPHA moves a pixel by tens per channel; the ±1
             antialiasing flutter of wall-clock decor (chimney smoke drifts
             on real time even with the sim paused) is not the wave */
          if (Math.abs(A[o] - B[o]) + Math.abs(A[o + 1] - B[o + 1]) + Math.abs(A[o + 2] - B[o + 2]) < 8) continue;
          wavePx++;
          const wx2 = R.cam.x + px2 / zd, wy2 = R.cam.y + py / zd;
          /* the 3x3 world-px neighbourhood: a canvas pixel's footprint at
             this zoom is under a world pixel, and the nearest-neighbour
             blit can snap the clamp's edge by one — so a changed pixel
             passes if ANY neighbour within a world pixel is wet or drawn
             sand. Real escapes are whole crest chunks, pixels deep. */
          let ok2 = false;
          for (let dy2 = -1; dy2 <= 1 && !ok2; dy2++) for (let dx2 = -1; dx2 <= 1 && !ok2; dx2++) {
            const nx2 = (wx2 | 0) + dx2, ny2 = (wy2 | 0) + dy2;
            const tv2 = S.map.terrain[((ny2 / CFG.TILE) | 0) * CFG.W + ((nx2 / CFG.TILE) | 0)];
            if (tv2 === T.WATER || tv2 === T.MOAT) { ok2 = true; break; }
            const lo2 = (ny2 * LS.width + nx2) * 4;
            if (Ld[lo2 + 3] > 0 && Ld[lo2] > Ld[lo2 + 2]) { ok2 = true; break; }
          }
          if (ok2) continue;
          const tv = S.map.terrain[((wy2 / CFG.TILE) | 0) * CFG.W + ((wx2 / CFG.TILE) | 0)];
          const lo = ((wy2 | 0) * LS.width + (wx2 | 0)) * 4;
          dryPx++;
          if (out.drySamples.length < 10) {
            const mxx = (wx2 - wp2.mx0) | 0, myy = (wy2 - wp2.my0) | 0;
            const mA = (Md && mxx >= 0 && myy >= 0 && mxx < MK.width && myy < MK.height)
              ? Md[(myy * MK.width + mxx) * 4 + 3] : -1;
            const sA = (Sd && mxx >= 0 && myy >= 0 && mxx < SC.width && myy < SC.height)
              ? Sd[(myy * SC.width + mxx) * 4 + 3] : -1;
            out.drySamples.push({ e, w: [+wx2.toFixed(1), +wy2.toFixed(1)], t: tv, maskA: mA, scrA: sA,
              box: [wp2.mx0, wp2.my0, wp2.mw, wp2.mh],
              seg: [Math.round(wp2.segs[0].x), Math.round(wp2.segs[0].y), wp2.segs.length],
              shore: [Ld[lo], Ld[lo + 1], Ld[lo + 2], Ld[lo + 3]],
              a: [A[o], A[o + 1], A[o + 2]], b: [B[o], B[o + 1], B[o + 2]] });
          }
        }
      }
      S.paused = wasPaused;
      out.wavePx = wavePx; out.dryPx = dryPx; out.clampedEpochs = clampedEpochs;
      out.err = G.lastFrameError ? String(G.lastFrameError) : '';
    } catch (e) { out.thrown = String(e && e.stack || e); }
    return out;`));
  await p.close();
  const f2 = (n) => (n == null ? '?' : (+n).toFixed(3));
  ck('theDepthFieldIsDistanceToLand', !v.thrown && v.bad === 0 && v.shoreN > 50 && v.shoreOk === v.shoreN && v.max <= v.cap16,
    v.thrown || (v.shoreOk + '/' + v.shoreN + ' shore tiles inside the shore steps, max ' + v.max + '/16 (cap ' + v.cap16 + '), ' + v.bad + ' bad cells'));
  ck('andAMoatIsPinnedShallow', !v.thrown && v.moatD === 16, v.thrown || ('moat depth ' + v.moatD + '/16'));
  ck('theStepEdgesAreFittedToTheMap', !v.thrown && v.edges && v.edges.length === LAND_STEPS(v) - 1 && v.edges.every((e, i) => i === 0 || e > v.edges[i - 1])
    && v.edges[v.edges.length - 1] <= v.depthMax && v.edges[v.edges.length - 1] >= Math.min(v.depthMax, 4) - 1e-6,
    v.thrown || ('edges ' + JSON.stringify(v.edges) + ' for a deepest tile of ' + (v.depthMax || 0).toFixed(2)));
  ck('noStepEdgeFollowsTheTileGrid', !v.thrown && v.changes > 200 && v.onGrid <= v.changes * 0.25,
    v.thrown || (v.onGrid + ' of ' + v.changes + ' step changes on a tile boundary (the grid share is 1 in 8)'));
  ck('theRampShowsItsSteps', !v.thrown && v.bands.length >= 14,
    v.thrown || (v.bands.length + ' distinct steps painted of ' + LAND_STEPS(v) + ': ' + JSON.stringify(v.bands)));
  ck('ampZeroIsTheFlatBody', !v.thrown && v.tintedAtZero === 0, v.thrown || (v.tintedAtZero + ' ramp-coloured pixels at DEPTH_AMP 0'));
  ck('noShelfLeavesTheWaterOnAConcaveBay', !v.thrown && v.carved >= 1 && v.shelfOutside === 0,
    v.thrown || (v.shelfOutside + ' shelf pixels outside the body with ' + v.carved + ' inlets carved (' + v.shelfPxOnLand + ' on land-tile pixels inside it)'));
  ck('theLivingWaterFitsItsBudget', !v.thrown && v.livingMs < 0.4 && v.waterLivingMs < 0.4,
    v.thrown || ('the whole living-water pass, raster included: ' + f2(v.livingMs) + 'ms on the town view at z1.5 golden hour (was ' + f2(v.frameOff) + 'ms before 1b–1d: delta ' + f2(v.newWork) + 'ms; recorded foam ' + f2(v.foamMs) + ' + tiles ' + f2(v.tilesMs) + '); ' + f2(v.waterLivingMs) + 'ms on the water view; a flush alone ' + f2(v.flushMs) + 'ms'));
  ck('aFewFishStaggeredOnTheWaterWorthFishing',
    !v.thrown && v.noLockstep && v.spots > 1 && v.distinctPicks > 1 && v.offShoal === 0 && v.poor === 0
      && v.tooMany === 0 && v.sameFrame === 0 && !v.err,
    v.thrown || v.err || (v.spots + ' spots worth fishing, ' + v.distinctPicks + ' different ones chosen over 30 leaps, ' +
      v.offShoal + ' off a shoal, ' + v.poor + ' below the stock floor, ' + v.tooMany + ' epochs over the FISH_N cap, ' +
      v.sameFrame + ' sharing a frame'));
  ck('aWaveRollsOnItsBeachParallelAndRare',
    !v.thrown && v.waveRolls > 10 && v.waveBad === 0 && v.waveOversize === 0 && v.waveDistinct > 4 && v.waveInWaterFrame === true && !v.err,
    v.thrown || v.err || (v.waveRolls + ' rolls over 40 epochs (' + v.waveSegs + ' crests, ' + v.waveSplits +
      ' split on curves), ' + v.waveDistinct + ' distinct stretches, ' + v.waveBad +
      ' with rock/moat behind or no open water in front; wave live in the water-view budget frame: ' + v.waveInWaterFrame));
  ck('andNoFoamPixelEscapesTheBeach',
    !v.thrown && v.clampedEpochs >= 3 && v.wavePx > 200 && v.dryPx === 0 && !v.err,
    v.thrown || v.err || (v.wavePx + ' wave pixels over ' + v.clampedEpochs +
      ' rolls diffed against the same frame without the wave; ' + v.dryPx +
      ' landed past the drawn beach (grass, trees or rock)' +
      (v.dryPx ? ' — first offenders ' + JSON.stringify(v.drySamples) : '')));
  Object.assign(res, { _water: { livingPassMs: f2(v.livingMs), livingPassBeforeMs: f2(v.frameOff), motionDeltaMs: f2(v.newWork),
    recordedFoamMs: f2(v.foamMs), recordedTilesMs: f2(v.tilesMs), waterViewPassMs: f2(v.waterLivingMs), flushMs: f2(v.flushMs) } });
}
function LAND_STEPS(v) { return 16; }

/* ---- 21. THE RAMP, THE BATHYMETRY AND THE SANDBARS ----
   The ramp is EVEN, which is the whole reason it was rebuilt in OKLab:
   adjacent steps differ by roughly equal LIGHTNESS. Bunch the steps and
   the eye reads the few big jumps as bands and ignores the rest — which
   is exactly how the first cut of this ramp failed, sixteen steps that
   read as four. water[1] and water[2] must still land ON the ramp so
   every other water reference in the world matches it, and nothing in it
   may be lighter than its own shallow end (near-white belongs to the
   glints, not the body).

   The floor is a LANDFORM, not a contour map of the coast: the warp must
   actually move most of the water off the plain distance, come out
   identical on a second derive, and still leave land-adjacent water
   inside the shore steps so a beach reads as a beach. And every gameplay
   shoal rides a bar cut INTO the field, never painted over it. ---- */
{
  const p = await page();
  const v = await p.evaluate(new Function(boot + `
    const out = {};
    try {
      // ---- R1: the ramp, measured in OKLab on the shipped hexes ----
      const lin = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
      const okL = (hx) => {
        const r = lin(parseInt(hx.slice(1, 3), 16) / 255), g2 = lin(parseInt(hx.slice(3, 5), 16) / 255), b = lin(parseInt(hx.slice(5, 7), 16) / 255);
        const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g2 + 0.0514459929 * b);
        const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g2 + 0.1073969566 * b);
        const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g2 + 0.6299787005 * b);
        return 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
      };
      const DR = ART.PALETTE.deep, Ls = DR.map(okL), dd = [];
      for (let i = 1; i < Ls.length; i++) dd.push(Ls[i - 1] - Ls[i]);
      out.n = DR.length;
      out.minD = Math.min.apply(null, dd); out.maxD = Math.max.apply(null, dd);
      out.ratio = out.maxD / out.minD;
      out.monotone = dd.every(x => x > 0);
      out.w1 = DR.indexOf(ART.PALETTE.water[1]); out.w2 = DR.indexOf(ART.PALETTE.water[2]);
      out.shallowestIsLightest = Ls.every(l => l <= Ls[0] + 1e-9);
      // ---- R2: the bathymetry ----
      const W = CFG.W, H = CFG.H, terr = S.map.terrain, wet = t => t === T.WATER || t === T.MOAT;
      const snap = () => { R._depthKey = ''; return Array.from(R.waterDepth()); };
      const shipped = snap(), again = snap();
      out.deterministic = shipped.every((x, i) => x === again[i]);
      const sv = LAND.SLOPE_VAR, ba = LAND.BAR_AMP, sb = LAND.SHOAL_BAR;
      // the shipped field is the PLAIN distance: the warp is off in
      // production (it read as blotches) and the size-aware banding carries
      // the variation instead. The dials must still work when turned up.
      LAND.SLOPE_VAR = 0.55; LAND.BAR_AMP = 0.9;
      const warped = snap();
      LAND.SLOPE_VAR = sv; LAND.BAR_AMP = ba; LAND.SHOAL_BAR = 0;
      const noBar = snap();                       // shipped, bars off
      LAND.SHOAL_BAR = sb;
      const bars = snap();                        // …and the shipped field again
      let water = 0, moved = 0;
      for (let i = 0; i < bars.length; i++) { if (!wet(terr[i])) continue; water++; if (Math.abs(warped[i] - shipped[i]) >= 8) moved++; }
      out.water = water; out.movedPct = Math.round(moved * 1000 / Math.max(1, water)) / 10;
      out.shippedIsFlat = LAND.SLOPE_VAR === 0 && LAND.BAR_AMP === 0;
      // ---- R3: the sandbars ----
      let shoals = 0, barred = 0, cells = 0;
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        if (MapGen.shoal(x, y)) { shoals++; if (bars[i] < noBar[i] || bars[i] <= 8) barred++; }
        if (wet(terr[i]) && bars[i] < noBar[i]) cells++;
      }
      out.shoals = shoals; out.barred = barred; out.barCells = cells;
    } catch (e) { out.thrown = String(e && e.stack || e); }
    return out;`));
  await p.close();
  ck('theRampIsPerceptuallyEven', !v.thrown && v.n >= 15 && v.ratio <= 1.5 && v.monotone && v.shallowestIsLightest,
    v.thrown || (v.n + ' steps, lightness delta ' + (v.minD || 0).toFixed(4) + '–' + (v.maxD || 0).toFixed(4) +
      ', max/min ' + (v.ratio || 0).toFixed(2) + ' (pin ≤ 1.5)'));
  ck('andTheWorldsOtherBluesLandOnIt', !v.thrown && v.w1 >= 0 && v.w2 >= 0,
    v.thrown || ('water[1] at step ' + v.w1 + ', water[2] at step ' + v.w2));
  ck('theWarpDialsStillWorkThoughTheyShipOff', !v.thrown && v.movedPct >= 25 && v.deterministic && v.shippedIsFlat,
    v.thrown || (v.movedPct + '% of ' + v.water + ' water cells move when SLOPE_VAR/BAR_AMP are turned up' +
      (v.deterministic ? ', identical on a second derive' : ', NOT DETERMINISTIC') +
      (v.shippedIsFlat ? '; the shipped field is the plain distance' : '; SHIPPED FIELD IS WARPED')));

  ck('everyShoalRidesASandbar', !v.thrown && v.shoals > 5 && v.barred === v.shoals && v.barCells >= v.shoals * 3,
    v.thrown || (v.barred + '/' + v.shoals + ' shoals shallowed, ' + v.barCells + ' cells raised by the bars'));
}

/* ---- 21b. THE FADE'S THREE MODES (rule 5 as amended twice) ----
   Steps is the byte-pinned incumbent (every other water check runs on it).
   SMOOTH must actually fade — many more distinct body colours than the
   ramp has steps — and DITHER must fade while staying QUANTIZED: lots of
   mixing, yet every body pixel still one of the sixteen ramp colours.
   All three bake without error and swap live through the bench dial. ---- */
{
  const p = await page();
  const v = await p.evaluate(new Function(boot + `
    const out = {};
    try {
      const W = CFG.W, H = CFG.H, TL = CFG.TILE, terr = S.map.terrain;
      const wet = t => t === T.WATER || t === T.MOAT;
      const g = () => R.terrainCache.getContext('2d');
      const countBody = () => {
        const gg = g(), seen = new Set(); let cells = 0;
        for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
          const i = y * W + x;
          // interior by the painter's own rule (all EIGHT neighbours wet):
          // a diagonal-shore tile is painted under the body clip, and the
          // grass floor showing past the traced line is not body colour
          let interior = wet(terr[i]);
          for (let oy = -1; oy <= 1 && interior; oy++) for (let ox = -1; ox <= 1; ox++)
            if (!wet(terr[i + oy * W + ox])) { interior = false; break; }
          if (!interior) continue;
          cells++;
          const d = gg.getImageData(x * TL + 4, y * TL + 4, 1, 1).data;
          seen.add(d[0] + ',' + d[1] + ',' + d[2]);
          const d2 = gg.getImageData(x * TL + 20, y * TL + 12, 1, 1).data;
          seen.add(d2[0] + ',' + d2[1] + ',' + d2[2]);
        }
        return { seen, cells };
      };
      const bake = (mode) => { LAND.WATER_FADE = mode; R.rebakeAll(); while (R.tickBake(1e9)) {} return countBody(); };
      const sm = bake(2); out.smoothColours = sm.seen.size; out.cells = sm.cells;
      const di = bake(1); out.ditherColours = di.seen.size;
      const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)].join(',');
      const ramp = new Set(R._deepCols().fill.map(hex));
      let off = 0; for (const c of di.seen) if (!ramp.has(c)) off++;
      out.ditherOffRamp = off;
      bake(0);
      out.err = G.lastFrameError ? String(G.lastFrameError).slice(0, 200) : '';
    } catch (e) { out.thrown = String(e && e.message || e).slice(0, 300); }
    return out;`));
  await p.close();
  ck('theSmoothFadeActuallyFades', !v.thrown && v.cells > 40 && v.smoothColours > 40 && !v.err,
    v.thrown || v.err || (v.smoothColours + ' distinct body colours over ' + v.cells + ' interior water cells (the ramp itself has 16)'));
  ck('andTheWideDitherFadesWhileStayingQuantized', !v.thrown && v.ditherColours >= 8 && v.ditherColours <= 16 && v.ditherOffRamp === 0,
    v.thrown || (v.ditherColours + ' body colours, ' + v.ditherOffRamp + ' off the ramp'));
}

/* ---- 20. THE DEEP RAMP ACROSS MAP SIZES (the Overhaul, Part 0) ----
   The deep steps are fitted per MAP, never per region: the darkest step
   must actually be painted in the largest body on every map size, and a
   small pond — three or four tiles of water — must still show at least
   three steps, because the shore steps are absolute. Both are measured
   from the baked cache, not from the field. ---- */
{
  const p = await page();
  const v = await p.evaluate(new Function(`
    const out = { sizes: {} };
    try {
      const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
      const DR = ART.PALETTE.deep.map(hex), NC = DR.length;
      for (const [seed, size] of [['verify7', 'medium'], ['verify7', 'large'], ['verify7', 'xlarge'], ['scenes1', 'large'], ['pond1', 'xlarge']]) {
        Boot.force(); LAND.WATER_FADE = 0; G.newGame(seed, 'moderate', size); Screens._demo = false; Screens.show('playing'); S.paused = true;
        for (let i = 0; i < S.map.explored.length; i++) { S.map.explored[i] = 1; if (S.map.seenTerrain) S.map.seenTerrain[i] = S.map.terrain[i]; }
        R.rebakeAll(); while (R.tickBake(1e9)) {}
        const W = CFG.W, H = CFG.H, TL = CFG.TILE, terr = S.map.terrain, wet = t => t === T.WATER || t === T.MOAT;
        const g = R.terrainCache.getContext('2d'), img = g.getImageData(0, 0, W * TL, H * TL).data, RW = W * TL;
        const stepAt = (px, py) => { const o = (py * RW + px) * 4; for (let b = 0; b < NC; b++) if (img[o] === DR[b][0] && img[o + 1] === DR[b][1] && img[o + 2] === DR[b][2]) return b; return -1; };
        const seen = new Set(); let heart = 0;
        for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { if (!wet(terr[y * W + x])) continue;
          for (let cy = 2; cy < TL; cy += 4) for (let cx = 2; cx < TL; cx += 4) { const b = stepAt(x * TL + cx, y * TL + cy); if (b >= 0) seen.add(b); if (b === NC - 1) heart++; } }
        // the smallest region of three or more cells: how many steps does it show?
        const regs = R.waterRegions().filter(r => r.cells.length >= 3).sort((a, b) => a.cells.length - b.cells.length);
        let pondSteps = null, pondN = 0;
        if (regs.length) { const ps = new Set(); for (const c of regs[0].cells) { const x = c % W, y = (c / W) | 0; for (let cy = 2; cy < TL; cy += 4) for (let cx = 2; cx < TL; cx += 4) { const b = stepAt(x * TL + cx, y * TL + cy); if (b >= 0) ps.add(b); } } pondSteps = ps.size; pondN = regs[0].cells.length; }
        out.sizes[seed + '/' + size] = { dims: W + 'x' + H, deepest: +R._depthMax.toFixed(2), steps: seen.size, heartPx: heart, pondCells: pondN, pondSteps };
      }
    } catch (e) { out.thrown = String(e && e.stack || e); }
    return out;`));
  await p.close();
  const S2 = v.sizes || {};
  const every = Object.values(S2);
  ck('theHeartAppearsInTheLargestBodyOnEverySize', !v.thrown && every.length === 5 && every.every(s => s.heartPx > 0 && s.steps >= 12),
    v.thrown || Object.entries(S2).map(([k, s]) => k + ': ' + s.steps + ' steps, heart ' + s.heartPx + ' cells, deepest ' + s.deepest).join('; '));
  ck('andASmallPondStillShowsItsShoreSteps', !v.thrown && every.length === 5 && every.every(s => s.pondSteps == null || s.pondSteps >= 3),
    v.thrown || Object.entries(S2).map(([k, s]) => k + ': pond of ' + s.pondCells + ' cells shows ' + s.pondSteps + ' steps').join('; '));
}

/* ---- 22. A MISSING PALETTE RAMP MAY NOT KILL THE BAKE ----
   Reported from a real phone on a day-90 save: no trees, rocks, berries or
   gold anywhere, black unpainted tiles, chrome smeared at the edges. The
   cause was not the art — it was a browser holding a CACHED OLDER
   js/artstyle.js beside a fresh js/render.js (the script tags carried no
   version, so the two files cache independently). paintWater read
   ART.PALETTE.deep bare, threw a TypeError inside the terrain bake, and a
   bake that throws dies mid-plan: every step after the water — the cover,
   the rocks, the decals, the shore — never ran.

   So: a missing ramp degrades to the flat body this code drew before the
   ramp existed. One layer stands down; the map still paints. index.html
   versions its script tags now as well, but a renderer that dies on a
   missing palette entry is a fault in its own right. ---- */
{
  const p = await page();
  const v = await p.evaluate(new Function(`
    const out = {};
    try {
      Boot.force();
      delete ART.PALETTE.deep;                 // the stale artstyle.js
      R._deepC = null;
      G.newGame('scenes1', 'moderate', 'large');
      Screens._demo = false; Screens.show('playing'); S.paused = true;
      for (let i = 0; i < S.map.explored.length; i++) { S.map.explored[i] = 1; if (S.map.seenTerrain) S.map.seenTerrain[i] = S.map.terrain[i]; }
      R.terrainCache = null;
      R.rebakeAll(); while (R.tickBake(1e9)) {}
      out.baked = true;
      const W = CFG.W, H = CFG.H, TL = CFG.TILE, terr = S.map.terrain;
      const c = R.terrainCache, g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data;
      let unpainted = 0, painted = 0, forest = 0, flat = 0;
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        const o = ((y * TL + 16) * c.width + x * TL + 16) * 4;
        if (d[o + 3] === 0 || (d[o] < 20 && d[o + 1] < 20 && d[o + 2] < 20)) unpainted++; else painted++;
        if (terr[y * W + x] !== T.FOREST || forest >= 24) continue;
        forest++;
        let varied = 0;
        for (let py = 4; py < TL - 4; py += 5) for (let px = 4; px < TL - 4; px += 5) {
          const o2 = ((y * TL + py) * c.width + x * TL + px) * 4;
          if (Math.abs(d[o2] - d[o]) > 8 || Math.abs(d[o2 + 1] - d[o + 1]) > 8) varied++;
        }
        if (!varied) flat++;
      }
      out.unpainted = unpainted; out.painted = painted; out.forest = forest; out.flatForest = flat;
      R.cam.z = 1.5; const tc = Bld.tcOf('P'); if (tc) R.centerOn(tc.x + 0.5, tc.y + 0.5);
      R.draw(0.016); out.drew = true;
      out.err = G.lastFrameError ? String(G.lastFrameError).slice(0, 200) : '';
    } catch (e) { out.thrown = String(e && e.message || e).slice(0, 300); }
    return out;`));
  await p.close();
  ck('aStalePaletteDegradesInsteadOfKillingTheBake',
    !v.thrown && v.baked && v.drew && v.unpainted === 0 && v.painted > 500 && v.forest > 5 && v.flatForest === 0 && !v.err,
    v.thrown || (v.painted + ' tiles painted, ' + v.unpainted + ' unpainted, ' + v.forest + ' forest tiles checked with ' +
      v.flatForest + ' missing their trees' + (v.err ? ' — frame error ' + v.err : '')));
}

console.log(JSON.stringify(res, null, 1));
console.log(fails.length ? 'FAILURES: ' + fails.join(', ') : 'ALL LAND CHECKS PASS');
await b.close();
process.exit(fails.length ? 1 : 0);
