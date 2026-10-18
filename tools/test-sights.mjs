// Teste no navegador (headless): bancada de miras da Oficina (ponto vermelho e luneta 2×).
import { chromium } from 'playwright-core';
const out = process.argv[2] ?? '.';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
let ok = 0, bad = 0;
const check = (name, cond, detail = '') => { cond ? ok++ : bad++; console.log(`${cond ? 'ok  ' : 'FALHOU'} ${name}${detail ? ` (${detail})` : ''}`); };
const press = async (k) => { await page.keyboard.down(k); await page.waitForTimeout(40); await page.keyboard.up(k); };

await page.goto('http://localhost:5173/?autoplay');
await page.waitForLoadState('networkidle');
await page.click('#btn-solo');
await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
const calm = () => page.evaluate(() => { const sim = window.__game.transport.sim; sim.toSpawn = 0; sim.zombies.clear(); });
await calm();
await page.evaluate(() => { const p = window.__game.transport.sim.players.get('local'); p.points = 10000; p.weapons = ['pistol', 'rifle']; });
await page.waitForTimeout(300);
await page.evaluate(() => window.__game.weapon.switchTo('rifle'));
await page.waitForTimeout(700);

// de frente para a bancada (ela fica no lado +z)
const use = await page.evaluate(() => window.__game.o.map.interactables.find((i) => i.id === 'sight-red').use);
await page.evaluate(([x, z]) => window.__game.debugView(x, z, Math.PI, -0.25), use);
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/s1-bancada.png` });
const prompt = await page.evaluate(() => document.querySelector('.prompt')?.textContent ?? '');
check('aviso de compra do ponto vermelho', /Ponto vermelho/.test(prompt) && /1000/.test(prompt), prompt);
await press('KeyF');
await page.waitForTimeout(1600);
let st = await page.evaluate(() => ({ pts: window.__game.me.points, sight: window.__game.weapon.sight }));
check('compra o ponto vermelho para o fuzil', st.pts === 9000 && st.sight === 'red', JSON.stringify(st));

// mirando pelo ponto vermelho, olhando para a rua
await calm();
await page.evaluate(([x, z]) => window.__game.debugView(x, z - 2, 0, 0), use);
await page.waitForTimeout(300);
await page.mouse.move(640, 360);
await page.mouse.down({ button: 'right' });
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/s2-ponto-vermelho.png` });
const fovRed = await page.evaluate(() => window.__game.camera.fov / window.__game.settings.fov);
const dot = await page.evaluate(() => { const o = window.__game.weapon.slots.find((s) => s.def.id === 'rifle').optic; return !!o?.dot?.visible; });
check('ponto vermelho aproxima mais que a mira de ferro', fovRed < 0.72 && fovRed > 0.64, fovRed.toFixed(3));
check('o ponto aparece ao mirar', dot);
await page.mouse.up({ button: 'right' });
await page.waitForTimeout(300);

// luneta 2×
const useS = await page.evaluate(() => window.__game.o.map.interactables.find((i) => i.id === 'sight-scope').use);
await page.evaluate(([x, z]) => window.__game.debugView(x, z, Math.PI, -0.25), useS);
await page.waitForTimeout(500);
await press('KeyF');
await page.waitForTimeout(1600);
st = await page.evaluate(() => ({ pts: window.__game.me.points, sight: window.__game.weapon.sight }));
check('troca pela luneta 2×', st.pts === 7500 && st.sight === 'scope', JSON.stringify(st));
await calm();
await page.evaluate(([x, z]) => window.__game.debugView(x, z - 2, 0, 0), useS);
await page.waitForTimeout(300);
await page.mouse.down({ button: 'right' });
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/s3-luneta.png` });
const scope = await page.evaluate(() => { const el = document.querySelector('.scope'); return { on: !el.classList.contains('hidden'), luneta: el.classList.contains('luneta'), fov: window.__game.camera.fov / window.__game.settings.fov }; });
check('tela da luneta 2× ao mirar', scope.on && scope.luneta && scope.fov < 0.53, JSON.stringify(scope));
await page.mouse.up({ button: 'right' });
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/s4-luneta-quadril.png` });

// a pistola não aceita mira
await page.evaluate(() => window.__game.weapon.switchTo('pistol'));
await page.waitForTimeout(700);
await page.evaluate(([x, z]) => window.__game.debugView(x, z, Math.PI, -0.25), use);
await page.waitForTimeout(400);
const p2 = await page.evaluate(() => document.querySelector('.prompt')?.textContent ?? '');
check('avisa que a pistola não aceita a mira', /não serve/.test(p2), p2);

check('sem erros na página', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`\n${ok} ok, ${bad} falharam`);
await browser.close();
