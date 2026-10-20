// Proteções do servidor: limite de conexões por endereço, chute de códigos de sala, tirar da sala
// (e não voltar), cabeçalhos de segurança.
// Uso: suba um servidor de teste atrás de "túnel" simulado e rode o teste:
//   PORT=3012 HOST=127.0.0.1 ZOMBA_PROXY=cloudflare ZOMBA_DATA=<pasta> node --import tsx src/server/main.ts
//   node tools/test-guard.mjs [http://127.0.0.1:3012]
// Num servidor local, o teste finge endereços diferentes com o cabeçalho que o túnel da Cloudflare põe.
import { WebSocket } from 'ws';

const base = (process.argv[2] ?? 'http://127.0.0.1:3012').replace(/\/+$/, '');
const local = /\/\/(127\.|localhost)/.test(base);

let fail = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'ok ' : 'FALHOU'} ${name} ${extra}`);
  if (!cond) fail++;
};

class Peer {
  constructor(ip) {
    this.msgs = [];
    this.waiters = [];
    const headers = { origin: base };
    if (local && ip) headers['cf-connecting-ip'] = ip;
    this.ws = new WebSocket(base.replace(/^http/, 'ws'), { headers });
    this.closed = new Promise((ok) => this.ws.on('close', ok));
    this.ws.on('error', () => {});
    this.ws.on('message', (d) => {
      const m = JSON.parse(String(d));
      this.msgs.push(m);
      this.waiters = this.waiters.filter((w) => !(w.test(m) && (w.ok(m), true)));
    });
  }
  send(m) {
    this.ws.send(JSON.stringify(m));
  }
  wait(test, ms = 4000) {
    const hit = this.msgs.find(test);
    if (hit) return Promise.resolve(hit);
    return new Promise((ok) => {
      const w = { test, ok };
      this.waiters.push(w);
      setTimeout(() => ok(null), ms);
    });
  }
  close() {
    this.ws.close();
  }
}
const isT = (t) => (m) => m.t === t;

// cabeçalhos
const page = await fetch(`${base}/`);
check('x-frame-options', page.headers.get('x-frame-options') === 'DENY');
check('nosniff', page.headers.get('x-content-type-options') === 'nosniff');
check('csp sem script de fora', /script-src 'self'(;|$)/.test(page.headers.get('content-security-policy') ?? ''));

// limite de conexões por endereço (8)
const many = [];
for (let i = 0; i < 9; i++) many.push(new Peer('203.0.113.7'));
const results = await Promise.all(many.map((p) => p.wait((m) => m.t === 'welcome' || m.t === 'error')));
const welcomed = results.filter((m) => m?.t === 'welcome').length;
check('9ª conexão do mesmo endereço recusada', welcomed === 8, `(${welcomed} entraram)`);
many.forEach((p) => p.close());
await Promise.all(many.map((p) => p.closed));
const other = new Peer('203.0.113.8');
check('outro endereço entra', !!(await other.wait(isT('welcome'))));

// chute de códigos: 12 errados por minuto, depois espera
const guesser = new Peer('198.51.100.20');
await guesser.wait(isT('welcome'));
const codes = ['QQQQ', 'QQQW', 'QQQE', 'QQQR', 'QQQT', 'QQQY', 'QQQU', 'QQQP', 'QQQA', 'QQQS', 'QQQD', 'QQQF', 'QQQG'];
let blocked = null;
for (const code of codes) {
  guesser.msgs.length = 0;
  guesser.send({ t: 'join', code, name: 'Chute', level: 1 });
  const m = await guesser.wait(isT('error'));
  blocked = m?.msg ?? null;
}
check('13º código errado bloqueado', /Muitos códigos/.test(blocked ?? ''), blocked ?? '');

// tirar da sala: o anfitrião tira, a pessoa não volta para a mesma sala
const host = new Peer('192.0.2.1');
await host.wait(isT('welcome'));
host.send({ t: 'create', name: 'Anfitriao', level: 1, startRound: 1, mapId: 'cidade' });
const lobby = await host.wait(isT('lobby'));
check('sala criada', !!lobby?.code);
const stranger = new Peer('192.0.2.66');
const sw = await stranger.wait(isT('welcome'));
stranger.send({ t: 'join', code: lobby.code, name: 'Estranho', level: 1 });
check('estranho entrou', !!(await stranger.wait(isT('lobby'))));
// quem não é anfitrião não tira ninguém
stranger.send({ t: 'kick', id: 'p1' });
host.msgs.length = 0;
host.send({ t: 'kick', id: sw.id });
const left = await stranger.wait(isT('left'));
check('estranho tirado', /tirou/.test(left?.msg ?? ''), left?.msg ?? '');
const after = await host.wait((m) => m.t === 'lobby' && m.players.length === 1);
check('lobby do anfitrião atualizou', !!after);
stranger.msgs.length = 0;
stranger.send({ t: 'join', code: lobby.code, name: 'Estranho', level: 1 });
const again = await stranger.wait(isT('error'));
check('estranho não volta', /tirou você desta sala/.test(again?.msg ?? ''), again?.msg ?? '');
const friend = new Peer('192.0.2.2');
await friend.wait(isT('welcome'));
friend.send({ t: 'join', code: lobby.code, name: 'Amigo', level: 1 });
check('amigo entra normalmente', !!(await friend.wait((m) => m.t === 'lobby' && m.players.length === 2)));

// /api/info
const info = await (await fetch(`${base}/api/info`)).json();
check('api/info', info.ok === true && info.game === 'zomba');

// sai sozinho quando as conexões fecharem (process.exit com conexão fechando quebra o Node no Windows)
for (const p of [other, guesser, host, stranger, friend]) p.close();
console.log(fail ? `${fail} falha(s)` : 'tudo certo');
process.exitCode = fail ? 1 : 0;
