// Fotografa os pés do zumbi mais perto (confere a sombra no chão). Uso: node tools/feet-shot.mjs <pasta> [mapa]
import { chromium } from 'playwright-core';
const out = process.argv[2] ?? '.';
const map = process.argv[3] ?? 'cidade';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:5173/?autoplay');
await page.waitForLoadState('networkidle');
await page.click(`#map-choice [data-map="${map}"]`);
await page.click('#btn-solo');
await (await page.waitForFunction(() => window.__game, null, { timeout: 90000 })).dispose();
await page.evaluate(() => {
  const s = window.__game.transport.sim;
  s.stateTimer = 0.1;
  s.round = 3;
  const p = s.players.get('local');
  p.health = p.maxHealth = 99999;
});
for (let i = 0; i < 3; i++) {
  await page.waitForTimeout(i ? 1800 : 9000);
  await page.evaluate(() => window.__game.lookAtNearestZombie(0.1));
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${out}/pes-${map}-${i}.png` });
}
await browser.close();
