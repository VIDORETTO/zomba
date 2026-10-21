import * as THREE from 'three';

// Sons do mapa Trincheira: tudo sintetizado com Web Audio (nada gravado nem de terceiros).
// O AudioEngine entrega as ferramentas (kit); aqui só ficam as receitas dos sons e o ambiente.

export type Weather4 = 'limpo' | 'chuva' | 'neve';

export type TrSound =
  | 'gerador-liga' | 'gerador-perde' | 'gerador-captura' | 'alarme' | 'forja-sobe' | 'fonte-gira' | 'fonte-bebida' | 'fonte-foge'
  | 'cavar' | 'cavar-fim' | 'achou-peca' | 'bancada' | 'monta' | 'drone-liga' | 'escudo-pega' | 'tanque-motor' | 'tanque-chamado'
  | 'tanque-fogo' | 'buzina-colosso' | 'pisada-colosso' | 'passo-colosso' | 'blindado-chega' | 'blindado-fogo' | 'blindado-garra'
  | 'blindado-salto' | 'cruzado-grito' | 'portal-musica' | 'portal-abre' | 'teleporte' | 'cristal' | 'cajado-monta'
  | 'cajado-desperto' | 'alvo-ok' | 'alvo-erro' | 'tabua' | 'desafio' | 'artilharia-lanca' | 'artilharia-apito' | 'artilharia-bomba'
  | 'sangue-morto' | 'missao-passo' | 'missao-fim' | 'fogo-bola' | 'fogo-pilar' | 'gelo-raio' | 'gelo-quebra' | 'nevasca'
  | 'redemoinho' | 'raio-bola' | 'trovao' | 'artilharia-longe' | 'vinheta-inicio' | 'vinheta-fim' | 'vinheta-blindado' | 'passo-distante' | 'rangido-colosso' | 'cantil-1' | 'cantil-2' | 'cantil-3' | 'segredo-musica' | 'radio';

export const TR_SOUNDS: TrSound[] = [
  'gerador-liga', 'gerador-perde', 'gerador-captura', 'alarme', 'forja-sobe', 'fonte-gira', 'fonte-bebida', 'fonte-foge',
  'cavar', 'cavar-fim', 'achou-peca', 'bancada', 'monta', 'drone-liga', 'escudo-pega', 'tanque-motor', 'tanque-chamado',
  'tanque-fogo', 'buzina-colosso', 'pisada-colosso', 'passo-colosso', 'blindado-chega', 'blindado-fogo', 'blindado-garra',
  'blindado-salto', 'cruzado-grito', 'portal-musica', 'portal-abre', 'teleporte', 'cristal', 'cajado-monta',
  'cajado-desperto', 'alvo-ok', 'alvo-erro', 'tabua', 'desafio', 'artilharia-lanca', 'artilharia-apito', 'artilharia-bomba',
  'sangue-morto', 'missao-passo', 'missao-fim', 'fogo-bola', 'fogo-pilar', 'gelo-raio', 'gelo-quebra', 'nevasca',
  'redemoinho', 'raio-bola', 'trovao', 'artilharia-longe', 'vinheta-inicio', 'vinheta-fim', 'vinheta-blindado', 'passo-distante', 'rangido-colosso', 'cantil-1', 'cantil-2', 'cantil-3', 'segredo-musica', 'radio',
];

export interface AudioKit {
  ctx: AudioContext;
  sfx: GainNode;
  music: GainNode;
  amb: GainNode;
  now: () => number;
  gain: (v: number, to: AudioNode) => GainNode;
  env: (g: GainNode, t: number, peak: number, attack: number, decay: number) => void;
  noiseSrc: (t: number, dur: number) => AudioBufferSourceNode;
  noiseBuffer: AudioBuffer;
  filter: (type: BiquadFilterType, freq: number, q?: number) => BiquadFilterNode;
  osc: (type: OscillatorType, freq: number, t: number, dur: number) => OscillatorNode;
  out: (pos?: THREE.Vector3, ref?: number, to?: AudioNode) => AudioNode;
  click: (freq: number, q: number, dur: number, vol: number, delay?: number, pos?: THREE.Vector3) => void;
  voice: (pos: THREE.Vector3, f0: number, f1: number, dur: number, vol: number, rough: number) => void;
  bell: (freq: number, t: number, vol: number, decay: number) => void;
  pad: (freqs: number[], t: number, dur: number, vol: number, cutoff?: number) => void;
  boom: (t: number, vol: number) => void;
  listener: THREE.Vector3;
}

const R = (a: number, b: number) => a + Math.random() * (b - a);

// ajuste de volume de cada som (medido: nenhum passa de ~1,1 antes do compressor)
const TRIM: Partial<Record<TrSound, number>> = {
  'gerador-perde': 0.85, 'gerador-captura': 0.8, 'fonte-foge': 0.65, cavar: 0.85, 'escudo-pega': 0.8,
  'tanque-chamado': 0.6, 'pisada-colosso': 0.25, 'passo-colosso': 0.4, 'blindado-chega': 0.4, 'blindado-fogo': 0.5,
  'blindado-garra': 0.4, 'blindado-salto': 0.55, 'cruzado-grito': 0.5, 'portal-musica': 0.7, 'portal-abre': 0.55,
  teleporte: 0.6, cristal: 0.65, 'cajado-monta': 0.9, 'artilharia-lanca': 0.85, 'artilharia-bomba': 0.55,
  trovao: 0.85, 'artilharia-longe': 0.85, 'tanque-fogo': 0.85, 'vinheta-inicio': 0.9, 'vinheta-fim': 0.9, 'vinheta-blindado': 0.85,
};

export class TrAudio {
  private rain: { src: AudioBufferSourceNode; gain: GainNode; lp: BiquadFilterNode } | null = null;
  private wind: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private weather: Weather4 = 'limpo';
  private ambient = false;
  private drumT = 8;
  // motores dos geradores: um laço por gerador por perto (e ligado)
  private readonly genLoops = new Map<number, { panner: PannerNode; gain: GainNode; lp: BiquadFilterNode; o1: OscillatorNode; o2: OscillatorNode; mode: 'liga' | 'falha'; t0: number }>();
  // sons parecidos não empilham (gelo-raio chega 10 vezes por segundo)
  private readonly lastT = new Map<string, number>();

  constructor(private readonly k: AudioKit) {}

  // ---------- primitivas ----------

  private pad(freqs: number[], t: number, dur: number, vol: number, cutoff = 900) {
    this.k.pad(freqs, t, dur, vol, cutoff);
  }

  private bell(freq: number, t: number, vol: number, decay: number) {
    this.k.bell(freq, t, vol, decay);
  }

  private boom(t: number, vol: number) {
    this.k.boom(t, vol);
  }

  private dest(pos: THREE.Vector3 | undefined, ref: number, bus: AudioNode) {
    return pos ? this.k.out(pos, ref) : bus;
  }

  // queda de tom (batida grave)
  private thump(dst: AudioNode, t: number, f0: number, f1: number, dur: number, vol: number, type: OscillatorType = 'sine') {
    const { k } = this;
    const o = k.osc(type, f0, t, dur);
    o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + dur * 0.9);
    const g = k.gain(0, dst);
    k.env(g, t, vol, 0.004, dur);
    o.connect(g);
  }

  // ruído filtrado com varredura de frequência
  private hiss(dst: AudioNode, t: number, type: BiquadFilterType, f0: number, f1: number, dur: number, vol: number, attack = 0.01, q = 0.8) {
    const { k } = this;
    const s = k.noiseSrc(t, dur);
    const f = k.filter(type, f0, q);
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = k.gain(0, dst);
    k.env(g, t, vol, attack, dur);
    s.connect(f).connect(g);
  }

  // tom com varredura
  private tone(dst: AudioNode, t: number, type: OscillatorType, f0: number, f1: number, dur: number, vol: number, attack = 0.01, cutoff = 0) {
    const { k } = this;
    const o = k.osc(type, f0, t, dur);
    o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + dur);
    const g = k.gain(0, dst);
    k.env(g, t, vol, attack, dur);
    if (cutoff) o.connect(k.filter('lowpass', cutoff, 0.8)).connect(g);
    else o.connect(g);
  }


  // coral grave: vozes (dentes de serra filtrados em faixa de vogal) que entram devagar e se sustentam
  private choir(dst: AudioNode, t: number, freqs: number[], dur: number, vol: number) {
    const { k } = this;
    for (const f of freqs) {
      for (const det of [-0.006, 0.006]) {
        const o = k.osc('sawtooth', f * (1 + det), t, dur + 0.5);
        const bp = k.filter('bandpass', 520 + (f % 7) * 40, 1.6);
        const g = k.gain(0, dst);
        k.env(g, t, vol / freqs.length, dur * 0.45, dur * 0.7);
        o.connect(bp).connect(g);
      }
    }
  }

  // metal ao longe: dente de serra com filtro que abre devagar, e eco baixo
  private brass(dst: AudioNode, t: number, f: number, dur: number, vol: number) {
    const { k } = this;
    const o = k.osc('sawtooth', f, t, dur);
    const lp = k.filter('lowpass', 300, 0.9);
    lp.frequency.setValueAtTime(260, t);
    lp.frequency.linearRampToValueAtTime(1100, t + dur * 0.35);
    lp.frequency.linearRampToValueAtTime(380, t + dur);
    const g = k.gain(0, dst);
    k.env(g, t, vol, dur * 0.3, dur * 0.85);
    o.connect(lp).connect(g);
  }


  // Motor do gerador: ronco grave e posicional, só até 25 m de distância; `mode` null = desligado (silêncio).
  // Atacado pelos Cruzados ('falha'), o motor engasga: o volume corta e volta.
  genLoop(i: number, pos: THREE.Vector3, mode: 'liga' | 'falha' | null) {
    const { k } = this;
    const dist = pos.distanceTo(k.listener);
    const active = mode !== null && dist < 25;
    let l = this.genLoops.get(i);
    const t = k.now();
    if (!active) {
      if (l) {
        l.gain.gain.setTargetAtTime(0, t, 0.25);
        const dead = l;
        this.genLoops.delete(i);
        setTimeout(() => {
          try { dead.o1.stop(); dead.o2.stop(); dead.panner.disconnect(); } catch { /* já parado */ }
        }, 1500);
      }
      return;
    }
    if (!l) {
      const panner = k.out(new THREE.Vector3(pos.x, 1.5, pos.z), 6) as PannerNode;
      const gain = k.gain(0, panner);
      const lp = k.filter('lowpass', 240, 0.9);
      lp.connect(gain);
      const o1 = k.ctx.createOscillator();
      o1.type = 'sawtooth';
      o1.frequency.value = 46 + (i % 3) * 3;
      const o2 = k.ctx.createOscillator();
      o2.type = 'square';
      o2.frequency.value = 69 + (i % 3) * 4;
      const g2 = k.gain(0.3, lp);
      o1.connect(lp);
      o2.connect(g2);
      o1.start();
      o2.start();
      l = { panner, gain, lp, o1, o2, mode: mode!, t0: t };
      this.genLoops.set(i, l);
    }
    l.mode = mode!;
    // volume cai com a distância (0 aos 25 m); na falha, cortes irregulares e o tom oscila
    const near = 1 - dist / 25;
    let v = 0.14 * near * near;
    if (mode === 'falha') {
      const s = Math.sin(t * 9) + Math.sin(t * 23.7) + Math.sin(t * 3.3);
      if (s > 1.2) v *= 0.08;
      l.o1.frequency.setTargetAtTime(38 + 10 * Math.sin(t * 5), t, 0.05);
    } else {
      l.o1.frequency.setTargetAtTime(46 + (i % 3) * 3, t, 0.2);
    }
    l.gain.gain.setTargetAtTime(v, t, 0.06);
  }

  // para os testes: motores de gerador tocando agora (gen0, gen3...) e o modo de um deles
  activeLoops(): string[] {
    return [...this.genLoops.keys()].map((i) => `gen${i}`);
  }
  loopMode(name: string): string | null {
    return this.genLoops.get(Number(name.replace('gen', '')))?.mode ?? null;
  }


  // Música do segredo (~90 s, toda sintetizada): marcha lenta em lá menor, 27 compassos de 3,33 s (72 bpm),
  // com baixo, acordes em pad, melodia de sinos e uma caixa distante. Toca no canal da música.
  readonly segredoSecs = 27 * (60 / 72) * 4;
  private segredoMusic(t0: number) {
    const { k } = this;
    const beat = 60 / 72;
    const bar = beat * 4;
    const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
    // progressão: Am, F, C, G (4 compassos); as seções variam a melodia e a densidade
    const prog = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
    const bass = [45, 41, 36, 43];
    const scale = [69, 72, 74, 76, 79, 81, 84];
    let seed = 7;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const d = k.music;
    for (let b = 0; b < 27; b++) {
      const t = t0 + b * bar;
      const chord = prog[b % 4];
      const section = Math.floor(b / 9);
      // baixo: duas notas por compasso
      this.tone(d, t, 'triangle', hz(bass[b % 4]), hz(bass[b % 4]) * 0.995, beat * 1.9, 0.16, 0.02, 400);
      if (section > 0) this.tone(d, t + beat * 2, 'triangle', hz(bass[b % 4] + 7), hz(bass[b % 4] + 7), beat * 1.8, 0.1, 0.02, 400);
      // pad do acorde
      this.pad(chord.map(hz), t, bar * 1.1, 0.05 + section * 0.01, 900);
      // melodia de sinos: 3 notas por compasso, sorteadas da escala, com pausas na primeira seção
      for (let n = 0; n < 4; n++) {
        if (section === 0 && n % 2) continue;
        if (rnd() < 0.25) continue;
        const note = scale[Math.floor(rnd() * scale.length)];
        this.bell(hz(note), t + n * beat + (section === 2 ? 0.0 : 0.02), 0.07 + section * 0.02, 1.6);
      }
      // caixa distante no 2 e no 4 a partir da segunda seção
      if (section > 0) {
        for (const q of [1, 3]) this.thump(d, t + q * beat, 140, 80, 0.12, 0.2, 'triangle');
      }
    }
    // final: acorde longo de lá maior que se apaga
    this.pad([hz(45), hz(57), hz(61), hz(64)], t0 + 26 * bar + bar * 0.5, bar * 1.6, 0.07, 700);
  }

  // pancada metálica: parciais inarmônicas
  private clang(dst: AudioNode, t: number, base: number, vol: number, decay = 0.9) {
    const { k } = this;
    for (const [m, v] of [[1, 1], [2.76, 0.6], [5.4, 0.35], [8.9, 0.2]] as [number, number][]) {
      const o = k.osc('sine', base * m, t, decay);
      const g = k.gain(0, dst);
      k.env(g, t, vol * v, 0.002, decay / m ** 0.3);
      o.connect(g);
    }
    this.hiss(dst, t, 'highpass', 2500, 5000, 0.08, vol * 0.8, 0.001);
  }

  // roncos de motor a diesel: pulsos graves (cilindros) com uma onda serrada
  private diesel(dst: AudioNode, t: number, dur: number, f0: number, f1: number, vol: number) {
    const { k } = this;
    const o = k.osc('sawtooth', f0, t, dur);
    o.frequency.linearRampToValueAtTime(f1, t + dur);
    const lp = k.filter('lowpass', 220, 1.2);
    const mod = k.ctx.createGain();
    mod.gain.value = 0.5;
    const lfo = k.osc('square', f0 * 0.5, t, dur);
    lfo.frequency.linearRampToValueAtTime(f1 * 0.5, t + dur);
    const lg = k.ctx.createGain();
    lg.gain.value = 0.5;
    lfo.connect(lg).connect(mod.gain);
    const g = k.gain(0, dst);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + Math.min(0.3, dur * 0.2));
    g.gain.setValueAtTime(vol, t + dur * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp).connect(mod).connect(g);
  }

  // ---------- passo na lama ----------

  mudStep(loud = 1) {
    const { k } = this;
    const t = k.now();
    const s = k.noiseSrc(t, 0.2);
    const f = k.filter('lowpass', R(380, 560), 1.4);
    f.frequency.setValueAtTime(R(480, 620), t);
    f.frequency.exponentialRampToValueAtTime(180, t + 0.16);
    const g = k.gain(0, k.sfx);
    k.env(g, t, R(0.13, 0.19) * loud, 0.006, 0.17);
    s.connect(f).connect(g);
    // "chup": o pé descolando da lama
    this.thump(k.sfx, t + R(0.1, 0.14), 190, 90, 0.08, 0.05 * loud);
    this.hiss(k.sfx, t + 0.09, 'bandpass', 700, 1500, 0.07, 0.04 * loud, 0.01, 2);
  }

  // ---------- ambiente ----------

  setWeather(w: Weather4) {
    this.weather = w;
    this.applyWeather();
  }

  private loopNoise(): AudioBufferSourceNode {
    const s = this.k.ctx.createBufferSource();
    s.buffer = this.k.noiseBuffer;
    s.loop = true;
    s.start();
    return s;
  }

  private applyWeather() {
    const { k } = this;
    const t = k.now();
    if (this.weather === 'chuva') {
      if (!this.rain) {
        const src = this.loopNoise();
        const hp = k.filter('highpass', 900, 0.6);
        const lp = k.filter('lowpass', 7000, 0.6);
        const gain = k.gain(0, k.amb);
        src.connect(hp).connect(lp).connect(gain);
        this.rain = { src, gain, lp };
      }
      this.rain.gain.gain.setTargetAtTime(0.28, t, 1.2);
    } else if (this.rain) {
      const r = this.rain;
      r.gain.gain.setTargetAtTime(0, t, 0.8);
      this.rain = null;
      setTimeout(() => r.src.stop(), 4000);
    }
    if (this.wind) this.wind.gain.gain.setTargetAtTime(this.weather === 'neve' ? 0.2 : this.weather === 'chuva' ? 0.1 : 0.07, t, 1.5);
  }

  startAmbient() {
    if (this.ambient) return;
    this.ambient = true;
    const { k } = this;
    const src = this.loopNoise();
    const bp = k.filter('bandpass', 260, 0.5);
    const gain = k.gain(0, k.amb);
    // vento: faixa estreita com a frequência balançando devagar
    const lfo = k.ctx.createOscillator();
    lfo.frequency.value = 0.11;
    const lg = k.ctx.createGain();
    lg.gain.value = 120;
    lfo.connect(lg).connect(bp.frequency);
    lfo.start();
    src.connect(bp).connect(gain);
    this.wind = { src, gain };
    this.applyWeather();
    this.drumT = R(4, 10);
  }

  stopAmbient() {
    this.ambient = false;
    if (this.wind) {
      this.wind.gain.gain.setTargetAtTime(0, this.k.now(), 0.5);
      const w = this.wind;
      setTimeout(() => w.src.stop(), 3000);
      this.wind = null;
    }
    if (this.rain) {
      this.rain.gain.gain.setTargetAtTime(0, this.k.now(), 0.5);
      const r = this.rain;
      setTimeout(() => r.src.stop(), 3000);
      this.rain = null;
    }
  }

  // tambor de guerra distante, de tempos em tempos (a artilharia ao longe e os trovões vêm do SkyFx, com o clarão)
  update(dt: number) {
    if (!this.ambient) return;
    this.drumT -= dt;
    if (this.drumT <= 0) {
      this.drumT = R(14, 28);
      this.distantDrum();
    }
  }

  // tambor de guerra distante: batidas graves abafadas
  private distantDrum() {
    const { k } = this;
    const t = k.now() + 0.05;
    const n = 3 + Math.floor(Math.random() * 3);
    const lp = k.filter('lowpass', 200, 0.7);
    lp.connect(k.amb);
    for (let i = 0; i < n; i++) this.thump(lp, t + i * 0.55, 90, 45, 0.5, 0.35);
  }

  // ---------- sons ----------

  play(name: TrSound, pos?: THREE.Vector3, vol = 1) {
    const { k } = this;
    const now = performance.now();
    const gap = name === 'gelo-raio' ? 120 : name === 'passo-colosso' ? 80 : 30;
    if (now - (this.lastT.get(name) ?? -1e9) < gap) return;
    this.lastT.set(name, now);
    const t = k.now() + 0.005;
    vol *= TRIM[name] ?? 1;
    // todo som passa por um ganho próprio para o volume geral
    const wrap = (ref: number, bus: AudioNode = k.sfx) => (vol === 1 ? this.dest(pos, ref, bus) : k.gain(vol, this.dest(pos, ref, bus)));
    switch (name) {
      case 'gerador-liga': {
        const d = wrap(10);
        // tentativas de partida e o motor pegando
        for (let i = 0; i < 4; i++) this.thump(d, t + i * 0.28, 120, 60, 0.2, 0.5, 'triangle');
        this.diesel(d, t + 1.0, 3.2, 28, 46, 0.55);
        this.tone(d, t + 1.4, 'sawtooth', 60, 120, 2.6, 0.12, 0.6, 700);
        for (let i = 0; i < 6; i++) k.click(R(2000, 5000), 6, 0.04, 0.35, 2.6 + i * 0.1, pos);
        break;
      }
      case 'gerador-perde': {
        const d = wrap(10);
        this.tone(d, t, 'sawtooth', 110, 24, 1.8, 0.5, 0.02, 500);
        this.clang(d, t + 0.1, 190, 0.5);
        this.thump(d, t + 0.2, 80, 25, 1.2, 0.8);
        break;
      }
      case 'gerador-captura': {
        const d = wrap(6);
        this.clang(d, t, 330, 0.3, 0.5);
        this.diesel(d, t + 0.1, 0.8, 30, 38, 0.3);
        break;
      }
      case 'alarme': {
        // sirene de dois tons
        const d = wrap(25, k.sfx);
        for (let i = 0; i < 6; i++) {
          this.tone(d, t + i * 0.55, 'sawtooth', i % 2 ? 520 : 390, i % 2 ? 520 : 390, 0.5, 0.2, 0.03, 1800);
        }
        break;
      }
      case 'forja-sobe': {
        const d = wrap(25);
        this.tone(d, t, 'sawtooth', 32, 55, 6, 0.55, 0.8, 200);
        this.hiss(d, t, 'lowpass', 600, 120, 6.2, 0.5, 0.5, 1);
        for (let i = 0; i < 12; i++) this.thump(d, t + i * 0.5, R(70, 120), 30, 0.35, 0.3);
        this.pad([55, 82.41, 110, 130.81], t + 0.5, 6, 0.07, 700);
        this.bell(220, t + 5.6, 0.25, 3.5);
        this.boom(t + 5.8, 0.8);
        break;
      }
      case 'fonte-gira': {
        const d = wrap(8);
        // roleta: tiques cada vez mais espaçados e zumbido
        let at = 0;
        for (let i = 0; i < 22; i++) {
          k.click(1900 + (i % 3) * 300, 7, 0.03, 0.3, at, pos);
          at += 0.09 + i * 0.012;
        }
        this.tone(d, t, 'triangle', 240, 520, 3.8, 0.1, 0.4, 1600);
        this.tone(d, t, 'sine', 360, 760, 3.8, 0.06, 0.4);
        break;
      }
      case 'fonte-bebida': {
        const d = wrap(5);
        for (let i = 0; i < 3; i++) this.thump(d, t + i * 0.22, 260 - i * 30, 120, 0.15, 0.3);
        [880, 1318, 1760].forEach((f, i) => this.tone(d, t + 0.1 + i * 0.1, 'sine', f, f * 1.01, 0.8, 0.07));
        break;
      }
      case 'fonte-foge': {
        const d = wrap(12);
        this.hiss(d, t, 'highpass', 5000, 1200, 0.5, 0.7, 0.002, 0.7);
        this.tone(d, t, 'sawtooth', 1800, 90, 0.7, 0.3, 0.005, 3000);
        this.thump(d, t + 0.05, 100, 30, 0.7, 0.9);
        break;
      }
      case 'cavar': {
        const d = wrap(4);
        this.hiss(d, t, 'bandpass', 1400, 500, 0.22, 0.4, 0.02, 1.5);
        this.thump(d, t + 0.18, 130, 70, 0.1, 0.25);
        break;
      }
      case 'cavar-fim': {
        const d = wrap(4);
        this.thump(d, t, 150, 50, 0.22, 0.7);
        this.hiss(d, t, 'lowpass', 1400, 300, 0.35, 0.5, 0.004);
        break;
      }
      case 'achou-peca': {
        const d = wrap(4, k.music);
        [659.25, 830.6, 987.8, 1318.5].forEach((f, i) => this.tone(d, t + i * 0.07, 'triangle', f, f, 0.5, 0.12, 0.005));
        break;
      }
      case 'bancada': {
        const d = wrap(5);
        for (let i = 0; i < 3; i++) {
          this.clang(d, t + i * 0.28, R(520, 640), 0.18, 0.35);
          this.thump(d, t + i * 0.28, 160, 80, 0.08, 0.3);
        }
        break;
      }
      case 'monta': {
        const d = wrap(6);
        for (let i = 0; i < 6; i++) this.clang(d, t + i * 0.12, R(300, 900), 0.15, 0.4);
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.bell(f, t + 0.8 + i * 0.1, 0.12, 1.6));
        break;
      }
      case 'drone-liga': {
        const d = wrap(7);
        this.tone(d, t, 'sawtooth', 90, 340, 1.4, 0.14, 0.2, 1400);
        const lfo = k.osc('square', 40, t, 1.4);
        const lg = k.ctx.createGain();
        lg.gain.value = 30;
        const o = k.osc('triangle', 220, t, 1.4);
        lfo.connect(lg).connect(o.frequency);
        const g = k.gain(0, d);
        k.env(g, t, 0.08, 0.2, 1.2);
        o.connect(g);
        this.tone(d, t + 1.2, 'sine', 880, 1320, 0.25, 0.1);
        break;
      }
      case 'escudo-pega': {
        const d = wrap(4);
        this.clang(d, t, 240, 0.4, 0.7);
        this.hiss(d, t, 'lowpass', 2000, 400, 0.15, 0.3);
        break;
      }
      case 'tanque-motor': {
        const d = wrap(14);
        this.diesel(d, t, 2.5, 26, 34, 0.6);
        this.hiss(d, t, 'lowpass', 400, 200, 2.5, 0.12, 0.3);
        break;
      }
      case 'tanque-chamado': {
        const d = wrap(14);
        this.clang(d, t, 140, 0.6, 0.6);
        this.thump(d, t, 100, 40, 0.3, 0.7);
        this.diesel(d, t + 0.4, 2.5, 22, 34, 0.55);
        this.hiss(d, t + 0.6, 'lowpass', 1500, 250, 1.6, 0.25, 0.1);
        break;
      }
      case 'tanque-fogo': {
        const d = wrap(10);
        this.hiss(d, t, 'bandpass', 900, 500, 1.2, 0.7, 0.05, 0.5);
        this.hiss(d, t, 'lowpass', 2600, 700, 1.0, 0.4, 0.03, 0.7);
        this.thump(d, t, 80, 40, 0.3, 0.5);
        break;
      }
      case 'buzina-colosso': {
        // buzina de navio, muito grave, dois tons
        const d = wrap(60);
        for (const [f, v] of [[55, 0.9], [82.5, 0.6], [110, 0.35]] as [number, number][]) {
          const o = k.osc('sawtooth', f, t, 3.2);
          o.frequency.linearRampToValueAtTime(f * 0.94, t + 3);
          const lp = k.filter('lowpass', 420, 0.9);
          const g = k.gain(0, d);
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(v, t + 0.25);
          g.gain.setValueAtTime(v, t + 2.2);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
          o.connect(lp).connect(g);
        }
        break;
      }
      case 'pisada-colosso': {
        const d = wrap(40);
        this.thump(d, t, 62, 20, 1.8, 1.3);
        this.thump(d, t, 110, 30, 0.9, 0.7, 'triangle');
        this.hiss(d, t, 'lowpass', 900, 80, 1.8, 0.9, 0.003);
        for (let i = 0; i < 5; i++) this.thump(d, t + 0.3 + i * 0.16, R(50, 80), 25, 0.5, 0.3);
        break;
      }
      case 'passo-colosso': {
        const d = wrap(35);
        this.thump(d, t, 50, 24, 0.8, 0.5);
        this.clang(d, t, 85, 0.25, 1.2);
        break;
      }
      case 'blindado-chega': {
        const d = wrap(25);
        // mochila-foguete descendo: chiado que cai e pancada do pouso
        this.hiss(d, t, 'bandpass', 3200, 500, 1.8, 0.8, 0.05, 0.6);
        this.tone(d, t, 'sawtooth', 160, 50, 1.8, 0.2, 0.05, 700);
        this.thump(d, t + 1.7, 70, 22, 0.9, 1.1);
        this.clang(d, t + 1.7, 120, 0.6, 1.2);
        break;
      }
      case 'blindado-fogo': {
        const d = wrap(12);
        this.hiss(d, t, 'bandpass', 1100, 600, 1.0, 0.6, 0.05, 0.5);
        this.hiss(d, t, 'lowpass', 3000, 900, 0.9, 0.3, 0.04);
        this.thump(d, t, 90, 50, 0.25, 0.4);
        break;
      }
      case 'blindado-garra': {
        const d = wrap(12);
        for (let i = 0; i < 8; i++) k.click(R(2200, 4200), 5, 0.035, 0.3, i * 0.035, pos);
        this.clang(d, t + 0.3, 200, 0.5, 0.8);
        this.hiss(d, t, 'bandpass', 800, 2800, 0.35, 0.3, 0.03, 1);
        break;
      }
      case 'blindado-salto': {
        const d = wrap(18);
        this.hiss(d, t, 'bandpass', 700, 3500, 0.5, 0.8, 0.01, 0.6);
        this.thump(d, t, 100, 40, 0.4, 0.8);
        this.hiss(d, t + 0.1, 'lowpass', 2500, 300, 1.3, 0.5, 0.05);
        break;
      }
      case 'cruzado-grito': {
        if (!pos) break;
        const f = R(130, 180);
        k.voice(pos, f, f * 0.6, R(0.7, 1.1), 0.7 * vol, 1.1);
        this.clang(this.k.out(pos, 4), t, R(400, 520), 0.1, 0.4);
        break;
      }
      case 'portal-musica': {
        // disco no gramofone: chiado de agulha e uma melodia lenta de caixa de música desafinada, 6 s
        const d = wrap(18, k.music);
        const s = k.noiseSrc(t, 6);
        const hp = k.filter('highpass', 3500, 0.6);
        const sg = k.gain(0, d);
        sg.gain.setValueAtTime(0.0001, t);
        sg.gain.linearRampToValueAtTime(0.06, t + 0.3);
        sg.gain.setValueAtTime(0.06, t + 5.4);
        sg.gain.exponentialRampToValueAtTime(0.0001, t + 6);
        s.connect(hp).connect(sg);
        const notes = [392, 466.16, 523.25, 466.16, 392, 349.23, 392, 311.13, 349.23, 392, 523.25, 466.16];
        notes.forEach((f, i) => {
          const tt = t + 0.3 + i * 0.46;
          const o = k.osc('square', f * (1 + R(-0.004, 0.004)), tt, 0.8);
          const lp = k.filter('lowpass', 1500, 1);
          const g = k.gain(0, d);
          k.env(g, tt, 0.07, 0.01, 0.7);
          o.connect(lp).connect(g);
          const o2 = k.osc('sine', f * 2, tt, 0.6);
          const g2 = k.gain(0, d);
          k.env(g2, tt, 0.05, 0.005, 0.5);
          o2.connect(g2);
        });
        this.pad([98, 146.83], t + 0.2, 5.6, 0.05, 500);
        break;
      }
      case 'portal-abre': {
        const d = wrap(25);
        // a laje de pedra afunda
        this.tone(d, t, 'sawtooth', 48, 24, 2.2, 0.55, 0.1, 260);
        this.hiss(d, t, 'lowpass', 700, 120, 2.2, 0.6, 0.1);
        this.thump(d, t + 1.8, 60, 22, 1, 1.0);
        this.hiss(d, t + 1.7, 'bandpass', 500, 4000, 1.5, 0.3, 0.3, 0.6);
        break;
      }
      case 'teleporte': {
        const d = wrap(10);
        this.tone(d, t, 'sine', 140, 1800, 0.5, 0.3, 0.02);
        this.hiss(d, t, 'highpass', 800, 8000, 0.45, 0.5, 0.01);
        this.thump(d, t + 0.4, 70, 28, 1.1, 0.9);
        this.tone(d, t + 0.4, 'sine', 1400, 300, 0.9, 0.12, 0.01);
        break;
      }
      case 'cristal': {
        const d = wrap(6, k.music);
        [1568, 2093, 2637, 3136].forEach((f, i) => this.tone(d, t + i * 0.06, 'sine', f, f * 0.998, 1.4, 0.07, 0.003));
        this.hiss(d, t, 'highpass', 6000, 9000, 0.3, 0.15, 0.002);
        break;
      }
      case 'cajado-monta': {
        const d = wrap(6, k.music);
        for (let i = 0; i < 4; i++) this.clang(d, t + i * 0.15, R(300, 600), 0.14, 0.5);
        this.pad([110, 164.81, 220], t + 0.4, 2.4, 0.08, 800);
        [392, 523.25, 659.25, 784].forEach((f, i) => this.bell(f, t + 0.8 + i * 0.12, 0.14, 2));
        break;
      }
      case 'cajado-desperto': {
        const d = wrap(15, k.music);
        this.pad([65.41, 98, 130.81, 196], t, 4.2, 0.12, 900);
        this.pad([261.63, 329.63, 392], t + 0.3, 4, 0.06, 1400);
        [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => this.bell(f, t + 0.5 + i * 0.14, 0.14, 3));
        this.boom(t + 0.3, 0.7);
        this.hiss(d, t, 'bandpass', 400, 4000, 1.4, 0.2, 0.5, 0.6);
        break;
      }
      case 'alvo-ok': {
        wrap(8, k.music);
        this.bell(1046.5, t, 0.2, 1.4);
        this.bell(1568, t + 0.09, 0.14, 1.2);
        break;
      }
      case 'alvo-erro': {
        const d = wrap(8);
        this.tone(d, t, 'square', 140, 90, 0.35, 0.18, 0.005, 700);
        break;
      }
      case 'tabua': {
        const d = wrap(8);
        this.tone(d, t, 'sawtooth', 70, 40, 1.0, 0.3, 0.05, 250);
        this.hiss(d, t, 'lowpass', 1000, 200, 0.9, 0.4);
        this.bell(293.66, t + 0.7, 0.18, 3);
        break;
      }
      case 'desafio': {
        
        [392, 523.25, 659.25, 783.99].forEach((f, i) => this.bell(f, t + i * 0.12, 0.18, 2));
        this.boom(t, 0.4);
        break;
      }
      case 'artilharia-lanca': {
        const d = wrap(4);
        this.thump(d, t, 140, 50, 0.2, 0.7);
        this.hiss(d, t, 'bandpass', 1800, 500, 0.25, 0.4, 0.002);
        break;
      }
      case 'artilharia-apito': {
        // assobio descendo de um obus caindo
        const d = wrap(30);
        this.tone(d, t, 'sine', 2400, 500, 1.4, 0.14, 0.05);
        this.hiss(d, t, 'bandpass', 3200, 700, 1.4, 0.2, 0.1, 4);
        break;
      }
      case 'artilharia-bomba': {
        const d = wrap(20);
        this.thump(d, t, 85, 22, 1.5, 1.4);
        this.hiss(d, t, 'lowpass', 1800, 120, 1.4, 1.0, 0.002);
        this.hiss(d, t, 'highpass', 2500, 800, 0.2, 0.7, 0.001);
        for (let i = 0; i < 4; i++) k.click(R(1500, 4000), 3, 0.05, 0.3, 0.2 + i * 0.12, pos);
        break;
      }
      case 'sangue-morto': {
        const d = wrap(5);
        // batimento duplo e um sussurro gutural
        for (const dd of [0, 0.32, 0.9, 1.22]) this.thump(d, t + dd, 70, 38, 0.18, 0.7);
        this.hiss(d, t, 'bandpass', 300, 160, 1.6, 0.25, 0.3, 3);
        this.tone(d, t, 'sawtooth', 70, 50, 1.6, 0.08, 0.4, 260);
        break;
      }
      case 'missao-passo': {
        
        const t0 = k.now() + 0.05;
        this.pad([73.42, 110, 146.83], t0, 3.4, 0.09, 700);
        [587.33, 698.46, 880].forEach((f, i) => this.bell(f, t0 + 0.2 + i * 0.3, 0.2, 2.4));
        this.boom(t0, 0.6);
        break;
      }
      case 'missao-fim': {
        const t0 = k.now() + 0.05;
        this.pad([55, 82.41, 110, 164.81], t0, 8, 0.12, 900);
        this.pad([220, 277.18, 329.63], t0 + 1, 7, 0.08, 1400);
        [880, 1108.7, 1318.5, 1760, 2093].forEach((f, i) => this.bell(f, t0 + 0.6 + i * 0.35, 0.18, 4));
        this.boom(t0, 1);
        this.boom(t0 + 2.4, 0.7);
        break;
      }
      case 'fogo-bola': {
        const d = wrap(8);
        this.hiss(d, t, 'bandpass', 700, 2200, 0.5, 0.5, 0.01, 0.6);
        this.thump(d, t, 120, 50, 0.25, 0.6);
        this.hiss(d, t + 0.05, 'highpass', 3000, 1500, 0.15, 0.2);
        break;
      }
      case 'fogo-pilar': {
        const d = wrap(18);
        this.thump(d, t, 70, 28, 0.9, 1.0);
        this.hiss(d, t, 'lowpass', 1800, 300, 5, 0.6, 0.2, 0.7);
        this.tone(d, t, 'sawtooth', 50, 42, 5, 0.25, 0.4, 260);
        break;
      }
      case 'gelo-raio': {
        const d = wrap(6);
        this.hiss(d, t, 'highpass', 4500, 7500, 0.14, 0.18, 0.005, 1.4);
        this.tone(d, t, 'triangle', 1600 + R(0, 200), 2400, 0.12, 0.05, 0.005);
        break;
      }
      case 'gelo-quebra': {
        const d = wrap(8);
        for (let i = 0; i < 8; i++) k.click(R(3000, 8000), 4, 0.05, 0.35, i * 0.018, pos);
        this.hiss(d, t, 'highpass', 5000, 3000, 0.3, 0.4, 0.001);
        this.tone(d, t, 'sine', 2800, 1900, 0.2, 0.08);
        break;
      }
      case 'nevasca': {
        const d = wrap(25);
        this.hiss(d, t, 'bandpass', 500, 1600, 3, 0.55, 1.0, 0.7);
        this.hiss(d, t + 1.8, 'bandpass', 1800, 450, 3, 0.45, 0.8, 0.7);
        this.tone(d, t, 'sine', 330, 250, 4, 0.05, 1.2);
        break;
      }
      case 'redemoinho': {
        const d = wrap(18);
        this.hiss(d, t, 'bandpass', 400, 1900, 2.5, 0.5, 0.5, 1.6);
        this.hiss(d, t + 1.5, 'bandpass', 1900, 350, 3.5, 0.5, 0.5, 1.6);
        this.thump(d, t, 60, 30, 2, 0.5);
        break;
      }
      case 'raio-bola': {
        const d = wrap(14);
        const o = k.osc('sawtooth', 110, t, 4);
        const m = k.osc('square', 55, t, 4);
        const mg = k.ctx.createGain();
        mg.gain.value = 70;
        m.connect(mg).connect(o.frequency);
        const bp = k.filter('bandpass', 700, 2);
        const g = k.gain(0, d);
        k.env(g, t, 0.35, 0.1, 3.8);
        o.connect(bp).connect(g);
        for (let i = 0; i < 12; i++) k.click(R(3000, 6500), 5, 0.05, 0.25, i * 0.3 + R(0, 0.2), pos);
        break;
      }
      case 'vinheta-inicio': {
        // tambor de guerra (4 batidas que apertam), coral grave que sobe e dois metais distantes
        const d = k.music;
        [0, 0.6, 1.15, 1.6].forEach((dt, i) => {
          this.thump(d, t + dt, 105, 48, 0.5, 0.75 - i * 0.04, 'sine');
          this.hiss(d, t + dt, 'lowpass', 600, 120, 0.22, 0.28, 0.004);
        });
        this.thump(d, t + 2.1, 90, 34, 1.6, 0.95);
        this.choir(d, t + 0.9, [98, 146.8, 196, 247], 4.2, 0.2);
        this.pad([49, 73.4], t + 0.4, 5, 0.06, 500);
        this.brass(this.dest(undefined, 6, k.music), t + 2.2, 196, 2.4, 0.07);
        this.brass(this.dest(undefined, 6, k.music), t + 3.0, 246.9, 2.2, 0.06);
        break;
      }
      case 'vinheta-fim': {
        // dois tambores lentos, coral que cai para o acorde grave e o sino de uma igreja distante
        const d = k.music;
        [0, 0.9].forEach((dt) => this.thump(d, t + dt, 95, 40, 0.8, 0.4));
        this.choir(d, t + 0.4, [87.3, 130.8, 174.6, 207.7], 4.6, 0.1);
        this.pad([43.65, 65.4], t + 0.6, 5.5, 0.035, 450);
        this.bell(392, t + 1.6, 0.09, 3.4);
        this.bell(293.7, t + 3.1, 0.07, 3.6);
        break;
      }
      case 'vinheta-blindado': {
        // começo mais pesado: tambor duplo, estrondo, marteladas de aço e metais descendo
        const d = k.music;
        [0, 0.38, 0.76, 1.14, 1.52].forEach((dt, i) => this.thump(d, t + dt, 120 - i * 6, 42, 0.5, 0.78));
        this.boom(t + 1.9, 0.8);
        this.clang(d, t + 0.2, 180, 0.4, 1.3);
        this.clang(d, t + 0.95, 150, 0.4, 1.3);
        this.choir(d, t + 0.6, [65.4, 98, 130.8, 164.8], 4.6, 0.19);
        this.pad([41.2, 61.7], t + 0.3, 5.5, 0.08, 420);
        this.brass(d, t + 1.8, 220, 2.6, 0.085);
        this.brass(d, t + 2.5, 174.6, 2.4, 0.085);
        this.brass(d, t + 3.2, 146.8, 2.4, 0.085);
        break;
      }
      case 'passo-distante': {
        // pisada de um colosso longe: só o grave, abafado, com um eco que demora
        const d = wrap(200, k.sfx);
        const lp = k.filter('lowpass', 150, 0.7);
        lp.connect(d);
        this.thump(lp, t, 58, 24, 1.1, 0.9);
        this.thump(lp, t + 0.7, 46, 22, 1.0, 0.25);
        this.hiss(lp, t, 'lowpass', 220, 60, 0.9, 0.3, 0.02);
        break;
      }
      case 'rangido-colosso': {
        // aço rangendo: tom que desliza com trepidação e ruído fino
        const d = wrap(30);
        this.tone(d, t, 'sawtooth', 220, 150, 1.1, 0.12, 0.05, 700);
        this.tone(d, t + 0.1, 'square', 331, 210, 0.9, 0.06, 0.05, 500);
        this.hiss(d, t, 'bandpass', 1400, 600, 1.0, 0.1, 0.1, 3);
        break;
      }
      case 'cantil-1':
      case 'cantil-2':
      case 'cantil-3': {
        // lata batendo na lata: dois tinidos de metal e um sino curto, cada cantil num tom
        const base = name === 'cantil-1' ? 523.25 : name === 'cantil-2' ? 659.25 : 783.99;
        const d = wrap(10);
        this.clang(d, t, base * 2, 0.4, 0.5);
        this.clang(d, t + 0.13, base * 3.01, 0.25, 0.4);
        this.bell(base, t + 0.05, 0.28, 1.8);
        break;
      }
      case 'segredo-musica':
        this.segredoMusic(t);
        break;
      case 'radio': {
        // chiado de rádio de campanha: ruído em faixa estreita, bipes e a voz abafada que some
        const d = wrap(8);
        this.hiss(d, t, 'bandpass', 1800, 900, 1.4, 0.35, 0.02, 1.4);
        this.tone(d, t + 0.05, 'square', 880, 880, 0.08, 0.07, 0.005, 2200);
        this.tone(d, t + 0.2, 'square', 1175, 1175, 0.08, 0.07, 0.005, 2200);
        this.hiss(d, t + 0.5, 'bandpass', 1200, 700, 1.6, 0.12, 0.2, 2);
        break;
      }
      case 'trovao': {
        const d = wrap(60);
        this.hiss(d, t, 'lowpass', 1500, 90, 3.2, 1.0, 0.03, 0.8);
        this.thump(d, t + 0.1, 70, 24, 2.4, 1.0);
        this.hiss(d, t, 'highpass', 3000, 800, 0.12, 0.8, 0.001);
        break;
      }
      case 'artilharia-longe': {
        // estrondo abafado vindo de longe, com eco
        const d = wrap(120, k.sfx);
        const lp = k.filter('lowpass', 260, 0.8);
        lp.connect(d);
        this.thump(lp, t, 70, 28, 1.4, 0.9);
        this.hiss(lp, t, 'lowpass', 500, 80, 1.8, 0.7, 0.01);
        this.thump(lp, t + 0.9, 60, 26, 1.2, 0.35);
        this.thump(lp, t + 2.1, 55, 24, 1.2, 0.18);
        break;
      }
    }
  }
}
