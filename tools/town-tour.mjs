// Fotos de dentro de cada prédio da Cidade (todas as portas abertas). Uso: node tools/town-tour.mjs <pasta> [ids...]
import { chromium } from 'playwright-core';
const out = process.argv[2] ?? '.';
const only = process.argv.slice(3);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:5173/?autoplay');
await page.waitForLoadState('networkidle');
await page.click('#map-choice [data-map="cidade"]');
await page.click('#btn-solo');
await (await page.waitForFunction(() => window.__game, null, { timeout: 90000 })).dispose();
await page.waitForTimeout(1500);
const doors = await page.evaluate(() => {
  const g = window.__game;
  const s = g.transport.sim;
  s.toSpawn = 0;
  s.zombies.clear();
  s.players.get('local').health = s.players.get('local').maxHealth = 99999;
  for (const d of g.o.map.doors) s.world.openDoors.add(d.id);
  return g.o.map.doors.filter((d) => d.kind === 'door' && g.o.map.zombieSpawns.some((p) => p.area === d.id)).map((d) => d.id);
});
await page.waitForTimeout(800);
for (const id of doors) {
  if (only.length && !only.includes(id)) continue;
  for (const [k, back] of [[0, 2.2], [1, -1]]) {
    await page.evaluate(([id, back]) => {
      const g = window.__game;
      const m = g.o.map;
      const use = m.interactables.find((i) => i.door === id).use;
      const sp = m.zombieSpawns.find((p) => p.area === id);
      const dx = sp.x - use[0], dz = sp.z - use[1];
      const d = Math.hypot(dx, dz);
      // logo depois da porta, olhando para o fundo (k=0); do fundo olhando para a porta (k=1)
      const ex = back > 0 ? use[0] + (dx / d) * back : sp.x + (dx / d) * 1.5;
      const ez = back > 0 ? use[1] + (dz / d) * back : sp.z + (dz / d) * 1.5;
      const lx = back > 0 ? dx : -dx, lz = back > 0 ? dz : -dz;
      g.transport.sim.zombies.clear();
      g.debugView(ex, ez, Math.atan2(-lx, -lz), -0.05);
    }, [id, back]);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${out}/in-${id}-${k}.png` });
  }
}
await browser.close();
