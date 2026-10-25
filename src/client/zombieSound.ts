import * as THREE from 'three';
import type { AudioKit } from './trSound';

// Vozes e ruídos extras dos zumbis, sintetizados: rosnados, gorgolejos, gritos de quem corre, gemido de dor,
// passos arrastados e os ruídos do Rastejador (respiração rouca, raspar no chão, arranhar a parede, guincho do salto).
// Vêm somados às gravações (`z-moan`, `z-growl`, `z-attack`, `z-death`) para os zumbis não soarem todos iguais.

const R = (a: number, b: number) => a + Math.random() * (b - a);

interface Vocal {
  f0: number;
  f1: number;
  dur: number;
  vol: number;
  // ruído de garganta misturado
  rough: number;
  formants: [number, number, number][];
  wave?: OscillatorType;
  // tremor da amplitude (Hz e profundidade 0 a 1): rosnado "rolando" ou gorgolejo
  am?: number;
  amDepth?: number;
  // vibrato (Hz e fração da frequência)
  vib?: number;
  vibDepth?: number;
  attack?: number;
}

export class ZombieAudio {
  // vozes sintetizadas tocando agora (limite para não virar sopa) e passos neste instante
  private voices = 0;
  private stepWindow = 0;
  private stepCount = 0;

  constructor(private readonly k: AudioKit) {}

  private vocal(pos: THREE.Vector3 | undefined, v: Vocal) {
    if (this.voices >= 5) return;
    this.voices++;
    setTimeout(() => this.voices--, v.dur * 1000);
    const { k } = this;
    const t = k.now();
    const dst = k.out(pos, 2.2);
    const o = k.osc(v.wave ?? 'sawtooth', v.f0, t, v.dur);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, v.f1), t + v.dur);
    if (v.vib) {
      const lfo = k.osc('sine', v.vib, t, v.dur);
      const lg = k.ctx.createGain();
      lg.gain.value = v.f0 * (v.vibDepth ?? 0.05);
      lfo.connect(lg).connect(o.frequency);
    }
    const mix = k.gain(0, dst);
    const a = v.attack ?? 0.08;
    mix.gain.setValueAtTime(0.0001, t);
    mix.gain.linearRampToValueAtTime(v.vol, t + a);
    mix.gain.setValueAtTime(v.vol, t + v.dur * 0.55);
    mix.gain.exponentialRampToValueAtTime(0.0001, t + v.dur);
    // a amplitude tremendo dá o "rrrr" do rosnado e o borbulhar do gorgolejo
    let bus: AudioNode = mix;
    if (v.am) {
      const amp = k.gain(1 - (v.amDepth ?? 0.5), mix);
      const lfo = k.osc('sine', v.am, t, v.dur);
      const lg = k.ctx.createGain();
      lg.gain.value = v.amDepth ?? 0.5;
      lfo.connect(lg).connect(amp.gain);
      bus = amp;
    }
    for (const [ff, q, g] of v.formants) {
      o.connect(k.filter('bandpass', ff, q)).connect(k.gain(g, bus));
    }
    if (v.rough > 0) {
      const n = k.noiseSrc(t, v.dur);
      n.connect(k.filter('bandpass', R(900, 1700), 1.1)).connect(k.gain(v.rough, bus));
    }
  }

  // rosnado de garganta, de quem vai atacar
  snarl(pos: THREE.Vector3, pitch = 1) {
    const f = R(95, 140) * pitch;
    this.vocal(pos, {
      f0: f, f1: f * R(0.7, 0.9), dur: R(0.5, 0.85), vol: 0.55, rough: 1.0,
      formants: [[R(450, 650), 5, 1], [R(1000, 1300), 6, 0.7], [R(2300, 2700), 8, 0.28]],
      am: R(22, 32), amDepth: 0.55,
    });
  }

  // gorgolejo molhado, com som de sangue na garganta
  gurgle(pos: THREE.Vector3, pitch = 1) {
    const f = R(58, 82) * pitch;
    this.vocal(pos, {
      f0: f, f1: f * R(0.8, 1.2), dur: R(0.7, 1.2), vol: 0.6, rough: 0.7,
      formants: [[R(260, 340), 4, 1], [R(650, 800), 5, 0.55], [1500, 6, 0.15]],
      am: R(13, 19), amDepth: 0.8, attack: 0.15,
    });
  }

  // grito agudo e rasgado de quem corre
  scream(pos: THREE.Vector3, pitch = 1) {
    const f = R(400, 540) * pitch;
    this.vocal(pos, {
      f0: f, f1: f * R(0.55, 0.75), dur: R(0.55, 0.95), vol: 0.5, rough: 0.55,
      formants: [[R(850, 1000), 6, 1], [R(1700, 2000), 8, 0.8], [R(3000, 3400), 8, 0.3]],
      vib: R(6, 8.5), vibDepth: 0.045, attack: 0.05,
    });
  }

  // grunhido curto de quem levou tiro
  pain(pos: THREE.Vector3, pitch = 1) {
    const f = R(170, 250) * pitch;
    this.vocal(pos, {
      f0: f, f1: f * 0.6, dur: R(0.18, 0.32), vol: 0.6, rough: 0.5,
      formants: [[R(500, 700), 5, 1], [R(1200, 1600), 6, 0.6]], attack: 0.02,
    });
  }

  // gemido longo de longe (a distância é o `pos`; o ar abafa o brilho)
  wail(pos: THREE.Vector3, pitch = 1) {
    const f = R(110, 170) * pitch;
    this.vocal(pos, {
      f0: f, f1: f * R(0.6, 0.85), dur: R(1.4, 2.4), vol: 0.9, rough: 0.35,
      formants: [[R(400, 560), 4, 1], [R(900, 1200), 5, 0.5]], vib: R(4, 6), vibDepth: 0.03, attack: 0.4,
    });
  }

  // passo arrastado: ruído surdo e um baque fraco
  step(pos: THREE.Vector3, loud = 1) {
    const now = this.k.now();
    if (now - this.stepWindow > 0.15) {
      this.stepWindow = now;
      this.stepCount = 0;
    }
    if (++this.stepCount > 4) return;
    const { k } = this;
    const dst = k.out(pos, 2.5);
    const n = k.noiseSrc(now, 0.16);
    const lp = k.filter('lowpass', R(500, 900), 0.7);
    const g = k.gain(0, dst);
    k.env(g, now, 0.2 * loud, 0.015, 0.13);
    n.connect(lp).connect(g);
    const o = k.osc('sine', R(60, 85), now, 0.1);
    o.frequency.exponentialRampToValueAtTime(40, now + 0.09);
    const og = k.gain(0, dst);
    k.env(og, now, 0.22 * loud, 0.005, 0.08);
    o.connect(og);
  }

  // Rastejador: respiração rouca (puxa e solta o ar) com um fio de voz
  rasp(pos: THREE.Vector3, pitch = 1) {
    const { k } = this;
    const t = k.now();
    const dst = k.out(pos, 2.2);
    const dur = R(0.7, 1.1);
    const n = k.noiseSrc(t, dur);
    const bp = k.filter('bandpass', R(2000, 2800), 1.6);
    const g = k.gain(0, dst);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.32, t + dur * 0.3);
    g.gain.linearRampToValueAtTime(0.06, t + dur * 0.48);
    g.gain.linearRampToValueAtTime(0.4, t + dur * 0.72);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(bp).connect(g);
    this.vocal(pos, {
      f0: R(150, 210) * pitch, f1: R(110, 150) * pitch, dur: dur * 0.5, vol: 0.18, rough: 0.2,
      formants: [[900, 5, 1], [1900, 6, 0.5]], am: 40, amDepth: 0.5,
    });
  }

  // Rastejador: o corpo raspando no chão (um arrasto curto)
  scrape(pos: THREE.Vector3) {
    const { k } = this;
    const t = k.now();
    const dst = k.out(pos, 2.5);
    const dur = R(0.25, 0.4);
    const n = k.noiseSrc(t, dur);
    const bp = k.filter('bandpass', R(1400, 2200), 0.9);
    bp.frequency.exponentialRampToValueAtTime(R(700, 1000), t + dur);
    const g = k.gain(0, dst);
    k.env(g, t, 0.22, 0.04, dur);
    n.connect(bp).connect(g);
  }

  // Rastejador subindo: unhas e dentes arranhando a parede, em rajadinha
  scrabble(pos: THREE.Vector3) {
    const { k } = this;
    const t = k.now();
    const dst = k.out(pos, 3);
    const n = R(3, 5);
    for (let i = 0; i < n; i++) {
      const at = t + i * R(0.035, 0.06);
      const src = k.noiseSrc(at, 0.05);
      const bp = k.filter('bandpass', R(2600, 4200), 3);
      const g = k.gain(0, dst);
      k.env(g, at, R(0.15, 0.3), 0.003, 0.04);
      src.connect(bp).connect(g);
    }
    k.click(R(180, 260), 1.2, 0.06, 0.2, 0, pos);
  }

  // Rastejador no ar: guincho que sobe, seco e cortante
  screech(pos: THREE.Vector3, pitch = 1) {
    const f = R(800, 950) * pitch;
    this.vocal(pos, {
      f0: f, f1: f * R(1.4, 1.7), dur: R(0.4, 0.55), vol: 0.5, rough: 0.8,
      formants: [[R(1500, 1800), 7, 1], [R(2800, 3300), 8, 0.7]], vib: 11, vibDepth: 0.04, attack: 0.03,
    });
  }

  // mordida: dentes batendo e carne molhada
  bite(pos: THREE.Vector3) {
    const { k } = this;
    const t = k.now() + 0.05;
    k.click(R(1600, 2200), 3, 0.035, 0.35, 0.05, pos);
    k.click(R(900, 1300), 2, 0.05, 0.3, 0.12, pos);
    const dst = k.out(pos, 2.5);
    const n = k.noiseSrc(t, 0.18);
    const g = k.gain(0, dst);
    k.env(g, t + 0.1, 0.18, 0.02, 0.14);
    n.connect(k.filter('lowpass', 800, 0.8)).connect(g);
  }
}
