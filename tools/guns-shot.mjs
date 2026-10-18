// Fotografa armas na mão: parada, mirando e logo depois do tiro (a rajada sai inteira).
// Uso: node tools/guns-shot.mjs <pasta> arma1,arma2,...
import { chromium } from 'playwright-core';
const out = process.argv[2] ?? '.';
const ids = (process.argv[3] ?? 'burstrifle,revolver,burstpistol,machinepistol,dmr,rocket,blade,drum').split(',');
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:5173/?autoplay');
await page.waitForLoadState('networkidle');
await page.click('#btn-solo');
await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
await page.waitForTimeout(2500);
await page.mouse.move(480, 270);
for (const id of ids) {
  await page.evaluate((id) => {
    const g = window.__game;
    const s = g.transport.sim;
    s.toSpawn = 0;
    s.zombies.clear();
    s.players.get('local').weapons = ['pistol', id];
    g.debugView(0, 24, 0, 0);
  }, id);
  await page.waitForTimeout(300);
  await page.evaluate((id) => window.__game.weapon.switchTo(id), id);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/g-${id}-1parada.png` });
  await page.mouse.down({ button: 'right' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/g-${id}-2mira.png` });
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(350);
  const before = await page.evaluate(() => window.__game.weapon.ammo);
  await page.mouse.down();
  await page.waitForTimeout(40);
  await page.mouse.up();
  await page.waitForTimeout(90);
  await page.screenshot({ path: `${out}/g-${id}-3tiro.png` });
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => window.__game.weapon.ammo);
  console.log(id, 'um clique gastou', before - after, 'bala(s)');
}
await browser.close();
