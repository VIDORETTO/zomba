// Confere a versão de produção como ela vai para a internet: SÓ arquivos estáticos (nenhum servidor de jogo, de salas ou de placar).
// Gera o pacote, serve a pasta com um servidor de arquivos simples, abre dois navegadores e faz um co-op de verdade
// (encontro pelos relés públicos, ligação WebRTC entre as duas abas). Precisa de internet.
// Uso: node tools/prod-check.mjs            (serve a pasta dist/ localmente; rode npm run build antes)
//      node tools/prod-check.mjs https://zomba.gabrielvidoretto.com.br   (confere o site publicado)
import { chromium } from 'playwright-core';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { homedir } from 'node:os';
import { readdirSync } from 'node:fs';

const REMOTE = process.argv[2]?.replace(/\/+$/, '');
const DIST = new URL('../dist/', import.meta.url).pathname;
if (!REMOTE && !existsSync(join(DIST, 'index.html'))) throw new Error('rode npm run build antes');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ogg': 'audio/ogg', '.png': 'image/png', '.json': 'application/json' };
const requests = [];
const srv = createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
  requests.push(path);
  let f = normalize(join(DIST, path));
  if (!f.startsWith(DIST) || !existsSync(f) || statSync(f).isDirectory()) f = join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': MIME[extname(f)] ?? 'application/octet-stream' });
  res.end(readFileSync(f));
});
if (!REMOTE) {
  srv.listen(0, '127.0.0.1');
  await new Promise((r) => srv.once('listening', r));
}
const url = REMOTE ?? `http://127.0.0.1:${srv.address().port}`;

let fail = 0;
const check = (n, c, d = '') => { console.log(`${c ? 'ok  ' : 'FALHOU'} ${n}${d ? ` (${d})` : ''}`); if (!c) fail++; };

const args = ['--no-sandbox', '--ignore-gpu-blocklist', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-features=WebRtcHideLocalIpsWithMdns'];
async function open() {
  try { return await chromium.launch({ channel: 'chrome', headless: true, args }); } catch {
    const base = join(homedir(), '.cache', 'ms-playwright');
    const d = readdirSync(base).filter((x) => x.startsWith('chromium-')).sort().reverse()[0];
    return chromium.launch({ executablePath: join(base, d, 'chrome-linux', 'chrome'), headless: true, args });
  }
}
const browser = await open();
const errs = [];
const page = async (name) => {
  const p = await browser.newPage({ viewport: { width: 1000, height: 640 } });
  p.on('pageerror', (e) => errs.push(`${name}: ${e.message}`));
  await p.goto(url);
  await p.waitForLoadState('networkidle');
  return p;
};
const turnReqs = [];
const a = await page('Ana');
a.on('response', (r) => r.url().includes('workers.dev') && turnReqs.push(`${r.status()} ${r.url()}`));
check('menu sem campo de servidor nem aba de placar online', (await a.isHidden('#server-adv')) && (await a.isHidden('#board-tabs [data-tab="online"]')));
check('no navegador de produção não existe o atalho de desenvolvimento', await a.evaluate(() => !window.__game));
await a.fill('#in-name', 'Ana');
await a.click('#btn-coop');
await a.click('#btn-create');
await a.waitForSelector('#panel-lobby:not(.hidden)');
const code = (await a.textContent('#lobby-code')).trim();
const link = await a.inputValue('#lobby-link');
check('convite aponta para o próprio endereço do jogo', link === `${url}/#sala=${code}`, link);
const b = await page('Beto');
await b.goto(link);
await b.waitForSelector('#invite-box:not(.hidden)');
await b.fill('#in-coop-name', 'Beto');
await b.click('#btn-invite-join');
await a.waitForFunction(() => document.querySelectorAll('#lobby-players li').length === 2, null, { timeout: 60000 });
check('o amigo entrou na sala pelo convite (só com arquivos estáticos)', true);
await a.click('#btn-start');
await Promise.all([a, b].map((p) => p.waitForSelector('#menu.hidden', { state: 'attached', timeout: 90000 })));
await a.waitForTimeout(2500);
check('a partida começou para os dois', true);
await browser.close();
srv.close?.();
if (REMOTE) check('o jogo buscou as credenciais do TURN (Worker da Cloudflare) e a origem foi aceita', turnReqs.some((r) => r.startsWith('200')), turnReqs.join(' | ') || 'nenhum pedido');
if (!REMOTE) check('o servidor do jogo só recebeu pedidos de arquivos (nada de /api)', requests.every((r) => !r.startsWith('/api')), requests.filter((r) => r.startsWith('/api')).join(','));
check('nenhum erro de script', errs.length === 0, errs.slice(0, 2).join(' | '));
console.log(fail ? `${fail} falharam` : 'tudo certo');
process.exit(fail ? 1 : 0);
