// Teste no navegador (headless) do placar online: conta no menu, partida solo enviada no fim e listada na aba Online.
// Uso: node tools/test-online.mjs <pasta>   (com npm run dev rodando; grava em data/placar.json do servidor de teste)
import { chromium } from 'playwright-core';
const out = process.argv[2] ?? '.';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
let ok = 0, bad = 0;
const check = (name, cond, detail = '') => { cond ? ok++ : bad++; console.log(`${cond ? 'ok  ' : 'FALHOU'} ${name}${detail ? ` (${detail})` : ''}`); };
const name = `Teste${Math.floor(Math.random() * 9000 + 1000)}`;
await page.goto('http://localhost:5173/?autoplay');
await page.waitForLoadState('networkidle');

// placar → Online → cria a conta
await page.click('#btn-board');
await page.click('#board-tabs [data-tab="online"]');
await page.waitForTimeout(400);
await page.fill('#acc-name', name);
await page.fill('#acc-pass', 'senha123');
await page.click('#acc-in');
await page.waitForFunction(() => /Conectado como/.test(document.querySelector('#board-account')?.textContent ?? ''), null, { timeout: 8000 });
const acc = await page.evaluate(() => ({ text: document.querySelector('#board-account').textContent, nameField: document.querySelector('#in-name').value }));
check('conta criada no menu e nome do jogo trocado', acc.text.includes(name) && acc.nameField === name, JSON.stringify(acc));
await page.screenshot({ path: `${out}/o1-conta.png` });

// partida solo curta: o jogador cai na rodada 1 (sem Segundo Fôlego = fim de jogo)
await page.click('#panel-board [data-back]');
await page.click('#map-choice [data-map="cidade"]');
await page.click('#btn-solo');
await (await page.waitForFunction(() => window.__game, null, { timeout: 90000 })).dispose();
await page.waitForFunction(() => window.__game.transport.sim.round >= 1, null, { timeout: 15000 });
await page.evaluate(() => {
  const s = window.__game.transport.sim;
  const p = s.players.get('local');
  p.kills = 7;
  p.headshots = 2;
  s.damagePlayer(p, 9999, p.x, p.z, false);
});
await page.waitForFunction(() => /placar online/i.test(document.querySelector('.online-note')?.textContent ?? ''), null, { timeout: 10000 });
const note = await page.evaluate(() => document.querySelector('.online-note').textContent);
check('fim de jogo envia a partida ao placar online', /Novo recorde|enviada/.test(note), note);
await page.screenshot({ path: `${out}/o2-fim.png` });

// volta ao menu e confere a aba Online
await page.click('[data-act="exit"]');
await page.click('#btn-board');
await page.click('#board-tabs [data-tab="online"]');
await page.waitForFunction((n) => (document.querySelector('#board-body')?.textContent ?? '').includes(n), name, { timeout: 8000 });
const row = await page.evaluate((n) => [...document.querySelectorAll('#board-body tr')].find((tr) => tr.textContent.includes(n))?.textContent, name);
check('a partida aparece na aba Online', !!row && row.includes('7'), row);
await page.screenshot({ path: `${out}/o3-placar.png` });

// sair da conta
await page.click('#acc-out');
await page.waitForTimeout(200);
check('sair da conta volta ao formulário', await page.evaluate(() => !!document.querySelector('#acc-pass')));
check('sem erros na página', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`\n${ok} ok, ${bad} falharam`);
await browser.close();
