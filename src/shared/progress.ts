// Progressão: rodada inicial, experiência (XP), níveis, patentes e banco.

export const MAX_START_ROUND = 100;

// Pontos para começar na rodada R: dá para abrir o mapa, girar a caixa, beber e forjar.
export function startPoints(round: number): number {
  const r = Math.max(1, Math.min(MAX_START_ROUND, Math.floor(round))) - 1;
  return 500 + 1200 * r + 40 * r * r;
}

export interface MatchStats {
  kills: number;
  headshots: number;
  revives: number;
  startRound: number;
  // última rodada alcançada (a rodada em que o jogo acabou)
  round: number;
}

export const XP = {
  kill: 10,
  headshot: 25,
  revive: 100,
  perRound: 50,
};

// XP de uma partida: abates, tiros na cabeça, reanimações e 50 x número de cada rodada sobrevivida.
export function matchXp(s: MatchStats): number {
  let rounds = 0;
  for (let r = s.startRound; r < s.round; r++) rounds += XP.perRound * r;
  return s.kills * XP.kill + s.headshots * XP.headshot + s.revives * XP.revive + rounds;
}

export const MAX_LEVEL = 60;

// XP para passar do nível n para o n+1 (começa em 2000 e cresce 20% por nível).
export function xpForLevel(n: number): number {
  return Math.round(2000 * Math.pow(1.2, n - 1));
}

export interface LevelInfo {
  level: number;
  into: number;
  need: number;
}

export function levelFromXp(xp: number): LevelInfo {
  let level = 1;
  let left = Math.max(0, Math.floor(xp));
  while (level < MAX_LEVEL && left >= xpForLevel(level)) {
    left -= xpForLevel(level);
    level++;
  }
  return { level, into: left, need: level >= MAX_LEVEL ? 0 : xpForLevel(level) };
}

export type Patente = 'osso' | 'ossos' | 'caveira' | 'faca' | 'escopetas' | 'lenda';
export type Tier = 'ferro' | 'bronze' | 'prata' | 'ouro' | 'brilho';

export const PATENTES: { id: Patente; name: string }[] = [
  { id: 'osso', name: 'Osso' },
  { id: 'ossos', name: 'Ossos cruzados' },
  { id: 'caveira', name: 'Caveira' },
  { id: 'faca', name: 'Caveira com faca' },
  { id: 'escopetas', name: 'Caveira e escopetas' },
  { id: 'lenda', name: 'Lenda' },
];

export const TIERS: Tier[] = ['ferro', 'bronze', 'prata', 'ouro', 'brilho'];

// Patente a cada 10 níveis; dentro dela, o material muda a cada 2 níveis.
export function rankOf(level: number): { patente: Patente; name: string; tier: Tier } {
  const l = Math.max(1, Math.min(MAX_LEVEL, level));
  const p = PATENTES[Math.floor((l - 1) / 10)];
  const tier = TIERS[Math.floor(((l - 1) % 10) / 2)];
  return { patente: p.id, name: p.name, tier };
}

export const BANK = {
  step: 1000,
  fee: 100,
  limit: 250000,
};
