// Regras da sala de co-op que roda no navegador do anfitrião (sem rede e sem navegador). Uso: npx tsx tools/test-hostroom.ts
import { HostRoom, type RoomIO } from '../src/client/p2p/hostRoom';
import { decodeMsg, decodeSnap, encodeMsg, encodeSnap } from '../src/client/p2p/wire';
import type { ServerMsg, Snapshot } from '../src/shared/protocol';

let fails = 0;
function check(name: string, ok: boolean, detail = '') {
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FALHOU'} ${name}${detail ? ` (${detail})` : ''}`);
}

function mk() {
  const sent: { to: string; m: ServerMsg }[] = [];
  const all: ServerMsg[] = [];
  const snaps: Snapshot[] = [];
  const dropped: string[] = [];
  const io: RoomIO = {
    send: (id, m) => sent.push({ to: id, m }),
    broadcast: (m) => all.push(m),
    broadcastSnap: (s) => snaps.push(s),
    drop: (id) => dropped.push(id),
  };
  const room = new HostRoom('ABC234', io, { name: 'Ana', level: 3, bank: 100, startRound: 1, mapId: 'cidade' });
  return { room, sent, all, snaps, dropped };
}
const join = (name = 'Beto', v?: number) => ({ t: 'join' as const, code: 'ABC234', name, level: 1, v });
const lastLobby = (all: ServerMsg[]) => [...all].reverse().find((m) => m.t === 'lobby') as Extract<ServerMsg, { t: 'lobby' }>;

// --- entrar, sair, lotação ---
{
  const { room, sent, all } = mk();
  const r = room.addGuest('k1', join('Beto'));
  check('convidado entra e recebe o id', 'id' in r && r.id === 'p1');
  check('o convidado recebe "welcome"', sent.some((s) => s.to === 'p1' && s.m.t === 'welcome'));
  check('o lobby lista os dois, anfitrião p0', lastLobby(all).players.length === 2 && lastLobby(all).hostId === 'p0');
  check('o mesmo convidado entrando de novo não duplica', 'id' in room.addGuest('k1', join('Beto')) && room.members.size === 2);
  for (const k of ['k2', 'k3']) room.addGuest(k, join(k));
  const cheio = room.addGuest('k4', join('Quinto'));
  check('sala cheia recusa o quinto (máx. 4)', 'error' in cheio && /cheia/.test(cheio.error));
  room.remove('p2');
  check('quem sai libera a vaga e o lobby se atualiza', room.members.size === 3 && lastLobby(all).players.length === 3);
  check('depois de sair, entra outro', 'id' in room.addGuest('k5', join('Novo')));
  check('versão diferente do protocolo é recusada com aviso', 'error' in mk().room.addGuest('kx', join('Velho', 99)));
  check('nome é limpo (sem símbolos, até 16 letras)', (() => { const m = mk(); m.room.addGuest('ky', { ...join(), name: '<b>Hacker</b>MuitoLongoNomeAqui' }); return [...m.room.members.values()][1].name.length <= 16 && ![...m.room.members.values()][1].name.includes('<'); })());
}

// --- só o anfitrião manda na sala ---
{
  const { room, all, sent, dropped } = mk();
  room.addGuest('k1', join('Beto'));
  room.handle('p1', { t: 'config', startRound: 9, mapId: 'rota' });
  check('convidado não muda a configuração', lastLobby(all).startRound === 1 && lastLobby(all).mapId === 'cidade');
  room.handle('p0', { t: 'config', startRound: 9, mapId: 'rota' });
  check('anfitrião muda rodada e mapa', lastLobby(all).startRound === 9 && lastLobby(all).mapId === 'rota');
  room.handle('p0', { t: 'config', startRound: 9999, mapId: 'inexistente' });
  check('valores absurdos são limitados', lastLobby(all).startRound === 100 && lastLobby(all).mapId === 'rota');
  room.handle('p1', { t: 'start' });
  check('convidado não inicia a partida', !room.sim);
  room.handle('p1', { t: 'kick', id: 'p0' });
  check('convidado não tira o anfitrião', room.members.has('p0'));
  room.handle('p0', { t: 'kick', id: 'p1' });
  check('anfitrião tira o convidado: aviso, corte da ligação e sai do lobby', sent.some((s) => s.to === 'p1' && s.m.t === 'left') && dropped.includes('p1') && !room.members.has('p1'));
  const volta = room.addGuest('k1', join('Beto'));
  check('quem foi tirado não volta com a mesma ligação', 'error' in volta && /tirou/.test(volta.error));
}

// --- partida ---
{
  const { room, sent, snaps, all } = mk();
  room.addGuest('k1', join('Beto'));
  room.handle('p0', { t: 'start' });
  check('iniciar: cada jogador recebe "started" com o próprio id', sent.filter((s) => s.m.t === 'started').map((s) => (s.m as { you: string }).you).sort().join() === 'p0,p1' && !!room.sim);
  check('o anfitrião também está na partida', room.sim!.players.has('p0') && room.sim!.players.has('p1'));
  const r = room.addGuest('k2', join('Atrasado'));
  check('depois de iniciar ninguém entra', 'error' in r && /começou/.test(r.error));
  room.advance(0.5);
  check('avançar manda um estado por lote e os eventos', snaps.length === 1 && snaps[0].players.length === 2, `${snaps.length}`);
  room.advance(100);
  check('lag grande não faz a partida correr de uma vez (limite de 0,25 s por lote)', snaps.length === 2);
  room.handle('p1', { t: 'ping', n: 5 });
  check('ping é respondido só a quem pediu', sent.some((s) => s.to === 'p1' && s.m.t === 'pong' && s.m.n === 5));
  const antes = room.sim!.players.get('p1')!.x;
  room.handle('p1', { t: 'state', x: antes + 0.2, y: 0, z: room.sim!.players.get('p1')!.z, yaw: 0, pitch: 0, crouch: false, speed: 1 });
  check('a entrada do convidado chega à simulação', Math.abs(room.sim!.players.get('p1')!.x - (antes + 0.2)) < 1e-6);
  room.handle('p1', { t: 'interact' } as never);
  room.handle('p1', { t: 'shoot', weapon: 12, hits: 'x' } as never);
  room.advance(0.1);
  check('mensagem malformada não derruba a sala', snaps.length === 3);
  room.remove('p1');
  check('quem cai no meio da partida sai da simulação', !room.sim!.players.has('p1'));
  room.close('fim');
  check('fechar a sala avisa os convidados (só quem ficou)', all.length > 0);
}

// --- limite de mensagens ---
{
  const { room, sent } = mk();
  room.addGuest('k1', join('Beto'));
  sent.length = 0;
  for (let i = 0; i < 500; i++) room.handle('p1', { t: 'ping', n: i }, 1000);
  check('mais de 200 mensagens por segundo são ignoradas', sent.length === 200, `${sent.length}`);
  room.handle('p1', { t: 'ping', n: 1 }, 2100);
  check('no segundo seguinte volta a valer', sent.length === 201);
}

// --- formato das mensagens ---
{
  const m = { t: 'lobby', code: 'X', hostId: 'p0', players: [], startRound: 1, mapId: 'cidade' } as ServerMsg;
  check('mensagem de controle vai e volta igual', JSON.stringify(decodeMsg(encodeMsg(m))) === JSON.stringify(m));
  check('lixo não vira mensagem', decodeMsg('not json') === null && decodeMsg('{"x":1}') === null && decodeMsg(42) === null && decodeMsg('x'.repeat(70000)) === null);
  const m2 = mk();
  m2.room.addGuest('k1', join('B'));
  m2.room.handle('p0', { t: 'start' });
  m2.room.advance(0.1);
  const snap = m2.snaps[0];
  const bytes = encodeSnap(7, snap);
  const back = decodeSnap(bytes);
  check('estado do jogo vai e volta igual, com a sequência', !!back && back.seq === 7 && JSON.stringify(back.s) === JSON.stringify(snap));
  check('estado comprimido é bem menor que o JSON', bytes.length < JSON.stringify(snap).length / 2, `${bytes.length} contra ${JSON.stringify(snap).length}`);
  check('bytes quebrados não viram estado', decodeSnap(new Uint8Array([1, 2, 3, 4, 5, 6, 7])) === null && decodeSnap('x') === null);
}

console.log(fails ? `\n${fails} falharam` : '\ntudo certo');
process.exit(fails ? 1 : 0);
