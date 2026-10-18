// Teste no navegador (headless): perfil, emblemas, rodada inicial, banco, XP no fim de jogo e placar.
import { chromium } from 'playwright-core';
const out = process.argv[2] ?? '.';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
let ok = 0, bad = 0;
const check = (name, cond, detail = '') => { cond ? ok++ : bad++; console.log(`${cond ? 'ok  ' : 'FALHOU'} ${name}${detail ? ` (${detail})` : ''}`); };
const press = async (k) => { await page.keyboard.down(k); await page.waitForTimeout(40); await page.keyboard.up(k); };

await page.goto('http://localhost:5173/?autoplay');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(1500);
await page.evaluate(() => { localStorage.removeItem('zomba.profiles'); localStorage.removeItem('zomba.runs'); localStorage.removeItem('zomba.prefs'); });
await page.reload();
await page.fill('#in-name', 'Tester');
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/g1-menu.png` });
check('cartão do perfil no nível 1', /Nível 1 · Osso/.test(await page.textContent('#profile-rank')));

// galeria de emblemas
await page.evaluate(async () => {
  const { emblemCanvas } = await import('/src/client/emblems.ts');
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;inset:0;z-index:99;background:#140d0a;display:flex;flex-wrap:wrap;gap:12px;padding:24px;align-content:flex-start';
  for (const lv of [1, 3, 5, 7, 9, 11, 15, 19, 21, 25, 29, 31, 35, 39, 41, 45, 49, 51, 55, 59]) {
    const c = emblemCanvas(lv, 128);
    c.title = String(lv);
    d.appendChild(c);
  }
  document.body.appendChild(d);
});
await page.waitForTimeout(200);
await page.screenshot({ path: `${out}/g2-emblemas.png` });
await page.reload();
await page.fill('#in-name', 'Tester');

// rodada inicial 20
await page.evaluate(() => { const r = document.querySelector('#in-round'); r.value = '20'; r.dispatchEvent(new Event('input')); });
check('mostra os pontos da rodada 20', /37\.740/.test(await page.textContent('#round-points')), await page.textContent('#round-points'));
await page.click('#btn-solo');
await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
await page.waitForTimeout(4500);
const st = await page.evaluate(() => ({ round: window.__game.buffer.latest.s.round, pts: window.__game.me.points }));
check('começa na rodada 20 com 37.740 pontos', st.round === 20 && st.pts >= 37740, JSON.stringify(st));

// banco
await page.evaluate(() => { const sim = window.__game.transport.sim; sim.toSpawn = 0; sim.zombies.clear(); });
await page.evaluate(() => window.__game.debugView(-14, -18.2, 0, -0.1));
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/g3-banco.png` });
await press('KeyF');
await page.waitForTimeout(500);
let bank = await page.evaluate(() => JSON.parse(localStorage.getItem('zomba.profiles'))?.tester?.bank ?? 0);
check('depósito guarda 1000 no navegador', bank === 1000, String(bank));
await page.evaluate(() => window.__game.debugView(-20, -18.2, 0, -0.1));
await page.waitForTimeout(400);
const before = await page.evaluate(() => window.__game.me.points);
await press('KeyF');
await page.waitForTimeout(500);
bank = await page.evaluate(() => JSON.parse(localStorage.getItem('zomba.profiles'))?.tester?.bank ?? 0);
const after = await page.evaluate(() => window.__game.me.points);
check('saque devolve 900 e zera o saldo', bank === 0 && after - before === 900, `${before} -> ${after}`);

// fim de jogo
await page.evaluate(() => { const sim = window.__game.transport.sim; const p = sim.players.get('local'); p.kills = 40; p.headshots = 12; sim.damagePlayer(p, 9999, p.x, p.z, false); });
await page.waitForTimeout(3200);
await page.screenshot({ path: `${out}/g4-fim.png` });
const xpText = await page.evaluate(() => document.querySelector('.xp-gain')?.textContent);
check('fim de jogo mostra o XP ganho', /\+\d/.test(xpText ?? ''), xpText);
const prof = await page.evaluate(() => JSON.parse(localStorage.getItem('zomba.profiles')).tester);
check('perfil guarda XP e estatísticas', prof.xp > 0 && prof.stats.games === 1 && prof.stats.kills === 40, `xp ${prof.xp}`);
await page.click('[data-act="exit"]');
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/g5-menu-depois.png` });

// placar
await page.click('#btn-board');
await page.click('#board-filter [data-filter="custom"]');
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/g6-placar-recordes.png` });
check('recorde da partida com rodada inicial', (await page.textContent('#board-body')).includes('Tester'));
await page.click('#board-tabs [data-tab="players"]');
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/g7-placar-jogadores.png` });

check('sem erros na página', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`\n${ok} ok, ${bad} falharam`);
await browser.close();
