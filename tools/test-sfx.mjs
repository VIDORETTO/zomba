// Confere se as gravações (public/sfx) carregam e se o tiro, os passos e as tábuas usam a gravação.
// Uso: node tools/test-sfx.mjs [firefox]   (firefox = simula o ouvinte sem positionX, como no Firefox)
import { chromium } from 'playwright-core';
const ff = process.argv[2] === 'firefox';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => (m.type() === 'warning' || m.type() === 'error') && errs.push(m.text()));
if (ff) await page.addInitScript(() => { delete AudioListener.prototype.positionX; });
let fails = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'ok  ' : 'FALHOU'} ${msg}`);
  if (!cond) fails++;
};
await page.goto('http://localhost:5173/?autoplay');
await page.waitForLoadState('networkidle');
await page.click('#btn-solo');
await (await page.waitForFunction(() => window.__game, null, { timeout: 90000 })).dispose();
await (await page.waitForFunction(() => window.__game.audio.samples.size >= 22, null, { timeout: 20000 }).catch(() => null))?.dispose();
const loaded = await page.evaluate(() => [...window.__game.audio.samples].map(([k, v]) => `${k}:${v.length}`));
ok(loaded.length === 22, `22 sons gravados carregados (${loaded.length})`);
const total = await page.evaluate(() => [...window.__game.audio.samples.values()].reduce((n, v) => n + v.length, 0));
ok(total === 85, `85 variações decodificadas (${total})`);
// toca de tudo um pouco e confere que não deu erro
await page.evaluate(() => {
  const a = window.__game.audio;
  const p = window.__game.pc.pos.clone();
  for (const c of ['pistol', 'rifle', 'smg', 'shotgun', 'magnum', 'sniper']) { a.gunshot(undefined, c); a.gunshot(p, c); }
  for (const s of ['hard', 'wood', 'dirt']) a.footstep(s);
  a.boardBreak(p); a.boardFix(p); a.bodyHit(p, true); a.bodyHit(p, false); a.knifeHit();
  for (const k of [0, 1, 2, 5]) a.zombieGroan(p, k, 0.9);
  a.zombieAttack(p, 1.1); a.zombieDeath(p, 0.95);
});
for (let i = 0; i < 8; i++) {
  await page.evaluate(() => window.__game.debugShoot());
  await page.waitForTimeout(90);
}
await page.waitForTimeout(500);
ok(errs.length === 0, `sem erros ou avisos de som ${errs.slice(0, 3).join(' | ')}`);
await browser.close();
console.log(fails ? `${fails} falha(s)` : 'tudo certo');
process.exit(fails ? 1 : 0);
