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

   Run after touching: R.landTone / groundTint / cornerShade / landDecals /
   drawDecal / terrainEdges / paintWater / paintGround /
   waterRegions / chaikin / roughen / buildShoreLayer / blitShore / waterKey /
   rebuildTerrain / drawTileAt / drawTilesAt / clipBoard, Sprites.tree and the
   forest sets, or the LAND constants.

     node tests/land.mjs      # exits non-zero on any regression */
let pw;
try { pw = (await import('playwright')).default ?? await import('playwright'); }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
import { writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(root, 'assets/terrain');
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });

const page = async () => {
  const p = await b.newPage({ viewport: { width: 600, height: 500 } });
  p.on('pageerror', e => console.log('PAGEERROR', String(e).slice(0, 200)));
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
    const one=[]; for(let k=0;k<200;k++){const t=performance.now();R.drawTileAt(20+(k%9),20+((k/9)|0)%9);one.push(performance.now()-t);}
    one.sort((a,b)=>a-b);
    return { bakeMed:+runs[2].toFixed(1), bakeMax:+runs[4].toFixed(1),
             frameMed:+ft[20].toFixed(2), frameP95:+ft[38].toFixed(2),
             editMed:+one[100].toFixed(2), editP95:+one[190].toFixed(2), tiles:CFG.W*CFG.H };`));
  Object.assign(res, { _perf: v });
  ck('theBakeStaysOffTheFrameLoop', v.frameP95 < 16, 'frame p95 ' + v.frameP95 + 'ms');
  ck('andATerrainEditIsCheap', v.editP95 < 8, '3x3 repaint p95 ' + v.editP95 + 'ms');
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
   `gold` is the seam, the bar and the +gold float; `fire` is a building
   burning, the only unprompted alarm in the game; `berry` is forage worth
   walking to. A ground decal in one of those ramps is a two-pixel promise
   the ground cannot keep. Measured on the DRAWN PIXELS, not on the source,
   so it still catches a colour arrived at some other way. ---- */
{
  const p = await page();
  const v = await p.evaluate(new Function(boot + `
    const hex=(r,g2,b)=>'#'+[r,g2,b].map(v=>v.toString(16).padStart(2,'0')).join('');
    const rgb=(h)=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
    const banned=[];
    for (const k of R.DECAL_RESERVED) ART.PALETTE[k].forEach((h,i)=>banned.push([k,h,rgb(h),i]));
    const c=document.createElement('canvas'); c.width=c.height=64;
    const g=c.getContext('2d');
    const hits=[], near=[];
    for (const kind of [...R.DECAL_OPEN, ...R.DECAL_FOLIAGE]) {
      g.clearRect(0,0,64,64);
      let s=12345; const rnd=()=>{s=(s*1103515245+12345)>>>0;return s/4294967296;};
      for (let k=0;k<24;k++) R.drawDecal(g, 8, 8, kind, 2, rnd);
      const d=g.getImageData(0,0,64,64).data;
      const seen=new Set();
      for (let i=0;i<d.length;i+=4) if (d[i+3]>200) seen.add(hex(d[i],d[i+1],d[i+2]));
      for (const h of seen) {
        const [r0,g0,b0]=rgb(h);
        for (const [ramp,bh,[br,bg,bb],idx] of banned) {
          const dist=Math.abs(r0-br)+Math.abs(g0-bg)+Math.abs(b0-bb);
          if (dist===0) hits.push(kind+' draws '+h+' = '+ramp+' '+bh);
          // …and NEAR is the real failure: bloom[2] and gold[2] were 20 apart
          // and indistinguishable at two pixels on grass. The DARKEST step of
          // every ramp is exempt from the near test — a ramp's index 0 is its
          // shadow, and every shadow in this palette is the same dark earthy
          // brown, so gold[0] sits a few units from honest wood and thatch.
          // What the eye reads as gold, fire or berry is the bright end.
          else if (idx > 0 && dist<=40) near.push(kind+' draws '+h+' ~ '+ramp+' '+bh+' (d='+dist+')');
        }
      }
    }
    return { hits, near, reserved: R.DECAL_RESERVED };`));
  ck('noGroundDecalWearsAReservedColour', v.hits.length === 0,
    v.hits.length ? v.hits.join('; ') : 'none of ' + v.reserved.join('/') + ' appears in any ground decal');
  ck('andNoneComesCloseEnoughToBeMistaken', v.near.length === 0,
    v.near.length ? v.near.join('; ') : 'no decal colour within 40 of a reserved one');
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

console.log(JSON.stringify(res, null, 1));
console.log(fails.length ? 'FAILURES: ' + fails.join(', ') : 'ALL LAND CHECKS PASS');
await b.close();
process.exit(fails.length ? 1 : 0);
