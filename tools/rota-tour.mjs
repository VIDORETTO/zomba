// Passeio fotográfico pelo mapa Rota: cada parada vista da estrada, o ônibus de fora e a estrada na névoa.
import { chromium } from 'playwright-core';
const out = process.argv[2] ?? '.';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:5173/?autoplay');
await page.waitForLoadState('networkidle');
await page.click('#map-choice [data-map="rota"]');
await page.click('#btn-solo');
await page.waitForFunction(() => window.__game, null, { timeout: 90000 });
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const s = window.__game.transport.sim;
  s.toSpawn = 0;
  s.zombies.clear();
  s.players.get('local').health = s.players.get('local').maxHealth = 99999;
  s.power = true;
});
// ônibus parado na Rodoviária, visto de fora
await page.evaluate(() => window.__game.debugView(8, 9, 0.726, 0.05));
await page.waitForTimeout(1000);
await page.screenshot({ path: `${out}/t0-onibus-parado.png` });
// [nome, x, z, yaw, pitch]  (yaw 0 = olhando para -z)
const shots = [
  ['t1-rodoviaria', 0, 16, 0, 0.12],
  ['t2-lanchonete', -168, -112, 0, 0.12],
  ['t3-posto-oficina', -168, -122, Math.PI, 0.1],
  ['t4-fazenda', -236, 98, -Math.PI / 2, 0.12],
  ['t5-celeiro', -246, 103, Math.PI / 2, 0.15],
  ['t6-usina', -40, 254, 0, 0.18],
  ['t7-cidade', 192, 132, -Math.PI / 2, 0.1],
  ['t8-cidade-praca', 190, 128, Math.PI / 2, 0.1],
  ['t9-estrada', -100, -70, 2.4, 0.05],
  ['t11-usina-dentro', -37, 232, 0, 0.05],
];
for (const [name, x, z, yaw, pitch] of shots) {
  await page.evaluate(([x, z, yaw, pitch]) => { window.__game.transport.sim.zombies.clear(); window.__game.debugView(x, z, yaw, pitch); }, [x, z, yaw, pitch]);
  await page.waitForTimeout(1300);
  await page.screenshot({ path: `${out}/${name}.png` });
}
// ônibus visto de fora, chegando na Rodoviária
await page.evaluate(() => {
  const g = window.__game;
  const b = g.buffer.latest.s.bus;
  g.debugView(b.x - 9, b.z + 7, 2.2, 0.08);
});
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/t10-onibus.png` });
await browser.close();
