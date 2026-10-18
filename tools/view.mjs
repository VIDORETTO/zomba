// Captura vistas avulsas da Cidade ou do Rota. Uso: node tools/view.mjs <pasta> <mapa> nome:x:z:yaw:pitch ...
import { chromium } from 'playwright-core';
const [out, map, ...views] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:5173/?autoplay');
await page.waitForLoadState('networkidle');
await page.click(`#map-choice [data-map="${map}"]`);
await page.click('#btn-solo');
await (await page.waitForFunction(() => window.__game, null, { timeout: 90000 })).dispose();
await page.waitForTimeout(4000);
for (const v of views) {
  const [name, x, z, yaw, pitch] = v.split(':');
  await page.evaluate(([x, z, yaw, pitch]) => {
    const s = window.__game.transport.sim;
    s.toSpawn = 0;
    s.zombies.clear();
    window.__game.debugView(x, z, yaw, pitch);
  }, [Number(x), Number(z), Number(yaw), Number(pitch)]);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/${name}.png` });
}
await browser.close();
