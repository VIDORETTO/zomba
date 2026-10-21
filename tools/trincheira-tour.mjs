// Passeio fotográfico pela Trincheira: cada área vista de dentro. Uso: node tools/trincheira-tour.mjs <pasta> [aberto]
// Com "aberto" todos os portões já começam abertos.
import { launch } from './launch.mjs';
const out = process.argv[2] ?? '.';
const openAll = process.argv[3] === 'aberto';
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
await page.evaluate((openAll) => {
  const s = window.__game.transport.sim;
  s.toSpawn = 0;
  s.zombies.clear();
  s.players.get('local').health = s.players.get('local').maxHealth = 99999;
  if (openAll) for (const d of window.__game.o.map.doors) s.world.openDoors.add(d.id);
}, openAll);
// [nome, x, z, yaw, pitch]  (yaw 0 = olhando para o norte, -z; PI/2 = oeste)
const shots = [
  ['tr01-posto', 103, 58, 0, 0.05],
  ['tr02-posto-portoes', 104, 50, Math.PI / 2 - 0.4, 0.05],
  ['tr03-estacao', 88, 44, Math.PI / 2, 0.05],
  ['tr04-lama-sul', 30, 27, Math.PI / 2, 0.02],
  ['tr05-escavacao', -15, -22, Math.PI, 0.12],
  ['tr06-forja', -15, 2, 0, 0.05],
  ['tr07-igreja', -84, 18, 0, 0.1],
  ['tr08-quartel', 2, -64, Math.PI / 2, 0.05],
  ['tr09-oficina', 46, 16, 0, 0.05],
  ['tr10-casamata', 68, -9, 0, 0.05],
  ['tr11-vala', -10, 48, Math.PI, 0.05],
  ['tr12-lama-norte', -45, -38, -Math.PI / 2, 0.02],
  ['tr13-cripta', 77, -3, 0, 0.05],
  ['tr14-oeste', -110, 22, 0, 0.05],
];
for (const [name, x, z, yaw, pitch] of shots) {
  await page.evaluate(([x, z, yaw, pitch]) => { window.__game.transport.sim.zombies.clear(); window.__game.debugView(x, z, yaw, pitch); }, [x, z, yaw, pitch]);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/${name}.png` });
}
const fps = await page.evaluate(() => new Promise((res) => {
  let n = 0;
  const t0 = performance.now();
  const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(Math.round(n / ((performance.now() - t0) / 1000))); };
  requestAnimationFrame(f);
}));
console.log('fps', fps);
await browser.close();
