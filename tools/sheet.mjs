// Junta capturas numa folha só (grade), para revisar animações de uma vez.
// Uso: node tools/sheet.mjs <saida.png> <colunas> <largura-celula> img1.png img2.png ...
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
const [outFile, colsArg, cellArg, ...files] = process.argv.slice(2);
const cols = Number(colsArg);
const cell = Number(cellArg);
const imgs = files.map((f) => `<figure><img src="data:image/png;base64,${readFileSync(f).toString('base64')}"><figcaption>${basename(f, '.png')}</figcaption></figure>`).join('');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: cols * (cell + 4), height: 400 } });
await page.setContent(`<style>body{margin:0;background:#111;display:grid;grid-template-columns:repeat(${cols},${cell}px);gap:4px}figure{margin:0}img{width:${cell}px;display:block}figcaption{color:#ddd;font:11px sans-serif;padding:1px 3px}</style>${imgs}`);
await page.screenshot({ path: outFile, fullPage: true });
await browser.close();
