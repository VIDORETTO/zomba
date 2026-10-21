import { joinRoom, type Room } from 'trystero';
import type { MessageAction } from '@trystero-p2p/core';
import type { ClientMsg, ServerMsg, Snapshot } from '../../shared/protocol';
import { APP_ID, PROTOCOL } from './codes';
import { relayOnly, type IceServer } from './config';
import { decodeMsg, decodeSnap, encodeMsg, encodeSnap, type Wire } from './wire';

// Ligação entre os navegadores. O encontro (troca dos endereços) usa relés públicos de Nostr; o código da sala
// também é a senha que embaralha essa troca, então nem os relés enxergam os endereços de quem joga.
// Depois que a ligação abre, os dados vão direto de navegador para navegador (ou, se o roteador de alguém não
// deixar, pelo TURN, ainda cifrados). Controle vai por um canal confiável; o estado do jogo, por um canal que
// aceita perder pacotes (o próximo estado chega 50 ms depois, e esperar o velho só atrasaria o jogo).

export type Role = 'host' | 'guest';

export interface LinkEvents {
  // ligação com um navegador aberta e aprovada (o anfitrião só aprova convidados, e o convidado só o anfitrião)
  up(key: string): void;
  down(key: string): void;
  msg(key: string, m: Wire): void;
  snap(key: string, s: Snapshot): void;
  // não foi possível se encontrar com ninguém (relés fora do ar, TURN necessário e fora do ar...)
  fail(reason: string): void;
}

const SNAP_CHANNEL_ID = 21;
// o limite seguro de uma mensagem em canal sem confirmação (acima disso, vai pelo canal confiável)
const SNAP_MAX = 15000;

export class Link {
  private readonly room: Room;
  private readonly control: MessageAction;
  private readonly snapAction: MessageAction;
  private readonly fast = new Map<string, RTCDataChannel>();
  private readonly ready = new Set<string>();
  private seqOut = 0;
  private readonly seqIn = new Map<string, number>();
  private closed = false;

  constructor(code: string, readonly role: Role, private readonly ev: LinkEvents, ice: IceServer[]) {
    this.room = joinRoom(
      {
        appId: APP_ID,
        password: code,
        relayConfig: { redundancy: 5, warnOnRelayFailure: false },
        rtcConfig: { iceServers: ice, iceTransportPolicy: relayOnly() ? 'relay' : 'all', iceCandidatePoolSize: 2 },
      },
      code,
      {
        // só convidado↔anfitrião: convidados não precisam se ligar entre si (menos conexões, menos falha de roteador)
        onPeerHandshake: async (_id, send, receive) => {
          await send({ role, v: PROTOCOL });
          const { data } = (await receive()) as { data: { role?: string; v?: number } };
          if (!data || data.role === role) throw new Error('mesmo papel');
          if (data.v !== PROTOCOL) throw new Error('versão diferente');
        },
        handshakeTimeoutMs: 15000,
        onJoinError: () => {
          /* ligações recusadas (convidado↔convidado) são esperadas; as que falham de verdade aparecem como "fail" por tempo */
        },
      },
    );
    this.control = this.room.makeAction('c');
    this.snapAction = this.room.makeAction('s');
    this.control.onMessage = (data, { peerId }) => {
      const m = decodeMsg(data);
      if (m) this.ev.msg(peerId, m);
    };
    this.snapAction.onMessage = (data, { peerId }) => this.gotSnap(peerId, data);
    this.room.onPeerJoin = (id) => this.peerUp(id);
    this.room.onPeerLeave = (id) => this.peerDown(id);
  }

  private peerUp(id: string) {
    if (this.closed || this.ready.has(id)) return;
    this.ready.add(id);
    const pc = this.room.getPeers()[id];
    if (pc) {
      try {
        const ch = pc.createDataChannel('s', { negotiated: true, id: SNAP_CHANNEL_ID, ordered: false, maxRetransmits: 0 });
        ch.binaryType = 'arraybuffer';
        ch.onmessage = (e) => this.gotSnap(id, e.data);
        ch.onclose = () => this.fast.delete(id);
        this.fast.set(id, ch);
      } catch {
        // sem canal rápido: o estado vai pelo confiável
      }
    }
    this.ev.up(id);
  }

  private peerDown(id: string) {
    if (!this.ready.delete(id)) return;
    this.fast.delete(id);
    this.seqIn.delete(id);
    this.ev.down(id);
  }

  private gotSnap(key: string, raw: unknown) {
    const d = decodeSnap(raw);
    if (!d) return;
    // pacotes fora de ordem ou repetidos são jogados fora
    const last = this.seqIn.get(key) ?? -1;
    if (d.seq <= last && last - d.seq < 1 << 30) return;
    this.seqIn.set(key, d.seq);
    this.ev.snap(key, d.s);
  }

  send(key: string, m: ClientMsg | ServerMsg) {
    if (this.closed) return;
    void this.control.send(encodeMsg(m), { target: key }).catch(() => {});
  }

  broadcast(m: ServerMsg, keys: string[]) {
    if (this.closed || !keys.length) return;
    void this.control.send(encodeMsg(m), { target: keys }).catch(() => {});
  }

  broadcastSnap(s: Snapshot, keys: string[]) {
    if (this.closed) return;
    const bytes = encodeSnap(this.seqOut++, s);
    const slow: string[] = [];
    for (const k of keys) {
      const ch = this.fast.get(k);
      if (ch && ch.readyState === 'open' && bytes.length <= SNAP_MAX) {
        // fila cheia = a ligação não está dando conta: pula este estado em vez de acumular atraso
        if (ch.bufferedAmount > 64 * 1024) continue;
        try {
          ch.send(bytes);
        } catch {
          slow.push(k);
        }
      } else slow.push(k);
    }
    if (slow.length) void this.snapAction.send(bytes, { target: slow }).catch(() => {});
  }

  // por onde a ligação com esse navegador passa: direta ou retransmitida (TURN)
  async route(key: string): Promise<'direta' | 'retransmitida' | 'desconhecida'> {
    const pc = this.room.getPeers()[key];
    if (!pc) return 'desconhecida';
    try {
      const stats = await pc.getStats();
      let selected: string | undefined;
      stats.forEach((r) => {
        if (r.type === 'transport' && (r as { selectedCandidatePairId?: string }).selectedCandidatePairId) selected = (r as { selectedCandidatePairId: string }).selectedCandidatePairId;
      });
      let local: string | undefined;
      stats.forEach((r) => {
        if (r.type === 'candidate-pair' && (r.id === selected || (!selected && (r as { nominated?: boolean }).nominated && (r as { state?: string }).state === 'succeeded'))) local = (r as { localCandidateId?: string }).localCandidateId;
      });
      let type: string | undefined;
      stats.forEach((r) => {
        if (r.type === 'local-candidate' && r.id === local) type = (r as { candidateType?: string }).candidateType;
      });
      return type === 'relay' ? 'retransmitida' : type ? 'direta' : 'desconhecida';
    } catch {
      return 'desconhecida';
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    void this.room.leave().catch(() => {});
  }
}
