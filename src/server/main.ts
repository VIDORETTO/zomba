import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import { MAX_PLAYERS, NET_PORT, TICK_DT, TICK_RATE } from '../shared/constants';
import { MAPS, getMap, isMapId } from '../shared/map';
import { BOARD, checkRun } from '../shared/board';
import { BANK } from '../shared/progress';
import { Board } from './board';
import { Gauge, PAGE_HEADERS, Window, originOk, peerOf } from './guard';
import type { ClientMsg, ServerMsg } from '../shared/protocol';
import { GameSim } from '../shared/sim';

interface Client {
  id: string;
  ws: WebSocket;
  name: string;
  slot: number;
  level: number;
  bank: number;
  room: Room | null;
  // conta do placar online (nome), se o jogador entrou nela
  account: string | null;
  // endereço de quem conectou; local = o próprio computador do servidor
  ip: string;
  local: boolean;
}

interface Room {
  code: string;
  hostId: string;
  clients: Map<string, Client>;
  sim: GameSim | null;
  timer: NodeJS.Timeout | null;
  endAt: number;
  startRound: number;
  mapId: string;
  startedAt: number;
  recorded: boolean;
  createdAt: number;
  // endereços tirados da sala pelo anfitrião (não voltam para ela)
  banned: Set<string>;
}

const PORT = Number(process.env.PORT ?? NET_PORT);
// HOST=127.0.0.1 deixa o servidor só para este computador (e para o túnel), fora da rede local
const HOST = process.env.HOST || undefined;
// endereço público (link do túnel ou domínio), que vai nos convites; o iniciador (servidor/iniciar.mjs)
// avisa pelo canal interno quando o túnel muda de link
let publicUrl = (process.env.ZOMBA_PUBLIC_URL ?? '').trim().replace(/\/+$/, '') || null;
const DIST = resolve(process.cwd(), 'dist');
const rooms = new Map<string, Room>();
let nextId = 1;
// placar online: arquivo na pasta data/ (ou na indicada em ZOMBA_DATA)
const board = new Board(process.env.ZOMBA_DATA ?? resolve(process.cwd(), 'data'));
function shutdown() {
  board.flush();
  process.exit(0);
}
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, shutdown);
// canal com o iniciador: link novo do túnel, ou desligar guardando o placar
process.on('message', (m: { publicUrl?: unknown; stop?: unknown }) => {
  if (m?.stop) shutdown();
  if (typeof m?.publicUrl === 'string' && /^https?:\/\//.test(m.publicUrl)) {
    publicUrl = m.publicUrl.replace(/\/+$/, '');
    console.log(`Link público: ${publicUrl}`);
  }
});
// o iniciador fechou (janela fechada): desliga junto
process.on('disconnect', shutdown);
const mapIds = MAPS.map((m) => m.id);

// ---------- placar online (HTTP) ----------
// POST /api/conta {name, pass}: entra (ou cria a conta) e devolve o token
// POST /api/partida {token, run}: guarda uma partida solo
// GET /api/placar?modo=solo|coop&inicio=zero|custom&mapa=cidade|rota e GET /api/jogadores
// GET /api/info: o servidor está no ar e qual é o endereço público (o iniciador espera por ele)
const posts = new Window(60000, BOARD.ratePerMinute);

function reply(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    ...PAGE_HEADERS,
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((ok, fail) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > 4096) {
        fail(new Error('grande demais'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        ok(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        fail(new Error('JSON inválido'));
      }
    });
  });
}

async function api(req: IncomingMessage, res: ServerResponse, path: string, query: URLSearchParams) {
  if (req.method === 'OPTIONS') return reply(res, 204, {});
  if (req.method === 'GET' && path === '/api/placar') {
    const mode = query.get('modo') === 'coop' ? 'coop' : 'solo';
    const start = query.get('inicio') === 'custom' ? 'custom' : 'zero';
    const map = isMapId(query.get('mapa')) ? query.get('mapa')! : 'cidade';
    return reply(res, 200, { runs: board.top(mode, start, map) });
  }
  if (req.method === 'GET' && path === '/api/jogadores') return reply(res, 200, { players: board.players() });
  if (req.method === 'GET' && path === '/api/info') return reply(res, 200, { ok: true, game: 'zomba', publicUrl });
  if (req.method !== 'POST') return reply(res, 404, { error: 'Não encontrado.' });
  if (posts.hit(peerOf(req).ip)) return reply(res, 429, { error: 'Muitos envios. Espere um minuto.' });
  let body: Record<string, unknown>;
  try {
    body = (await readBody(req)) as Record<string, unknown>;
  } catch (err) {
    return reply(res, 400, { error: (err as Error).message });
  }
  if (path === '/api/conta') {
    const r = board.login(body.name, body.pass);
    return 'error' in r ? reply(res, 401, r) : reply(res, 200, r);
  }
  if (path === '/api/partida') {
    const name = board.nameOf(body.token);
    if (!name) return reply(res, 401, { error: 'Entre na sua conta de novo.' });
    const run = checkRun(body.run as never, mapIds);
    if (typeof run === 'string') return reply(res, 400, { error: `Partida recusada: ${run}.` });
    // o co-op o próprio servidor registra; pelo navegador só entra partida solo
    if (run.mode !== 'solo') return reply(res, 400, { error: 'Partidas de co-op são registradas pelo servidor.' });
    const best = board.addRun(name, run, false);
    return reply(res, 200, { ok: true, best });
  }
  return reply(res, 404, { error: 'Não encontrado.' });
}

// fim de partida de co-op: grava no placar de quem entrou na conta (partida verificada pelo servidor)
function recordRoom(room: Room, sim: GameSim) {
  if (room.recorded) return;
  room.recorded = true;
  const seconds = Math.round((Date.now() - room.startedAt) / 1000);
  for (const c of room.clients.values()) {
    if (!c.account) continue;
    const p = sim.players.get(c.id);
    if (!p) continue;
    const run = checkRun({
      mode: 'coop', map: room.mapId, round: sim.round, startRound: room.startRound, players: sim.players.size,
      kills: p.kills, headshots: p.headshots, downs: p.downs, revives: p.revives, seconds,
    }, mapIds);
    if (typeof run === 'string') {
      console.log(`[sala ${room.code}] partida de ${c.account} fora do placar: ${run}`);
      continue;
    }
    board.addRun(c.account, run, true);
  }
}

// Em produção (npm run build), o próprio servidor entrega o jogo pela mesma porta.
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.glb': 'model/gltf-binary',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

const http = createServer((req, res) => {
  const [rawPath, rawQuery] = (req.url ?? '/').split('?');
  if (rawPath.startsWith('/api/')) {
    api(req, res, rawPath, new URLSearchParams(rawQuery ?? '')).catch((err) => {
      console.error('[placar] erro:', err);
      if (!res.headersSent) reply(res, 500, { error: 'Erro no servidor.' });
    });
    return;
  }
  if (!existsSync(DIST)) {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Servidor Zomba rodando. Em desenvolvimento, abra o jogo pelo Vite (porta 5173).');
    return;
  }
  let url: string;
  try {
    url = decodeURIComponent(rawPath);
  } catch {
    // endereço com % malformado: recusa em vez de derrubar o servidor
    res.writeHead(400).end();
    return;
  }
  let file = normalize(join(DIST, url));
  if (file !== DIST && !file.startsWith(DIST + sep)) {
    res.writeHead(403).end();
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  const stream = createReadStream(file);
  stream.on('error', () => {
    if (!res.headersSent) res.writeHead(404);
    res.end();
  });
  // arquivos com o resumo no nome (assets/) nunca mudam; a página vem sempre nova, para pegar a versão atual
  const cache = file.startsWith(join(DIST, 'assets') + sep) ? 'public, max-age=31536000, immutable'
    : extname(file) === '.html' ? 'no-cache' : 'public, max-age=3600';
  stream.once('open', () => {
    res.writeHead(200, { ...PAGE_HEADERS, 'cache-control': cache, 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    stream.pipe(res);
  });
});

// mensagens do jogo são pequenas; recusa as enormes
const wss = new WebSocketServer({ server: http, maxPayload: 64 * 1024 });
wss.on('error', (err) => console.error('[ws] erro:', err.message));

// Conexão que caiu sem avisar (Wi-Fi, notebook fechado) não fecha sozinha: sem resposta ao ping, o servidor
// derruba, e o jogador some da sala em vez de ficar parado lá como um fantasma.
const HEARTBEAT_MS = 10000;
const awake = new WeakMap<WebSocket, boolean>();
setInterval(() => {
  for (const ws of wss.clients) {
    if (awake.get(ws) === false) {
      ws.terminate();
      continue;
    }
    awake.set(ws, false);
    ws.ping();
  }
}, HEARTBEAT_MS).unref();

// mensagens por segundo que um jogador pode mandar (o jogo manda umas 40; o resto é ignorado)
const MSG_PER_SECOND = 200;
// limites para ninguém lotar o servidor: conexões por endereço e no total, salas abertas
const MAX_CONN_PER_IP = 8;
const MAX_CONN = 400;
const MAX_ROOMS = 100;
// sala esperando no lobby por mais que isto fecha sozinha
const LOBBY_MAX_MS = 3 * 3600 * 1000;
const conns = new Gauge();
// códigos errados por endereço: depois de 12 em um minuto, espera (ninguém fica chutando códigos)
const wrongCodes = new Window(60000, 12);

function send(c: Client, msg: ServerMsg) {
  if (c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify(msg));
}

function broadcast(room: Room, msg: ServerMsg) {
  const data = JSON.stringify(msg);
  for (const c of room.clients.values()) {
    if (c.ws.readyState === WebSocket.OPEN) c.ws.send(data);
  }
}

function newCode(): string {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (;;) {
    let s = '';
    for (let i = 0; i < 4; i++) s += abc[Math.floor(Math.random() * abc.length)];
    if (!rooms.has(s)) return s;
  }
}

function sendLobby(room: Room) {
  broadcast(room, {
    t: 'lobby',
    code: room.code,
    hostId: room.hostId,
    players: [...room.clients.values()].map((c) => ({ id: c.id, name: c.name, slot: c.slot, level: c.level })),
    startRound: room.startRound,
    mapId: room.mapId,
  });
}

function freeSlot(room: Room): number {
  const used = new Set([...room.clients.values()].map((c) => c.slot));
  for (let i = 0; i < MAX_PLAYERS; i++) if (!used.has(i)) return i;
  return -1;
}

// fecha as salas esquecidas no lobby
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.sim || now - room.createdAt < LOBBY_MAX_MS) continue;
    broadcast(room, { t: 'left', msg: 'A sala ficou parada tempo demais e foi fechada.' });
    closeRoom(room);
  }
}, 60000).unref();

function closeRoom(room: Room) {
  if (room.timer) clearInterval(room.timer);
  for (const c of room.clients.values()) c.room = null;
  rooms.delete(room.code);
  console.log(`[sala ${room.code}] encerrada`);
}

function leave(c: Client) {
  const room = c.room;
  if (!room) return;
  room.clients.delete(c.id);
  c.room = null;
  room.sim?.removePlayer(c.id);
  if (room.clients.size === 0) {
    closeRoom(room);
    return;
  }
  if (room.hostId === c.id) room.hostId = room.clients.keys().next().value!;
  if (!room.sim) sendLobby(room);
}

function startRoom(room: Room) {
  const map = getMap(room.mapId);
  const sim = new GameSim(map, false, { startRound: room.startRound });
  for (const c of room.clients.values()) {
    sim.addPlayer(c.id, c.name, c.slot, c.level, c.bank);
    send(c, { t: 'started', mapId: map.id, you: c.id });
  }
  sim.start();
  room.sim = sim;
  room.startedAt = Date.now();
  console.log(`[sala ${room.code}] partida iniciada com ${room.clients.size} jogador(es)`);
  room.timer = setInterval(() => {
    // um erro numa sala não pode derrubar o servidor (e as outras salas)
    try {
      sim.tick(TICK_DT);
    } catch (err) {
      console.error(`[sala ${room.code}] erro na simulação:`, err);
    }
    const list = sim.drainEvents();
    if (list.length) broadcast(room, { t: 'ev', list });
    broadcast(room, { t: 'snap', s: sim.snapshot() });
    if (sim.state === 'gameover') {
      recordRoom(room, sim);
      if (!room.endAt) room.endAt = Date.now() + 20000;
      else if (Date.now() > room.endAt) closeRoom(room);
    }
  }, 1000 / TICK_RATE);
}

const cleanLevel = (n: unknown) => Math.max(1, Math.min(60, Math.floor(Number(n) || 1)));
const cleanBank = (n: unknown) => Math.max(0, Math.min(BANK.limit, Math.floor(Number(n) || 0)));
const cleanRound = (n: unknown) => Math.max(1, Math.min(100, Math.floor(Number(n) || 1)));
const cleanName = (n: unknown) => String(n ?? '').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 16) || 'Jogador';

wss.on('connection', (ws, req) => {
  const peer = peerOf(req);
  ws.on('error', (err) => console.error('[ws] erro na conexão:', err.message));
  const refuse = (msg: string) => {
    ws.send(JSON.stringify({ t: 'error', msg } satisfies ServerMsg));
    ws.close(1008);
  };
  if (!originOk(req)) return refuse('Conexão recusada: abra o jogo pelo endereço do próprio servidor.');
  if (conns.total >= MAX_CONN) return refuse('Servidor cheio. Tente de novo daqui a pouco.');
  if (!peer.local && conns.count(peer.ip) >= MAX_CONN_PER_IP) return refuse('Conexões demais deste endereço.');
  conns.add(peer.ip);
  const c: Client = { id: `p${nextId++}`, ws, name: 'Jogador', slot: 0, level: 1, bank: 0, room: null, account: null, ip: peer.ip, local: peer.local };
  send(c, { t: 'welcome', id: c.id, url: publicUrl ?? undefined });
  awake.set(ws, true);
  ws.on('pong', () => awake.set(ws, true));
  let windowStart = Date.now();
  let inWindow = 0;

  ws.on('message', (raw) => {
    const now = Date.now();
    if (now - windowStart >= 1000) {
      windowStart = now;
      inWindow = 0;
    }
    if (++inWindow > MSG_PER_SECOND) return;
    let msg: ClientMsg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'ping':
        send(c, { t: 'pong', n: msg.n });
        return;
      case 'create': {
        if (rooms.size >= MAX_ROOMS) return send(c, { t: 'error', msg: 'O servidor está com salas demais. Tente de novo daqui a pouco.' });
        leave(c);
        c.name = cleanName(msg.name);
        c.level = cleanLevel(msg.level);
        c.bank = cleanBank(msg.bank);
        c.account = board.nameOf(msg.token);
        c.slot = 0;
        const room: Room = {
          code: newCode(), hostId: c.id, clients: new Map([[c.id, c]]), sim: null, timer: null, endAt: 0, startedAt: 0, recorded: false,
          createdAt: Date.now(), banned: new Set(),
          startRound: cleanRound(msg.startRound),
          mapId: isMapId(msg.mapId) ? msg.mapId : 'cidade',
        };
        rooms.set(room.code, room);
        c.room = room;
        console.log(`[sala ${room.code}] criada por ${c.name}`);
        sendLobby(room);
        return;
      }
      case 'join': {
        if (!c.local && wrongCodes.over(c.ip)) return send(c, { t: 'error', msg: 'Muitos códigos errados. Espere um minuto.' });
        const room = rooms.get(String(msg.code ?? '').toUpperCase().trim());
        if (!room) {
          if (!c.local) wrongCodes.hit(c.ip);
          return send(c, { t: 'error', msg: 'Sala não encontrada. Confira o código ou peça um convite novo.' });
        }
        if (room.banned.has(c.ip)) return send(c, { t: 'error', msg: 'O anfitrião tirou você desta sala.' });
        if (room.sim) return send(c, { t: 'error', msg: 'A partida dessa sala já começou.' });
        const slot = freeSlot(room);
        if (slot < 0) return send(c, { t: 'error', msg: 'Sala cheia (máximo 4).' });
        leave(c);
        c.name = cleanName(msg.name);
        c.level = cleanLevel(msg.level);
        c.bank = cleanBank(msg.bank);
        c.account = board.nameOf(msg.token);
        c.slot = slot;
        c.room = room;
        room.clients.set(c.id, c);
        sendLobby(room);
        return;
      }
      case 'config': {
        const room = c.room;
        if (room && room.hostId === c.id && !room.sim) {
          room.startRound = cleanRound(msg.startRound);
          if (isMapId(msg.mapId)) room.mapId = msg.mapId;
          sendLobby(room);
        }
        return;
      }
      case 'kick': {
        // o anfitrião tira alguém do lobby (por exemplo, um desconhecido que achou o código)
        const room = c.room;
        const target = room?.clients.get(String(msg.id));
        if (!room || room.hostId !== c.id || room.sim || !target || target === c) return;
        // não bane o endereço do anfitrião (outra aba dele, ou todos atrás da mesma rede)
        if (target.ip !== c.ip) room.banned.add(target.ip);
        send(target, { t: 'left', msg: 'O anfitrião tirou você da sala.' });
        leave(target);
        console.log(`[sala ${room.code}] ${target.name} foi tirado da sala`);
        return;
      }
      case 'start': {
        const room = c.room;
        if (room && room.hostId === c.id && !room.sim) startRoom(room);
        return;
      }
      default:
        // mensagem malformada de um jogador não derruba a sala
        try {
          c.room?.sim?.handle(c.id, msg);
        } catch (err) {
          console.error(`[${c.id}] mensagem inválida (${String((msg as { t?: unknown }).t)}):`, (err as Error).message);
        }
    }
  });

  ws.on('close', () => {
    conns.remove(c.ip);
    leave(c);
  });
});

http.listen(PORT, HOST, () => {
  console.log(`Servidor Zomba ouvindo na porta ${PORT}${HOST ? ` (${HOST})` : ''}`);
});
