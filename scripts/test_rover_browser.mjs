/** Bounded browser QA with intercepted file responses. No local HTTP server or deployment is started.
 * Run after npm run build: PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/test_rover_browser.mjs
 * Uses installed Chrome. Outputs screenshots and a report under node_modules/.cache/rover-qa/.
 */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const root = resolve(import.meta.dirname, '..'), cache = join(root, 'node_modules/.cache/rover-qa');
await mkdir(cache, { recursive: true });
const origin = 'https://rover-qa.test';
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const errors = [], notes = [];
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--enable-webgl'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
let harness = false;
await context.route('**/*', async (route) => {
  const u = new URL(route.request().url());
  if (u.origin !== origin) { notes.push(`External request: ${u.href}`); return route.fulfill({ status: 204, body: '' }); }
  const path = decodeURIComponent(u.pathname);
  if (path.includes('..')) return route.fulfill({ status: 400, body: '' });
  if (path === '/' && harness) return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/qa.css"></head><body style="margin:0"><div id="root"></div><script type="module" src="/qa.js"></script></body></html>' });
  const file = path === '/' ? 'index.html' : path.slice(1);
  for (const dir of harness ? [join(cache, 'build'), join(root, 'public')] : [join(root, 'dist')]) {
    try { return await route.fulfill({ body: await readFile(join(dir, file)), contentType: mime[extname(file)] ?? 'text/html' }); } catch { /* Try the next asset directory. */ }
  }
  notes.push(`Missing asset: ${path}`);
  return route.fulfill({ status: 404, body: 'Missing test asset.' });
});
const page = await context.newPage();
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript(() => { try { localStorage.setItem('tour-seen-normal', '1'); localStorage.setItem('tour-seen-expert', '1'); } catch { /* about:blank has no storage. */ } });
const shot = (name) => page.screenshot({ path: join(cache, `${name}.png`) });
const assert = (condition, why) => { if (!condition) throw new Error(why); };

try {
  await page.goto(`${origin}/#ui=normal`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Education Learn/ }).click();
  await page.getByRole('button', { name: 'Drive a rover', exact: true }).click();
  await page.waitForFunction(() => ['brief', 'unavailable', 'error'].includes(document.querySelector('.rg')?.dataset.stage), { timeout: 120000 });
  console.log('Production UI:', await page.locator('.rg').getAttribute('data-stage'));
  await shot('brief');
  assert(await page.locator('.rg').getAttribute('data-stage') === 'brief', await page.locator('.rg-dialog').innerText());
  await page.getByRole('button', { name: 'Begin mission' }).click();
  await page.keyboard.down('w'); await page.waitForTimeout(1000); await page.keyboard.up('w');
  await shot('drive-desktop');
  await page.getByRole('button', { name: 'Pause mission', exact: true }).click();
  assert(await page.locator('.rg').getAttribute('data-stage') === 'pause', 'Pause did not open.');
  await page.getByRole('button', { name: 'Resume mission', exact: true }).last().click();
  await page.setViewportSize({ width: 390, height: 844 });
  await shot('drive-mobile');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile layout overflows.');
  const mapReturn = page.getByRole('button', { name: 'Exit rover mission' });
  await mapReturn.click(); await page.getByRole('button', { name: 'Leave mission', exact: true }).click();
  await page.getByRole('button', { name: 'Drive a rover', exact: true }).waitFor();
  console.log('Production UI: launch, driving, pause/resume, mobile and return passed.');

  // A separate test-only entry exposes the engine for accelerated mission and cleanup checks.
  await page.goto('about:blank');
  const source = `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import RoverGame from ${JSON.stringify(join(root, 'src/game/RoverGame.tsx'))};
    import {Game} from ${JSON.stringify(join(root, 'src/game/engine.ts'))};
    const init=Game.prototype.init; Game.prototype.init=function(){ window.game=this; return init.call(this); };
    const doc=await (await fetch('/sites.json')).json();
    createRoot(document.getElementById('root')).render(React.createElement(RoverGame, {sites:doc.sites, selectedId:'mons-mouton', t:Date.parse('2027-07-08'), tMax:Date.parse(doc.range.end)-1800000, onClose:()=>window.game.dispose()}));
  `;
  await build({ configFile: false, root, publicDir: false, base: '/', logLevel: 'error', plugins: [react(), { name: 'qa-entry', resolveId: (id) => id === 'virtual:qa' ? '\0virtual:qa' : undefined, load: (id) => id === '\0virtual:qa' ? source : undefined }], build: { outDir: join(cache, 'build'), emptyOutDir: false, target: 'esnext', rolldownOptions: { input: 'virtual:qa', output: { entryFileNames: 'qa.js', assetFileNames: 'assets/qa[extname]' } } } });
  harness = true;
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('.rg')?.dataset.stage === 'brief', { timeout: 120000 });
  await page.getByRole('button', { name: 'Begin mission' }).click();
  const opening = await page.evaluate(() => {
    const g = window.game; cancelAnimationFrame(g.raf);
    return { plan: g.plan, time: new Date(g.simT).toISOString(), sun: g.sky.sunFrac, earth: g.sky.earthUp, roverParts: g.wheels.length, geometryCount: g.renderer.info.memory.geometries };
  });
  console.log('Real-terrain mission:', JSON.stringify(opening));
  // Accelerate the real driving loop, steering toward each target instead of teleporting the rover.
  const result = await page.evaluate(async () => {
    const g = window.game; const trace = [];
    const check = (ok, m) => { if (!ok) throw new Error(m); };
    const tick = (n, key) => { if (key) g.press(key, true); for (let i=0;i<n;i++) { g.step(1/60); if (g.state === 'end') throw new Error(`Rover failed: ${JSON.stringify(g.vit)}`); } if (key) g.press(key, false); };
    const drive = (p) => {
      for (let i=0;i<20000;i++) {
        const dist = Math.hypot(g.e-p.e,g.n-p.n);
        if (dist<3) { g.keys.clear(); tick(40,'brake'); return; }
        const target = Math.atan2(p.e-g.e,p.n-g.n), diff = Math.atan2(Math.sin(target-g.psi),Math.cos(target-g.psi));
        g.keys.clear(); if (Math.abs(diff)>0.05) g.keys.add(diff>0?'d':'a'); if(Math.abs(diff)<0.4) g.keys.add('w');
        tick(1);
      }
      throw new Error('Route did not converge.');
    };
    drive(g.plan.charge); tick(500,'f'); check(g.quest.phase==='phone','Charging objective did not advance.'); trace.push('charged');
    if(!g.sky.earthUp) drive(g.plan.phone); g.press('t',true); g.press('t',false); tick(190); check(g.quest.phase==='ice','Status transmission failed.'); trace.push('contacted');
    for(const p of g.plan.ice) { drive(p); g.press('e',true); g.press('e',false); tick(250); }
    check(g.quest.phase==='uplink','Samples did not complete.'); trace.push('sampled');
    if(!g.sky.earthUp) drive(g.plan.phone); g.press('t',true); g.press('t',false); tick(190); check(g.quest.phase==='haven','Data transmission failed.'); trace.push('uplinked');
    drive(g.plan.haven); tick(2); check(g.quest.phase==='done','Safe haven did not complete.'); trace.push('parked');
    g.place(0.016,performance.now()); g.renderer.clear();g.renderer.render(g.far,g.farCam);g.renderer.clearDepth();g.renderer.render(g.near,g.cam);g.cb.onHud(g.hud());
    return {trace,stats:g.stats(),position:{e:g.e,n:g.n},cameraClearance:g.cam.position.y-g.gy(g.cam.position.x,-g.cam.position.z)};
  });
  console.log('Mission completed:', JSON.stringify(result));
  await shot('mission-complete');
  assert(result.cameraClearance>=0.44,'Camera went underground.');
  assert(errors.length===0,`Browser errors: ${errors.join('\n')}`);
  await writeFile(join(cache,'report.json'),JSON.stringify({opening,result,errors,notes},null,2));
  console.log('PASS. Screenshots and report:',cache);
} catch (e) {
  await shot('failure').catch(()=>{});
  console.error('QA failed:',e.message);
  console.error('Browser errors:',errors);
  console.error('Notes:',notes.slice(-20));
  process.exitCode=1;
} finally { await browser.close(); }
