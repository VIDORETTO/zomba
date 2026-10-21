// Salvar e carregar o progresso (nível, banco, recordes) em arquivo. Uso: node tools/test-backup.mjs <pasta> [endereço do jogo]
import { launch } from './launch.mjs';
import { readFileSync, writeFileSync } from 'node:fs';

const out = process.argv[2] ?? '.';
const host = (process.argv[3] ?? 'http://127.0.0.1:5173').replace(/\/+$/, '');
let fail = 0;
const check = (n, c, d = '') => { console.log(`${c ? 'ok  ' : 'FALHOU'} ${n}${d ? ` (${d})` : ''}`); if (!c) fail++; };

const browser = await launch();
const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1000, height: 700 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(host);
await page.waitForSelector('#btn-controls');
// progresso de mentira guardado no navegador (como o jogo guarda)
await page.evaluate(() => {
  localStorage.setItem('zomba.profiles', JSON.stringify({ Ana: { name: 'Ana', xp: 1234, stats: {} } }));
  localStorage.setItem('zomba.account', JSON.stringify({ name: 'x', token: 'segredo' }));
});
await page.click('#btn-controls');
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-save-progress')]);
const file = `${out}/progresso-teste.json`;
await dl.saveAs(file);
const j = JSON.parse(readFileSync(file, 'utf8'));
check('o arquivo tem a marca e o perfil', j.marca === 'zomba-progresso' && 'zomba.profiles' in j.dados);
check('o token da conta do placar não vai no arquivo', !('zomba.account' in j.dados) && !readFileSync(file, 'utf8').includes('segredo'));

// apaga tudo e carrega o arquivo
await page.evaluate(() => localStorage.clear());
await page.setInputFiles('#file-progress', file);
await page.waitForFunction(() => /Recarregando/.test(document.getElementById('progress-msg').textContent));
await page.waitForLoadState('load');
await page.waitForTimeout(1200);
const back = await page.evaluate(() => JSON.parse(localStorage.getItem('zomba.profiles') ?? 'null'));
check('o progresso voltou depois de carregar o arquivo', back?.Ana?.xp === 1234, JSON.stringify(back));

// arquivo errado não estraga nada
await page.click('#btn-controls');
writeFileSync(`${out}/lixo.json`, '{"qualquer":1}');
await page.setInputFiles('#file-progress', `${out}/lixo.json`);
await page.waitForTimeout(300);
check('arquivo que não é do jogo é recusado', /não é um progresso/.test(await page.textContent('#progress-msg')));
check('o progresso continua intacto', (await page.evaluate(() => JSON.parse(localStorage.getItem('zomba.profiles')).Ana.xp)) === 1234);
await browser.close();
console.log(fail ? `${fail} falharam` : 'tudo certo');
process.exit(fail ? 1 : 0);
