// Teste do co-op: dois navegadores, um cria a sala e o outro entra pelo código.
import { chromium } from 'playwright-core';
const out = process.argv[2] ?? '.';
// node tools/coop.mjs <pasta> rota  -> o anfitrião escolhe o mapa Rota no lobby
const mapId = process.argv[3] ?? 'cidade';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const mk = async (name) => {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${name} pageerror]`, e.message));
  await page.goto('http://localhost:5173/?autoplay');
  await page.fill('#in-name', name);
  await page.click('#btn-coop');
  return page;
};
const a = await mk('Ana');
const b = await mk('Beto');
await a.click('#btn-create');
await a.waitForSelector('#panel-lobby:not(.hidden)');
const code = (await a.textContent('#lobby-code')).trim();
console.log('sala', code);
await b.fill('#in-code', code);
await b.click('#btn-join');
await b.waitForSelector('#panel-lobby:not(.hidden)');
await a.waitForTimeout(300);
console.log('lobby A:', (await a.textContent('#lobby-players')).trim());
console.log('lobby B:', (await b.textContent('#lobby-players')).trim(), '| msg B:', await b.textContent('#lobby-msg'));
await a.screenshot({ path: `${out}/coop-lobby.png` });
if (mapId !== 'cidade') {
  await a.click(`#lobby-map [data-map="${mapId}"]`);
  await b.waitForFunction((id) => document.querySelector(`#lobby-map [data-map="${id}"]`)?.classList.contains('on'), mapId);
}
await a.click('#btn-start');
await Promise.all([a, b].map((p) => p.waitForFunction(() => window.__game, null, { timeout: 60000 })));
await a.waitForTimeout(1500);
// Ana olha para o Beto
await a.evaluate(() => window.__game.debugView(-3, 18, 0.5, 0));
await b.evaluate(() => window.__game.debugView(-1, 13, 0, 0));
await a.waitForTimeout(1500);
await a.screenshot({ path: `${out}/coop-ana-ve-beto.png` });
await b.screenshot({ path: `${out}/coop-beto.png` });
const state = await a.evaluate(() => JSON.stringify(window.__game.buffer.latest.s.players.map((p) => ({ n: p.name, slot: p.slot, x: p.x, z: p.z, life: p.life, pts: p.points }))));
console.log('jogadores (visão da Ana):', state);
const maps = await Promise.all([a, b].map((p) => p.evaluate(() => ({ map: window.__game.o.map.id, bus: !!window.__game.buffer.latest.s.bus }))));
console.log('mapa:', JSON.stringify(maps), maps.every((m) => m.map === mapId) ? 'ok' : 'FALHOU');
await browser.close();
