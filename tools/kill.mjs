// Teste de abate: chega perto do primeiro zumbi e atira na cabeça, capturando a sequência.
import { chromium } from 'playwright-core';
const out = process.argv[2] ?? '.';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:5173/?autoplay');
await page.click('#btn-solo');
await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
await page.waitForFunction(() => window.__game.zombies.bodies().some((z) => !z.rising), null, { timeout: 30000 });
const z = await page.evaluate(() => window.__game.zombies.bodies()[0]);
console.log('zumbi', z);
await page.evaluate(([x, z]) => { const g = window.__game; g.debugView(x + 3.2, z + 3.2, 0, 0); g.lookAtNearestZombie(1.55); }, [z.x, z.z]);
await page.waitForTimeout(250);
await page.evaluate(() => window.__game.lookAtNearestZombie(1.55));
await page.screenshot({ path: `${out}/k0-mira.png` });
const before = await page.evaluate(() => window.__game.me.points);
for (let i = 0; i < 3; i++) {
  await page.evaluate(() => { window.__game.lookAtNearestZombie(1.62); window.__game.debugShoot(); });
  await page.waitForTimeout(40);
  await page.screenshot({ path: `${out}/k${i + 1}-tiro.png` });
  await page.waitForTimeout(220);
}
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/k5-caindo.png` });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/k6-caido.png` });
const after = await page.evaluate(() => ({ pts: window.__game.me.points, kills: window.__game.me.kills, heads: window.__game.me.headshots }));
console.log('pontos antes', before, 'depois', after);
await browser.close();
