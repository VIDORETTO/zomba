import * as THREE from 'three';

// Todos os sons são sintetizados com Web Audio. Mais tarde dá para trocar por gravações.

export type Surface = 'hard' | 'wood' | 'dirt';

const R = (a: number, b: number) => a + Math.random() * (b - a);

export class AudioEngine {
  readonly ctx: AudioContext;
  private readonly master: GainNode;
  private readonly sfx: GainNode;
  private readonly music: GainNode;
  private readonly amb: GainNode;
  private readonly noise: AudioBuffer;
  private readonly shaper: WaveShaperNode;
  private groans = 0;
  private heartT = 0;
  private ambNodes: AudioNode[] = [];
  private hellNodes: { nodes: AudioScheduledSourceNode[]; gain: GainNode } | null = null;
  private bus: { panner: PannerNode; gain: GainNode; lp: BiquadFilterNode; o1: OscillatorNode; o2: OscillatorNode } | null = null;
  // última posição do ouvinte (uivos ao longe na rodada infernal)
  private readonly lastListener = new THREE.Vector3();

  constructor() {
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(this.ctx.destination);
    this.sfx = this.gain(1, this.master);
    this.music = this.gain(0.55, this.master);
    this.amb = this.gain(0.5, this.master);

    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.shaper = this.ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(x * 2.5);
    }
    this.shaper.curve = curve;
    this.shaper.connect(this.sfx);
  }

  resume() {
    if (this.ctx.state !== 'running') void this.ctx.resume();
  }

  setVolume(v: number) {
    this.master.gain.value = v;
  }

  private get now() {
    return this.ctx.currentTime;
  }

  private gain(v: number, to: AudioNode): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = v;
    g.connect(to);
    return g;
  }

  private env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private noiseSrc(t: number, dur: number): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.start(t, Math.random() * Math.max(0, 1.85 - dur), dur + 0.1);
    return s;
  }

  private filter(type: BiquadFilterType, freq: number, q = 1): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  private osc(type: OscillatorType, freq: number, t: number, dur: number): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  // Saída posicional (HRTF) quando há posição; senão vai direto (sons do próprio jogador).
  private out(pos?: THREE.Vector3, ref = 2.5, to: AudioNode = this.sfx): AudioNode {
    if (!pos) return to;
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.maxDistance = 90;
    p.rolloffFactor = 1.3;
    if (p.positionX) {
      p.positionX.value = pos.x;
      p.positionY.value = pos.y;
      p.positionZ.value = pos.z;
    } else {
      p.setPosition(pos.x, pos.y, pos.z);
    }
    p.connect(to);
    return p;
  }

  setListener(pos: THREE.Vector3, fwd: THREE.Vector3) {
    if (!Number.isFinite(pos.x + pos.y + pos.z + fwd.x + fwd.y + fwd.z)) return;
    this.lastListener.copy(pos);
    const l = this.ctx.listener;
    // O Firefox não tem positionX/forwardX no ouvinte; lá vale a API antiga.
    if (!l.positionX) {
      l.setPosition(pos.x, pos.y, pos.z);
      l.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0);
      return;
    }
    const t = this.now;
    l.positionX.setTargetAtTime(pos.x, t, 0.02);
    l.positionY.setTargetAtTime(pos.y, t, 0.02);
    l.positionZ.setTargetAtTime(pos.z, t, 0.02);
    l.forwardX.setTargetAtTime(fwd.x, t, 0.02);
    l.forwardY.setTargetAtTime(fwd.y, t, 0.02);
    l.forwardZ.setTargetAtTime(fwd.z, t, 0.02);
    l.upX.value = 0;
    l.upY.value = 1;
    l.upZ.value = 0;
  }

  // ---------- armas ----------

  // Tiro sintetizado; cada família de arma tem seu timbre.
  gunshot(pos?: THREE.Vector3, cls: 'pistol' | 'rifle' | 'smg' | 'shotgun' | 'magnum' = 'pistol') {
    const P = {
      pistol: { body: 0.9, decay: 0.22, crack: 0.55, thump: 1.0, thumpF: 140, tail: 0.22, lpEnd: 700 },
      rifle: { body: 1.0, decay: 0.26, crack: 0.85, thump: 1.1, thumpF: 120, tail: 0.32, lpEnd: 950 },
      smg: { body: 0.7, decay: 0.13, crack: 0.45, thump: 0.65, thumpF: 165, tail: 0.14, lpEnd: 850 },
      shotgun: { body: 1.15, decay: 0.4, crack: 0.5, thump: 1.45, thumpF: 95, tail: 0.45, lpEnd: 420 },
      magnum: { body: 1.25, decay: 0.36, crack: 1.0, thump: 1.5, thumpF: 105, tail: 0.5, lpEnd: 620 },
    }[cls];
    const t = this.now;
    const dst = pos ? this.out(pos, 6) : this.shaper;
    const vol = pos ? 0.8 : 1;

    const body = this.noiseSrc(t, P.decay + 0.1);
    const lp = this.filter('lowpass', 4200, 0.7);
    lp.frequency.setValueAtTime(4200, t);
    lp.frequency.exponentialRampToValueAtTime(P.lpEnd, t + P.decay * 0.8);
    const g1 = this.gain(0, dst);
    this.env(g1, t, P.body * vol, 0.002, P.decay);
    body.connect(lp).connect(g1);

    const crack = this.noiseSrc(t, 0.08);
    const hp = this.filter('highpass', 2500, 0.8);
    const g2 = this.gain(0, dst);
    this.env(g2, t, P.crack * vol, 0.001, 0.05);
    crack.connect(hp).connect(g2);

    const thump = this.osc('sine', P.thumpF, t, 0.25);
    thump.frequency.exponentialRampToValueAtTime(40, t + 0.16);
    const g3 = this.gain(0, dst);
    this.env(g3, t, P.thump * vol, 0.002, 0.2);
    thump.connect(g3);

    // eco da rua
    const tail = this.noiseSrc(t + 0.03, 1.2);
    const lp2 = this.filter('lowpass', 520, 0.5);
    const g4 = this.gain(0, pos ? dst : this.sfx);
    this.env(g4, t + 0.03, P.tail * vol, 0.03, 1.0);
    tail.connect(lp2).connect(g4);
  }

  // Caixinha de música do sorteio (melodia original), uns 4 s.
  boxSpin(pos: THREE.Vector3) {
    const t0 = this.now + 0.05;
    const dst = this.out(pos, 4, this.music);
    const notes = [76, 79, 83, 81, 79, 76, 74, 76, 79, 76, 72, 71, 72, 76];
    notes.forEach((n, i) => {
      const f = 440 * Math.pow(2, (n - 69) / 12);
      const t = t0 + i * 0.27;
      const o = this.osc('sine', f, t, 0.9);
      const o2 = this.osc('sine', f * 3.01, t, 0.4);
      const g = this.gain(0, dst);
      this.env(g, t, 0.28, 0.003, 0.8);
      const g2 = this.gain(0, dst);
      this.env(g2, t, 0.06, 0.002, 0.25);
      o.connect(g);
      o2.connect(g2);
    });
  }

  crow(pos: THREE.Vector3) {
    const dst = this.out(pos, 6);
    for (let i = 0; i < 3; i++) {
      const t = this.now + i * 0.45;
      const o = this.osc('sawtooth', R(820, 900), t, 0.35);
      o.frequency.exponentialRampToValueAtTime(R(520, 600), t + 0.3);
      const f = this.filter('bandpass', 1300, 2.5);
      const g = this.gain(0, dst);
      this.env(g, t, 0.7, 0.01, 0.3);
      o.connect(f).connect(g);
      const n = this.noiseSrc(t, 0.3);
      const nf = this.filter('bandpass', 2200, 1.5);
      const ng = this.gain(0, dst);
      this.env(ng, t, 0.3, 0.01, 0.25);
      n.connect(nf).connect(ng);
    }
  }

  rayZap() {
    const t = this.now;
    const o = this.osc('sawtooth', 300, t, 0.3);
    o.frequency.exponentialRampToValueAtTime(1800, t + 0.12);
    o.frequency.exponentialRampToValueAtTime(600, t + 0.25);
    const m = this.osc('sine', 47, t, 0.3);
    const mg = this.ctx.createGain();
    mg.gain.value = 400;
    m.connect(mg).connect(o.frequency);
    const f = this.filter('bandpass', 1400, 1.2);
    const g = this.gain(0, this.sfx);
    this.env(g, t, 0.45, 0.004, 0.25);
    o.connect(f).connect(g);
  }

  anvil(pos: THREE.Vector3) {
    const t = this.now;
    const dst = this.out(pos, 4);
    for (const [f, v] of [[1750, 0.35], [2630, 0.2], [4100, 0.12]] as [number, number][]) {
      const o = this.osc('sine', f * R(0.98, 1.02), t, 0.6);
      const g = this.gain(0, dst);
      this.env(g, t, v, 0.001, 0.5);
      o.connect(g);
    }
    this.click(900, 2, 0.05, 0.5, 0, pos);
  }

  forgeIgnite(pos: THREE.Vector3) {
    const t = this.now;
    const dst = this.out(pos, 6);
    const s = this.noiseSrc(t, 1.5);
    const f = this.filter('lowpass', 300, 0.7);
    f.frequency.exponentialRampToValueAtTime(2200, t + 0.6);
    const g = this.gain(0, dst);
    this.env(g, t, 1.2, 0.3, 1.1);
    s.connect(f).connect(g);
    this.boom(t + 0.4, 0.8);
  }

  // item caiu no chão: brilho que sobe (posicional, ouve-se de longe)
  powerupDrop(pos: THREE.Vector3) {
    const t = this.now;
    const dst = this.out(pos, 8);
    [392, 587.33, 783.99].forEach((f, i) => {
      const o = this.osc('sine', f, t + i * 0.09, 0.9);
      o.frequency.linearRampToValueAtTime(f * 1.5, t + i * 0.09 + 0.8);
      const g = this.gain(0, dst);
      this.env(g, t + i * 0.09, 0.35, 0.02, 0.8);
      o.connect(g);
    });
  }

  powerupPickup() {
    const t = this.now;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const o = this.osc('triangle', f, t + i * 0.06, 0.4);
      const g = this.gain(0, this.sfx);
      this.env(g, t + i * 0.06, 0.25, 0.005, 0.35);
      o.connect(g);
    });
  }

  shell() {
    this.click(R(2600, 3400), 6, 0.05, 0.3);
    this.click(R(1200, 1600), 4, 0.06, 0.2, 0.05);
  }

  weaponSwitch() {
    this.click(1400, 2, 0.08, 0.3);
    this.click(900, 2, 0.06, 0.25, 0.12);
  }

  explosion(pos: THREE.Vector3) {
    const t = this.now;
    const dst = this.out(pos, 10);
    const s = this.noiseSrc(t, 1.6);
    const f = this.filter('lowpass', 2400, 0.7);
    f.frequency.setValueAtTime(2400, t);
    f.frequency.exponentialRampToValueAtTime(160, t + 1.2);
    const g = this.gain(0, dst);
    this.env(g, t, 1.6, 0.003, 1.4);
    s.connect(f).connect(g);
    const o = this.osc('sine', 90, t, 1.0);
    o.frequency.exponentialRampToValueAtTime(28, t + 0.8);
    const g2 = this.gain(0, dst);
    this.env(g2, t, 1.8, 0.003, 0.9);
    o.connect(g2);
  }

  private click(freq: number, q: number, dur: number, vol: number, delay = 0, pos?: THREE.Vector3) {
    const t = this.now + delay;
    const s = this.noiseSrc(t, dur);
    const f = this.filter('bandpass', freq, q);
    const g = this.gain(0, this.out(pos));
    this.env(g, t, vol, 0.001, dur);
    s.connect(f).connect(g);
  }

  dryFire() {
    this.click(3200, 4, 0.04, 0.35);
  }
  magOut() {
    this.click(1800, 3, 0.06, 0.4);
    this.click(900, 2, 0.08, 0.25, 0.05);
  }
  magIn() {
    this.click(1400, 3, 0.05, 0.5);
    this.click(2600, 5, 0.04, 0.35, 0.04);
  }
  slide() {
    this.click(2200, 2, 0.07, 0.45);
    this.click(3400, 4, 0.05, 0.4, 0.09);
  }

  knifeSwing() {
    const t = this.now;
    const s = this.noiseSrc(t, 0.2);
    const f = this.filter('bandpass', 700, 2.5);
    f.frequency.setValueAtTime(700, t);
    f.frequency.exponentialRampToValueAtTime(2800, t + 0.16);
    const g = this.gain(0, this.sfx);
    this.env(g, t, 0.35, 0.05, 0.14);
    s.connect(f).connect(g);
  }

  knifeHit() {
    const t = this.now;
    const o = this.osc('sine', 110, t, 0.15);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const g = this.gain(0, this.sfx);
    this.env(g, t, 0.8, 0.002, 0.13);
    o.connect(g);
    this.click(500, 1, 0.12, 0.5);
  }

  hitmarker(head: boolean) {
    const t = this.now;
    const o = this.osc('square', head ? 2900 : 2300, t, 0.04);
    const f = this.filter('bandpass', head ? 2900 : 2300, 6);
    const g = this.gain(0, this.sfx);
    this.env(g, t, head ? 0.16 : 0.1, 0.001, 0.035);
    o.connect(f).connect(g);
  }

  footstep(surface: Surface, loud = 1) {
    const t = this.now;
    const s = this.noiseSrc(t, 0.12);
    const f = this.filter('lowpass', surface === 'wood' ? 750 : surface === 'dirt' ? 450 : 1100, surface === 'wood' ? 4 : 1);
    const g = this.gain(0, this.sfx);
    this.env(g, t, R(0.1, 0.15) * loud, 0.004, surface === 'dirt' ? 0.12 : 0.07);
    s.connect(f).connect(g);
  }

  land() {
    this.footstep('hard', 2.2);
    this.click(200, 1, 0.12, 0.35);
  }

  hurt() {
    const t = this.now;
    const o = this.osc('sine', 80, t, 0.3);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.25);
    const g = this.gain(0, this.sfx);
    this.env(g, t, 0.9, 0.003, 0.28);
    o.connect(g);
    const s = this.noiseSrc(t, 0.2);
    const f = this.filter('bandpass', 900, 1.5);
    const g2 = this.gain(0, this.sfx);
    this.env(g2, t, 0.4, 0.002, 0.15);
    s.connect(f).connect(g2);
  }

  // batimento cardíaco quando a vida está baixa (k de 0 a 1)
  heartbeat(dt: number, k: number) {
    if (k <= 0) {
      this.heartT = 0;
      return;
    }
    this.heartT -= dt;
    if (this.heartT > 0) return;
    this.heartT = 0.9 - k * 0.35;
    const t = this.now;
    for (const [d, v] of [[0, 1], [0.16, 0.7]] as [number, number][]) {
      const o = this.osc('sine', 52, t + d, 0.18);
      const g = this.gain(0, this.sfx);
      this.env(g, t + d, 0.7 * k * v, 0.01, 0.16);
      o.connect(g);
    }
  }

  // ---------- zumbis ----------

  private voice(pos: THREE.Vector3, f0: number, f1: number, dur: number, vol: number, rough: number) {
    const t = this.now;
    const dst = this.out(pos, 2.2);
    const o = this.osc('sawtooth', f0, t, dur);
    o.frequency.linearRampToValueAtTime(f1, t + dur);
    const lfo = this.osc('sine', R(5, 9), t, dur);
    const lg = this.ctx.createGain();
    lg.gain.value = f0 * 0.06;
    lfo.connect(lg).connect(o.frequency);
    const mix = this.gain(0, dst);
    mix.gain.setValueAtTime(0.0001, t);
    mix.gain.linearRampToValueAtTime(vol, t + 0.12);
    mix.gain.setValueAtTime(vol, t + dur * 0.6);
    mix.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const [ff, q, v] of [[R(450, 700), 5, 1], [R(1000, 1400), 7, 0.6], [R(2300, 2800), 8, 0.25]] as [number, number, number][]) {
      const f = this.filter('bandpass', ff, q);
      const g = this.gain(v, mix);
      o.connect(f).connect(g);
    }
    const n = this.noiseSrc(t, dur);
    const nf = this.filter('bandpass', R(900, 1600), 1.2);
    const ng = this.gain(rough, mix);
    n.connect(nf).connect(ng);
  }

  zombieGroan(pos: THREE.Vector3, kind: number) {
    if (this.groans >= 6) return;
    this.groans++;
    const dur = kind === 0 ? R(0.9, 1.6) : R(0.5, 1.0);
    const f0 = kind === 0 ? R(70, 110) : R(110, 170);
    this.voice(pos, f0, f0 * R(0.7, 1.15), dur, kind === 0 ? 0.55 : 0.7, kind === 0 ? 0.35 : 0.6);
    setTimeout(() => this.groans--, dur * 1000);
  }

  zombieAttack(pos: THREE.Vector3) {
    const f = R(150, 210);
    this.voice(pos, f, f * 0.65, 0.45, 0.9, 0.8);
  }

  zombieDeath(pos: THREE.Vector3) {
    const f = R(90, 130);
    this.voice(pos, f, f * 0.45, 0.8, 0.6, 0.4);
  }

  zombieRise(pos: THREE.Vector3) {
    const t = this.now;
    const dst = this.out(pos, 3);
    const s = this.noiseSrc(t, 1.2);
    const f = this.filter('lowpass', 260, 0.8);
    const g = this.gain(0, dst);
    this.env(g, t, 0.6, 0.15, 1.0);
    s.connect(f).connect(g);
    for (let i = 0; i < 5; i++) this.click(R(300, 900), 2, 0.05, 0.25, R(0, 0.8), pos);
  }

  // Forja pronta: bigorna tinindo, acorde crescendo e chama subindo
  forgeDone(pos: THREE.Vector3) {
    const t = this.now + 0.02;
    const dst = this.out(pos, 6);
    for (const [f, v, d] of [[523, 0.4, 2.2], [1046, 0.25, 1.8], [1568, 0.15, 1.4]] as [number, number, number][]) {
      const o = this.osc('triangle', f, t, d);
      const g = this.gain(0, dst);
      this.env(g, t, v, 0.002, d);
      o.connect(g);
    }
    this.pad([110, 164.81, 220, 277.18], t, 3.2, 0.09, 1400);
    const s = this.noiseSrc(t, 1.5);
    const bp = this.filter('bandpass', 400, 0.6);
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(2400, t + 1.2);
    const g2 = this.gain(0, dst);
    this.env(g2, t, 0.6, 0.2, 1.2);
    s.connect(bp).connect(g2);
  }

  // pegou a arma forjada: subida de quintas e um estalo de fogo
  forgeTake() {
    const t = this.now + 0.02;
    [196, 293.66, 392, 587.33].forEach((f, i) => this.bell(f, t + i * 0.09, 0.22, 1.6));
    this.boom(t, 0.6);
    const s = this.noiseSrc(t, 0.8);
    const hp = this.filter('highpass', 1200, 0.7);
    const g = this.gain(0, this.sfx);
    this.env(g, t, 0.35, 0.05, 0.7);
    s.connect(hp).connect(g);
  }

  // tiro da arma forjada: chiado de brasa por cima do estampido
  emberShot() {
    const t = this.now;
    const s = this.noiseSrc(t, 0.25);
    const hp = this.filter('highpass', 3000, 0.7);
    const g = this.gain(0, this.sfx);
    this.env(g, t, 0.18, 0.01, 0.22);
    s.connect(hp).connect(g);
    const o = this.osc('sine', 1800, t, 0.15);
    o.frequency.exponentialRampToValueAtTime(500, t + 0.12);
    const g2 = this.gain(0, this.sfx);
    this.env(g2, t, 0.08, 0.002, 0.12);
    o.connect(g2);
  }

  // foguete saindo: estouro abafado e chiado do motor
  rocketLaunch(pos?: THREE.Vector3) {
    const t = this.now;
    const dst = pos ? this.out(pos, 6) : this.sfx;
    const o = this.osc('sine', 90, t, 0.4);
    o.frequency.exponentialRampToValueAtTime(35, t + 0.35);
    const g = this.gain(0, dst);
    this.env(g, t, 1.1, 0.003, 0.35);
    o.connect(g);
    const s = this.noiseSrc(t, 1.2);
    const bp = this.filter('bandpass', 900, 0.5);
    bp.frequency.setValueAtTime(2200, t);
    bp.frequency.exponentialRampToValueAtTime(500, t + 1.1);
    const g2 = this.gain(0, dst);
    this.env(g2, t, 0.7, 0.02, 1.1);
    s.connect(bp).connect(g2);
  }

  // faca balística: mola soltando e a lâmina zunindo
  bladeLaunch(pos?: THREE.Vector3) {
    const t = this.now;
    const dst = pos ? this.out(pos, 3) : this.sfx;
    this.click(R(900, 1200), 3, 0.05, 0.7, 0, pos);
    const o = this.osc('triangle', 520, t, 0.25);
    o.frequency.exponentialRampToValueAtTime(1400, t + 0.2);
    const g = this.gain(0, dst);
    this.env(g, t, 0.25, 0.01, 0.22);
    o.connect(g);
  }

  // ---------- armas maravilha ----------

  // Canhão de Vento: estrondo grave e um sopro forte que some longe
  windBlast(pos?: THREE.Vector3) {
    const t = this.now;
    const dst = pos ? this.out(pos, 7) : this.sfx;
    const o = this.osc('sine', 70, t, 0.6);
    o.frequency.exponentialRampToValueAtTime(28, t + 0.5);
    const g = this.gain(0, dst);
    this.env(g, t, 1.3, 0.004, 0.5);
    o.connect(g);
    const s = this.noiseSrc(t, 1.3);
    const lp = this.filter('lowpass', 3000, 0.7);
    lp.frequency.setValueAtTime(3800, t);
    lp.frequency.exponentialRampToValueAtTime(260, t + 1.2);
    const g2 = this.gain(0, dst);
    this.env(g2, t, 1.0, 0.01, 1.2);
    s.connect(lp).connect(g2);
  }

  // Arpão Elétrico: estalo seco e zumbido elétrico
  arcZap(pos?: THREE.Vector3) {
    const t = this.now;
    const dst = pos ? this.out(pos, 5) : this.sfx;
    const s = this.noiseSrc(t, 0.35);
    const hp = this.filter('highpass', 2500, 0.7);
    const g = this.gain(0, dst);
    this.env(g, t, 0.9, 0.001, 0.12);
    s.connect(hp).connect(g);
    const o = this.osc('sawtooth', 120, t, 0.45);
    const m = this.osc('square', 63, t, 0.45);
    const mg = this.ctx.createGain();
    mg.gain.value = 90;
    m.connect(mg).connect(o.frequency);
    const bp = this.filter('bandpass', 900, 2);
    const g2 = this.gain(0, dst);
    this.env(g2, t, 0.5, 0.005, 0.4);
    o.connect(bp).connect(g2);
  }

  // faísca do arpão em cada zumbi atingido
  arcHit(pos: THREE.Vector3) {
    const t = this.now;
    const s = this.noiseSrc(t, 0.15);
    const bp = this.filter('bandpass', R(3000, 4500), 1.5);
    const g = this.gain(0, this.out(pos, 3));
    this.env(g, t, 0.45, 0.001, 0.12);
    s.connect(bp).connect(g);
  }

  // Vórtice: rugido grave que gira enquanto o buraco fica aberto
  vortexOpen(pos: THREE.Vector3, dur: number) {
    const t = this.now;
    const dst = this.out(pos, 6);
    const o = this.osc('sawtooth', 48, t, dur);
    o.frequency.linearRampToValueAtTime(72, t + dur);
    const lfo = this.osc('sine', 3.2, t, dur);
    const lg = this.ctx.createGain();
    lg.gain.value = 260;
    const lp = this.filter('lowpass', 500, 4);
    lfo.connect(lg).connect(lp.frequency);
    const g = this.gain(0, dst);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.7, t + 0.3);
    g.gain.setValueAtTime(0.7, t + dur - 0.4);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(lp).connect(g);
    // ruído em laço (o buffer de ruído tem só 2 s)
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.start(t);
    s.stop(t + dur + 0.1);
    const bp = this.filter('bandpass', 700, 0.8);
    lfo.connect(lg).connect(bp.frequency);
    const g2 = this.gain(0, dst);
    g2.gain.setValueAtTime(0, t);
    g2.gain.linearRampToValueAtTime(0.35, t + 0.4);
    g2.gain.setValueAtTime(0.35, t + dur - 0.4);
    g2.gain.linearRampToValueAtTime(0, t + dur);
    s.connect(bp).connect(g2);
  }

  vortexClose(pos: THREE.Vector3) {
    const t = this.now;
    const dst = this.out(pos, 6);
    const o = this.osc('sine', 40, t, 0.5);
    o.frequency.exponentialRampToValueAtTime(180, t + 0.25);
    const g = this.gain(0, dst);
    this.env(g, t, 1, 0.01, 0.45);
    o.connect(g);
    const s = this.noiseSrc(t, 0.5);
    const lp = this.filter('lowpass', 300, 1);
    lp.frequency.exponentialRampToValueAtTime(2500, t + 0.3);
    const g2 = this.gain(0, dst);
    this.env(g2, t, 0.7, 0.2, 0.25);
    s.connect(lp).connect(g2);
  }

  // ---------- Bispo e o ritual ----------

  // voz do Bispo: coro grave e desafinado, como um canto de igreja distorcido
  bispoVoice(pos: THREE.Vector3, k = 1) {
    const t = this.now;
    const dur = 1.2 + 1.2 * k;
    const dst = this.out(pos, 5 + 3 * k);
    const base = R(62, 74);
    for (const mul of [1, 1.5, 2.01, 2.98]) {
      const o = this.osc('sawtooth', base * mul, t, dur);
      o.frequency.linearRampToValueAtTime(base * mul * (k > 1 ? 0.7 : 0.94), t + dur);
      const vib = this.osc('sine', R(4.5, 6), t, dur);
      const vg = this.ctx.createGain();
      vg.gain.value = base * mul * 0.012;
      vib.connect(vg).connect(o.frequency);
      const f = this.filter('bandpass', 550 + mul * 120, 3);
      const g = this.gain(0, dst);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.16 * k / mul, t + 0.35);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f).connect(g);
    }
  }

  // vela preta acesa: chiado e um sussurro grave
  ritualCandle(pos: THREE.Vector3) {
    const t = this.now;
    const s = this.noiseSrc(t, 0.8);
    const bp = this.filter('bandpass', 1800, 2);
    bp.frequency.exponentialRampToValueAtTime(500, t + 0.7);
    const g = this.gain(0, this.out(pos, 3));
    this.env(g, t, 0.5, 0.02, 0.7);
    s.connect(bp).connect(g);
    this.bispoVoice(pos, 0.35);
  }

  // as três velas acesas: sino grave tocando três vezes
  ritualBell() {
    for (let i = 0; i < 3; i++) {
      const t = this.now + i * 1.1;
      for (const [f, a] of [[98, 0.5], [196.5, 0.3], [261, 0.18], [392, 0.1]] as [number, number][]) {
        const o = this.osc('sine', f, t, 3.5);
        const g = this.gain(0, this.sfx);
        this.env(g, t, a, 0.005, 3.4);
        o.connect(g);
      }
    }
  }

  // aviso dos pilares de fogo: ronco que sobe do chão
  pillarWarn(pos: THREE.Vector3) {
    const t = this.now;
    const o = this.osc('sawtooth', 40, t, 1.3);
    o.frequency.exponentialRampToValueAtTime(90, t + 1.2);
    const lp = this.filter('lowpass', 300, 2);
    const g = this.gain(0, this.out(pos, 4));
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.6, t + 1.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.35);
    o.connect(lp).connect(g);
  }

  // ---------- Carrasco ----------

  // rugido grave e áspero; vol 1 = rugido de batalha
  bossRoar(pos: THREE.Vector3, vol = 1) {
    const f = R(55, 75);
    this.voice(pos, f, f * R(0.6, 0.8), 0.8 + vol * 0.6, 0.9 * vol, 1.0);
    this.voice(pos, f * 2.02, f * 1.3, 0.7 + vol * 0.5, 0.35 * vol, 0.8);
  }

  bossStep(pos: THREE.Vector3, running: boolean) {
    const t = this.now;
    const dst = this.out(pos, 6);
    const o = this.osc('sine', running ? 75 : 62, t, 0.35);
    o.frequency.exponentialRampToValueAtTime(30, t + 0.3);
    const g = this.gain(0, dst);
    this.env(g, t, running ? 0.9 : 0.7, 0.004, 0.3);
    o.connect(g);
    const s = this.noiseSrc(t, 0.2);
    const f = this.filter('lowpass', 300, 0.7);
    const g2 = this.gain(0, dst);
    this.env(g2, t, 0.5, 0.003, 0.18);
    s.connect(f).connect(g2);
    // corrente balançando
    if (Math.random() < 0.6) for (let i = 0; i < 3; i++) this.click(R(2500, 4200), 6, 0.03, 0.12, R(0.02, 0.2), pos);
  }

  // capacete arrancado: clangor metálico
  armorBreak(pos: THREE.Vector3) {
    const t = this.now;
    const dst = this.out(pos, 6);
    for (const [f, v] of [[R(380, 430), 0.5], [R(960, 1050), 0.35], [R(1700, 1900), 0.25]] as [number, number][]) {
      const o = this.osc('square', f, t, 1.2);
      const bp = this.filter('bandpass', f, 6);
      const g = this.gain(0, dst);
      this.env(g, t, v, 0.002, 1.1);
      o.connect(bp).connect(g);
    }
    const s = this.noiseSrc(t, 0.15);
    const hp = this.filter('highpass', 2000, 0.8);
    const g2 = this.gain(0, dst);
    this.env(g2, t, 0.8, 0.001, 0.12);
    s.connect(hp).connect(g2);
  }

  // sino de igreja grave, três badaladas: o Carrasco chegou
  bossBell() {
    const t = this.now + 0.05;
    for (let i = 0; i < 3; i++) {
      this.bell(98, t + i * 1.4, 0.55, 4);
      this.bell(196.5, t + i * 1.4, 0.2, 3);
    }
    this.boom(t, 1.0);
  }

  bossSlam(pos: THREE.Vector3) {
    this.explosion(pos);
    const t = this.now;
    const dst = this.out(pos, 8);
    const o = this.osc('sine', 48, t, 1.2);
    o.frequency.exponentialRampToValueAtTime(22, t + 1.1);
    const g = this.gain(0, dst);
    this.env(g, t, 1.0, 0.005, 1.1);
    o.connect(g);
  }

  // corrente sendo lançada: chocalho subindo
  chainThrow(pos: THREE.Vector3) {
    for (let i = 0; i < 9; i++) this.click(R(2200, 4000), 5, 0.035, 0.3, i * 0.035, pos);
    const t = this.now;
    const s = this.noiseSrc(t, 0.4);
    const bp = this.filter('bandpass', 1200, 1);
    bp.frequency.setValueAtTime(700, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + 0.35);
    const g = this.gain(0, this.out(pos, 5));
    this.env(g, t, 0.5, 0.02, 0.35);
    s.connect(bp).connect(g);
  }

  // o gancho pegou o jogador: tranco perto do ouvido
  chainHit() {
    const t = this.now;
    for (let i = 0; i < 5; i++) this.click(R(1800, 3000), 4, 0.04, 0.6, i * 0.03);
    const o = this.osc('triangle', 140, t, 0.25);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.2);
    const g = this.gain(0, this.sfx);
    this.env(g, t, 0.8, 0.003, 0.2);
    o.connect(g);
  }

  // ---------- Cães Infernais ----------

  dogGrowl(pos: THREE.Vector3) {
    if (this.groans >= 6) return;
    this.groans++;
    const dur = R(0.5, 1.0);
    const f = R(70, 105);
    this.voice(pos, f, f * R(0.85, 1.1), dur, 0.6, 1.0);
    setTimeout(() => this.groans--, dur * 1000);
  }

  // latido curto e a mordida estalando
  dogBark(pos: THREE.Vector3) {
    const f = R(260, 340);
    this.voice(pos, f, f * 0.6, 0.2, 0.9, 0.9);
    this.click(R(1800, 2400), 4, 0.04, 0.5, 0.26, pos);
  }

  dogHowl(pos: THREE.Vector3) {
    const f = R(330, 420);
    this.voice(pos, f, f * 1.45, 1.6, 0.45, 0.25);
  }

  // morte do cão: estouro abafado e chamas
  dogDeath(pos: THREE.Vector3) {
    const t = this.now;
    const dst = this.out(pos, 4);
    const o = this.osc('sine', 120, t, 0.4);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.35);
    const g = this.gain(0, dst);
    this.env(g, t, 0.9, 0.004, 0.35);
    o.connect(g);
    const s = this.noiseSrc(t, 0.9);
    const f = this.filter('bandpass', 700, 0.6);
    f.frequency.setValueAtTime(1600, t);
    f.frequency.exponentialRampToValueAtTime(300, t + 0.8);
    const g2 = this.gain(0, dst);
    this.env(g2, t, 0.8, 0.01, 0.8);
    s.connect(f).connect(g2);
    const yelp = R(500, 650);
    this.voice(pos, yelp, yelp * 0.5, 0.3, 0.5, 0.6);
  }

  // raio de fogo: estalo seco e trovão rolando
  lightning(pos: THREE.Vector3) {
    const t = this.now;
    const dst = this.out(pos, 10);
    const crack = this.noiseSrc(t, 0.2);
    const hp = this.filter('highpass', 1800, 0.7);
    const g = this.gain(0, dst);
    this.env(g, t, 1.0, 0.001, 0.18);
    crack.connect(hp).connect(g);
    const roll = this.noiseSrc(t + 0.05, 1.8);
    const lp = this.filter('lowpass', 220, 0.6);
    lp.frequency.setValueAtTime(400, t + 0.05);
    lp.frequency.exponentialRampToValueAtTime(90, t + 1.7);
    const g2 = this.gain(0, dst);
    this.env(g2, t + 0.05, 1.3, 0.05, 1.7);
    roll.connect(lp).connect(g2);
    const o = this.osc('sine', 60, t, 1.2);
    o.frequency.exponentialRampToValueAtTime(30, t + 1.1);
    const g3 = this.gain(0, dst);
    this.env(g3, t, 0.7, 0.01, 1.1);
    o.connect(g3);
  }

  // Vinheta da rodada infernal: estrondo, acorde dissonante, sinos graves e uivos ao longe
  hellStart() {
    const t = this.now + 0.05;
    this.boom(t, 1.1);
    this.pad([41.2, 58.27, 82.41, 116.54], t, 6, 0.1, 600);
    [329.63, 311.13, 233.08, 220].forEach((f, i) => this.bell(f, t + 0.5 + i * 0.55, 0.2, 3));
    const far = new THREE.Vector3();
    for (const [d, a] of [[1.4, 0.7], [2.6, 2.6], [3.4, 4.5]]) {
      setTimeout(() => {
        far.set(this.lastListener.x + Math.cos(a) * 30, 2, this.lastListener.z + Math.sin(a) * 30);
        this.dogHowl(far);
      }, d * 1000);
    }
    this.startHellDrone();
  }

  hellEnd() {
    this.stopHellDrone();
  }

  // zumbido grave em trítono, pulsando, enquanto durar a rodada infernal
  private startHellDrone() {
    this.stopHellDrone();
    const t = this.now;
    const g = this.gain(0, this.music);
    g.gain.linearRampToValueAtTime(0.07, t + 3);
    const lp = this.filter('lowpass', 260, 0.8);
    lp.connect(g);
    const nodes: AudioScheduledSourceNode[] = [];
    for (const f of [41.2, 58.27]) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(lp);
      o.start();
      nodes.push(o);
    }
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 1.1;
    const lg = this.ctx.createGain();
    lg.gain.value = 0.035;
    lfo.connect(lg).connect(g.gain);
    lfo.start();
    nodes.push(lfo);
    this.hellNodes = { nodes, gain: g };
  }

  private stopHellDrone() {
    if (!this.hellNodes) return;
    const { nodes, gain } = this.hellNodes;
    const t = this.now;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(0.0001, t + 2.5);
    for (const n of nodes) n.stop(t + 2.6);
    this.hellNodes = null;
  }

  bodyHit(pos: THREE.Vector3, head: boolean) {
    this.click(head ? 700 : 400, 1.5, 0.08, head ? 0.6 : 0.4, 0, pos);
  }

  // ---------- portas ----------

  doorOpen(pos: THREE.Vector3) {
    const t = this.now;
    const dst = this.out(pos, 5);
    const s = this.noiseSrc(t, 1.4);
    const f = this.filter('lowpass', 320, 0.8);
    f.frequency.setValueAtTime(600, t);
    f.frequency.exponentialRampToValueAtTime(140, t + 1.3);
    const g = this.gain(0, dst);
    this.env(g, t, 1.0, 0.05, 1.3);
    s.connect(f).connect(g);
    const o = this.osc('sawtooth', 70, t, 1.0);
    o.frequency.linearRampToValueAtTime(48, t + 1.0);
    const lp = this.filter('lowpass', 220, 1);
    const g2 = this.gain(0, dst);
    this.env(g2, t, 0.35, 0.1, 0.9);
    o.connect(lp).connect(g2);
    for (let i = 0; i < 6; i++) this.click(R(200, 900), 2, 0.06, 0.3, R(0, 0.9), pos);
  }

  // ---------- barricadas ----------

  boardBreak(pos: THREE.Vector3) {
    const t = this.now;
    const dst = this.out(pos, 3);
    const s = this.noiseSrc(t, 0.25);
    const f = this.filter('bandpass', R(900, 1400), 1.2);
    const g = this.gain(0, dst);
    this.env(g, t, 0.9, 0.002, 0.22);
    s.connect(f).connect(g);
    const o = this.osc('triangle', R(140, 190), t, 0.15);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.12);
    const g2 = this.gain(0, dst);
    this.env(g2, t, 0.6, 0.002, 0.13);
    o.connect(g2);
    for (let i = 0; i < 3; i++) this.click(R(1500, 3000), 3, 0.03, 0.25, R(0.02, 0.12), pos);
  }

  boardFix(pos: THREE.Vector3) {
    const t = this.now;
    const dst = this.out(pos, 3);
    for (const d of [0, 0.16]) {
      const o = this.osc('sine', R(180, 220), t + d, 0.12);
      o.frequency.exponentialRampToValueAtTime(90, t + d + 0.1);
      const g = this.gain(0, dst);
      this.env(g, t + d, 0.7, 0.002, 0.1);
      o.connect(g);
      this.click(R(2000, 2600), 4, 0.03, 0.3, d, pos);
    }
  }

  // ---------- compras ----------

  buy() {
    const t = this.now;
    for (const [f, d] of [[1568, 0], [2093, 0.07]] as [number, number][]) {
      const o = this.osc('sine', f, t + d, 0.5);
      const g = this.gain(0, this.sfx);
      this.env(g, t + d, 0.22, 0.004, 0.45);
      o.connect(g);
    }
    this.click(3000, 3, 0.05, 0.3);
  }

  deny() {
    const t = this.now;
    const o = this.osc('square', 104, t, 0.28);
    const f = this.filter('lowpass', 600, 1);
    const g = this.gain(0, this.sfx);
    this.env(g, t, 0.25, 0.005, 0.25);
    o.connect(f).connect(g);
  }

  gulp() {
    const t = this.now;
    const o = this.osc('sine', R(200, 240), t, 0.14);
    o.frequency.exponentialRampToValueAtTime(R(85, 110), t + 0.12);
    const g = this.gain(0, this.sfx);
    this.env(g, t, 0.55, 0.01, 0.12);
    o.connect(g);
    this.click(R(500, 800), 2, 0.06, 0.15);
  }

  // Vinheta curta de cada máquina de bebida (melodias originais), tocada na posição da máquina.
  perkJingle(pos: THREE.Vector3, index: number) {
    const melodies: [number, number][][] = [
      [[0, 0.18], [3, 0.18], [7, 0.18], [10, 0.36], [7, 0.18], [12, 0.54]],
      [[7, 0.15], [5, 0.15], [7, 0.15], [12, 0.3], [10, 0.15], [7, 0.45]],
      [[0, 0.12], [4, 0.12], [7, 0.12], [11, 0.12], [12, 0.24], [11, 0.12], [7, 0.36]],
      [[5, 0.2], [5, 0.1], [8, 0.2], [12, 0.2], [10, 0.2], [8, 0.5]],
      [[0, 0.16], [2, 0.16], [4, 0.16], [7, 0.16], [9, 0.16], [12, 0.48]],
      [[12, 0.22], [7, 0.22], [8, 0.22], [3, 0.22], [5, 0.22], [0, 0.6]],
    ];
    const mel = melodies[index % melodies.length];
    const base = [220, 196, 261.6, 174.6, 246.9, 207.7][index % 6];
    const dst = this.out(pos, 3, this.music);
    let t = this.now + 0.05;
    for (const [st, d] of mel) {
      const f = base * Math.pow(2, st / 12);
      const o = this.osc('triangle', f, t, d + 0.25);
      const o2 = this.osc('square', f * 2, t, d + 0.25);
      const lp = this.filter('lowpass', 1800, 0.7);
      const g = this.gain(0, dst);
      this.env(g, t, 0.35, 0.01, d + 0.2);
      const g2 = this.gain(0.12, lp);
      o.connect(g);
      o2.connect(g2);
      lp.connect(g);
      t += d;
    }
  }

  // ---------- música (vinhetas originais) ----------

  private bell(freq: number, t: number, vol: number, decay: number) {
    const car = this.osc('sine', freq, t, decay);
    const mod = this.osc('sine', freq * 3.51, t, decay);
    const mg = this.ctx.createGain();
    mg.gain.setValueAtTime(freq * 2.2, t);
    mg.gain.exponentialRampToValueAtTime(freq * 0.05, t + decay);
    mod.connect(mg).connect(car.frequency);
    const g = this.gain(0, this.music);
    this.env(g, t, vol, 0.004, decay);
    car.connect(g);
  }

  private pad(freqs: number[], t: number, dur: number, vol: number, cutoff = 900) {
    const f = this.filter('lowpass', cutoff, 0.8);
    const g = this.gain(0, this.music);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.3);
    g.gain.setValueAtTime(vol, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    f.connect(g);
    for (const fr of freqs) {
      for (const det of [-7, 6]) {
        const o = this.osc('sawtooth', fr, t, dur);
        o.detune.value = det;
        o.connect(f);
      }
    }
  }

  private boom(t: number, vol: number) {
    const o = this.osc('sine', 70, t, 1.6);
    o.frequency.exponentialRampToValueAtTime(28, t + 1.4);
    const g = this.gain(0, this.music);
    this.env(g, t, vol, 0.01, 1.5);
    o.connect(g);
  }

  roundStart() {
    const t = this.now + 0.05;
    this.boom(t, 0.9);
    this.pad([55, 82.41, 110, 130.81], t, 4.5, 0.08);
    [659.25, 587.33, 440, 415.3].forEach((f, i) => this.bell(f, t + 0.35 + i * 0.42, 0.22, 2.4));
  }

  roundEnd() {
    const t = this.now + 0.05;
    this.pad([73.42, 110, 146.83, 174.61], t, 6, 0.07, 700);
    [880, 1046.5, 987.77, 830.61, 880, 659.25].forEach((f, i) => this.bell(f, t + i * 0.33, 0.13, 1.8));
    this.boom(t + 2.2, 0.6);
  }

  gameOver() {
    const t = this.now + 0.1;
    this.boom(t, 1);
    const chords = [
      [55, 110, 130.81, 164.81],
      [49, 98, 116.54, 146.83],
      [43.65, 87.31, 103.83, 130.81],
      [41.2, 82.41, 98, 123.47],
    ];
    chords.forEach((c, i) => this.pad(c, t + i * 1.6, 3.2, 0.08, 650));
    [523.25, 466.16, 415.3, 392].forEach((f, i) => this.bell(f, t + 0.4 + i * 1.6, 0.18, 3));
  }

  // Motor do ônibus: ronco grave que segue a posição e sobe com a velocidade (null = desliga).
  busEngine(pos: THREE.Vector3 | null, speed: number) {
    if (!pos) {
      if (this.bus) {
        const t = this.now;
        this.bus.gain.gain.setTargetAtTime(0, t, 0.3);
      }
      return;
    }
    if (!this.bus) {
      const panner = this.out(pos, 7) as PannerNode;
      const gain = this.gain(0, panner);
      const lp = this.filter('lowpass', 260, 0.9);
      lp.connect(gain);
      const o1 = this.ctx.createOscillator();
      o1.type = 'sawtooth';
      o1.frequency.value = 38;
      const o2 = this.ctx.createOscillator();
      o2.type = 'square';
      o2.frequency.value = 57;
      const g2 = this.gain(0.35, lp);
      o1.connect(lp);
      o2.connect(g2);
      o1.start();
      o2.start();
      this.bus = { panner, gain, lp, o1, o2 };
    }
    const t = this.now;
    const b = this.bus;
    if (b.panner.positionX) {
      b.panner.positionX.setTargetAtTime(pos.x, t, 0.05);
      b.panner.positionY.setTargetAtTime(pos.y, t, 0.05);
      b.panner.positionZ.setTargetAtTime(pos.z, t, 0.05);
    } else {
      b.panner.setPosition(pos.x, pos.y, pos.z);
    }
    const k = Math.min(1, speed / 10);
    b.o1.frequency.setTargetAtTime(34 + k * 28, t, 0.2);
    b.o2.frequency.setTargetAtTime(51 + k * 42, t, 0.2);
    b.lp.frequency.setTargetAtTime(200 + k * 420, t, 0.2);
    b.gain.gain.setTargetAtTime(0.18 + k * 0.22, t, 0.2);
  }

  stopBusEngine() {
    if (!this.bus) return;
    this.bus.o1.stop();
    this.bus.o2.stop();
    this.bus = null;
  }

  busHorn(pos: THREE.Vector3) {
    const t = this.now;
    const dst = this.out(pos, 12);
    for (const [f, d] of [[311, 0], [370, 0], [311, 0.75], [370, 0.75]] as [number, number][]) {
      const o = this.osc('sawtooth', f, t + d, 0.6);
      const lp = this.filter('lowpass', 1400, 1.2);
      const g = this.gain(0, dst);
      g.gain.setValueAtTime(0.0001, t + d);
      g.gain.linearRampToValueAtTime(0.28, t + d + 0.03);
      g.gain.setValueAtTime(0.28, t + d + 0.5);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.6);
      o.connect(lp).connect(g);
    }
  }

  // porta pneumática do ônibus
  busDoor(pos: THREE.Vector3) {
    const t = this.now;
    const s = this.noiseSrc(t, 0.6);
    const bp = this.filter('bandpass', 2400, 0.8);
    bp.frequency.setValueAtTime(3200, t);
    bp.frequency.exponentialRampToValueAtTime(900, t + 0.5);
    const g = this.gain(0, this.out(pos, 5));
    this.env(g, t, 0.45, 0.02, 0.5);
    s.connect(bp).connect(g);
  }

  // energia ligada: estalo e zumbido elétrico subindo
  powerOn() {
    const t = this.now + 0.02;
    this.boom(t, 0.9);
    const o = this.osc('sawtooth', 50, t, 3);
    o.frequency.exponentialRampToValueAtTime(120, t + 2.5);
    const lp = this.filter('lowpass', 500, 1);
    const g = this.gain(0, this.music);
    this.env(g, t, 0.25, 0.4, 2.5);
    o.connect(lp).connect(g);
    for (let i = 0; i < 6; i++) this.click(R(2000, 5000), 6, 0.04, 0.4, i * 0.12);
  }

  // Vulto: sibilo agudo e áspero
  vultoHiss(pos: THREE.Vector3) {
    const f = R(520, 700);
    this.voice(pos, f, f * 1.3, R(0.3, 0.5), 0.5, 1.0);
  }

  startAmbience() {
    this.stopAmbience();
    const t = this.now;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    const f = this.filter('bandpass', 380, 0.6);
    const g = this.gain(0.0, this.amb);
    g.gain.linearRampToValueAtTime(0.35, t + 3);
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = this.ctx.createGain();
    lg.gain.value = 0.2;
    lfo.connect(lg).connect(g.gain);
    s.connect(f).connect(g);
    s.start();
    lfo.start();
    const drone = this.ctx.createOscillator();
    drone.frequency.value = 41;
    const dg = this.gain(0.06, this.amb);
    drone.connect(dg);
    drone.start();
    this.ambNodes = [s, lfo, drone];
  }

  stopAmbience() {
    for (const n of this.ambNodes) (n as OscillatorNode).stop();
    this.ambNodes = [];
  }
}
