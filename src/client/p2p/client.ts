import type { Transport } from '../net';
import type { ClientMsg, GameEvent, LobbyPlayer, PlayerInput, ServerMsg, Snapshot } from '../../shared/protocol';
import { CODE_RE, PROTOCOL, cleanCode, newCode } from './codes';
import { loadIceServers } from './config';
import { HostRoom, type RoomIO } from './hostRoom';
import { Link } from './link';
import type { Wire } from './wire';

// Co-op sem servidor. Faz o mesmo papel do NetClient (ligação WebSocket com o servidor antigo), mas:
// - quem cria a sala vira o anfitrião: o navegador dele roda a partida (HostRoom) e joga como qualquer um;
// - quem entra pelo código/convite liga-se direto no navegador do anfitrião (Link).
// O resto do jogo (main.ts, game.ts) usa a mesma interface nos dois casos.

const STEP_MS = 50;
const JOIN_TIMEOUT_MS = 30000;

// relógio do anfitrião: um Worker não é freado quando a aba fica em segundo plano (setInterval da página é, para 1 s),
// e sem isso a partida dos amigos congelaria quando o anfitrião trocasse de aba
function makeTicker(fn: () => void): () => void {
  try {
    const url = URL.createObjectURL(new Blob(['let t=0;onmessage=(e)=>{if(e.data==="go")t=setInterval(()=>postMessage(0),' + STEP_MS + ');else clearInterval(t)}'], { type: 'text/javascript' }));
    const w = new Worker(url);
    w.onmessage = fn;
    w.postMessage('go');
    return () => {
      w.postMessage('stop');
      w.terminate();
      URL.revokeObjectURL(url);
    };
  } catch {
    const id = setInterval(fn, STEP_MS);
    return () => clearInterval(id);
  }
}

export class P2PClient implements Transport {
  localId = '';
  readonly solo = false;
  readonly p2p = true;
  onSnapshot: ((s: Snapshot) => void) | null = null;
  onEvents: ((list: GameEvent[]) => void) | null = null;
  onLobby: ((code: string, hostId: string, players: LobbyPlayer[], startRound: number, mapId: string) => void) | null = null;
  onStarted: (() => void) | null = null;
  onError: ((msg: string) => void) | null = null;
  onClose: (() => void) | null = null;
  onLeft: ((msg: string) => void) | null = null;
  // quando a rota até o anfitrião é conhecida (direta ou retransmitida)
  onRoute: ((route: 'direta' | 'retransmitida' | 'desconhecida') => void) | null = null;
  mapId = 'cidade';
  // sempre null: o convite usa o endereço em que o jogo está aberto
  publicUrl: string | null = null;
  paused = false;
  ping = 0;
  code = '';
  isHost = false;
  route: 'direta' | 'retransmitida' | 'desconhecida' = 'desconhecida';

  private link: Link | null = null;
  private room: HostRoom | null = null;
  private hostKey: string | null = null;
  private stopTicker: (() => void) | null = null;
  private lastTick = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private joinTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingJoin: Extract<ClientMsg, { t: 'join' }> | null = null;
  private joined = false;
  private closed = false;
  private inGame = false;
  // cada create/join/saída muda o número: um Link que ainda estava sendo preparado para a sala anterior não nasce
  private gen = 0;
  private readonly unload = () => this.close();

  // mesma assinatura do NetClient.connect: aqui não há o que conectar antes de criar ou entrar
  static connect(): Promise<P2PClient> {
    return Promise.resolve(new P2PClient());
  }

  // ---------- anfitrião ----------

  create(name: string, level: number, startRound: number, mapId: string, _token?: string, bank?: number) {
    this.leaveAll();
    this.isHost = true;
    this.code = newCode();
    this.localId = HostRoom.HOST_ID;
    const room = new HostRoom(this.code, this.roomIO(), { name, level, bank: bank ?? 0, startRound, mapId });
    this.room = room;
    const gen = ++this.gen;
    void loadIceServers().then((ice) => {
      if (gen !== this.gen) return;
      this.link = new Link(this.code, 'host', {
        // o convidado manda o "join" logo depois de a ligação abrir
        up: () => {},
        down: (key) => {
          const id = room.idOfKey(key);
          if (id) room.remove(id);
        },
        msg: (key, m) => this.hostGot(key, m),
        snap: () => {},
        fail: (r) => this.onError?.(r),
      }, ice);
    });
    window.addEventListener('beforeunload', this.unload);
    this.lastTick = performance.now();
    this.stopTicker = makeTicker(() => {
      const now = performance.now();
      this.room?.advance((now - this.lastTick) / 1000);
      this.lastTick = now;
    });
    room.sendLobby();
  }

  private roomIO(): RoomIO {
    const keyOf = (id: string) => this.room?.members.get(id)?.key ?? '';
    const remote = () => [...(this.room?.members.values() ?? [])].filter((m) => m.id !== HostRoom.HOST_ID).map((m) => m.key);
    return {
      send: (id, m) => {
        if (id === HostRoom.HOST_ID) this.receive(m);
        else this.link?.send(keyOf(id), m);
      },
      broadcast: (m) => {
        this.receive(m);
        this.link?.broadcast(m, remote());
      },
      broadcastSnap: (s) => {
        this.receive({ t: 'snap', s });
        this.link?.broadcastSnap(s, remote());
      },
      drop: () => {},
    };
  }

  private hostGot(key: string, m: Wire) {
    const room = this.room;
    if (!room) return;
    const msg = m as ClientMsg;
    if (msg.t === 'join') {
      const r = room.addGuest(key, msg);
      if ('error' in r) this.link?.send(key, { t: 'error', msg: r.error });
      else room.sendLobby();
      return;
    }
    const id = room.idOfKey(key);
    if (id) room.handle(id, msg);
  }

  // ---------- convidado ----------

  join(code: string, name: string, level: number, token?: string, bank?: number) {
    this.leaveAll();
    const c = cleanCode(code);
    if (!CODE_RE.test(c)) {
      queueMicrotask(() => this.onError?.('O código da sala tem 6 letras ou números.'));
      return;
    }
    this.code = c;
    this.pendingJoin = { t: 'join', code: c, name, level, token, bank, v: PROTOCOL };
    const gen = ++this.gen;
    void loadIceServers().then((ice) => {
      if (gen !== this.gen) return;
      this.link = new Link(c, 'guest', {
        // só o anfitrião aprova a ligação de um convidado, então quem sobe aqui é ele
        up: (key) => {
          this.hostKey = key;
          if (this.pendingJoin) this.link?.send(key, this.pendingJoin);
        },
        down: (key) => {
          if (key !== this.hostKey) return;
          this.hostKey = null;
          if (!this.closed) this.onClose?.();
        },
        msg: (_k, m) => this.receive(m as ServerMsg),
        snap: (_k, s) => this.onSnapshot?.(s),
        fail: (r) => this.onError?.(r),
      }, ice);
    });
    window.addEventListener('beforeunload', this.unload);
    this.joinTimer = setTimeout(() => {
      if (!this.joined) this.onError?.('Não encontrei essa sala. Confira o código ou o link, e peça ao anfitrião para manter a aba do jogo aberta.');
    }, JOIN_TIMEOUT_MS);
    this.pingTimer = setInterval(() => {
      if (this.hostKey) this.link?.send(this.hostKey, { t: 'ping', n: performance.now() });
    }, 2000);
  }

  private receive(m: ServerMsg) {
    switch (m.t) {
      case 'welcome':
        this.localId = m.id;
        this.joined = true;
        if (this.joinTimer) clearTimeout(this.joinTimer);
        void this.checkRoute();
        break;
      case 'lobby':
        this.onLobby?.(m.code, m.hostId, m.players, m.startRound, m.mapId);
        break;
      case 'started':
        this.inGame = true;
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
        if (this.inGame) {
          // o anfitrião saiu no meio da partida: é o mesmo que perder a conexão
          this.leaveAll();
          if (!this.closed) this.onClose?.();
        } else {
          this.onLeft?.(m.msg);
          if (!this.isHost) this.leaveAll();
        }
        break;
      case 'pong':
        this.ping = performance.now() - m.n;
        break;
    }
  }

  private async checkRoute() {
    if (!this.hostKey || !this.link) return;
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const r = this.link ? await this.link.route(this.hostKey!) : 'desconhecida';
      if (r !== 'desconhecida') {
        this.route = r;
        this.onRoute?.(r);
        return;
      }
    }
  }

  // ---------- comum ----------

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

  private raw(m: ClientMsg) {
    if (this.closed) return;
    if (this.room) this.room.handle(HostRoom.HOST_ID, m);
    else if (this.hostKey) this.link?.send(this.hostKey, m);
  }

  update() {}

  private leaveAll() {
    this.gen++;
    this.inGame = false;
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.joinTimer) clearTimeout(this.joinTimer);
    this.pingTimer = this.joinTimer = null;
    this.stopTicker?.();
    this.stopTicker = null;
    const link = this.link;
    const room = this.room;
    // avisa os convidados antes de soltar a ligação
    if (room) room.close('O anfitrião saiu e a sala foi fechada.');
    this.link = null;
    this.room = null;
    this.hostKey = null;
    this.joined = false;
    this.pendingJoin = null;
    window.removeEventListener('beforeunload', this.unload);
    // dá tempo de o aviso de fechamento sair antes de derrubar a ligação
    if (link) setTimeout(() => link.close(), room ? 400 : 0);
  }

  close() {
    this.closed = true;
    this.leaveAll();
  }
}
