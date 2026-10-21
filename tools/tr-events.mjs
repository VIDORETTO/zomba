// Dispara todos os eventos da Trincheira na página de teste e confere que nada quebra. Uso: node tools/tr-events.mjs (com npx vite --port 5201)
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1169/chrome-linux/chrome', headless: true, args: ['--no-sandbox', '--use-gl=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push(m.text()); });
await page.goto('http://localhost:5201/tools/tr-harness.html');
await page.waitForFunction(() => window.__h?.ready, null, { timeout: 60000 });
const n = await page.evaluate(async () => {
  const H = window.__h; const T = H.map.trincheira;
  H.cam(100, 1.7, 45, 0, 0);
  const E = [
    { e: 'gen', gen: 0, on: true, pid: 'me', phase: 'start' }, { e: 'gen', gen: 0, on: true, pid: 'me', phase: 'done' }, { e: 'gen', gen: 1, on: false, pid: null, phase: 'lost' },
    { e: 'gen', gen: 2, on: false, pid: null, phase: 'attack' }, { e: 'gen', gen: 2, on: false, pid: null, phase: 'cancel' },
    { e: 'forjaSobe' }, { e: 'clima', weather: 'neve', round: 3 }, { e: 'clima', weather: 'limpo', round: 4 },
    { e: 'fizz', phase: 'spin', loc: 0, pid: 'me', perk: null }, { e: 'fizz', phase: 'give', loc: 0, pid: 'me', perk: 'couraca' }, { e: 'fizz', phase: 'leave', loc: 0, pid: null, perk: null }, { e: 'fizz', phase: 'arrive', loc: 2, pid: null, perk: null },
    { e: 'dig', pid: 'me', mound: 3, result: 'pontos', x: 0, z: 0, text: 'ok' }, { e: 'dig', pid: 'me', mound: 19, result: 'peca', x: 0, z: 0, text: 'peça' }, { e: 'dig', pid: 'me', mound: 2, result: 'pa-dourada', x: 0, z: 0, text: '' }, { e: 'dig', pid: 'me', mound: 2, result: 'capacete', x: 0, z: 0, text: '' },
    { e: 'tank', phase: 'chamado', stop: null }, { e: 'tank', phase: 'chegou', stop: 'igreja' }, { e: 'tank', phase: 'sai', stop: null }, { e: 'tank', phase: 'pronto', stop: null }, { e: 'esmaga', zid: 1 },
    { e: 'buzina', robot: 'atlas', dir: 1 }, { e: 'buzina', robot: 'tita', dir: -1 }, { e: 'pisada', robot: 'golias', foot: 'E', x: 5, z: 5, killed: ['me'], zombies: 3 }, { e: 'cabine', pid: 'me', robot: 'atlas', prize: 'bebida' },
    { e: 'recaptura', phase: 'start', gen: 1 }, { e: 'recaptura', phase: 'win', gen: 1 }, { e: 'recaptura', phase: 'lose', gen: 1 },
    { e: 'blindado', phase: 'spawn', zid: 1, x: 5, z: 5 }, { e: 'blindado', phase: 'flame', zid: 1, x: 5, z: 5 }, { e: 'blindado', phase: 'claw', zid: 1, x: 5, z: 5 }, { e: 'blindado', phase: 'jump', zid: 1, x: 5, z: 5 }, { e: 'blindado', phase: 'visor', zid: 1, x: 5, z: 5 }, { e: 'blindado', phase: 'death', zid: 1, x: 5, z: 5 },
    { e: 'peca', pid: 'me', key: 'escudo-rodas' }, { e: 'peca', pid: 'x', key: 'fogo-1' },
    { e: 'craft', pid: 'me', what: 'escudo', phase: 'start' }, { e: 'craft', pid: 'me', what: 'escudo', phase: 'done' }, { e: 'craft', pid: 'me', what: 'drone', phase: 'take' }, { e: 'craft', pid: 'me', what: 'drone', phase: 'expire' }, { e: 'craft', pid: 'me', what: 'escudo', phase: 'take' }, { e: 'craft', pid: 'me', what: 'drone', phase: 'drone-revive' },
    { e: 'portal', el: 'fogo', pid: 'me' }, { e: 'teleporte', pid: 'me', el: 'gelo', to: 'camara' }, { e: 'teleporte', pid: 'x', el: 'gelo', to: 'tunel' },
    { e: 'alvo', kind: 'bau', idx: 0, pid: 'me', ok: true }, { e: 'alvo', kind: 'lapide', idx: 1, pid: 'me', ok: true }, { e: 'alvo', kind: 'domo', idx: 2, pid: 'me', ok: true }, { e: 'alvo', kind: 'placa', idx: 3, pid: 'me', ok: false }, { e: 'alvo', kind: 'sola', idx: 0, pid: 'me', ok: true },
    { e: 'cajado', el: 'fogo', phase: 'monta', pid: 'me' }, { e: 'cajado', el: 'gelo', phase: 'pega', pid: 'me' }, { e: 'cajado', el: 'vento', phase: 'devolve', pid: 'me' }, { e: 'cajado', el: 'raio', phase: 'altar', pid: 'me' }, { e: 'cajado', el: 'raio', phase: 'cheio', pid: 'me' }, { e: 'cajado', el: 'raio', phase: 'perde', pid: 'me' },
    { e: 'desperto', el: 'fogo', pid: 'me' }, { e: 'enigma', el: 'gelo' },
    { e: 'tabua', phase: 'pega', pid: 'me' }, { e: 'tabua', phase: 'altar', pid: 'me' }, { e: 'tabua', phase: 'cheia', pid: 'me' }, { e: 'tabua', phase: 'punho', pid: 'me' },
    { e: 'desafio', pid: 'me', idx: 0, prize: 'x' }, { e: 'artilharia', phase: 'throw', pid: 'me', x: 3, z: 3 }, { e: 'artilharia', phase: 'marca', pid: 'me', x: 3, z: 3 }, { e: 'artilharia', phase: 'bomba', pid: 'me', x: 3, z: 3 },
    { e: 'missao', step: 1, phase: 'passo', text: 'passo' }, { e: 'missao', step: 5, phase: 'fim', text: 'fim' },
    { e: 'area', kind: 'pilar', x: 100, y: 0, z: 40, r: 4, dur: 2 }, { e: 'area', kind: 'nevasca', x: 100, y: 0, z: 40, r: 6, dur: 2 }, { e: 'area', kind: 'redemoinho', x: 100, y: 0, z: 40, r: 5, dur: 2 }, { e: 'area', kind: 'orbRaio', x: 100, y: 1, z: 40, r: 4, dur: 2 }, { e: 'area', kind: 'choque', x: 100, y: 1, z: 40, r: 4, dur: 1 },
    { e: 'fx', kind: 'queima', zid: 1, x: 100, y: 0, z: 40 }, { e: 'fx', kind: 'congela', zid: 1, x: 100, y: 0, z: 40 }, { e: 'fx', kind: 'estilhaca', zid: 1, x: 100, y: 0, z: 40 }, { e: 'fx', kind: 'chama', x: 100, y: 0, z: 40 }, { e: 'fx', kind: 'sangue', pid: 'me', x: 100, y: 0, z: 40 },
  ];
  for (const e of E) H.event(e);
  await new Promise((r) => setTimeout(r, 3000));
  // todos os prompts
  const bad = [];
  for (const it of H.map.interactables) { try { H.client.promptFor(it, H.snap, H.me, { useKey: 'F', solo: true, weaponName: 'x' }); } catch (e) { bad.push(it.id + ': ' + e.message); } }
  H.tr.drops = [{ id: 'drop-1', key: 'fogo-3', x: 100, z: 40 }]; H.tr.pick = ['part:fogo-1:0'];
  return { n: E.length, bad, sounds: [...new Set(H.audioLog)].length };
});
console.log(n);
await browser.close();
console.log(errs.length ? 'ERROS:\n' + [...new Set(errs)].join('\n') : 'sem erros');
