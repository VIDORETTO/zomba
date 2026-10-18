import type { BoardMode, BoardStart, OnlinePlayer, OnlineRun, RunInput } from '../shared/board';

// Placar online: conta (nome + senha) e consultas ao servidor do jogo, pelo mesmo endereço do co-op.

export interface Account {
  name: string;
  token: string;
}

const KEY = 'zomba.account';

export function getAccount(): Account | null {
  try {
    const a = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Account | null;
    return a?.name && a.token ? a : null;
  } catch {
    return null;
  }
}

export function setAccount(a: Account | null) {
  try {
    if (a) localStorage.setItem(KEY, JSON.stringify(a));
    else localStorage.removeItem(KEY);
  } catch {
    // sem armazenamento: a conta vale só nesta aba
  }
}

// ws://host:porta → http://host:porta (o placar mora no mesmo servidor do co-op)
export function apiBase(serverUrl: string) {
  return serverUrl.trim().replace(/^ws(s?):\/\//, 'http$1://').replace(/\/+$/, '') + '/api';
}

async function call<T>(base: string, path: string, body?: unknown): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 6000);
  try {
    const res = await fetch(base + path, body === undefined
      ? { signal: ctl.signal }
      : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) throw new Error(data.error ?? `Erro ${res.status} no servidor.`);
    return data;
  } catch (err) {
    if ((err as Error).name === 'AbortError' || err instanceof TypeError) throw new Error('Servidor do placar fora do ar.');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function login(base: string, name: string, pass: string): Promise<Account & { created: boolean }> {
  const r = await call<Account & { created: boolean }>(base, '/conta', { name, pass });
  setAccount({ name: r.name, token: r.token });
  return r;
}

export function submitRun(base: string, run: RunInput): Promise<{ ok: boolean; best: boolean }> {
  const acc = getAccount();
  if (!acc) return Promise.reject(new Error('Sem conta.'));
  return call(base, '/partida', { token: acc.token, run });
}

export function fetchRuns(base: string, mode: BoardMode, start: BoardStart, map: string) {
  return call<{ runs: OnlineRun[] }>(base, `/placar?modo=${mode}&inicio=${start}&mapa=${encodeURIComponent(map)}`).then((r) => r.runs);
}

export function fetchPlayers(base: string) {
  return call<{ players: OnlinePlayer[] }>(base, '/jogadores').then((r) => r.players);
}
