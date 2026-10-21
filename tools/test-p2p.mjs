// Co-op SEM servidor (WebRTC): o anfitrião cria a sala no próprio navegador e copia o convite; um amigo abre o link,
// digita o nome e cai na sala; o anfitrião tira um estranho e inicia a partida; os dois jogam (estado chega ao convidado).
// O encontro usa relés públicos de Nostr da internet de verdade, então precisa de internet.
// Uso: node tools/test-p2p.mjs <pasta> [endereço do jogo]   (padrão http://localhost:5173, com o Vite ligado)
import { chromium } from 'playwright-core';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const out = process.argv[2] ?? '.';
// RELAY=1: força passar pelo TURN público (prova que quem tem roteador difícil também conecta)
let q = '';
let closeTurn = () => {};
if (process.env.RELAY) {
  // TURN de verdade (node-turn) e um endereço que entrega as credenciais, como o Worker da Cloudflare faria
  const { createRequire } = await import('node:module');
  const Turn = createRequire(import.meta.url)('node-turn');
  const { createServer } = await import('node:http');
  const turn = new Turn({ authMech: 'long-term', credentials: { zomba: 'teste' }, listeningPort: 3479, listeningIps: ['127.0.0.1'], relayIps: ['127.0.0.1'], debugLevel: 'OFF' });
  turn.start();
  const http = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end(JSON.stringify({ iceServers: [{ urls: ['turn:127.0.0.1:3479'], username: 'zomba', credential: 'teste' }] }));
  }).listen(3480, '127.0.0.1');
  closeTurn = () => { http.close(); turn.stop?.(); };
  q = '?relay&turn=' + encodeURIComponent('http://127.0.0.1:3480/ice');
}
const host = (process.argv[3] ?? 'http://localhost:5173').replace(/\/+$/, '');
// no mesmo computador os endereços "locais" vêm embaralhados (mDNS) e o navegador de teste não os resolve: desliga isso
const args = ['--no-sandbox', '--ignore-gpu-blocklist', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-features=WebRtcHideLocalIpsWithMdns'];
async function open() {
  try {
    return await chromium.launch({ channel: 'chrome', headless: true, args });
  } catch {
    const base = join(homedir(), '.cache', 'ms-playwright');
    const dirs = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium-')).sort().reverse() : [];
    for (const d of dirs) {
      const exe = join(base, d, 'chrome-linux', 'chrome');
      if (existsSync(exe)) return chromium.launch({ executablePath: exe, headless: true, args });
    }
    throw new Error('Chrome não encontrado');
  }
}
const browser = await open();

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
await a.goto(`${host}/${q}#criar`);
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
check('código de 6 letras ou números', /^[A-Z2-9]{6}$/.test(code), code);
await a.click('#btn-copy-invite');
check('botão copiar', /Copiado/.test(await a.textContent('#btn-copy-invite')));

// amigo abre o convite
const b = await mk('Beto');
await b.goto(link.replace('/#', `/${q}#`));
await b.waitForSelector('#invite-box:not(.hidden)', { timeout: 60000 });
check('convite mostra a sala', (await b.textContent('#invite-code')).trim() === code);
check('criar sala escondido no convite', await b.isHidden('#btn-create'));
check('mapa escondido no convite', await b.isHidden('#map-card'));
await b.fill('#in-coop-name', 'Beto');
await b.screenshot({ path: `${out}/invite-amigo.png` });
await b.click('#btn-invite-join');
await b.waitForSelector('#panel-lobby:not(.hidden)', { timeout: 60000 });
await a.waitForFunction(() => document.querySelectorAll('#lobby-players li').length === 2, null, { timeout: 30000 });
check('Beto no lobby do anfitrião', (await a.textContent('#lobby-players')).includes('Beto'));
check('nome do anfitrião', (await b.textContent('#lobby-players')).includes('Ana'));
check('Beto não vê botão de tirar', (await b.locator('#lobby-players .kick').count()) === 0);

// um estranho com o mesmo código: o anfitrião tira
const e = await mk('Estranho');
await e.goto(link.replace('/#', `/${q}#`));
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

// mais dois amigos: sala de 4 (anfitrião + 3 convidados, que não se ligam entre si, só ao anfitrião)
const extras = [];
for (const nome of ['Cris', 'Duda']) {
  const x = await mk(nome);
  await x.goto(link.replace('/#', `/${q}#`));
  await x.waitForSelector('#invite-box:not(.hidden)', { timeout: 60000 });
  await x.fill('#in-coop-name', nome);
  await x.click('#btn-invite-join');
  await x.waitForSelector('#panel-lobby:not(.hidden)', { timeout: 60000 });
  extras.push(x);
}
await a.waitForFunction(() => document.querySelectorAll('#lobby-players li').length === 4, null, { timeout: 30000 });
check('sala com 4 jogadores', true);
const quinto = await mk('Quinto');
await quinto.goto(link.replace('/#', `/${q}#`));
await quinto.waitForSelector('#invite-box:not(.hidden)', { timeout: 60000 });
await quinto.fill('#in-coop-name', 'Quinto');
await quinto.click('#btn-invite-join');
await quinto.waitForFunction(() => /cheia/.test(document.querySelector('#coop-msg').textContent), null, { timeout: 60000 });
check('o quinto jogador recebe "sala cheia"', true);
await quinto.close();
await a.click('#btn-start');
await Promise.all([a, b, ...extras].map((p) => p.waitForSelector('#menu.hidden', { state: 'attached', timeout: 90000 })));
check('partida começou para os dois', true);
await a.waitForTimeout(2500);
// o convidado recebe o estado do jogo da partida do anfitrião e o anfitrião recebe as entradas do convidado
const info = (p) => p.evaluate(() => { const g = window.__game; const t = g.transport; return { p2p: !!t.p2p, host: !!t.isHost, id: t.localId, ping: Math.round(t.ping), route: t.route, n: g.buffer.latest?.s.time ?? 0, players: g.buffer.latest?.s.players.map((x) => x.id).sort() ?? [] }; });
const ia = await info(a), ib = await info(b);
console.log('anfitrião', JSON.stringify(ia), '\nconvidado', JSON.stringify(ib));
if (process.env.RELAY) check('a ligação passou pelo TURN', ib.route === 'retransmitida', ib.route);
check('os dois usam o co-op sem servidor', ia.p2p && ib.p2p && ia.host && !ib.host);
check('todos veem os 4 jogadores', ia.players.length === 4 && ib.players.length === 4 && (await info(extras[1])).players.length === 4);
// o convidado anda (o próprio jogo manda a posição dele ao anfitrião, como em qualquer partida)
await b.evaluate(() => window.__game.debugView(10, 10, 1.2));
await b.waitForTimeout(1500);
const n1 = (await info(b)).n;
await b.waitForTimeout(1500);
const n2 = (await info(b)).n;
check('o estado do jogo continua chegando ao convidado', n2 - n1 > 0.8, `avançou ${(n2 - n1).toFixed(2)} s em 1,5 s`);
const px = await a.evaluate((id) => window.__game.buffer.latest.s.players.find((x) => x.id === id)?.x, ib.id);
check('a posição do convidado chegou ao anfitrião', Math.abs(px - 10) < 1.5, String(px));
const pingB = (await info(b)).ping;
check('ping medido no convidado', pingB >= 0 && pingB < 500, `${pingB} ms`);
await b.screenshot({ path: `${out}/invite-jogo-beto.png` });
// o anfitrião fecha a aba no meio da partida: o convidado vê o aviso de conexão perdida
await a.close();
await b.waitForSelector('text=CONEXÃO PERDIDA', { timeout: 20000 });
check('anfitrião saiu: o convidado recebe o aviso de conexão perdida', /anfitrião/.test(await b.textContent('.gameover')));
await browser.close();
closeTurn();
console.log(fail ? `${fail} falha(s)` : 'tudo certo');
process.exitCode = fail ? 1 : 0;
process.exit(fail ? 1 : 0);
