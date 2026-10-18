import { BANK, levelFromXp, matchXp, type LevelInfo } from '../shared/progress';

// Perfil do jogador guardado no navegador (localStorage), separado por nome.
// Guarda XP, saldo do banco, estatísticas gerais e os melhores recordes deste computador.

export interface Stats {
  games: number;
  kills: number;
  headshots: number;
  downs: number;
  revives: number;
  earned: number;
  seconds: number;
  bestSolo: number;
  bestCoop: number;
  weaponKills: Record<string, number>;
}

export interface Profile {
  name: string;
  xp: number;
  bank: number;
  stats: Stats;
}

export interface Run {
  name: string;
  round: number;
  startRound: number;
  mode: 'solo' | 'coop';
  players: number;
  kills: number;
  headshots: number;
  date: string;
}

const KEY_PROFILES = 'zomba.profiles';
const KEY_RUNS = 'zomba.runs';

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    // sem armazenamento (janela anônima, por exemplo): o jogo segue sem salvar
  }
}

const emptyStats = (): Stats => ({
  games: 0, kills: 0, headshots: 0, downs: 0, revives: 0, earned: 0, seconds: 0, bestSolo: 0, bestCoop: 0, weaponKills: {},
});

const keyOf = (name: string) => name.trim().toLowerCase() || 'sobrevivente';

export function getProfile(name: string): Profile {
  const all = read<Record<string, Profile>>(KEY_PROFILES, {});
  const p = all[keyOf(name)];
  return p ? { ...p, stats: { ...emptyStats(), ...p.stats } } : { name, xp: 0, bank: 0, stats: emptyStats() };
}

export function saveProfile(p: Profile) {
  const all = read<Record<string, Profile>>(KEY_PROFILES, {});
  all[keyOf(p.name)] = p;
  write(KEY_PROFILES, all);
}

export function allProfiles(): Profile[] {
  return Object.values(read<Record<string, Profile>>(KEY_PROFILES, {})).map((p) => ({ ...p, stats: { ...emptyStats(), ...p.stats } }));
}

export function runs(): Run[] {
  return read<Run[]>(KEY_RUNS, []);
}

export function levelOf(name: string): LevelInfo {
  return levelFromXp(getProfile(name).xp);
}

// ---------- banco ----------

export function bankBalance(name: string) {
  return getProfile(name).bank;
}

export function canDeposit(name: string) {
  return getProfile(name).bank + BANK.step <= BANK.limit;
}

export function bankChange(name: string, delta: number) {
  const p = getProfile(name);
  p.bank = Math.max(0, Math.min(BANK.limit, p.bank + delta));
  saveProfile(p);
}

// ---------- fim de partida ----------

export interface MatchRecord {
  name: string;
  mode: 'solo' | 'coop';
  players: number;
  round: number;
  startRound: number;
  kills: number;
  headshots: number;
  downs: number;
  revives: number;
  earned: number;
  seconds: number;
  weaponKills: Record<string, number>;
}

export interface MatchResult {
  xp: number;
  before: LevelInfo;
  after: LevelInfo;
  record: boolean;
}

export function recordMatch(m: MatchRecord): MatchResult {
  const p = getProfile(m.name);
  const before = levelFromXp(p.xp);
  const xp = matchXp(m);
  p.xp += xp;
  const s = p.stats;
  s.games++;
  s.kills += m.kills;
  s.headshots += m.headshots;
  s.downs += m.downs;
  s.revives += m.revives;
  s.earned += m.earned;
  s.seconds += Math.round(m.seconds);
  for (const [w, n] of Object.entries(m.weaponKills)) s.weaponKills[w] = (s.weaponKills[w] ?? 0) + n;
  let record = false;
  // recorde só vale para partidas que começaram na rodada 1
  if (m.startRound === 1) {
    if (m.mode === 'solo' && m.round > s.bestSolo) {
      s.bestSolo = m.round;
      record = true;
    }
    if (m.mode === 'coop' && m.round > s.bestCoop) {
      s.bestCoop = m.round;
      record = true;
    }
  }
  saveProfile(p);
  const list = runs();
  list.push({
    name: m.name, round: m.round, startRound: m.startRound, mode: m.mode, players: m.players,
    kills: m.kills, headshots: m.headshots, date: new Date().toISOString().slice(0, 10),
  });
  list.sort((a, b) => b.round - a.round || b.kills - a.kills);
  write(KEY_RUNS, list.slice(0, 50));
  return { xp, before, after: levelFromXp(p.xp), record };
}

export function favoriteWeapon(s: Stats): string | null {
  let best: string | null = null;
  let n = 0;
  for (const [w, k] of Object.entries(s.weaponKills)) {
    if (k > n) {
      n = k;
      best = w;
    }
  }
  return best;
}
