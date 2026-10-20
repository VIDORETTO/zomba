// Menu com o mapa 3D ao fundo, tela de carregamento, "Jogar de novo" e volta ao menu.
// Uso: node tools/test-menu.mjs
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
let fails = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'ok  ' : 'FALHOU'} ${msg}`);
  if (!cond) fails++;
};
const fits = (sel) => page.evaluate((sel) => {
  const b = document.querySelector(sel).getBoundingClientRect();
  return b.top >= 0 && b.bottom <= innerHeight && b.left >= 0 && b.right <= innerWidth;
}, sel);

await page.goto('http://localhost:5173/?autoplay');
await page.waitForLoadState('networkidle');
await (await page.waitForFunction(() => window.__menu, null, { timeout: 60000 })).dispose();
ok(await page.evaluate(() => document.getElementById('menu').classList.contains('live')), 'menu com o mapa 3D ao fundo');
for (const sel of ['.logo', '#btn-solo', '#btn-controls', '#map-card', '#in-round']) ok(await fits(sel), `${sel} cabe em 1280×720`);

await page.click('#map-choice [data-map="rota"]');
await (await page.waitForFunction(() => window.__menu?.map.id === 'rota', null, { timeout: 60000 })).dispose();
ok(await page.evaluate(() => document.getElementById('map-name').textContent === 'Rota'), 'troca de mapa muda o fundo e o nome');

await page.click('#btn-solo');
await page.waitForTimeout(150);
ok(await page.evaluate(() => !document.getElementById('loading').classList.contains('hidden') && document.getElementById('load-map').textContent === 'Rota'), 'tela de carregamento com o nome do mapa');
ok(await page.evaluate(() => document.getElementById('load-tip').textContent.length > 10), 'dica na tela de carregamento');
await (await page.waitForFunction(() => window.__game, null, { timeout: 90000 })).dispose();
ok(await page.evaluate(() => !window.__menu || window.__menu.disposed), 'fundo do menu desligado durante a partida');
await page.waitForTimeout(900);
ok(await page.evaluate(() => document.getElementById('loading').classList.contains('hidden')), 'tela de carregamento some');

// morre e joga de novo no mesmo mapa
const first = await page.evaluateHandle(() => window.__game);
await page.evaluate(() => {
  const s = window.__game.transport.sim;
  const p = s.players.get('local');
  p.perks = [];
  s.round = 5;
  p.kills = 30;
  s.damagePlayer(p, 999, p.x, p.z, false);
});
await page.waitForSelector('[data-act="again"]', { timeout: 15000 });
await page.waitForTimeout(3200);
const xp = await page.evaluate(() => document.querySelector('.xp-count').textContent);
ok(xp !== '0', `XP sobe na tela de fim (${xp})`);
await page.click('[data-act="again"]');
await (await page.waitForFunction((g) => window.__game && window.__game !== g, first, { timeout: 90000 })).dispose();
await first.dispose();
ok(await page.evaluate(() => window.__game.o.map.id === 'rota'), 'jogar de novo volta para o mesmo mapa');
ok(await page.evaluate(() => document.getElementById('menu').classList.contains('hidden')), 'jogar de novo não passa pelo menu');

// sai para o menu: o fundo volta
await page.evaluate(() => window.__game.o.onExit());
await (await page.waitForFunction(() => window.__menu && !window.__menu.disposed, null, { timeout: 60000 })).dispose();
ok(true, 'fundo do menu volta ao sair da partida');
ok(errs.length === 0, `sem erros na página ${errs.slice(0, 2).join(' | ')}`);
await browser.close();
console.log(fails ? `${fails} falha(s)` : 'tudo certo');
process.exit(fails ? 1 : 0);
