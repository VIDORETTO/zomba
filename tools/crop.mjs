// Recorta e amplia um pedaço de uma captura. Uso: node tools/crop.mjs <entrada.png> <saida.png> x y w h [zoom]
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const [inp, out, x, y, w, h, zoom = 2] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: Number(w) * zoom, height: Number(h) * zoom } });
const b64 = readFileSync(inp).toString('base64');
await page.setContent(`<body style="margin:0;overflow:hidden"><div style="width:${w}px;height:${h}px;overflow:hidden;transform:scale(${zoom});transform-origin:0 0;image-rendering:pixelated"><img src="data:image/png;base64,${b64}" style="margin:-${y}px 0 0 -${x}px"></div></body>`);
await page.screenshot({ path: out });
await browser.close();
