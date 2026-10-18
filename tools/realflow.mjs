// Fluxo real (sem ?autoplay): Solo, clique na tela, anda, atira. Uso: node tools/realflow.mjs <firefox|chrome> <pasta>
import { chromium, firefox } from 'playwright-core';
const engine = process.argv[2] ?? 'firefox';
const out = process.argv[3] ?? '.';
const browser = engine === 'firefox' ? await firefox.launch({ headless: false }) : await chromium.launch({ channel: 'chrome', headless: false });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const logs = [];
page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`); });
await page.goto('http://localhost:5173/');
await page.click('#btn-solo');
await page.waitForSelector('.hud', { timeout: 90000 });
await page.waitForTimeout(1500);
const state = () => page.evaluate(() => ({
  locked: !!document.pointerLockElement,
  click: !document.querySelector('.click-to-play')?.classList.contains('hidden'),
  ammo: document.querySelector('.ammo-nums')?.textContent,
  fps: document.querySelector('.netinfo')?.textContent,
  feed: [...document.querySelectorAll('.note')].map((n) => n.textContent),
}));
console.log('após Solo:', JSON.stringify(await state()));
await page.screenshot({ path: `${out}/${engine}-1-apos-solo.png` });
await page.mouse.click(800, 450);
await page.waitForTimeout(800);
console.log('após clicar na tela:', JSON.stringify(await state()));
await page.keyboard.down('KeyW'); await page.waitForTimeout(800); await page.keyboard.up('KeyW');
await page.mouse.down(); await page.mouse.up();
await page.waitForTimeout(500);
console.log('após andar e atirar:', JSON.stringify(await state()));
await page.screenshot({ path: `${out}/${engine}-2-jogando.png` });
console.log(logs.filter((l) => !/willReadFrequently|vite/.test(l)).slice(0, 10).join('\n'));
await browser.close();
