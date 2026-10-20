import type { IncomingMessage } from 'node:http';

// Proteções do servidor: endereço real de quem conecta (atrás do túnel ou de um proxy), limites
// por endereço e cabeçalhos de segurança das páginas.

// ZOMBA_PROXY=cloudflare: atrás do túnel da Cloudflare (o túnel roda no mesmo computador)
// ZOMBA_PROXY=1: atrás de um proxy (Caddy, Nginx) na mesma máquina ou rede interna
const PROXY = (process.env.ZOMBA_PROXY ?? '').trim().toLowerCase();

const isLoopback = (ip: string) => ip === '::1' || ip.startsWith('127.') || ip.startsWith('::ffff:127.');
const isPrivate = (ip: string) => {
  const v4 = ip.replace(/^::ffff:/, '');
  return isLoopback(ip) || /^10\./.test(v4) || /^192\.168\./.test(v4) || /^172\.(1[6-9]|2\d|3[01])\./.test(v4) || /^f[cd]/i.test(ip);
};
const header = (req: IncomingMessage, name: string) => {
  const v = req.headers[name];
  return (Array.isArray(v) ? v[v.length - 1] : v ?? '').trim();
};

export interface Peer {
  ip: string;
  // o próprio computador do servidor (quem hospeda): fica fora dos limites
  local: boolean;
}

// Só acredita no cabeçalho do proxy quando a conexão vem dele (máquina ou rede interna);
// quem conecta direto não consegue se passar por outro endereço.
export function peerOf(req: IncomingMessage): Peer {
  const sock = req.socket.remoteAddress ?? '?';
  if (PROXY === 'cloudflare' && isLoopback(sock)) {
    const cf = header(req, 'cf-connecting-ip');
    if (cf) return { ip: cf.slice(0, 64), local: false };
  } else if (PROXY && isPrivate(sock)) {
    const xff = header(req, 'x-forwarded-for').split(',').pop()?.trim();
    if (xff) return { ip: xff.slice(0, 64), local: false };
  }
  return { ip: sock, local: isLoopback(sock) };
}

// Conta acontecimentos por chave numa janela de tempo (envios, tentativas de código errado).
export class Window {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly ms: number, private readonly max: number) {
    setInterval(() => {
      const now = Date.now();
      for (const [k, list] of this.hits) if (!list.some((t) => now - t < this.ms)) this.hits.delete(k);
    }, ms).unref();
  }

  // registra um acontecimento e diz se passou do limite
  hit(key: string): boolean {
    const now = Date.now();
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < this.ms);
    list.push(now);
    this.hits.set(key, list);
    return list.length > this.max;
  }

  // já passou do limite (sem registrar nada)
  over(key: string): boolean {
    const now = Date.now();
    return (this.hits.get(key) ?? []).filter((t) => now - t < this.ms).length >= this.max;
  }
}

// Conexões abertas por endereço.
export class Gauge {
  private readonly open = new Map<string, number>();
  total = 0;

  add(ip: string) {
    this.open.set(ip, (this.open.get(ip) ?? 0) + 1);
    this.total++;
  }

  remove(ip: string) {
    const n = (this.open.get(ip) ?? 1) - 1;
    if (n > 0) this.open.set(ip, n);
    else this.open.delete(ip);
    this.total--;
  }

  count(ip: string) {
    return this.open.get(ip) ?? 0;
  }
}

// O WebSocket só aceita páginas do próprio servidor (ou do Vite, em desenvolvimento, que muda só a porta):
// um site qualquer aberto no navegador de alguém não consegue entrar nas salas por ele.
// Programas fora do navegador não mandam Origin e passam (os outros limites continuam valendo).
export function originOk(req: IncomingMessage): boolean {
  const origin = header(req, 'origin');
  if (!origin) return true;
  let host: string;
  try {
    host = new URL(origin).hostname;
  } catch {
    return false;
  }
  const own = header(req, 'host').replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  const extra = (process.env.ZOMBA_ORIGENS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return host.replace(/^\[|\]$/g, '') === own || extra.includes(host) || extra.includes(origin);
}

// Cabeçalhos de segurança das páginas: nada de embutir o jogo em outro site, nem de rodar script de fora.
// connect-src aceita outros servidores porque o jogador pode digitar o endereço de outro servidor no co-op.
export const PAGE_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'cross-origin-opener-policy': 'same-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'content-security-policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' ws: wss: http: https:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; '),
};
