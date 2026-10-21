import { NET_PORT, TICK_DT } from '../shared/constants';
import type { MapDef } from '../shared/map/types';
import type { ClientMsg, GameEvent, LobbyPlayer, PlayerInput, ServerMsg, Snapshot } from '../shared/protocol';
import { GameSim } from '../shared/sim';

export interface Transport {
  readonly localId: string;
  readonly solo: boolean;
  onSnapshot: ((s: Snapshot) => void) | null;
  onEvents: ((list: GameEvent[]) => void) | null;
  paused: boolean;
  ping: number;
  send(m: PlayerInput): void;
  update(dt: number): void;
  close(): void;
}

// Solo: a mesma simulação do servidor, rodando no navegador em passos fixos.
export class LocalTransport implements Transport {
  readonly localId = 'local';
  readonly solo = true;
  onSnapshot: ((s: Snapshot) => void) | null = null;
  onEvents: ((list: GameEvent[]) => void) | null = null;
  paused = false;
  ping = 0;
  private readonly sim: GameSim;
  private acc = 0;

  constructor(map: MapDef, name: string, opts: { startRound?: number; level?: number; bank?: number; log?: boolean } = {}) {
    this.sim = new GameSim(map, true, { startRound: opts.startRound, log: opts.log });
    this.sim.addPlayer(this.localId, name, 0, opts.level ?? 1, opts.bank ?? 0);
    this.sim.start();
  }

  send(m: PlayerInput) {
    if (!this.paused) this.sim.handle(this.localId, m);
  }

  update(dt: number) {
    if (this.paused) return;
    this.acc += Math.min(dt, 0.25);
    while (this.acc >= TICK_DT) {
      this.acc -= TICK_DT;
      this.sim.tick(TICK_DT);
      const ev = this.sim.drainEvents();
      if (ev.length) this.onEvents?.(ev);
      this.onSnapshot?.(this.sim.snapshot());
    }
  }

  close() {}
}

export function defaultServerUrl(): string {
  const secure = location.protocol === 'https:';
  if (import.meta.env.DEV) return `ws://${location.hostname}:${NET_PORT}`;
  return `${secure ? 'wss' : 'ws'}://${location.host}`;
}

// Co-op: conexão WebSocket com o servidor de salas.
export class NetClient implements Transport {
  localId = '';
  readonly solo = false;
  onSnapshot: ((s: Snapshot) => void) | null = null;
  onEvents: ((list: GameEvent[]) => void) | null = null;
  onLobby: ((code: string, hostId: string, players: LobbyPlayer[], startRound: number, mapId: string) => void) | null = null;
  // mapa da partida (vem do servidor quando ela começa)
  mapId = 'cidade';
  onStarted: (() => void) | null = null;
  onError: ((msg: string) => void) | null = null;
  onClose: (() => void) | null = null;
  // tirado da sala pelo anfitrião, ou sala fechada (a conexão continua aberta)
  onLeft: ((msg: string) => void) | null = null;
  // endereço público do servidor, para o convite (null: o servidor não sabe)
  publicUrl: string | null = null;
  paused = false;
  ping = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private closed = false;

  private constructor(private readonly ws: WebSocket) {
    ws.onmessage = (ev) => this.receive(JSON.parse(String(ev.data)) as ServerMsg);
    ws.onclose = () => {
      if (this.pingTimer) clearInterval(this.pingTimer);
      if (!this.closed) this.onClose?.();
    };
    this.pingTimer = setInterval(() => this.raw({ t: 'ping', n: performance.now() }), 2000);
  }

  static connect(url: string): Promise<NetClient> {
    return new Promise((resolve, reject) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch {
        reject(new Error('Endereço do servidor inválido.'));
        return;
      }
      // o servidor pode recusar a conexão com um motivo (cheio, endereço errado) antes do welcome
      let refused = '';
      const fail = () => reject(new Error(refused || 'Não foi possível conectar ao servidor.'));
      ws.onerror = fail;
      ws.onclose = fail;
      ws.onmessage = (ev) => {
        const m = JSON.parse(String(ev.data)) as ServerMsg;
        if (m.t === 'error') refused = m.msg;
        if (m.t !== 'welcome') return;
        ws.onerror = null;
        const c = new NetClient(ws);
        c.localId = m.id;
        c.publicUrl = m.url ?? null;
        resolve(c);
      };
    });
  }

  private raw(m: ClientMsg) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  private receive(m: ServerMsg) {
    switch (m.t) {
      case 'lobby':
        this.onLobby?.(m.code, m.hostId, m.players, m.startRound, m.mapId);
        break;
      case 'started':
        this.localId = m.you;
        this.mapId = m.mapId;
        this.onStarted?.();
        break;
      case 'snap':
        this.onSnapshot?.(m.s);
        break;
      case 'ev':
        this.onEvents?.(m.list);
        break;
      case 'error':
        this.onError?.(m.msg);
        break;
      case 'left':
        this.onLeft?.(m.msg);
        break;
      case 'pong':
        this.ping = performance.now() - m.n;
        break;
    }
  }

  // token: conta do placar online (o servidor registra a partida de co-op nela)
  create(name: string, level: number, startRound: number, mapId: string, token?: string, bank?: number) {
    this.raw({ t: 'create', name, level, startRound, mapId, token, bank });
  }

  join(code: string, name: string, level: number, token?: string, bank?: number) {
    this.raw({ t: 'join', code, name, level, token, bank });
  }

  config(startRound: number, mapId: string) {
    this.raw({ t: 'config', startRound, mapId });
  }

  start() {
    this.raw({ t: 'start' });
  }

  kick(id: string) {
    this.raw({ t: 'kick', id });
  }

  send(m: PlayerInput) {
    this.raw(m);
  }

  update() {}

  close() {
    this.closed = true;
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.ws.close();
  }
}
