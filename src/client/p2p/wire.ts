import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import type { ClientMsg, ServerMsg, Snapshot } from '../../shared/protocol';

// Formato das mensagens entre os navegadores. Controle e entradas vão em JSON puro (pequenas); o estado do
// jogo (snapshot) vai comprimido, porque é o que pesa na internet de quem hospeda (4 a 7 KB, 20 vezes por segundo).

export type Wire = ClientMsg | ServerMsg;

export const encodeMsg = (m: Wire): string => JSON.stringify(m);

export function decodeMsg<T extends Wire>(raw: unknown): T | null {
  if (typeof raw !== 'string' || raw.length > 64 * 1024) return null;
  try {
    const m = JSON.parse(raw) as T;
    return m && typeof m === 'object' && typeof (m as { t?: unknown }).t === 'string' ? m : null;
  } catch {
    return null;
  }
}

// snapshot: 4 bytes de sequência (para jogar fora o que chega atrasado) + JSON comprimido
export function encodeSnap(seq: number, s: Snapshot): Uint8Array<ArrayBuffer> {
  const body = deflateSync(strToU8(JSON.stringify(s)), { level: 1 });
  const out = new Uint8Array(4 + body.length);
  new DataView(out.buffer).setUint32(0, seq >>> 0);
  out.set(body, 4);
  return out;
}

export function decodeSnap(raw: unknown): { seq: number; s: Snapshot } | null {
  let u8: Uint8Array;
  if (raw instanceof ArrayBuffer) u8 = new Uint8Array(raw);
  else if (ArrayBuffer.isView(raw)) u8 = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  else return null;
  if (u8.length < 5 || u8.length > 256 * 1024) return null;
  try {
    const seq = new DataView(u8.buffer, u8.byteOffset, 4).getUint32(0);
    const s = JSON.parse(strFromU8(inflateSync(u8.subarray(4)))) as Snapshot;
    return s && typeof s === 'object' ? { seq, s } : null;
  } catch {
    return null;
  }
}
