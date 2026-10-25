import type { AudioKit } from './trSound';

// Trilha sonora de fundo, toda sintetizada e gerada na hora (nada gravado): um colchão de acordes graves e lentos,
// notas soltas de caixa de música com muito eco, uma batida surda de coração quando a coisa esquenta e, na
// rodada infernal, um zumbido de graves mais pesado. Fica baixa de propósito: é clima, não melodia para assobiar.
// O clima muda sozinho com a partida (calmo entre rodadas, tenso durante, infernal nas rodadas de cães).

export type MusicMood = 'calm' | 'tense' | 'hell';
export type MusicKey = 'cidade' | 'rota' | 'trincheira';

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const R = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

interface Theme {
  // acordes (notas MIDI) que se repetem em ciclo e a escala das notas soltas
  chords: number[][];
  scale: number[];
  // duração de cada acorde (s) por clima
  bar: Record<MusicMood, number>;
}

const THEMES: Record<MusicKey, Theme> = {
  // Lá menor: Am, F, C, Em
  cidade: {
    chords: [[45, 52, 57, 60], [41, 48, 57, 60], [48, 55, 60, 64], [40, 52, 59, 64]],
    scale: [69, 72, 74, 76, 79, 81, 84],
    bar: { calm: 22, tense: 17, hell: 13 },
  },
  // Ré menor, mais aberta e vazia (estrada na névoa): Dm, Bb, Gm, Am
  rota: {
    chords: [[38, 50, 57, 62], [46, 53, 58, 62], [43, 50, 58, 62], [45, 52, 57, 64]],
    scale: [62, 65, 67, 69, 72, 74, 77],
    bar: { calm: 26, tense: 20, hell: 14 },
  },
  // Mi frígio, sombria e pesada (1918): Em, F, Em, Dm
  trincheira: {
    chords: [[40, 47, 55, 59], [41, 48, 57, 60], [40, 47, 55, 59], [38, 45, 53, 57]],
    scale: [64, 65, 67, 71, 72, 76, 77],
    bar: { calm: 24, tense: 18, hell: 13 },
  },
};

// nível de cada camada por clima
const MIX: Record<MusicMood, { pad: number; cut: number; pluck: [number, number]; pulse: number; swell: number }> = {
  calm: { pad: 0.8, cut: 520, pluck: [5, 11], pulse: 0, swell: 0 },
  tense: { pad: 1, cut: 680, pluck: [3, 7], pulse: 0.5, swell: 0.5 },
  hell: { pad: 1.1, cut: 820, pluck: [1.8, 4], pulse: 1, swell: 1 },
};

const BASE = 0.42;

// Resposta ao impulso de um eco: ruído escurecido que some em curva (o brilho morre antes que o grave).
export function makeImpulse(ctx: AudioContext, secs: number, decay: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * secs);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const x = i / len;
      lp += (Math.random() * 2 - 1 - lp) * (0.55 - 0.45 * x);
      d[i] = lp * Math.pow(1 - x, decay) * 1.6;
    }
  }
  return buf;
}

export class Soundtrack {
  private readonly bus: GainNode;
  private readonly verb: ConvolverNode;
  private readonly verbIn: GainNode;
  private readonly theme: Theme;
  private mood: MusicMood = 'calm';
  private timer: ReturnType<typeof setInterval> | null = null;
  private chordT = 0;
  private chordI = 0;
  private pluckT = 0;
  private pulseT = 0;
  private swellT = 0;
  private lastPluck = 0;

  constructor(private readonly k: AudioKit, key: MusicKey) {
    this.theme = THEMES[key];
    this.bus = k.gain(0, k.music);
    this.bus.gain.setTargetAtTime(BASE, k.now(), 2.5);
    // eco longo e escuro, só da música (o volume da música controla tudo junto)
    this.verbIn = k.gain(0.9, this.bus);
    this.verb = k.ctx.createConvolver();
    this.verb.buffer = makeImpulse(k.ctx, 3.6, 2.4);
    const wet = k.gain(1.1, this.bus);
    this.verbIn.connect(this.verb);
    this.verb.connect(wet);
    const t = k.now();
    this.chordT = t + 0.3;
    this.pluckT = t + R(5, 9);
    this.pulseT = t + 4;
    this.swellT = t + R(10, 18);
    this.timer = setInterval(() => this.schedule(), 400);
    this.schedule();
  }

  setMood(m: MusicMood) {
    this.mood = m;
  }

  // abaixa a trilha por alguns segundos (vinheta, rugido do chefão, explosão)
  duck(secs: number, to = 0.35) {
    const t = this.k.now();
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setTargetAtTime(BASE * to, t, 0.15);
    this.bus.gain.setTargetAtTime(BASE, t + secs, 1.2);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const t = this.k.now();
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setTargetAtTime(0, t, 0.7);
    setTimeout(() => this.bus.disconnect(), 5000);
  }

  private schedule() {
    const { k } = this;
    const ahead = k.now() + 1.6;
    const mix = MIX[this.mood];
    while (this.chordT < ahead) {
      const len = this.theme.bar[this.mood];
      this.padChord(this.theme.chords[this.chordI % this.theme.chords.length], this.chordT, len, mix);
      this.chordI++;
      this.chordT += len * 0.82;
    }
    while (this.pluckT < ahead) {
      this.pluckNote(this.pluckT);
      this.pluckT += R(mix.pluck[0], mix.pluck[1]);
    }
    if (mix.pulse > 0) {
      while (this.pulseT < ahead) {
        this.heart(this.pulseT, mix.pulse);
        this.pulseT += this.mood === 'hell' ? 1.05 : 1.5;
      }
    } else {
      this.pulseT = Math.max(this.pulseT, k.now());
    }
    if (mix.swell > 0) {
      while (this.swellT < ahead) {
        this.swell(this.swellT, mix.swell);
        this.swellT += R(11, 22);
      }
    } else {
      this.swellT = Math.max(this.swellT, k.now() + 4);
    }
  }

  // colchão de acorde: cada nota são duas ondas levemente desafinadas, que sobem devagar e se fundem ao acorde seguinte
  private padChord(notes: number[], t: number, len: number, mix: (typeof MIX)[MusicMood]) {
    const { k } = this;
    const dur = len;
    const lp = k.filter('lowpass', mix.cut, 0.6);
    // o filtro respira devagar durante o acorde
    lp.frequency.setValueAtTime(mix.cut * 0.7, t);
    lp.frequency.linearRampToValueAtTime(mix.cut * 1.15, t + dur * 0.5);
    lp.frequency.linearRampToValueAtTime(mix.cut * 0.7, t + dur);
    const hp = k.filter('highpass', 70, 0.5);
    const g = k.gain(0, this.bus);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.045 * mix.pad, t + dur * 0.35);
    g.gain.setValueAtTime(0.045 * mix.pad, t + dur * 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    lp.connect(hp).connect(g);
    g.connect(this.verbIn);
    for (const n of notes) {
      for (const det of [-6, 5]) {
        const o = k.osc(n < 50 ? 'triangle' : 'sawtooth', hz(n), t, dur);
        o.detune.value = det + R(-2, 2);
        const vg = k.gain(n < 50 ? 1.2 : 0.55, lp);
        o.connect(vg);
      }
    }
  }

  // nota de caixa de música: fundamental e parciais que morrem depressa, com muito eco
  private pluckNote(t: number) {
    const chord = this.theme.chords[(this.chordI + this.theme.chords.length - 1) % this.theme.chords.length];
    const useChord = Math.random() < 0.55;
    let midi = useChord ? pick(chord) + 24 : pick(this.theme.scale);
    // não repete a nota anterior
    if (midi === this.lastPluck) midi = pick(this.theme.scale);
    this.lastPluck = midi;
    const vel = R(0.05, 0.1) * (this.mood === 'calm' ? 0.85 : 1);
    this.pluck(hz(midi), t, vel);
    // às vezes responde com uma segunda nota
    if (Math.random() < 0.35) this.pluck(hz(pick(this.theme.scale)), t + R(0.6, 1.4), vel * 0.7);
  }

  private pluck(f: number, t: number, vel: number) {
    const { k } = this;
    const dec = R(1.8, 3.2);
    const g = k.gain(0, this.verbIn);
    k.env(g, t, vel, 0.006, dec);
    const direct = k.gain(0.45, this.bus);
    g.connect(direct);
    for (const [mul, v, d] of [[1, 1, 1], [2.0, 0.28, 0.5], [3.01, 0.12, 0.3], [5.4, 0.05, 0.15]] as [number, number, number][]) {
      const o = k.osc('sine', f * mul, t, dec * d + 0.1);
      const og = k.gain(0, g);
      og.gain.setValueAtTime(v, t);
      og.gain.exponentialRampToValueAtTime(0.0001, t + dec * d);
      o.connect(og);
    }
  }

  // batida surda: dois toques de coração, bem abafados
  private heart(t: number, level: number) {
    const { k } = this;
    for (const [d, v] of [[0, 1], [0.24, 0.6]] as [number, number][]) {
      const o = k.osc('sine', 62, t + d, 0.4);
      o.frequency.exponentialRampToValueAtTime(34, t + d + 0.32);
      const g = k.gain(0, this.bus);
      k.env(g, t + d, 0.14 * level * v, 0.012, 0.3);
      o.connect(g);
    }
  }

  // sopro que sobe e some (ruído filtrado), de tempos em tempos
  private swell(t: number, level: number) {
    const { k } = this;
    const dur = R(4, 6.5);
    const n = k.noiseSrc(t, dur);
    const bp = k.filter('bandpass', 250, 1.1);
    bp.frequency.setValueAtTime(250, t);
    bp.frequency.exponentialRampToValueAtTime(R(900, 1500), t + dur * 0.85);
    const g = k.gain(0, this.bus);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05 * level, t + dur * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(bp).connect(g);
    g.connect(this.verbIn);
  }
}
