// Abre o jogo no Chrome (modo teste) e salva capturas de tela de vários pontos do mapa.
// Uso: node tools/shot.mjs <pasta-de-saída> [segundos-de-jogo]
import { chromium } from 'playwright-core';

const out = process.argv[2] ?? '.';
const playSeconds = Number(process.argv[3] ?? 0);

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

await page.goto('http://localhost:5173/?autoplay');
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/00-menu.png` });
await page.click('#btn-solo');
await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/01-spawn.png` });

const views = [
  ['02-cruzamento', 0, 16, 0, -0.1],
  ['03-rua-norte', 0, -8, 0, 0],
  ['04-banco', -7, -17, -Math.PI / 2, 0],
  ['05-dentro-banco', -13, -17, Math.PI / 2 + 0.6, 0],
  ['06-bar', 7.5, -15, Math.PI / 2, 0.05],
  ['07-cemiterio', 26, 28, -2.3, 0],
  ['08-igreja', 30, 5, -1.2, 0.25],
  ['09-teto-banco', -17, -14, Math.PI, 1.2],
];
for (const [name, x, z, yaw, pitch] of views) {
  await page.evaluate(([x, z, yaw, pitch]) => window.__game.debugView(x, z, yaw, pitch), [x, z, yaw, pitch]);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/${name}.png` });
}

if (playSeconds > 0) {
  // volta ao spawn e deixa os zumbis chegarem
  await page.evaluate(() => window.__game.debugView(0, 11.5, 0, 0));
  const step = 4;
  for (let s = step; s <= playSeconds; s += step) {
    await page.waitForTimeout(step * 1000);
    await page.evaluate(() => window.__game.lookAtNearestZombie?.());
    await page.waitForTimeout(200);
    if (s % 8 === 0) await page.evaluate(() => { window.__game.debugShoot(); window.__game.debugShoot(); });
    await page.waitForTimeout(60);
    await page.screenshot({ path: `${out}/play-${String(s).padStart(3, '0')}.png` });
  }
}

const info = await page.evaluate(() => document.querySelector('.netinfo')?.textContent);
console.log('HUD:', info);
console.log(logs.slice(0, 40).join('\n'));
await browser.close();
