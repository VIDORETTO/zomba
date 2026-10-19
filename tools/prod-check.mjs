// Confere a versão de produção (jogo + co-op + placar numa porta só, como na internet).
// Uso: node tools/prod-check.mjs [endereço]   (padrão http://localhost:3001, depois de npm run build)
import { chromium } from 'playwright-core';
const url = process.argv[2] ?? 'http://localhost:3001';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const errs = [];
const open = async () => {
  const p = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(url);
  await p.waitForLoadState('networkidle');
  return p;
};
const a = await open();
console.log('servidor do co-op no menu:', await a.inputValue('#in-server'));
await a.click('#btn-coop');
await a.click('#btn-create');
await a.waitForFunction(() => /^[A-Z]{4}$/.test(document.querySelector('#lobby-code')?.textContent ?? ''), null, { timeout: 8000 });
const code = await a.textContent('#lobby-code');
const b = await open();
await b.click('#btn-coop');
await b.fill('#in-code', code);
await b.click('#btn-join');
await a.waitForFunction(() => document.querySelectorAll('#lobby-players li').length === 2, null, { timeout: 8000 });
console.log('sala', code, 'com 2 jogadores: ok');
const r = await a.evaluate(async () => (await fetch('/api/placar?modo=solo&inicio=zero&mapa=cidade')).status);
console.log('placar responde:', r);
console.log('erros:', errs.length ? errs.slice(0, 3).join(' | ') : 'nenhum');
await browser.close();
