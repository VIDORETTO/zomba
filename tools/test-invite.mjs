// Convite por link: o anfitrião cria a sala e copia o convite; um amigo abre o link, digita o nome e cai na sala;
// o anfitrião tira um estranho (que não volta) e inicia a partida.
// Uso: node tools/test-invite.mjs <pasta> [endereço do anfitrião]
//   em desenvolvimento: node tools/test-invite.mjs <pasta>                  (http://localhost:5173)
//   com o iniciador:    node tools/test-invite.mjs <pasta> http://localhost:3002   (o convite sai com o link do túnel)
import { chromium } from 'playwright-core';

const out = process.argv[2] ?? '.';
const host = (process.argv[3] ?? 'http://localhost:5173').replace(/\/+$/, '');
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });

let fail = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'ok ' : 'FALHOU'} ${name} ${extra}`);
  if (!cond) fail++;
};
const mk = async (name) => {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 600 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${name} pageerror]`, e.message));
  page.on('console', (m) => m.type() === 'error' && console.log(`[${name} console]`, m.text()));
  return page;
};

// anfitrião: o iniciador abre o jogo com #criar, direto na tela do co-op
const a = await mk('Ana');
await a.goto(`${host}/#criar`);
await a.waitForSelector('#panel-coop:not(.hidden)', { timeout: 30000 });
check('#criar abre o co-op', true);
check('#criar some do endereço', !(await a.evaluate(() => location.hash)));
await a.fill('#in-coop-name', 'Ana');
await a.click('#btn-create');
await a.waitForSelector('#panel-lobby:not(.hidden)');
const code = (await a.textContent('#lobby-code')).trim();
const link = await a.inputValue('#lobby-link');
console.log('sala', code, '| convite', link);
check('convite tem o código', link.endsWith(`/#sala=${code}`));
if (/localhost:(3\d{3})/.test(host)) check('convite usa o link público do túnel', /^https:\/\/[a-z0-9-]+\.trycloudflare\.com\//.test(link), link);
await a.click('#btn-copy-invite');
check('botão copiar', /Copiado/.test(await a.textContent('#btn-copy-invite')));

// amigo abre o convite
const b = await mk('Beto');
await b.goto(link);
await b.waitForSelector('#invite-box:not(.hidden)', { timeout: 60000 });
check('convite mostra a sala', (await b.textContent('#invite-code')).trim() === code);
check('criar sala escondido no convite', await b.isHidden('#btn-create'));
check('mapa escondido no convite', await b.isHidden('#map-card'));
await b.fill('#in-coop-name', 'Beto');
await b.screenshot({ path: `${out}/invite-amigo.png` });
await b.click('#btn-invite-join');
await b.waitForSelector('#panel-lobby:not(.hidden)', { timeout: 20000 });
await a.waitForFunction(() => document.querySelectorAll('#lobby-players li').length === 2);
check('Beto no lobby do anfitrião', (await a.textContent('#lobby-players')).includes('Beto'));
check('nome do anfitrião', (await b.textContent('#lobby-players')).includes('Ana'));
check('Beto não vê botão de tirar', (await b.locator('#lobby-players .kick').count()) === 0);

// um estranho com o mesmo código: o anfitrião tira
const e = await mk('Estranho');
await e.goto(link);
await e.waitForSelector('#invite-box:not(.hidden)', { timeout: 60000 });
await e.fill('#in-coop-name', 'Estranho');
await e.click('#btn-invite-join');
await e.waitForSelector('#panel-lobby:not(.hidden)', { timeout: 20000 });
await a.waitForFunction(() => document.querySelectorAll('#lobby-players li').length === 3);
await a.screenshot({ path: `${out}/invite-lobby.png` });
await a.locator('#lobby-players li', { hasText: 'Estranho' }).locator('.kick').click();
await e.waitForSelector('#panel-coop:not(.hidden)');
check('estranho volta para o co-op com aviso', /tirou/.test(await e.textContent('#coop-msg')), await e.textContent('#coop-msg'));
await a.waitForFunction(() => document.querySelectorAll('#lobby-players li').length === 2);
check('lobby voltou a 2', true);
// (o bloqueio de quem foi tirado, por endereço, está em tools/test-guard.mjs: aqui os navegadores saem do mesmo computador)

await a.click('#btn-start');
await Promise.all([a, b].map((p) => p.waitForSelector('#menu.hidden', { state: 'attached', timeout: 90000 })));
check('partida começou para os dois', true);
await a.waitForTimeout(2500);
await b.screenshot({ path: `${out}/invite-jogo-beto.png` });
await browser.close();
console.log(fail ? `${fail} falha(s)` : 'tudo certo');
process.exitCode = fail ? 1 : 0;
