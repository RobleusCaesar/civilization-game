let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
import { writeFileSync } from 'node:fs';
const SP='/tmp/claude-0/-home-user-civilization-game/c237cbc3-a3de-5825-9360-10b21a6b6a96/scratchpad/';
const KEYS = process.argv[2] ? process.argv[2].split(',') : ['barracks'];
const b = await pw.chromium.launch(); const p = await b.newPage();
const errs=[]; p.on('pageerror', e=>errs.push(e.message));
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(1200);
const out = await p.evaluate((KEYS) => {
  const TL = CFG.TILE;                    // 32
  const GAME = TL * 2;                    // a 2x2 on the map at zoom 1 = 64px
  const ZOOM = Math.round(TL * 2 * 1.7);  // ~109px, the default-zoom size
  const cellW = 300, cellH = 210;
  const c = document.createElement('canvas');
  c.width = cellW * 3 + 20; c.height = cellH * KEYS.length + 30;
  const g = c.getContext('2d');
  g.fillStyle = '#4a7a3a'; g.fillRect(0,0,c.width,c.height);
  g.font = '12px monospace'; g.textBaseline = 'top';
  const info = {};
  KEYS.forEach((key, ki) => {
    info[key] = [];
    for (let lv = 1; lv <= 3; lv++) {
      const spr = Sprites.building[key][lv-1];
      info[key].push(spr.width);
      const x0 = 10 + ki*0 + (lv-1)*cellW, y0 = 20 + ki*cellH;
      g.imageSmoothingEnabled = false;
      g.drawImage(spr, x0, y0, spr.width, spr.height);              // 1:1 master
      g.imageSmoothingEnabled = true;
      g.drawImage(spr, x0 + 132, y0, ZOOM, ZOOM);                   // default zoom
      g.drawImage(spr, x0 + 132, y0 + 118, GAME, GAME);             // zoom 1
      g.imageSmoothingEnabled = false;
      g.drawImage(spr, x0 + 202, y0 + 118, 44, 44);                 // build-menu icon
      g.fillStyle = '#000';
      g.fillText(key + ' L' + lv + '  ' + spr.width + 'px', x0, y0 - 14);
      g.fillText('zoom1.7', x0 + 132, y0 + 110 - 12);
      g.fillText('z1  icon', x0 + 132, y0 + 118 + 46);
    }
  });
  return { png: c.toDataURL('image/png'), info };
}, KEYS);
writeFileSync(SP + 'lab-' + KEYS.join('-') + '.png', Buffer.from(out.png.split(',')[1], 'base64'));
console.log('sizes:', JSON.stringify(out.info));
console.log('errors:', errs.length, errs.slice(0,3));
await b.close();
