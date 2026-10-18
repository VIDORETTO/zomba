// Co-op no placar online: um servidor de teste separado (porta 3011, placar numa pasta temporária),
// um jogador com conta cria a sala, fica parado até morrer e o servidor registra a partida como verificada.
// Uso: node tools/test-coop-board.mjs   (leva uns 2 minutos)
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const PORT = 3011;
const dir = mkdtempSync(join(tmpdir(), 'zomba-coop-placar-'));
const server = spawn(process.execPath, ['--import', 'tsx', 'src/server/main.ts'], { env: { ...process.env, PORT: String(PORT), ZOMBA_DATA: dir }, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
server.stdout.on('data', (d) => (log += d));
server.stderr.on('data', (d) => (log += d));
let ok = 0, bad = 0;
const check = (name, cond, detail = '') => { cond ? ok++ : bad++; console.log(`${cond ? 'ok  ' : 'FALHOU'} ${name}${detail ? ` (${detail})` : ''}`); };
const base = `http://localhost:${PORT}/api`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  for (let i = 0; i < 60 && !log.includes('ouvindo'); i++) await wait(250);
  const acc = await (await fetch(`${base}/conta`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Carla', pass: 'coop1234' }) })).json();
  check('conta criada no servidor de teste', !!acc.token);
  const ws = new WebSocket(`ws://localhost:${PORT}`);
  let over = null;
  ws.on('message', (raw) => {
    const m = JSON.parse(String(raw));
    if (m.t === 'welcome') ws.send(JSON.stringify({ t: 'create', name: 'Carla', level: 1, startRound: 1, mapId: 'cidade', token: acc.token }));
    if (m.t === 'lobby') ws.send(JSON.stringify({ t: 'start' }));
    if (m.t === 'ev') for (const e of m.list) if (e.e === 'gameover') over = e;
  });
  const t0 = Date.now();
  while (!over && Date.now() - t0 < 200000) await wait(500);
  check('a partida de co-op terminou (o jogador parado morreu)', !!over, over ? `rodada ${over.round} em ${Math.round((Date.now() - t0) / 1000)} s` : 'sem fim de jogo');
  await wait(1000);
  const { runs } = await (await fetch(`${base}/placar?modo=coop&inicio=zero&mapa=cidade`)).json();
  check('o servidor registrou a partida no placar, verificada', runs.length === 1 && runs[0].name === 'Carla' && runs[0].verified === true, JSON.stringify(runs));
  const rec = await (await fetch(`${base}/partida`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: acc.token, run: { mode: 'coop', map: 'cidade', round: 40, startRound: 1, players: 2, kills: 900, headshots: 1, downs: 0, revives: 0, seconds: 9999 } }) })).json();
  check('co-op mandado pelo navegador é recusado', !!rec.error, rec.error);
  ws.close();
} finally {
  server.kill();
  await wait(300);
  rmSync(dir, { recursive: true, force: true });
}
console.log(`\n${ok} ok, ${bad} falharam`);
process.exit(bad ? 1 : 0);
