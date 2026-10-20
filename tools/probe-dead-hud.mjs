// Mata o jogador e mede onde ficam os pontos e a munição no HUD (o placar não pode cobrir a munição).
// Uso: node tools/probe-dead-hud.mjs [pasta]
import { chromium } from 'playwright-core';
const out = process.argv[2] ?? '.';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:5173/?autoplay');
await page.waitForLoadState('networkidle');
await page.click('#btn-solo');
await (await page.waitForFunction(() => window.__game, null, { timeout: 90000 })).dispose();
await page.waitForTimeout(1500);
const rects = () => page.evaluate(() => {
  const r = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.top), Math.round(b.bottom), getComputedStyle(e).display]; };
  return { scores: r('.scores'), popups: r('.popups'), ammo: r('.ammo'), right: r('.bottom-right'), rows: [...document.querySelectorAll('.score-row')].map((e) => e.className + ' ' + e.textContent) };
});
console.log('vivo:', JSON.stringify(await rects()));
await page.evaluate(() => {
  const s = window.__game.transport.sim;
  const p = s.players.get('local');
  p.perks = [];
  s.damagePlayer(p, 999, p.x, p.z, false);
});
for (const t of [300, 1500, 3500]) {
  await page.waitForTimeout(t);
  console.log(`caído +${t}:`, JSON.stringify(await rects()));
}
await page.screenshot({ path: `${out}/dead-hud.png` });
await browser.close();
