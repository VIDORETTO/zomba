// Conta as sombras difusas (blob) na cena do fundo do menu e diz onde estão. Uso: node tools/blob-count.mjs
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:5173/?autoplay');
await page.waitForLoadState('networkidle');
await (await page.waitForFunction(() => window.__menu, null, { timeout: 60000 })).dispose();
await page.evaluate(() => window.__menu.debugShot(2, 0.5));
await page.waitForTimeout(3000);
console.log(await page.evaluate(() => {
  const out = [];
  window.__menu.scene.traverse((o) => {
    if (o.name !== 'blob') return;
    const p = o.getWorldPosition(o.position.clone());
    out.push(`${o.visible ? 'vis' : 'oculta'} y=${p.y.toFixed(2)} s=${o.scale.x.toFixed(2)} pai=${o.parent?.parent ? 'ok' : 'solto'} op=${o.material.opacity} fog=${o.material.fog}`);
  });
  return out.join('\n') || 'nenhuma';
}));
await browser.close();
