import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BOARD, cleanName, nameKey, type BoardMode, type BoardStart, type OnlinePlayer, type OnlineRun, type RunInput } from '../shared/board';

// Placar online guardado num arquivo JSON no servidor: contas (nome e senha), melhor partida de cada
// jogador em cada categoria e estatísticas somadas. A senha nunca fica guardada, só o resumo dela (scrypt).

interface Account {
  name: string;
  salt: string;
  hash: string;
  created: string;
}

interface Data {
  secret: string;
  accounts: Record<string, Account>;
  runs: OnlineRun[];
  players: Record<string, OnlinePlayer>;
}

const hashPass = (pass: string, salt: string) => scryptSync(pass, salt, 32).toString('hex');

export class Board {
  private data: Data;
  private readonly file: string;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(dir: string) {
    mkdirSync(dir, { recursive: true });
    this.file = join(dir, 'placar.json');
    let d: Partial<Data> = {};
    if (existsSync(this.file)) {
      try {
        d = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<Data>;
      } catch (err) {
        console.error('[placar] arquivo ilegível, começando vazio:', (err as Error).message);
      }
    }
    this.data = {
      secret: d.secret ?? randomBytes(32).toString('hex'),
      accounts: d.accounts ?? {},
      runs: d.runs ?? [],
      players: d.players ?? {},
    };
    if (!d.secret) this.save();
  }

  // Grava logo depois da última mudança (e por um arquivo temporário, para nunca deixar o placar pela metade).
  private save() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => this.flush(), 300);
  }

  flush() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    const tmp = this.file + '.tmp';
    writeFileSync(tmp, JSON.stringify(this.data));
    renameSync(tmp, this.file);
  }

  private tokenFor(key: string) {
    const sig = createHmac('sha256', this.data.secret).update(key).digest('hex').slice(0, 32);
    return `${Buffer.from(key).toString('base64url')}.${sig}`;
  }

  // nome da conta dona do token (ou null se o token não vale)
  nameOf(token: unknown): string | null {
    if (typeof token !== 'string' || token.length > 200) return null;
    const [k64, sig] = token.split('.');
    if (!k64 || !sig) return null;
    const key = Buffer.from(k64, 'base64url').toString();
    const acc = this.data.accounts[key];
    if (!acc) return null;
    const want = Buffer.from(this.tokenFor(key).split('.')[1]);
    const got = Buffer.from(sig);
    return want.length === got.length && timingSafeEqual(want, got) ? acc.name : null;
  }

  // Entra na conta; se o nome ainda não existe, cria. Devolve o token ou o motivo da recusa.
  login(nameIn: unknown, passIn: unknown): { name: string; token: string; created: boolean } | { error: string } {
    const name = cleanName(nameIn);
    const pass = String(passIn ?? '');
    if (name.length < 2) return { error: 'O nome precisa de pelo menos 2 letras.' };
    if (pass.length < BOARD.passMin || pass.length > BOARD.passMax) return { error: `A senha precisa ter de ${BOARD.passMin} a ${BOARD.passMax} caracteres.` };
    const key = nameKey(name);
    const acc = this.data.accounts[key];
    if (acc) {
      const want = Buffer.from(acc.hash, 'hex');
      const got = Buffer.from(hashPass(pass, acc.salt), 'hex');
      if (!timingSafeEqual(want, got)) return { error: 'Senha errada para esse nome.' };
      return { name: acc.name, token: this.tokenFor(key), created: false };
    }
    const salt = randomBytes(16).toString('hex');
    this.data.accounts[key] = { name, salt, hash: hashPass(pass, salt), created: new Date().toISOString() };
    this.save();
    return { name, token: this.tokenFor(key), created: true };
  }

  // Guarda a partida: soma nas estatísticas e fica no placar se for a melhor do jogador na categoria.
  addRun(name: string, r: RunInput, verified: boolean): boolean {
    const key = nameKey(name);
    const p = (this.data.players[key] ??= { name, games: 0, bestSolo: 0, bestCoop: 0, kills: 0, headshots: 0, revives: 0, seconds: 0 });
    p.name = name;
    p.games++;
    p.kills += r.kills;
    p.headshots += r.headshots;
    p.revives += r.revives;
    p.seconds += r.seconds;
    if (r.startRound === 1) {
      if (r.mode === 'solo') p.bestSolo = Math.max(p.bestSolo, r.round);
      else p.bestCoop = Math.max(p.bestCoop, r.round);
    }
    const run: OnlineRun = {
      name, mode: r.mode, map: r.map, round: r.round, startRound: r.startRound, players: r.players,
      kills: r.kills, headshots: r.headshots, date: new Date().toISOString().slice(0, 10), verified,
      ...(r.missao ? { missao: true } : {}),
    };
    const start = (x: { startRound: number }) => (x.startRound === 1 ? 'zero' : 'custom');
    const i = this.data.runs.findIndex((x) => nameKey(x.name) === key && x.mode === run.mode && x.map === run.map && start(x) === start(run));
    let best = true;
    if (i >= 0) {
      const old = this.data.runs[i];
      if (old.round > run.round || (old.round === run.round && old.kills >= run.kills)) best = false;
      else this.data.runs.splice(i, 1);
    }
    if (best) this.data.runs.push(run);
    this.save();
    return best;
  }

  top(mode: BoardMode, start: BoardStart, map: string): OnlineRun[] {
    return this.data.runs
      .filter((r) => r.mode === mode && r.map === map && (start === 'zero' ? r.startRound === 1 : r.startRound > 1))
      .sort((a, b) => b.round - a.round || b.kills - a.kills)
      .slice(0, BOARD.top);
  }

  players(): OnlinePlayer[] {
    return Object.values(this.data.players)
      .sort((a, b) => Math.max(b.bestSolo, b.bestCoop) - Math.max(a.bestSolo, a.bestCoop) || b.kills - a.kills)
      .slice(0, BOARD.top);
  }
}
