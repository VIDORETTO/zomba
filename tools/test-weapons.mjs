// Teste no navegador (headless): armas de parede, troca de arma, tiro automático, granadas e faca.
import { chromium } from 'playwright-core';
const out = process.argv[2] ?? '.';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto('http://localhost:5173/?autoplay');
await page.click('#btn-solo');
await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
await page.waitForTimeout(1000);
let ok = 0, bad = 0;
const check = (name, cond, detail = '') => { cond ? ok++ : bad++; console.log(`${cond ? 'ok  ' : 'FALHOU'} ${name}${detail ? ` (${detail})` : ''}`); };
const press = async (k) => { await page.keyboard.down(k); await page.waitForTimeout(40); await page.keyboard.up(k); };
const calm = () => page.evaluate(() => { const sim = window.__game.transport.sim; sim.toSpawn = 0; sim.zombies.clear(); });
const w = () => page.evaluate(() => ({ ids: window.__game.weapon.weaponIds, cur: window.__game.weapon.def.id, ammo: window.__game.weapon.ammo, res: window.__game.weapon.reserve, pts: window.__game.me.points, nades: window.__game.me.grenades }));
const at = (x, z, yaw, pitch = 0) => page.evaluate(([x, z, yaw, pitch]) => window.__game.debugView(x, z, yaw, pitch), [x, z, yaw, pitch]);
await calm();
await page.evaluate(() => window.__game.debugPoints(30000));

// Carabina na parede do Correio
await at(6.6, 12.2, -Math.PI / 2);
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/w1-giz-carabina.png` });
await at(8.0, 12.2, -Math.PI / 2);
await page.waitForTimeout(300);
await press('KeyF');
await page.waitForTimeout(1200);
let s = await w();
check('compra a Carabina e troca para ela', s.ids.join() === 'pistol,carbine' && s.cur === 'carbine', JSON.stringify(s));
await page.screenshot({ path: `${out}/w2-carabina.png` });
await page.mouse.click(640, 360);
await page.waitForTimeout(300);
check('Carabina atira', (await w()).ammo === 7);

// Submetralhadora no Bar: troca pela arma da mão
await calm();
await at(13, -23.6, 0);
await page.waitForTimeout(300);
await press('KeyF');
await page.waitForTimeout(1200);
s = await w();
check('Submetralhadora troca a Carabina', s.ids.join() === 'pistol,smg' && s.cur === 'smg', JSON.stringify(s));
await page.mouse.down();
await page.waitForTimeout(700);
await page.mouse.up();
s = await w();
check('tiro automático segurando o botão', s.ammo <= 24, `pente ${s.ammo}`);
await page.screenshot({ path: `${out}/w3-smg.png` });
await press('Digit1');
await page.waitForTimeout(700);
check('tecla 1 troca para a pistola', (await w()).cur === 'pistol');
await page.mouse.wheel(0, 100);
await page.waitForTimeout(700);
check('roda do mouse troca de arma', (await w()).cur === 'smg');

// Escopeta de repetição (Oficina)
await calm();
await at(36, -23.0, Math.PI);
await page.waitForTimeout(300);
await press('KeyF');
await page.waitForTimeout(1200);
s = await w();
check('compra a Escopeta de repetição', s.cur === 'pump', JSON.stringify(s));
await page.screenshot({ path: `${out}/w4-pump.png` });
await page.mouse.click(640, 360);
await page.waitForTimeout(150);
await page.screenshot({ path: `${out}/w5-pump-tiro.png` });

// Dois canos (Mercearia) + recarga de bascular
await calm();
await at(-8.0, 21.8, Math.PI / 2);
await page.waitForTimeout(300);
await press('KeyF');
await page.waitForTimeout(1200);
s = await w();
check('compra a Escopeta de dois canos', s.cur === 'doublebarrel', JSON.stringify(s));
await page.mouse.click(640, 360);
await page.waitForTimeout(400);
await press('KeyR');
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/w6-dois-canos-recarga.png` });
await page.waitForTimeout(2000);
check('dois canos recarrega', (await w()).ammo === 2);

// Fuzil (Banco) e mira
await calm();
await at(-23.6, -13, Math.PI / 2);
await page.waitForTimeout(300);
await press('KeyF');
await page.waitForTimeout(1200);
s = await w();
check('compra o Fuzil', s.cur === 'rifle', JSON.stringify(s));
await page.screenshot({ path: `${out}/w7-fuzil.png` });
await page.mouse.down({ button: 'right' });
await page.waitForTimeout(450);
await page.screenshot({ path: `${out}/w8-fuzil-mira.png` });
await page.mouse.up({ button: 'right' });
// munição na parede pela metade
await page.mouse.down();
await page.waitForTimeout(400);
await page.mouse.up();
const before = await w();
await press('KeyF');
await page.waitForTimeout(1800);
const after = await w();
check('munição do Fuzil na parede por 700', before.pts - after.pts === 700 && after.ammo === 30, `${before.pts}->${after.pts} pente ${after.ammo}`);

// granadas: arremesso
await calm();
await at(0, 20, 0, 0.2);
await page.waitForTimeout(300);
const n0 = (await w()).nades;
await press('KeyG');
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/w9-granada-voando.png` });
await page.waitForTimeout(2200);
await page.screenshot({ path: `${out}/w10-explosao.png` });
check('arremessa granada', (await w()).nades === n0 - 1, `${n0} -> ${(await w()).nades}`);
await at(-6.0, -23, Math.PI / 2);
await page.waitForTimeout(300);
await press('KeyF');
await page.waitForTimeout(500);
check('compra granadas na banca', (await w()).nades === 4);

// faca pesada
await at(38, 23.6, 0);
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/w11-giz-faca.png` });
await at(38, 23.0, 0);
await page.waitForTimeout(300);
await press('KeyF');
await page.waitForTimeout(600);
check('compra a faca pesada', await page.evaluate(() => window.__game.me.heavyKnife));
await press('KeyV');
await page.waitForTimeout(160);
await page.screenshot({ path: `${out}/w12-faca-pesada.png` });

check('sem erros na página', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`\n${ok} ok, ${bad} falharam`);
await browser.close();
