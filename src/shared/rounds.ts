import { BOSS } from './constants';

// vida de um zumbi comum na rodada
export function zombieHealth(round: number): number {
  if (round < 10) return 150 + 100 * (round - 1);
  return Math.round(950 * Math.pow(1.1, round - 9));
}

// vida de um chefão: 12 x a de um zumbi da rodada x jogadores
export function bossHealth(round: number, players: number): number {
  return BOSS.healthMult * zombieHealth(round) * Math.max(1, players);
}
