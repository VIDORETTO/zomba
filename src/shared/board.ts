import { INTERMISSION_TIME } from './constants';

// Placar online: o que o servidor guarda e devolve, e as regras para aceitar uma partida.

export type BoardMode = 'solo' | 'coop';
export type BoardStart = 'zero' | 'custom';

export interface OnlineRun {
  name: string;
  mode: BoardMode;
  map: string;
  round: number;
  startRound: number;
  players: number;
  kills: number;
  headshots: number;
  date: string;
  // registrada pelo próprio servidor (co-op); as do solo vêm do navegador do jogador
  verified: boolean;
  // missão principal da Trincheira concluída nesta partida
  missao?: boolean;
}

export interface OnlinePlayer {
  name: string;
  games: number;
  bestSolo: number;
  bestCoop: number;
  kills: number;
  headshots: number;
  revives: number;
  seconds: number;
}

// partida como o jogo manda (o servidor completa nome, data e se foi verificada)
export interface RunInput {
  mode: BoardMode;
  map: string;
  round: number;
  startRound: number;
  players: number;
  kills: number;
  headshots: number;
  downs: number;
  revives: number;
  seconds: number;
  missao?: boolean;
}

export const BOARD = {
  // senha: de 4 a 64 caracteres
  passMin: 4,
  passMax: 64,
  // quantas linhas cada consulta devolve
  top: 50,
  // envios por minuto de cada endereço
  ratePerMinute: 20,
};

export const cleanName = (n: unknown) => String(n ?? '').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 16);
export const nameKey = (n: string) => cleanName(n).toLowerCase();

const int = (v: unknown, min: number, max: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

// Confere uma partida enviada: números dentro do possível. Devolve a partida limpa ou o motivo da recusa.
export function checkRun(r: Partial<RunInput> | null | undefined, maps: string[]): RunInput | string {
  if (!r || typeof r !== 'object') return 'partida vazia';
  const mode = r.mode === 'coop' ? 'coop' : r.mode === 'solo' ? 'solo' : null;
  if (!mode) return 'modo inválido';
  if (!maps.includes(String(r.map))) return 'mapa inválido';
  const round = int(r.round, 1, 1000);
  const startRound = int(r.startRound, 1, 100);
  const players = int(r.players, 1, 4);
  const kills = int(r.kills, 0, 1e6);
  const headshots = int(r.headshots, 0, 1e6);
  const downs = int(r.downs, 0, 1e5);
  const revives = int(r.revives, 0, 1e5);
  const seconds = int(r.seconds, 0, 1e7);
  if (round === null || startRound === null || players === null || kills === null || headshots === null || downs === null || revives === null || seconds === null) return 'números inválidos';
  if (startRound > round) return 'rodada inicial maior que a final';
  if (mode === 'solo' && players !== 1) return 'partida solo com mais de um jogador';
  if (headshots > kills) return 'mais tiros na cabeça que abates';
  // cada rodada vencida tem pelo menos o intervalo entre rodadas
  if (seconds < (round - startRound) * INTERMISSION_TIME * 0.8) return 'partida rápida demais';
  // abates: no máximo uns 60 zumbis (ou cães) por rodada por jogador, com folga
  if (kills > (round - startRound + 1) * 200 * players) return 'abates demais';
  return { mode, map: String(r.map), round, startRound, players, kills, headshots, downs, revives, seconds, ...(r.missao === true && String(r.map) === 'trincheira' ? { missao: true } : {}) };
}
