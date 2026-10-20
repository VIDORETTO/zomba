// Mede o volume (RMS geral e o maior RMS em janelas de ~40 ms, o "soco" do som) de cada som gravado comparado com o sintetizado que ele substitui.
// Uso: node tools/sfx-levels.mjs
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:5173/?autoplay');
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
];
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
  console.log(`${name.padEnd(22)} gravado rms ${res.rec.rms} curto ${res.rec.short} | sintetizado rms ${res.syn.rms} curto ${res.syn.short} | dif curto ${(res.rec.short - res.syn.short).toFixed(1)} dB`);
}
await browser.close();
