// Co-op sem servidor: o navegador de quem cria a sala roda a partida e os amigos se ligam direto nele (WebRTC).
// O servidor do jogo só entrega os arquivos; o "encontro" entre os navegadores usa relés públicos e gratuitos.
// STUN descobre o endereço público de cada um (funciona para a maioria das casas). Quando o roteador de alguém
// não deixa a ligação direta (comum em internet de celular e em redes com CGNAT), só um TURN, que retransmite os dados
// (ainda cifrados), resolve. Não existe TURN público gratuito que se possa confiar: o jogo busca as credenciais de um TURN
// próprio (por exemplo o gratuito da Cloudflare, com o Worker de servidor/turn-worker.js) no endereço VITE_TURN_ENDPOINT,
// definido ao construir o jogo. Sem ele, o jogo usa só STUN e avisa quando a ligação não fecha.
export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

const STUN: IceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];

let cached: { at: number; list: IceServer[] } | null = null;

// endereço que entrega as credenciais do TURN. Em desenvolvimento, ?turn=http://... troca o endereço (usado nos testes)
function turnEndpoint(): string {
  const env = (import.meta.env as Record<string, string | undefined>).VITE_TURN_ENDPOINT ?? '';
  if (import.meta.env.DEV) {
    const m = /[?&]turn=([^&#]+)/.exec(TURN_PARAM_SOURCE);
    if (m) return decodeURIComponent(m[1]);
  }
  return env.trim();
}
// lido uma vez, antes de a página limpar o endereço
const TURN_PARAM_SOURCE = typeof location !== 'undefined' ? location.search : '';

function normalize(raw: unknown): IceServer[] {
  const data = (raw as { iceServers?: unknown })?.iceServers ?? raw;
  const list = Array.isArray(data) ? data : data && typeof data === 'object' ? [data] : [];
  return list.filter((x): x is IceServer => !!x && typeof x === 'object' && !!(x as IceServer).urls);
}

// STUN + TURN (se houver endereço e ele responder em até 4 s; a resposta vale por 30 min)
export async function loadIceServers(): Promise<IceServer[]> {
  if (cached && Date.now() - cached.at < 30 * 60 * 1000) return cached.list;
  let turn: IceServer[] = [];
  const url = turnEndpoint();
  if (url) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 4000);
    try {
      const res = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
      if (res.ok) turn = normalize(await res.json());
    } catch {
      // sem TURN: segue só com STUN
    } finally {
      clearTimeout(timer);
    }
  }
  const list = [...STUN, ...turn];
  if (!url || turn.length) cached = { at: Date.now(), list };
  return list;
}

export const hasTurn = (): boolean => !!turnEndpoint();

// teste: força passar pelo TURN (?relay na página, só em desenvolvimento). Lido uma vez, antes de a página limpar o endereço.
const RELAY_ONLY = import.meta.env.DEV && typeof location !== 'undefined' && /[?&]relay\b/.test(location.search);
export const relayOnly = (): boolean => RELAY_ONLY;
