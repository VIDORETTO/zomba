import { launch } from './launch.mjs';
const out = process.argv[2];
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text()); });
await page.goto('http://127.0.0.1:5173/?autoplay');
await page.waitForLoadState('networkidle');
await page.click('#map-choice [data-map="trincheira"]');
await page.click('#btn-solo');
await page.waitForFunction(() => window.__game, null, { timeout: 90000 });
await page.waitForTimeout(1500);
await page.evaluate(() => { const g = window.__game; const s = g.transport.sim; s.toSpawn = 0; s.zombies.clear(); s.spawnZombie = () => undefined; s.players.get('local').health = 99999; s.state = 'intermission'; s.stateTimer = 1e9; document.querySelectorAll('.hud').forEach((e) => (e.style.visibility = 'hidden')); });
const shots = JSON.parse(process.argv[3]);
for (const [name, x, z, yaw, pitch, cmd] of shots) {
  if (cmd) await page.evaluate((c) => window.__game.debugTr(c), cmd);
  await page.evaluate(([x, z, yaw, pitch]) => window.__game.debugView(x, z, yaw, pitch), [x, z, yaw, pitch]);
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${out}/${name}.png` });
}
await browser.close();
