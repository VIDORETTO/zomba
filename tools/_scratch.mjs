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
await page.evaluate(() => { const g = window.__game; const s = g.transport.sim; s.toSpawn = 0; s.zombies.clear(); s.spawnZombie = () => undefined; s.players.get('local').health = 99999; s.state = 'intermission'; s.stateTimer = 1e9; document.querySelectorAll('.hud').forEach((e) => (e.style.visibility = 'hidden')); g.debugTr('blindado'); });
await page.waitForTimeout(5000);
const info = await page.evaluate(() => { const s = window.__game.transport.sim; const z = [...s.zombies.values()].find((q) => q.kind === 7); z.speed = 0; z.panzer.flameCD = 99; z.panzer.clawCD = 99; z.hp = 9e9; return { x: z.x, z: z.z }; });
console.log(JSON.stringify(info));
for (const [name, ang, dist, pitch] of JSON.parse(process.argv[3])) {
  await page.evaluate(([x, z, ang, dist, pitch]) => { const px = x + Math.cos(ang) * dist, pz = z + Math.sin(ang) * dist; window.__game.debugView(px, pz, Math.atan2(-(x - px), -(z - pz)), pitch); const s = window.__game.transport.sim; const q = [...s.zombies.values()].find((q) => q.kind === 7); q.x = x; q.z = z; q.speed = 0; }, [info.x, info.z, ang, dist, pitch]);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/${name}.png` });
}
await browser.close();
