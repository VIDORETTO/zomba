// Confere se a partida anterior é liberada da memória depois de voltar ao menu (WeakRef + gc).
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11', '--js-flags=--expose-gc'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:5173/?autoplay');
await page.waitForLoadState('networkidle');
await page.click('#btn-solo');
await (await page.waitForFunction(() => window.__game, null, { timeout: 90000 })).dispose();
await page.waitForTimeout(2500);
await page.evaluate(() => {
  const g = window.__game;
  window.__refs = { game: new WeakRef(g), sim: new WeakRef(g.transport.sim), hud: new WeakRef(g.hud), weapon: new WeakRef(g.weapon), input: new WeakRef(g.input), zombies: new WeakRef(g.zombies), map: new WeakRef(g.mapView), transport: new WeakRef(g.transport) };
  g.o.onExit();
  window.__game = null;
});
for (let i = 0; i < 5; i++) {
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.gc());
}
console.log(await page.evaluate(() => Object.fromEntries(Object.entries(window.__refs).map(([k, r]) => [k, r.deref() ? 'PRESO' : 'liberado']))));
const cdp = await page.context().newCDPSession(page);
if (process.argv[2]) {
  await cdp.send('HeapProfiler.enable');
  const chunks = [];
  cdp.on('HeapProfiler.addHeapSnapshotChunk', (e) => chunks.push(e.chunk));
  await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
  const fs = await import('node:fs');
  fs.writeFileSync(process.argv[2], chunks.join(''));
  console.log('snapshot salvo');
}
await browser.close();
