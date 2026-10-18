import type { NetPlayer, NetZombie, Snapshot } from '../shared/protocol';

export interface BufferedSnap {
  at: number;
  s: Snapshot;
  zombies: Map<number, NetZombie>;
  players: Map<string, NetPlayer>;
}

export interface Sample {
  a: BufferedSnap;
  b: BufferedSnap;
  k: number;
}

// Guarda os últimos snapshots e devolve o par em volta do instante de renderização.
export class SnapBuffer {
  private readonly list: BufferedSnap[] = [];
  latest: BufferedSnap | null = null;

  push(s: Snapshot, at: number) {
    const e: BufferedSnap = {
      at,
      s,
      zombies: new Map(s.zombies.map((z) => [z.id, z])),
      players: new Map(s.players.map((p) => [p.id, p])),
    };
    this.list.push(e);
    if (this.list.length > 30) this.list.shift();
    this.latest = e;
  }

  sample(renderAt: number): Sample | null {
    const l = this.list;
    if (!l.length) return null;
    if (renderAt <= l[0].at) return { a: l[0], b: l[0], k: 0 };
    for (let i = l.length - 1; i >= 0; i--) {
      if (l[i].at <= renderAt) {
        const a = l[i];
        const b = l[i + 1] ?? a;
        const k = b === a ? 0 : Math.min(1, (renderAt - a.at) / (b.at - a.at));
        return { a, b, k };
      }
    }
    return { a: l[0], b: l[0], k: 0 };
  }

  clear() {
    this.list.length = 0;
    this.latest = null;
  }
}
