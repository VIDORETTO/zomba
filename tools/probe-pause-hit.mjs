// Diagnóstico: o que está por cima das abas do menu de jogo (quem recebe o clique).
// Uso: node tools/probe-pause-hit.mjs
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:5173/?autoplay');
await page.waitForLoadState('networkidle');
await page.click('#btn-solo');
await (await page.waitForFunction(() => window.__game, null, { timeout: 90000 })).dispose();
await page.waitForTimeout(1500);
await page.evaluate(() => window.__game.showPause());
await page.waitForTimeout(300);
console.log('mudanças no menu em 1 s:', await page.evaluate(() => new Promise((res) => {
  let n = 0;
  const mo = new MutationObserver((l) => (n += l.length));
  mo.observe(document.querySelector('.overlay'), { childList: true, subtree: true, attributes: true, characterData: true });
  setTimeout(() => { mo.disconnect(); res(n); }, 1000);
})));
await page.mouse.move(560, 240);
console.log('mudanças com o mouse parado em cima da aba:', await page.evaluate(() => new Promise((res) => {
  let n = 0;
  const mo = new MutationObserver((l) => (n += l.length));
  mo.observe(document.querySelector('.overlay'), { childList: true, subtree: true });
  setTimeout(() => { mo.disconnect(); res(n); }, 1000);
})));
const sel = '.gm-tabs [data-tab="video"]';
const box = await page.locator(sel).boundingBox();
console.log('caixa', JSON.stringify(box));
const at = await page.evaluate(([x, y]) => {
  const el = document.elementFromPoint(x, y);
  return `${el.tagName}.${el.className} scrollY=${scrollY} overlayScroll=${document.querySelector('.overlay').scrollTop}`;
}, [box.x + box.width / 2, box.y + box.height / 2]);
console.log('no ponto:', at);
await page.click(sel, { timeout: 3000 }).then(() => console.log('clique ok'), (e) => console.log('clique falhou:', e.message.split('\n')[0]));
await page.evaluate(() => {
  window.__ev = [];
  for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
    document.addEventListener(t, (e) => window.__ev.push(`${t}->${e.target.tagName}.${e.target.className}`), true);
  }
});
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
console.log('eventos:', await page.evaluate(() => window.__ev.join(' | ')));
await page.waitForTimeout(200);
console.log('aba ativa depois do clique do mouse:', await page.evaluate(() => document.querySelector('.gm-tabs .on')?.dataset.tab));
await browser.close();
