// Regras do placar online (sem navegador): contas, senhas, tokens, partidas aceitas e recusadas, melhor por categoria.
// Uso: npx tsx tools/test-board.ts
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkRun, type RunInput } from '../src/shared/board';
import { Board } from '../src/server/board';

let passes = 0, fails = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) passes++;
  else fails++;
  console.log(`${ok ? 'ok  ' : 'FALHOU'} ${name}${detail ? ` (${detail})` : ''}`);
};
const dir = mkdtempSync(join(tmpdir(), 'zomba-placar-'));
const maps = ['cidade', 'rota'];
const run = (o: Partial<RunInput> = {}): RunInput => ({
  mode: 'solo', map: 'cidade', round: 10, startRound: 1, players: 1, kills: 150, headshots: 40, downs: 0, revives: 0, seconds: 900, ...o,
});
try {
  const b = new Board(dir);
  const a = b.login('Ana', 'segredo1');
  check('cria a conta no primeiro login', 'token' in a && a.created && a.name === 'Ana');
  const again = b.login('ana', 'segredo1');
  check('entra de novo com o mesmo nome (sem diferença de maiúsculas)', 'token' in again && !again.created && again.name === 'Ana');
  check('senha errada é recusada', 'error' in b.login('Ana', 'outra'));
  check('senha curta é recusada', 'error' in b.login('Beto', '12'));
  check('nome curto é recusado', 'error' in b.login('x', '1234'));
  const tok = 'token' in a ? a.token : '';
  check('token vale para a conta', b.nameOf(tok) === 'Ana');
  check('token adulterado não vale', b.nameOf(tok.slice(0, -2) + 'zz') === null && b.nameOf('lixo') === null && b.nameOf(42) === null);
  b.flush();
  check('a senha não fica guardada no arquivo', !readFileSync(join(dir, 'placar.json'), 'utf8').includes('segredo1'));

  // regras da partida
  check('partida normal passa', typeof checkRun(run(), maps) === 'object');
  check('rodada impossível de rápida é recusada', typeof checkRun(run({ round: 60, seconds: 100 }), maps) === 'string');
  check('mais cabeça que abates é recusada', typeof checkRun(run({ headshots: 999 }), maps) === 'string');
  check('mapa que não existe é recusado', typeof checkRun(run({ map: 'lua' }), maps) === 'string');
  check('números estranhos são recusados', typeof checkRun({ ...run(), round: -3 }, maps) === 'string' && typeof checkRun({ ...run(), kills: NaN }, maps) === 'string');

  // só a melhor partida de cada jogador em cada categoria fica no placar
  b.addRun('Ana', run({ round: 10 }), false);
  b.addRun('Ana', run({ round: 8 }), false);
  b.addRun('Ana', run({ round: 14, seconds: 2000 }), false);
  b.addRun('Ana', run({ mode: 'coop', players: 2, round: 9 }), true);
  b.addRun('Ana', run({ map: 'rota', round: 5 }), false);
  b.addRun('Ana', run({ startRound: 20, round: 25 }), false);
  const top = b.top('solo', 'zero', 'cidade');
  check('uma linha por jogador por categoria, a melhor', top.length === 1 && top[0].round === 14, JSON.stringify(top.map((r) => r.round)));
  check('categorias separadas (co-op, Rota, rodada escolhida)', b.top('coop', 'zero', 'cidade')[0]?.verified === true && b.top('solo', 'zero', 'rota')[0]?.round === 5 && b.top('solo', 'custom', 'cidade')[0]?.startRound === 20);
  b.login('Beto', 'abcd');
  b.addRun('Beto', run({ round: 20, seconds: 3000 }), false);
  const t2 = b.top('solo', 'zero', 'cidade');
  check('placar em ordem de rodada', t2[0].name === 'Beto' && t2[1].name === 'Ana');
  const ana = b.players().find((p) => p.name === 'Ana')!;
  check('estatísticas somam todas as partidas', ana.games === 6 && ana.bestSolo === 14 && ana.bestCoop === 9, JSON.stringify(ana));
  b.flush();
  const b2 = new Board(dir);
  check('placar sobrevive a reiniciar o servidor', b2.top('solo', 'zero', 'cidade').length === 2 && b2.nameOf(tok) === 'Ana');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log(`\n${passes} ok, ${fails} falharam`);
process.exit(fails ? 1 : 0);
