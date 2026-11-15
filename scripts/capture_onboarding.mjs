// Captures the onboarding screenshots and the on-screen position of every control the tour explains.
// Runs headless Chrome (macOS path) against a deployed copy of the app, so nothing is served locally:
//   node scripts/capture_onboarding.mjs https://lunar-site-compare-next.cuda.workers.dev/
// Writes public/onboarding/<shot>.webp (via scripts/webp.py) and src/onboarding/shots.ts.
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const URL0 = process.argv[2] ?? 'https://lunar-site-compare-next.cuda.workers.dev/';
const W = 1440, H = 900;
const TMP = process.env.RAW_DIR ?? join(tmpdir(), 'onboarding-raw');
mkdirSync(TMP, { recursive: true });
mkdirSync(join(ROOT, 'public', 'onboarding'), { recursive: true });
mkdirSync(join(ROOT, 'src', 'onboarding'), { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// helpers injected into the page
const LIB = `
window.__q = (s) => [...document.querySelectorAll(s)].find((e) => e.offsetParent || getComputedStyle(e).position === 'fixed') || null;
window.__sec = (t) => { const h = [...document.querySelectorAll('h2,h3,h4,.sv-k,.sv-sec > *:first-child')].find((e) => e.offsetParent && e.textContent.trim().startsWith(t)); return h ? h.closest('.instrument, .sv-sec, .deep, section') : null; };
window.__btn = (t) => [...document.querySelectorAll('button, [role=tab], [role=radio]')].find((b) => b.offsetParent && b.textContent.trim().startsWith(t)) || null;
window.__site = (t) => [...document.querySelectorAll('button, li, tr, .site-row')].find((e) => e.offsetParent && e.textContent.trim().startsWith(t)) || null;
window.__ground = (fx, fy) => { const cv = window.__moon?.renderer.domElement || document.querySelector('.moon-canvas canvas'); const r = cv.getBoundingClientRect(); const x = r.left + r.width * fx, y = r.top + r.height * fy;
  cv.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, isPrimary: true, bubbles: true }));
  cv.dispatchEvent(new PointerEvent('pointerup', { clientX: x, clientY: y, isPrimary: true, bubbles: true })); };
`;

// one entry per screenshot: prep runs first, then the page scrolls `scroll` into the middle (or to the top), then
// every target's rectangle is recorded as fractions of the 1440 x 900 frame
const STEPS = {
  normal: [
    { id: 'n-home', prep: '', scroll: null, wait: 1500, targets: { toggle: "__q('.ui-toggle')", strip: "__q('.kp')", moon: "__q('section.moon')", list: "__q('.ct-side .ct-panel')", missions: "__q('.ct-missions')", rail: "__q('.ct-rail')", help: "__q('.as-launch')", logo: "__q('.ct-home')" } },
    { id: 'n-site', prep: "__site('Mons Mouton')?.click()", scroll: null, wait: 5000, targets: { moon: "__q('section.moon')", zoom: "__q('.hud-bl')", tools: "__q('.hud-br')", probe: "__q('.hud-probe')", about: "document.querySelectorAll('.ct-side .ct-panel')[1]", status: "__q('.action-bar')", readout: "__q('.hud-tr')" } },
    { id: 'n-close', prep: "__btn('Light dark areas')?.click(); __btn('200 km')?.click()", scroll: null, wait: 9000, targets: { moon: "__q('section.moon')" } },
    { id: 'n-now', prep: "__btn('Light dark areas')?.click(); __btn('Home')?.click(); await new Promise(r => setTimeout(r, 300)); __site('Mons Mouton')?.click()", scroll: "__sec('Right now')", wait: 3500, targets: { now: "__sec('Right now')", play: "__q('.sv-time')" } },
    { id: 'n-land', prep: '', scroll: "__sec('Good place to land')", wait: 900, targets: { land: "__sec('Good place to land')" } },
    { id: 'n-stand', prep: '', scroll: "__sec('Standing here')", wait: 1500, targets: { stand: "__sec('Standing here')" } },
    { id: 'n-month', prep: '', scroll: "__sec('The month ahead')", wait: 900, targets: { month: "__sec('The month ahead')" } },
    { id: 'n-earth', prep: '', scroll: "__sec('Not like Earth')", wait: 900, targets: { earth: "__sec('Not like Earth')" } },
    { id: 'n-pair', prep: "window.scrollTo(0, 0); __site('Haworth')?.click(); await new Promise(r => setTimeout(r, 2500)); __site('Mons Mouton')?.click(); await new Promise(r => setTimeout(r, 2500)); __btn('Compare')?.click()", scroll: "__q('.deep')", wait: 2500, targets: { pair: "__q('.deep')", button: "__q('.ct-primary')" } },
    { id: 'n-missions', prep: "window.scrollTo(0, 0); __q('.ct-missions')?.click()", scroll: null, wait: 1800, targets: { panel: "__q('.mc')" } },
    { id: 'n-help', prep: "__q('.ct-missions')?.click(); await new Promise(r => setTimeout(r, 600)); __q('.as-launch')?.click()", scroll: null, wait: 1500, targets: { chat: "__q('.as-head')?.parentElement" } },
    { id: 'n-search', prep: "__q('.as-close')?.click(); await new Promise(r => setTimeout(r, 500)); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))", scroll: null, wait: 1000, targets: { palette: "__q('.cmdk')" } },
  ],
  expert: [
    { id: 'e-home', prep: '', scroll: null, wait: 1500, targets: { tabs: "__q('.ct-tabs')", strip: "__q('.kp')", moon: "__q('section.moon')", list: "__q('.ct-side .ct-panel')", rail: "__q('.ct-rail')", toggle: "__q('.ui-toggle')" } },
    { id: 'e-site', prep: "__site('Mons Mouton')?.click()", scroll: null, wait: 5000, targets: { readout: "__q('.hud-tr')", probe: "__q('.hud-probe')", tools: "__q('.hud-br')", zoom: "__q('.hud-bl')", review: "document.querySelectorAll('.ct-side .ct-panel')[1]", status: "__q('.action-bar')" } },
    { id: 'e-display', prep: "__btn('Display')?.click()", scroll: null, wait: 900, targets: { menu: "__q('.hud-menu')" } },
    { id: 'e-point', prep: "__btn('Display')?.click(); await new Promise(r => setTimeout(r, 300)); __ground(0.38, 0.62)", scroll: null, wait: 7000, targets: { point: "__q('.moon-marker.mine')", probe: "__q('.hud-probe')", moon: "__q('section.moon')" } },
    { id: 'e-range', prep: "__btn('Rover range')?.click()", scroll: null, wait: 2500, targets: { range: "__q('.hud-range')", moon: "__q('section.moon')" } },
    { id: 'e-terrain', prep: "__btn('Rover range')?.click(); await new Promise(r => setTimeout(r, 400)); __site('Mons Mouton')?.click(); await new Promise(r => setTimeout(r, 4000)); __btn('Terrain 3D')?.click()", scroll: null, wait: 14000, targets: { viewer: "__q('.tv')" } },
    { id: 'e-time', prep: "document.querySelector('.tv button[aria-label^=Close], .tv .icon-btn')?.click(); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))", scroll: "__sec('Time')", wait: 1500, targets: { time: "__sec('Time')", cond: "__sec('Conditions')" } },
    { id: 'e-cond', prep: '', scroll: "__sec('Conditions')", wait: 900, targets: { cond: "__sec('Conditions')" } },
    { id: 'e-horizon', prep: '', scroll: "__sec('Horizon')", wait: 1500, targets: { horizon: "__sec('Horizon')", views: "__sec('Horizon')?.querySelector('.seg')" } },
    { id: 'e-next', prep: '', scroll: "__sec('Next 30 days')", wait: 900, targets: { next: "__sec('Next 30 days')" } },
    { id: 'e-slip', prep: '', scroll: "__sec('If the landing date slips')", wait: 900, targets: { slip: "__sec('If the landing date slips')" } },
    { id: 'e-me', prep: '', scroll: "__sec('Moon vs Earth')", wait: 900, targets: { me: "__sec('Moon vs Earth')" } },
    { id: 'e-lib', prep: '', scroll: "__q('.deep')", wait: 1200, targets: { deep: "__q('.deep')", tabs: "__q('.deep .seg')" } },
    { id: 'e-cal', prep: "__btn('Calendar')?.click()", scroll: "__q('.deep')", wait: 1500, targets: { deep: "__q('.deep')" } },
    { id: 'e-mission', prep: "__btn('Mission plan')?.click()", scroll: "__q('.deep')", wait: 1500, targets: { deep: "__q('.deep')" } },
    { id: 'e-compare', prep: "window.scrollTo(0, 0); document.querySelectorAll('.ct-tabs button')[1]?.click()", scroll: "__q('.compare')", wait: 2500, targets: { compare: "__q('.compare')" } },
    { id: 'e-calc', prep: "document.querySelectorAll('.ct-tabs button')[2]?.click()", scroll: "__q('.calc')", wait: 2000, targets: { calc: "__q('.calc')" } },
    { id: 'e-launch', prep: "document.querySelectorAll('.ct-tabs button')[3]?.click()", scroll: "__q('.launch')", wait: 2500, targets: { launch: "__q('.launch')" } },
    { id: 'e-missions', prep: "document.querySelectorAll('.ct-tabs button')[0]?.click(); await new Promise(r => setTimeout(r, 800)); __q('.ct-missions')?.click()", scroll: null, wait: 1800, targets: { panel: "__q('.mc')" } },
    { id: 'e-search', prep: "__q('.ct-missions')?.click(); await new Promise(r => setTimeout(r, 600)); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))", scroll: null, wait: 1000, targets: { palette: "__q('.cmdk')" } },
  ],
};

async function session(mode) {
  const port = 9600 + Math.floor(Math.random() * 300);
  const profile = join(TMP, `profile-${port}`);
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${port}`,
    `--window-size=${W},${H}`, '--hide-scrollbars', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  try {
    let tabs;
    for (let i = 0; i < 50; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(200); } }
    const ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener('open', r));
    let id = 0; const wait = new Map();
    ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } });
    const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); return r.result?.result?.value; };
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    // the tour itself must not cover the screenshots
    await send('Page.addScriptToEvaluateOnNewDocument', { source: "try { localStorage.setItem('tour-seen-normal', '1'); localStorage.setItem('tour-seen-expert', '1'); } catch {}" });
    await send('Page.navigate', { url: URL0 });
    await sleep(7000);
    await ev(LIB);
    await ev(`document.querySelectorAll('.chooser-card')[${mode === 'normal' ? 0 : 1}]?.click()`);
    await sleep(2500);
    const out = {};
    for (const s of STEPS[mode]) {
      if (s.prep) await ev(`(async () => { ${s.prep} })()`);
      await sleep(400);
      if (s.scroll) await ev(`(() => { const e = ${s.scroll}; if (e) { const r = e.getBoundingClientRect(); window.scrollTo(0, window.scrollY + r.top - (r.height > innerHeight - 160 ? 72 : Math.max(80, (innerHeight - r.height) / 2))); } })()`);
      else await ev('0');
      await sleep(s.wait);
      const rects = await ev(`(() => { const o = {}; ${Object.entries(s.targets).map(([k, x]) => `try { const e = ${x}; if (e) { const r = e.getBoundingClientRect(); o[${JSON.stringify(k)}] = [r.left / ${W}, r.top / ${H}, r.width / ${W}, r.height / ${H}].map((v) => Math.round(v * 10000) / 10000); } } catch {}`).join(' ')} return o; })()`);
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      const png = join(TMP, `${s.id}.png`);
      writeFileSync(png, Buffer.from(shot.result.data, 'base64'));
      out[s.id] = rects;
      console.log(s.id, Object.keys(rects).join(','), '| missing:', Object.keys(s.targets).filter((k) => !rects[k]).join(',') || '-');
    }
    ws.close();
    return out;
  } finally {
    const gone = new Promise((r) => chrome.once('exit', r));
    chrome.kill();
    await Promise.race([gone, sleep(5000)]);
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  }
}

const all = { ...(await session('normal')), ...(await session('expert')) };
execFileSync('python3', [join(ROOT, 'scripts', 'webp.py'), TMP, join(ROOT, 'public', 'onboarding')], { stdio: 'inherit' });
writeFileSync(join(ROOT, 'src', 'onboarding', 'shots.ts'), '// Generated by scripts/capture_onboarding.mjs: where each explained control sits in its screenshot,\n// as [left, top, width, height] fractions of the 1440 x 900 frame.\nexport type Rect = [number, number, number, number];\nexport const SHOTS: Record<string, Record<string, Rect>> = ' + JSON.stringify(all, null, 1) + ';\n');
console.log('shots:', Object.keys(all).length);
