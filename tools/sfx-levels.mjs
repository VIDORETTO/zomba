// Mede o volume (RMS geral e o maior RMS em janelas de ~40 ms, o "soco" do som) de cada som gravado comparado com o sintetizado que ele substitui.
// Uso: node tools/sfx-levels.mjs
import { launch } from './launch.mjs';
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://127.0.0.1:5173/?autoplay');
await page.waitForLoadState('networkidle');
await page.click('#btn-solo');
await (await page.waitForFunction(() => window.__game, null, { timeout: 90000 })).dispose();
await (await page.waitForFunction(() => window.__game.audio.samples.size >= 22, null, { timeout: 20000 })).dispose();
await page.evaluate(() => {
  const a = window.__game.audio;
  a.stopAmbience();
  window.__game.transport.paused = true;
  const an = a.ctx.createAnalyser();
  an.fftSize = 2048;
  a.master.connect(an);
  window.__an = an;
  window.__measure = async (fn, ms = 400) => {
    const buf = new Float32Array(an.fftSize);
    let peak = 0, sum = 0, n = 0, short = 0;
    fn();
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      an.getFloatTimeDomainData(buf);
      let s2 = 0;
      for (const v of buf) { peak = Math.max(peak, Math.abs(v)); sum += v * v; n++; s2 += v * v; }
      short = Math.max(short, s2 / buf.length);
      await new Promise((r) => setTimeout(r, 10));
    }
    return { peak: +(20 * Math.log10(peak + 1e-9)).toFixed(1), rms: +(10 * Math.log10(sum / n + 1e-12)).toFixed(1), short: +(10 * Math.log10(short + 1e-12)).toFixed(1) };
  };
});
const cases = [
  ['tiro pistola', "a.gunshot(undefined, 'pistol')"],
  ['tiro fuzil', "a.gunshot(undefined, 'rifle')"],
  ['tiro submetralhadora', "a.gunshot(undefined, 'smg')"],
  ['tiro escopeta', "a.gunshot(undefined, 'shotgun')"],
  ['tiro magnum', "a.gunshot(undefined, 'magnum')"],
  ['passo duro', "a.footstep('hard')"],
  ['passo madeira', "a.footstep('wood')"],
  ['passo terra', "a.footstep('dirt')"],
  ['tábua quebra', 'a.boardBreak(p)'],
  ['tábua conserta', 'a.boardFix(p)'],
  ['acerto no corpo', 'a.bodyHit(p, false)'],
  ['zumbi gemendo (anda)', 'a.groans = 0; a.zombieGroan(p, 0)'],
  ['zumbi rosnando (corre)', 'a.groans = 0; a.zombieGroan(p, 2)'],
  ['zumbi ataca', 'a.zombieAttack(p)'],
  ['zumbi morre', 'a.zombieDeath(p)'],
  // D1: as vinhetas da Trincheira ficam na mesma faixa das de sempre (a diferença de volume tem de ser menor que 4 dB)
  ['vinheta começo (sempre)', 'a.roundStart()'],
  ['vinheta começo (Trincheira)', "a.trSound('vinheta-inicio')"],
  ['vinheta começo Blindado', "a.trSound('vinheta-blindado')"],
  ['vinheta fim (sempre)', 'a.roundEnd()'],
  ['vinheta fim (Trincheira)', "a.trSound('vinheta-fim')"],
];
const medidas = {};
for (const [name, code] of cases) {
  const res = await page.evaluate(async (code) => {
    const a = window.__game.audio;
    const p = window.__game.pc.pos.clone().add({ x: 1.5, y: 1.2, z: 0 });
    const run = new Function('a', 'p', code);
    await new Promise((r) => setTimeout(r, 900));
    const rec = await window.__measure(() => run(a, p), 1200);
    const saved = new Map(a.samples);
    a.samples.clear();
    await new Promise((r) => setTimeout(r, 900));
    const syn = await window.__measure(() => run(a, p), 1200);
    for (const [k, v] of saved) a.samples.set(k, v);
    return { rec, syn };
  }, code);
  medidas[name] = res.rec;
  console.log(`${name.padEnd(22)} gravado rms ${res.rec.rms} curto ${res.rec.short} | sintetizado rms ${res.syn.rms} curto ${res.syn.short} | dif curto ${(res.rec.short - res.syn.short).toFixed(1)} dB`);
}
const pares = [['vinheta começo (Trincheira)', 'vinheta começo (sempre)'], ['vinheta começo Blindado', 'vinheta começo (sempre)'], ['vinheta fim (Trincheira)', 'vinheta fim (sempre)']];
let falhou = 0;
for (const [a, b] of pares) {
  const d = medidas[a].rms - medidas[b].rms;
  const ok = Math.abs(d) <= 4 && medidas[a].peak < -1;
  if (!ok) falhou++;
  console.log(`${ok ? 'ok  ' : 'FALHOU'} ${a} na faixa de ${b} (${d.toFixed(1)} dB de diferença, pico ${medidas[a].peak} dB)`);
}
await browser.close();
process.exit(falhou ? 1 : 0);
