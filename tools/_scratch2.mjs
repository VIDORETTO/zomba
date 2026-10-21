import { launch } from './launch.mjs';
const out = process.argv[2];
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://127.0.0.1:5173/?autoplay');
await page.waitForLoadState('networkidle');
await page.click('#map-choice [data-map="trincheira"]');
await page.click('#btn-solo');
await page.waitForFunction(() => window.__game, null, { timeout: 90000 });
await page.waitForTimeout(1500);
await page.evaluate(() => { const g = window.__game; const s = g.transport.sim; s.toSpawn = 0; s.zombies.clear(); s.spawnZombie = () => undefined; s.players.get('local').health = 99999; s.state = 'intermission'; s.stateTimer = 1e9; s.tr.weather = 'limpo'; document.querySelectorAll('.hud').forEach((e) => (e.style.visibility = 'hidden')); });
for (const [name, x, z, yaw, pitch, wx] of JSON.parse(process.argv[3])) {
  await page.evaluate(([x, z, yaw, pitch, wx]) => { const g = window.__game; g.transport.sim.tr.weather = wx || 'limpo'; g.debugView(x, z, yaw, pitch); }, [x, z, yaw, pitch, wx]);
  await page.waitForTimeout(wx === 'chuva' ? 6000 : 2200);
  await page.screenshot({ path: `${out}/${name}.png` });
}
await browser.close();
