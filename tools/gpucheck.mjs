// Abre o Chrome do sistema SEM flags (como o usuário usa) e mostra qual renderizador o WebGL está usando.
import { chromium } from 'playwright-core';
const headed = process.argv[2] === 'headed';
const browser = await chromium.launch({ channel: 'chrome', headless: !headed, ignoreDefaultArgs: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto('chrome://gpu');
await page.waitForTimeout(1500);
const txt = await page.evaluate(() => document.body.innerText);
const pick = (re) => (txt.match(re) || [])[0] ?? '';
console.log(pick(/WebGL2?:.*$/m)); console.log(pick(/WebGL2:.*$/m));
console.log(pick(/GL_RENDERER.*$/m));
console.log(pick(/Rasterization:.*$/m));
await page.goto('http://localhost:5173/?autoplay');
const r = await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
  return gl ? gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) : 'sem webgl2';
});
console.log('renderizador do jogo:', r);
await page.click('#btn-solo');
await page.waitForFunction(() => window.__game, null, { timeout: 90000 });
await page.evaluate(() => window.__game.debugView(0, 16, 0, -0.05));
await page.waitForTimeout(3000);
console.log('FPS no HUD:', await page.evaluate(() => document.querySelector('.netinfo')?.textContent));
await browser.close();
