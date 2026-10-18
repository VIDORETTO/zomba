// Fotos do Bispo de perto: parado, lançando fogo e com o escudo. Uso: node tools/bispo-shot.mjs <pasta>
import { chromium } from 'playwright-core';
const out = process.argv[2] ?? '.';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:5173/?autoplay');
await page.waitForLoadState('networkidle');
await page.click('#map-choice [data-map="cidade"]');
await page.click('#btn-solo');
await (await page.waitForFunction(() => window.__game, null, { timeout: 90000 })).dispose();
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const s = window.__game.transport.sim;
  s.toSpawn = 0;
  s.zombies.clear();
  const p = s.players.get('local');
  p.health = p.maxHealth = 99999;
  s.spawnBispo();
  const b = [...s.zombies.values()].find((z) => z.kind === 6);
  b.x = 0; b.z = 20;
  window.__b = b;
  window.__game.debugView(0, 26.5, 0, 0.22);
});
const shot = async (name, fn, wait = 900) => {
  await page.evaluate(fn);
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `${out}/${name}.png` });
};
await page.waitForTimeout(3600);
// parado (sem atacar): o jogador fica longe para ele não andar
await shot('c1-parado', () => { const b = window.__b; b.bispo.orbT = b.bispo.summonT = 99; b.speed = 0; b.anim = 'move'; });
await shot('c2-fogo', () => { const b = window.__b; b.bispo.orbT = 0; }, 350);
await shot('c3-escudo', () => { const b = window.__b; b.bispo.shieldT = 3; }, 600);
await shot('c4-lado', () => { window.__b.bispo.shieldT = 0; window.__game.debugView(5.5, 22, -Math.PI / 2 + 0.4, 0.18); }, 900);
await browser.close();
