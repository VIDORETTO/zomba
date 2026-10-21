import type * as THREE from 'three';
import type { MapDef, TrincheiraData } from '../../shared/map/types';
import type { TrincheiraSnap } from '../../shared/protocol';
import type { QualityConfig } from '../quality';
import type { Sample } from '../snapbuffer';
import type { TexSet } from '../textures';
import type { Snd } from './common';
import type { TrFx } from './trFx';

// O que as telas da Trincheira compartilham: cena, mapa, efeitos, som e avisos.
export interface TrCtx {
  scene: THREE.Scene;
  map: MapDef;
  T: TrincheiraData;
  tex: TexSet;
  q: QualityConfig;
  fx: TrFx;
  snd: Snd;
  // aviso no canto da tela
  notify(html: string): void;
  // tremor de câmera (0..1.5); o game.ts lê e zera `quake`
  quake(v: number): void;
  // clarão branco na tela (teletransporte)
  flash(): void;
  // posição do jogador local
  me(): { id: string; x: number; y: number; z: number } | null;
}

export interface Pair {
  a: TrincheiraSnap;
  b: TrincheiraSnap;
  k: number;
}

// par interpolável (a, b, k) do bloco tr de uma amostra
export function pairOf(sample: Sample | null, snap: TrincheiraSnap): Pair {
  const a = sample?.a.s.tr;
  const b = sample?.b.s.tr;
  if (!sample || !a || !b) return { a: snap, b: snap, k: 0 };
  return { a, b, k: sample.k };
}
