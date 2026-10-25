// Pistolas duplas: sem mira, clique esquerdo = pistola da esquerda, clique direito = pistola da direita,
// um pente para cada uma, recarga das duas. Também confere o contador de zumbis e o tempo na tela.
// Uso: node tools/test-dual.mjs <pasta de capturas> [porta]
import { launch } from './launch.mjs';
const out = process.argv[2] ?? '.';
const port = process.argv[3] ?? '5173';
let fails = 0;
const check = (n, ok, d = '') => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FALHOU'} ${n}${d ? ` (${d})` : ''}`); };
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(`http://localhost:${port}/?autoplay`);
await page.waitForLoadState('networkidle');
await page.click('#btn-solo');
await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
await page.evaluate(() => {
  const g = window.__game;
  const sim = g.transport.sim;
  sim.players.get('local').health = 99999;
  const p = sim.players.get('local');
  p.weapons = ['dualpistol', 'pistol'];
  p.points = 99999;
  g.debugView(p.x, p.z, 0, -0.05);
});
await page.waitForTimeout(1500);
const st = () => page.evaluate(() => { const w = window.__game.weapon; return { id: w.def.id, a: w.ammo, a2: w.ammo2, res: w.reserve, ads: w.ads, busy: w.busy }; });
await page.keyboard.press('Digit1');
await page.waitForTimeout(900);
let s = await st();
check('equipou as pistolas duplas', s.id === 'dualpistol', JSON.stringify(s));
check('cada pistola tem o pente cheio (12 e 12)', s.a === 12 && s.a2 === 12 && s.res === 168, JSON.stringify(s));
await page.screenshot({ path: `${out}/d0-parado.png` });
// clique esquerdo: só a pistola da esquerda
await page.mouse.move(640, 360);
await page.mouse.down({ button: 'left' });
await page.waitForTimeout(40);
await page.screenshot({ path: `${out}/d1-esquerda.png` });
await page.mouse.up({ button: 'left' });
await page.waitForTimeout(300);
s = await st();
check('clique esquerdo gasta só o pente da esquerda', s.a === 12 && s.a2 === 11, JSON.stringify(s));
// clique direito: só a da direita, e não mira
await page.mouse.down({ button: 'right' });
await page.waitForTimeout(40);
await page.screenshot({ path: `${out}/d2-direita.png` });
await page.waitForTimeout(400);
s = await st();
check('clique direito gasta só o pente da direita', s.a === 11 && s.a2 === 11, JSON.stringify(s));
check('segurar o clique direito não mira', s.ads === 0, JSON.stringify(s));
await page.mouse.up({ button: 'right' });
// os dois ao mesmo tempo
await page.mouse.down({ button: 'left' });
await page.mouse.down({ button: 'right' });
await page.waitForTimeout(40);
await page.screenshot({ path: `${out}/d3-as-duas.png` });
await page.mouse.up({ button: 'left' });
await page.mouse.up({ button: 'right' });
await page.waitForTimeout(300);
s = await st();
check('as duas juntas gastam um tiro de cada', s.a === 10 && s.a2 === 10, JSON.stringify(s));
// esvazia a da esquerda e confere o clique seco sem travar a outra
await page.evaluate(() => { window.__game.weapon.slots[window.__game.weapon.cur].ammo2 = 0; });
await page.mouse.down({ button: 'left' });
await page.waitForTimeout(60);
await page.mouse.up({ button: 'left' });
await page.waitForTimeout(500);
await page.mouse.down({ button: 'right' });
await page.waitForTimeout(60);
await page.mouse.up({ button: 'right' });
await page.waitForTimeout(300);
s = await st();
check('esquerda vazia não recarrega sozinha e a direita ainda atira', s.a === 9 && s.a2 === 0 && !s.busy, JSON.stringify(s));
// recarga das duas
await page.keyboard.press('KeyR');
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/d4-recarga.png` });
await page.waitForTimeout(2600);
s = await st();
check('R recarrega as duas (12 e 12, reserva desconta 15)', s.a === 12 && s.a2 === 12 && s.res === 168 - 3 - 12, JSON.stringify(s));
// HUD: dois pentes, contador de zumbis e tempo
const hud = await page.evaluate(() => ({
  dm: [...document.querySelectorAll('.ammo-nums .dm')].map((e) => e.textContent),
  stats: [...document.querySelectorAll('.stat')].map((e) => e.textContent),
}));
check('HUD mostra os dois pentes', hud.dm.length === 2, JSON.stringify(hud.dm));
check('HUD mostra zumbis restantes e tempo', hud.stats.length === 2 && /Zumbis restantes/.test(hud.stats[0]) && /\d\d:\d\d/.test(hud.stats[1]), JSON.stringify(hud.stats));
await page.screenshot({ path: `${out}/d5-hud.png` });
// armas comuns: a mira continua funcionando
await page.keyboard.press('Digit2');
await page.waitForTimeout(900);
await page.mouse.down({ button: 'right' });
await page.waitForTimeout(500);
s = await st();
check('pistola comum ainda mira', s.id === 'pistol' && s.ads > 0.5, JSON.stringify(s));
await page.mouse.up({ button: 'right' });
check('sem erros no navegador', errs.length === 0, errs.join(' | '));
await browser.close();
console.log(fails ? `${fails} falharam` : 'tudo certo');
process.exit(fails ? 1 : 0);
