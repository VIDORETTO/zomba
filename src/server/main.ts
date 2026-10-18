import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import { MAX_PLAYERS, NET_PORT, TICK_DT, TICK_RATE } from '../shared/constants';
import { getMap, isMapId } from '../shared/map';
import type { ClientMsg, ServerMsg } from '../shared/protocol';
import { GameSim } from '../shared/sim';

interface Client {
  id: string;
  ws: WebSocket;
  name: string;
  slot: number;
  level: number;
  room: Room | null;
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
}

const PORT = Number(process.env.PORT ?? NET_PORT);
const DIST = resolve(process.cwd(), 'dist');
const rooms = new Map<string, Room>();
let nextId = 1;

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
  if (!existsSync(DIST)) {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Servidor Zomba rodando. Em desenvolvimento, abra o jogo pelo Vite (porta 5173).');
    return;
  }
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let file = normalize(join(DIST, url));
  if (!file.startsWith(DIST)) {
    res.writeHead(403).end();
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});

const wss = new WebSocketServer({ server: http });

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
    sim.addPlayer(c.id, c.name, c.slot, c.level);
    send(c, { t: 'started', mapId: map.id, you: c.id });
  }
  sim.start();
  room.sim = sim;
  console.log(`[sala ${room.code}] partida iniciada com ${room.clients.size} jogador(es)`);
  room.timer = setInterval(() => {
    sim.tick(TICK_DT);
    const list = sim.drainEvents();
    if (list.length) broadcast(room, { t: 'ev', list });
    broadcast(room, { t: 'snap', s: sim.snapshot() });
    if (sim.state === 'gameover') {
      if (!room.endAt) room.endAt = Date.now() + 20000;
      else if (Date.now() > room.endAt) closeRoom(room);
    }
  }, 1000 / TICK_RATE);
}

const cleanLevel = (n: unknown) => Math.max(1, Math.min(60, Math.floor(Number(n) || 1)));
const cleanRound = (n: unknown) => Math.max(1, Math.min(100, Math.floor(Number(n) || 1)));
const cleanName = (n: unknown) => String(n ?? '').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 16) || 'Jogador';

wss.on('connection', (ws) => {
  const c: Client = { id: `p${nextId++}`, ws, name: 'Jogador', slot: 0, level: 1, room: null };
  send(c, { t: 'welcome', id: c.id });

  ws.on('message', (raw) => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    switch (msg.t) {
      case 'ping':
        send(c, { t: 'pong', n: msg.n });
        return;
      case 'create': {
        leave(c);
        c.name = cleanName(msg.name);
        c.level = cleanLevel(msg.level);
        c.slot = 0;
        const room: Room = {
          code: newCode(), hostId: c.id, clients: new Map([[c.id, c]]), sim: null, timer: null, endAt: 0,
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
        const room = rooms.get(String(msg.code ?? '').toUpperCase().trim());
        if (!room) return send(c, { t: 'error', msg: 'Sala não encontrada.' });
        if (room.sim) return send(c, { t: 'error', msg: 'A partida dessa sala já começou.' });
        const slot = freeSlot(room);
        if (slot < 0) return send(c, { t: 'error', msg: 'Sala cheia (máximo 4).' });
        leave(c);
        c.name = cleanName(msg.name);
        c.level = cleanLevel(msg.level);
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
      case 'start': {
        const room = c.room;
        if (room && room.hostId === c.id && !room.sim) startRoom(room);
        return;
      }
      default:
        c.room?.sim?.handle(c.id, msg);
    }
  });

  ws.on('close', () => leave(c));
});

http.listen(PORT, () => {
  console.log(`Servidor Zomba ouvindo na porta ${PORT}`);
});
