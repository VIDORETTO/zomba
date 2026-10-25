// Mede o áudio do jogo num navegador sem tela: nível (dBFS) do ambiente + trilha sozinhos, depois com sons de zumbi,
// e confere que nada dá erro. Uso: node tools/audio-probe.mjs [porta]
import { launch } from './launch.mjs';
const port = process.argv[2] ?? '5173';
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (/falhou|error/i.test(m.text())) errs.push(m.text()); });
await page.goto(`http://localhost:${port}/?autoplay`);
await page.waitForLoadState('networkidle');
await page.click('#btn-solo');
await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
await page.evaluate(() => {
  const g = window.__game;
  const sim = g.transport.sim;
  sim.toSpawn = 0;
  sim.zombies.clear();
  sim.updateZombies = () => {};
  const a = g.audio;
  const an = a.ctx.createAnalyser();
  an.fftSize = 8192;
  a.master.connect(an);
  window.__an = an;
  window.__ctx = a.ctx;
  window.__db = () => {
    const buf = new Float32Array(an.fftSize);
    an.getFloatTimeDomainData(buf);
    let s = 0, pk = 0;
    for (const x of buf) { s += x * x; pk = Math.max(pk, Math.abs(x)); }
    return { rms: 20 * Math.log10(Math.sqrt(s / buf.length) + 1e-9), peak: 20 * Math.log10(pk + 1e-9) };
  };
  window.__hz = (f) => {
    const sp = new Float32Array(an.frequencyBinCount);
    an.getFloatFrequencyData(sp);
    return sp[Math.round((f / (a.ctx.sampleRate / 2)) * an.frequencyBinCount)];
  };
});
const sample = async (label, secs) => {
  const out = [];
  for (let i = 0; i < secs; i++) {
    await page.waitForTimeout(1000);
    out.push(await page.evaluate(() => window.__db()));
  }
  const rms = out.map((o) => o.rms);
  const pk = Math.max(...out.map((o) => o.peak));
  console.log(`${label}: rms médio ${(rms.reduce((a, b) => a + b, 0) / rms.length).toFixed(1)} dBFS, min ${Math.min(...rms).toFixed(1)}, max ${Math.max(...rms).toFixed(1)}, pico ${pk.toFixed(1)}`);
};
console.log('estado do áudio:', await page.evaluate(() => window.__ctx.state));
await page.evaluate(() => window.__game.audio.setMusicVolume(0));
await sample('só ambiente (vento + sons ao longe)', 20);
await page.evaluate(() => { window.__game.audio.setMusicVolume(1); window.__game.audio.amb.gain.value = 0; });
await sample('só trilha', 20);
await page.evaluate(() => { window.__game.audio.amb.gain.value = 0.5; });
await sample('ambiente + trilha (calmo)', 15);
console.log('energia em 41 Hz:', (await page.evaluate(() => window.__hz(41))).toFixed(1), 'dB; em 440 Hz:', (await page.evaluate(() => window.__hz(440))).toFixed(1), 'dB');
await page.evaluate(() => window.__game.audio.setMusicMood('tense'));
await sample('clima tenso', 15);
await page.evaluate(() => window.__game.audio.setMusicMood('hell'));
await sample('clima infernal', 10);
await page.evaluate(() => {
  const a = window.__game.audio;
  window.__game.audio.setMusicMood('tense');
  const P = (x, z) => new (Object.getPrototypeOf(window.__game.pc.pos).constructor)(x, 1, z);
  window.__zt = setInterval(() => {
    for (const k of [0, 1, 2, 9]) a.zombieIdle(P(Math.random() * 10 - 5, Math.random() * 10 - 5), k, 1);
    a.zombieAttack(P(2, 1), 1);
    a.zombiePain(P(-2, 3), 1);
    a.zombieStep(P(3, 3), 1);
    a.crawlerMove(P(1, 4)); a.crawlerScrabble(P(-1, 4)); a.crawlerLeap(P(0, 5), 1); a.crawlerBite(P(1, 1));
  }, 700);
});
await sample('com zumbis gritando de perto', 12);
await page.evaluate(() => clearInterval(window.__zt));
console.log(errs.length ? 'ERROS:\n' + [...new Set(errs)].join('\n') : 'sem erros');
await browser.close();
