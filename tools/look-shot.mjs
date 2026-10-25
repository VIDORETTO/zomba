// Fotografa pontos do mapa. Uso: node tools/look-shot.mjs <pasta> <porta> <mapa> '<json: [{n,x,z,yaw,pitch,eval?}]>'
import { launch } from './launch.mjs';
// Cada cena põe o jogador em (x,z) olhando para yaw/pitch; `eval` é um trecho de JS rodado na página antes da foto.
const [out = '.', port = '5173', mapa = 'cidade', json = '[]'] = process.argv.slice(2);
import { readFileSync } from 'node:fs';
const scenes = JSON.parse(json.endsWith('.json') ? readFileSync(json, 'utf8') : json);
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.addInitScript((m) => localStorage.setItem('zomba.prefs', JSON.stringify({ name: '', server: '', startRound: 1, mapId: m })), mapa);
await page.goto(`http://localhost:${port}/?autoplay`);
await page.waitForLoadState('networkidle');
await page.click('#btn-solo');
await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
await page.evaluate(() => {
  const sim = window.__game.transport.sim;
  sim.players.get('local').health = 99999;
  sim.toSpawn = 0;
  sim.zombies.clear();
  sim.updateZombies = () => {};
});
for (const s of scenes) {
  await page.evaluate(({ x, z, yaw, pitch, ev }) => {
    const g = window.__game;
    if (x !== undefined) g.debugView(x, z, yaw, pitch ?? 0);
    if (ev) new Function('g', ev)(g);
  }, { x: s.x, z: s.z, yaw: s.yaw, pitch: s.pitch, ev: s.eval });
  await page.waitForTimeout(s.wait ?? 1200);
  await page.screenshot({ path: `${out}/${s.n}.png` });
}
await browser.close();
