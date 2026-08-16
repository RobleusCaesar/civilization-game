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

   Run after touching: R.landTone / groundTint / cornerShade / landDecals /
   terrainEdges / shoreBand / paintWater / paintGround / rebuildTerrain /
   drawTileAt, or the LAND constants.

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

console.log(JSON.stringify(res, null, 1));
console.log(fails.length ? 'FAILURES: ' + fails.join(', ') : 'ALL LAND CHECKS PASS');
await b.close();
process.exit(fails.length ? 1 : 0);
