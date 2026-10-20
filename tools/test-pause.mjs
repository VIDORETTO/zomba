// Menu de jogo (Esc): abas, opções e troca de teclas (salva, vale no jogo e aparece nos avisos).
// Uso: node tools/test-pause.mjs <pasta-de-capturas>
import { chromium } from 'playwright-core';
const out = process.argv[2] ?? '.';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
let fails = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'ok  ' : 'FALHOU'} ${msg}`);
  if (!cond) fails++;
};
await page.goto('http://localhost:5173/?autoplay');
await page.waitForLoadState('networkidle');
await page.evaluate(() => localStorage.removeItem('zomba.settings'));
await page.reload();
await page.waitForLoadState('networkidle');
await page.click('#btn-solo');
await (await page.waitForFunction(() => window.__game, null, { timeout: 90000 })).dispose();
await page.waitForTimeout(1500);

await page.evaluate(() => window.__game.showPause());
await page.waitForTimeout(200);
ok(await page.isVisible('.gm'), 'menu de jogo abre');
ok(await page.evaluate(() => window.__game.transport.paused), 'solo fica pausado');
await page.screenshot({ path: `${out}/pausa-jogo.png` });
for (const tab of ['video', 'audio', 'controles']) {
  await page.click(`.gm-tabs [data-tab="${tab}"]`);
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${out}/pausa-${tab}.png` });
}
ok(await page.isVisible('.keybtn[data-a="use"][data-s="0"]'), 'aba Controles mostra as teclas');

// troca "usar" de F para T
await page.click('.keybtn[data-a="use"][data-s="0"]');
await page.waitForTimeout(100);
ok(await page.evaluate(() => document.querySelector('.keybtn[data-a="use"][data-s="0"]').classList.contains('wait')), 'botão espera a tecla');
await page.keyboard.press('KeyT');
await page.waitForTimeout(100);
ok(await page.evaluate(() => window.__game.input.keys.use[0] === 'KeyT'), 'usar agora é T');
ok(await page.evaluate(() => JSON.parse(localStorage.getItem('zomba.settings')).keys.use[0] === 'KeyT'), 'troca salva nas opções');
await page.screenshot({ path: `${out}/pausa-tecla.png` });

// trocar para uma tecla de outra ação: as duas trocam
await page.click('.keybtn[data-a="use"][data-s="0"]');
await page.waitForTimeout(100);
await page.keyboard.press('KeyR');
await page.waitForTimeout(100);
const swap = await page.evaluate(() => [window.__game.input.keys.use[0], window.__game.input.keys.reload[0]]);
ok(swap[0] === 'KeyR' && swap[1] === 'KeyT', `tecla repetida troca com a outra ação (${swap})`);
// Esc cancela sem fechar o menu
await page.click('.keybtn[data-a="use"][data-s="0"]');
await page.waitForTimeout(100);
await page.keyboard.press('Escape');
await page.waitForTimeout(100);
ok(await page.isVisible('.gm') && (await page.evaluate(() => window.__game.input.keys.use[0])) === 'KeyR', 'Esc cancela a escuta e o menu fica aberto');
// restaurar padrão
await page.click('.keys-foot button');
await page.waitForTimeout(100);
ok(await page.evaluate(() => window.__game.input.keys.use[0] === 'KeyF' && window.__game.input.keys.reload[0] === 'KeyR'), 'restaurar padrão');
// põe T de novo para conferir os avisos e o jogo
await page.click('.keybtn[data-a="use"][data-s="0"]');
await page.waitForTimeout(100);
await page.keyboard.press('KeyT');
await page.waitForTimeout(100);

// opções novas
await page.click('.gm-tabs [data-tab="video"]');
await page.evaluate(() => {
  const r = [...document.querySelectorAll('.gm-body .slider')].find((l) => l.textContent.includes('Brilho')).querySelector('input');
  r.value = '1.2';
  r.dispatchEvent(new Event('input'));
});
ok(await page.evaluate(() => Math.abs(window.__game.renderer.toneMappingExposure - 1.5) < 0.01), 'brilho muda a exposição');
await page.click('.gm-tabs [data-tab="audio"]');
await page.evaluate(() => {
  const r = [...document.querySelectorAll('.gm-body .slider')].find((l) => l.textContent.includes('Música')).querySelector('input');
  r.value = '0.5';
  r.dispatchEvent(new Event('input'));
});
ok(await page.evaluate(() => Math.abs(window.__game.audio.music.gain.value - 0.275) < 0.01), 'volume da música');

// Esc fecha o menu
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
ok(!(await page.isVisible('.gm')), 'Esc volta ao jogo');
ok(await page.evaluate(() => !window.__game.transport.paused), 'jogo despausado');

// o aviso de compra mostra a tecla nova e só a tecla nova compra
const wall = await page.evaluate(() => {
  const g = window.__game;
  const it = g.o.map.interactables.find((i) => i.kind === 'weapon');
  if (!it) return null;
  g.transport.sim.players.get('local').points = 50000;
  g.debugView(it.use[0], it.use[1], g.pc.yaw, 0);
  return it.id;
});
await page.waitForTimeout(700);
const prompt = await page.evaluate(() => document.querySelector('.prompt-text')?.innerHTML ?? '');
ok(/<b>T<\/b>/.test(prompt), `aviso mostra a tecla T (${prompt.slice(0, 50)})`);
const before = await page.evaluate(() => window.__game.transport.sim.players.get('local').points);
await page.keyboard.press('KeyF');
await page.waitForTimeout(400);
const afterF = await page.evaluate(() => window.__game.transport.sim.players.get('local').points);
ok(afterF === before, 'F não compra mais');
await page.keyboard.press('KeyT');
await page.waitForTimeout(600);
const afterT = await page.evaluate(() => window.__game.transport.sim.players.get('local').points);
ok(wall !== null && afterT < before, `T compra (${before} -> ${afterT})`);

// reiniciar pede confirmação e volta para o mesmo mapa
const first = await page.evaluateHandle(() => window.__game);
await page.evaluate(() => window.__game.showPause());
await page.click('.gm-tabs [data-tab="jogo"]');
await page.click('[data-act="restart"]');
await page.waitForTimeout(200);
ok(await page.isVisible('.gm'), 'reiniciar pede um segundo clique');
await page.click('[data-act="restart"]');
await (await page.waitForFunction((g) => window.__game && window.__game !== g, first, { timeout: 90000 })).dispose();
await first.dispose();
ok(await page.evaluate(() => window.__game.input.keys.use[0] === 'KeyT'), 'teclas valem na partida nova');
ok(errs.length === 0, `sem erros na página ${errs.slice(0, 2).join(' | ')}`);
await page.evaluate(() => localStorage.removeItem('zomba.settings'));
await browser.close();
console.log(fails ? `${fails} falha(s)` : 'tudo certo');
process.exit(fails ? 1 : 0);
