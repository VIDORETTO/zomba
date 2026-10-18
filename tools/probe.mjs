// Inspeciona valores internos do jogo em execução (só desenvolvimento).
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:5173/?autoplay');
await page.click('#btn-solo');
await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
for (let i = 0; i < 3; i++) {
  console.log(await page.evaluate(() => {
    const g = window.__game;
    return JSON.stringify({ pos: g.pc.pos, vel: g.pc.vel, yaw: g.pc.yaw, pitch: g.pc.pitch, cam: g.camera.position, step: g.pc.stepSmooth, land: g.pc.landKick, down: g.pc.downT, crouch: g.pc.crouchT, bob: g.pc.bobAmount, me: g.me && { x: g.me.x, life: g.me.life } });
  }));
  await page.waitForTimeout(300);
}
await browser.close();
