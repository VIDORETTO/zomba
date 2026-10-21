import { MAX_PLAYERS, TICK_DT } from '../../shared/constants';
import { getMap, isMapId } from '../../shared/map';
import { BANK } from '../../shared/progress';
import type { ClientMsg, LobbyPlayer, ServerMsg, Snapshot } from '../../shared/protocol';
import { GameSim } from '../../shared/sim';
import { PROTOCOL } from './codes';

// A sala de co-op, no navegador de quem hospeda. É a mesma regra que o servidor antigo (src/server/main.ts) tinha:
// lobby, mapa e rodada inicial, tirar jogador, iniciar, e a simulação da partida. Não conhece rede: quem usa
// entrega as mensagens que chegam (`handle`) e recebe o que deve ser enviado pelo `RoomIO`.

export interface RoomIO {
  send(id: string, m: ServerMsg): void;
  broadcast(m: ServerMsg): void;
  broadcastSnap(s: Snapshot): void;
  // corta a ligação de quem foi tirado da sala
  drop(id: string): void;
}

interface Member {
  id: string;
  key: string;
  name: string;
  slot: number;
  level: number;
  bank: number;
  // contagem de mensagens do último segundo (o jogo manda umas 40; o resto é ignorado)
  winStart: number;
  inWin: number;
}

const MSG_PER_SECOND = 200;
const MAX_CATCH_UP = 0.25;

const cleanLevel = (n: unknown) => Math.max(1, Math.min(60, Math.floor(Number(n) || 1)));
const cleanBank = (n: unknown) => Math.max(0, Math.min(BANK.limit, Math.floor(Number(n) || 0)));
const cleanRound = (n: unknown) => Math.max(1, Math.min(100, Math.floor(Number(n) || 1)));
const cleanName = (n: unknown) => String(n ?? '').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 16) || 'Jogador';

export class HostRoom {
  static readonly HOST_ID = 'p0';
  readonly members = new Map<string, Member>();
  sim: GameSim | null = null;
  startRound = 1;
  mapId = 'cidade';
  private nextId = 1;
  private acc = 0;
  private banned = new Set<string>();
  private closed = false;

  constructor(readonly code: string, private readonly io: RoomIO, host: { name: string; level: number; bank: number; startRound: number; mapId: string }) {
    this.startRound = cleanRound(host.startRound);
    this.mapId = isMapId(host.mapId) ? host.mapId : 'cidade';
    this.members.set(HostRoom.HOST_ID, { id: HostRoom.HOST_ID, key: 'host', name: cleanName(host.name), slot: 0, level: cleanLevel(host.level), bank: cleanBank(host.bank), winStart: 0, inWin: 0 });
  }

  get hostId() {
    return HostRoom.HOST_ID;
  }

  private lobbyMsg(): ServerMsg {
    const players: LobbyPlayer[] = [...this.members.values()].map((m) => ({ id: m.id, name: m.name, slot: m.slot, level: m.level }));
    return { t: 'lobby', code: this.code, hostId: HostRoom.HOST_ID, players, startRound: this.startRound, mapId: this.mapId };
  }

  sendLobby() {
    this.io.broadcast(this.lobbyMsg());
  }

  private freeSlot(): number {
    const used = new Set([...this.members.values()].map((m) => m.slot));
    for (let i = 0; i < MAX_PLAYERS; i++) if (!used.has(i)) return i;
    return -1;
  }

  // alguém quer entrar; devolve o id dele na sala ou o motivo da recusa
  addGuest(key: string, join: Extract<ClientMsg, { t: 'join' }>): { id: string } | { error: string } {
    if (join.v !== undefined && join.v !== PROTOCOL) return { error: 'Seu jogo está em outra versão. Atualize a página (Ctrl+F5) e entre de novo.' };
    if (this.banned.has(key)) return { error: 'O anfitrião tirou você desta sala.' };
    for (const m of this.members.values()) if (m.key === key) return { id: m.id };
    if (this.sim) return { error: 'A partida dessa sala já começou.' };
    const slot = this.freeSlot();
    if (slot < 0) return { error: 'Sala cheia (máximo 4).' };
    const id = `p${this.nextId++}`;
    this.members.set(id, { id, key, name: cleanName(join.name), slot, level: cleanLevel(join.level), bank: cleanBank(join.bank), winStart: 0, inWin: 0 });
    this.io.send(id, { t: 'welcome', id });
    this.sendLobby();
    return { id };
  }

  idOfKey(key: string): string | null {
    for (const m of this.members.values()) if (m.key === key) return m.id;
    return null;
  }

  // jogador saiu ou a ligação caiu
  remove(id: string) {
    const m = this.members.get(id);
    if (!m || id === HostRoom.HOST_ID) return;
    this.members.delete(id);
    this.sim?.removePlayer(id);
    if (!this.sim && !this.closed) this.sendLobby();
  }

  handle(id: string, msg: ClientMsg, nowMs = Date.now()) {
    const m = this.members.get(id);
    if (!m || !msg || typeof msg !== 'object') return;
    if (nowMs - m.winStart >= 1000) {
      m.winStart = nowMs;
      m.inWin = 0;
    }
    if (++m.inWin > MSG_PER_SECOND) return;
    const isHost = id === HostRoom.HOST_ID;
    switch (msg.t) {
      case 'ping':
        this.io.send(id, { t: 'pong', n: msg.n });
        return;
      case 'create':
      case 'join':
        return; // entrar na sala é feito por addGuest; criar, pelo construtor
      case 'config':
        if (isHost && !this.sim) {
          this.startRound = cleanRound(msg.startRound);
          if (isMapId(msg.mapId)) this.mapId = msg.mapId;
          this.sendLobby();
        }
        return;
      case 'kick': {
        const target = this.members.get(String(msg.id));
        if (!isHost || this.sim || !target || target.id === id) return;
        this.banned.add(target.key);
        this.io.send(target.id, { t: 'left', msg: 'O anfitrião tirou você da sala.' });
        this.members.delete(target.id);
        this.io.drop(target.id);
        this.sendLobby();
        return;
      }
      case 'start':
        if (isHost && !this.sim) this.start();
        return;
      default:
        // mensagem malformada de um jogador não derruba a sala
        try {
          this.sim?.handle(id, msg);
        } catch (err) {
          console.error(`[${id}] mensagem inválida (${String((msg as { t?: unknown }).t)}):`, (err as Error).message);
        }
    }
  }

  private start() {
    const map = getMap(this.mapId);
    const sim = new GameSim(map, false, { startRound: this.startRound });
    for (const m of this.members.values()) {
      sim.addPlayer(m.id, m.name, m.slot, m.level, m.bank);
      this.io.send(m.id, { t: 'started', mapId: map.id, you: m.id });
    }
    sim.start();
    this.sim = sim;
    this.acc = 0;
  }

  // avança a partida pelo tempo real que passou (em passos fixos), mandando eventos e o estado atual
  advance(dtSec: number) {
    const sim = this.sim;
    if (!sim || this.closed) return;
    this.acc += Math.min(dtSec, MAX_CATCH_UP);
    let steps = 0;
    const events = [] as ReturnType<GameSim['drainEvents']>;
    while (this.acc >= TICK_DT) {
      this.acc -= TICK_DT;
      steps++;
      try {
        sim.tick(TICK_DT);
      } catch (err) {
        console.error('[sala] erro na simulação:', err);
      }
      events.push(...sim.drainEvents());
    }
    if (!steps) return;
    if (events.length) this.io.broadcast({ t: 'ev', list: events });
    this.io.broadcastSnap(sim.snapshot());
  }

  // a sala acabou (o anfitrião saiu): avisa quem ficou
  close(msg: string) {
    if (this.closed) return;
    this.closed = true;
    for (const m of this.members.values()) if (m.id !== HostRoom.HOST_ID) this.io.send(m.id, { t: 'left', msg });
  }
}
