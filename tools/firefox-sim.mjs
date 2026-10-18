// Simula a falta de AudioListener.positionX (como no Firefox) e confere que o jogo desenha e não atira sozinho.
import { chromium } from 'playwright-core';
const out = process.argv[2] ?? '.';
// node tools/firefox-sim.mjs <pasta> rota  -> testa o mapa Rota
const mapId = process.argv[3] ?? 'cidade';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
for (const mode of ['?autoplay', '']) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.addInitScript(() => {
    for (const k of ['positionX', 'positionY', 'positionZ', 'forwardX', 'forwardY', 'forwardZ', 'upX', 'upY', 'upZ']) {
      Object.defineProperty(AudioListener.prototype, k, { get: () => undefined, configurable: true });
    }
  });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
  await page.goto('http://localhost:5173/' + mode);
  await page.waitForLoadState('networkidle');
  await page.click(`#map-choice [data-map="${mapId}"]`);
  await page.click('#btn-solo');
  await page.waitForFunction(() => document.querySelector('.hud'), null, { timeout: 60000 });
  await page.waitForTimeout(3000);
  const name = mode ? 'autoplay' : 'normal';
  await page.screenshot({ path: `${out}/ff-${mapId}-${name}.png` });
  const ammo = await page.evaluate(() => document.querySelector('.ammo-nums')?.textContent);
  console.log(name, '| munição na tela:', ammo, '| erros:', errs.filter((e) => !/willReadFrequently/.test(e)).slice(0, 5));
  await page.close();
}
await browser.close();
