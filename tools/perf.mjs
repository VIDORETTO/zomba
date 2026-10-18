// Mede FPS do jogo. Uso: node tools/perf.mjs <firefox|chrome> [parametros-da-url] [headed]
import { chromium, firefox } from 'playwright-core';
const engine = process.argv[2] ?? 'firefox';
const params = process.argv[3] ?? '';
const headed = process.argv[4] === 'headed';
const browser = engine === 'firefox'
  ? await firefox.launch({ headless: !headed })
  : await chromium.launch({ channel: 'chrome', headless: !headed, args: engine === 'chrome-sw' ? ['--disable-gpu'] : ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(`http://localhost:5173/?autoplay${params ? '&' + params : ''}`);
const gpu = await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  const ext = gl?.getExtension('WEBGL_debug_renderer_info');
  return gl ? (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : 'sem webgl2';
});
await page.click('#btn-solo');
await page.waitForFunction(() => window.__game, null, { timeout: 90000 });
await page.evaluate(() => window.__game.debugView(0, 16, 0, -0.05));
await page.waitForTimeout(Number(process.env.WAIT ?? 2000));
const zombies = await page.evaluate(() => window.__game.zombies.bodies().length);
console.log('zumbis em cena:', zombies);
const fps = await page.evaluate(() => new Promise((res) => {
  let n = 0; const t0 = performance.now(); const times = [];
  let last = t0;
  const f = (now) => { n++; times.push(now - last); last = now; if (now - t0 < 4000) requestAnimationFrame(f); else {
    times.sort((a, b) => a - b);
    res({ fps: +(n / ((now - t0) / 1000)).toFixed(1), p50: +times[times.length >> 1].toFixed(1), p95: +times[Math.floor(times.length * 0.95)].toFixed(1), perf: window.__perf ?? null });
  } };
  requestAnimationFrame(f);
}));
if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
const q = await page.evaluate(() => ({ nivel: window.__game.q.level, escala: window.__game.scale }));
console.log(engine, JSON.stringify(q), params || '(padrão)', '| GPU:', gpu, '|', JSON.stringify(fps), errs.length ? '| erros: ' + errs.slice(0, 3) : '');
await browser.close();
