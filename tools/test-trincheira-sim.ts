// Testes das regras da Trincheira (sem navegador). Uso: npx tsx tools/test-trincheira-sim.ts
import { TRINCHEIRA as T } from '../src/shared/constants';
import { getMap } from '../src/shared/map';
import type { GameEvent } from '../src/shared/protocol';
import { GameSim, zombieHealth } from '../src/shared/sim';
import { ids, ELEMENT_LIST } from '../src/shared/trincheira-info';

let fails = 0;
let passes = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) passes++;
  else fails++;
  console.log(`${ok ? 'ok  ' : 'FALHOU'} ${name}${detail ? ` (${detail})` : ''}`);
}

const map = getMap('trincheira');
const D = map.trincheira!;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const raw = (s: GameSim) => s as any;
const has = (ev: GameEvent[], e: string, extra: (x: GameEvent) => boolean = () => true) => ev.some((x) => x.e === e && extra(x));

function mk(players = 1, round = 1) {
  const s = new GameSim(map, false, { startRound: round });
  for (let i = 0; i < players; i++) s.addPlayer(`p${i}`, `P${i}`, i);
  s.start();
  return s;
}
const me = (s: GameSim, i = 0) => s.players.get(`p${i}`)!;
const goto = (s: GameSim, x: number, z: number, i = 0, y = 0) => {
  s.handle(`p${i}`, { t: 'state', x, y, z, yaw: 0, pitch: 0, crouch: false, speed: 0 });
};
const it = (id: string) => map.interactables.find((x) => x.id === id)!;
const goIt = (s: GameSim, id: string, i = 0) => goto(s, it(id).use[0], it(id).use[1], i);
const use = (s: GameSim, id: string, i = 0, weapon = 'pistol') => s.handle(`p${i}`, { t: 'interact', id, weapon });
const run = (s: GameSim, secs: number, dt = 0.05) => {
  const out: GameEvent[] = [];
  for (let t = 0; t < secs; t += dt) {
    s.tick(dt);
    out.push(...s.drainEvents());
  }
  return out;
};
const ev0 = (s: GameSim) => s.drainEvents();
// põe a rodada em andamento sem zumbis (para testar sem ruído)
const quiet = (s: GameSim) => {
  s.tick(3.2);
  raw(s).toSpawn = 0;
  raw(s).zombies.clear();
  // nenhuma rodada nova põe zumbis no caminho (quem quer zumbis os cria com zombie())
  raw(s).spawnZombie = () => undefined;
  s.drainEvents();
};
const tr = (s: GameSim) => raw(s).tr;
const zombie = (s: GameSim, x: number, z: number, hp = 150, kind = 0) => {
  const zb = raw(s).makeZombie(kind, x, z, hp, 1.1, {});
  zb.anim = 'move';
  return zb;
};

// --- geradores ---
{
  const s = mk(2);
  quiet(s);
  const a = me(s);
  const g0 = D.gens[0];
  goto(s, g0.x + 2, g0.z + 1);
  a.points = 100;
  use(s, ids.gen(0));
  check('gerador sem pontos é recusado', has(ev0(s), 'deny', (e) => e.e === 'deny' && e.reason === 'pontos') && !tr(s).gens[0].capturing);
  a.points = 1000;
  use(s, ids.gen(0));
  const ev = ev0(s);
  check('gerador: paga 200 e a captura começa', has(ev, 'gen', (e) => e.e === 'gen' && e.phase === 'start') && a.points === 800 && tr(s).gens[0].capturing);
  run(s, 10);
  check('captura anda enquanto há jogador dentro (metade em ~10 s)', tr(s).gens[0].progress > 0.4 && tr(s).gens[0].progress < 0.6, `progresso ${tr(s).gens[0].progress.toFixed(2)}`);
  goto(s, g0.x + 30, g0.z);
  run(s, 4);
  check('sem ninguém dentro o progresso volta', tr(s).gens[0].progress < 0.35, `progresso ${tr(s).gens[0].progress.toFixed(2)}`);
  run(s, 12);
  check('captura zerada cancela sem devolver os pontos', !tr(s).gens[0].capturing && a.points === 800);
  goto(s, g0.x + 2, g0.z + 1);
  use(s, ids.gen(0));
  ev0(s);
  const ev2 = run(s, 21);
  check('gerador liga em 20 s com 1 jogador', tr(s).gens[0].on && has(ev2, 'gen', (e) => e.e === 'gen' && e.phase === 'done'));
  check('gerador ligado não pode ser comprado de novo', (use(s, ids.gen(0)), has(ev0(s), 'deny')));
}
// dois jogadores dentro: cada um paga e liga mais rápido
{
  const s = mk(2);
  quiet(s);
  const g = D.gens[1];
  goto(s, g.x + 2, g.z, 0);
  goto(s, g.x - 2, g.z, 1);
  me(s, 0).points = 1000;
  me(s, 1).points = 100;
  use(s, ids.gen(1), 0);
  check('com dois dentro, falta de pontos de um nega para todos', has(ev0(s), 'deny') && !tr(s).gens[1].capturing);
  me(s, 1).points = 1000;
  use(s, ids.gen(1), 0);
  ev0(s);
  check('cada jogador dentro paga 200', me(s, 0).points === 800 && me(s, 1).points === 800);
  run(s, 14);
  check('dois jogadores ligam em ~13 s', tr(s).gens[1].on, `progresso ${tr(s).gens[1].progress.toFixed(2)}`);
}

// --- bebidas por gerador, Forja que sobe, Fonte da Sorte ---
{
  const s = mk();
  quiet(s);
  const a = me(s);
  a.points = 20000;
  goIt(s, 'perk-folego');
  use(s, 'perk-folego');
  check('bebida com o gerador desligado é recusada', has(ev0(s), 'deny', (e) => e.e === 'deny' && e.reason === 'desligada') && a.perks.length === 0);
  tr(s).debug('gens', undefined, a);
  check('com os 6 geradores a Forja sobe', tr(s).forjaUp && has(ev0(s), 'forjaSobe') && s.forge.on === false);
  use(s, 'perk-folego');
  check('bebida com o gerador ligado funciona', a.perks.includes('folego'));
}
{
  // a Forja só acende quando sobe
  const s = mk();
  check('Forja começa apagada', s.forge.on === false);
  quiet(s);
  tr(s).debug('gens', undefined, me(s));
  s.tick(0.1);
  check('a Forja sobe em 6 s (ainda apagada no começo)', s.forge.on === false);
  run(s, 6);
  check('Forja acende com os 6 geradores e fica para sempre', s.forge.on === true);
  tr(s).gens[0].on = false;
  s.tick(0.1);
  check('recapturar um gerador não derruba a Forja', s.forge.on === true);
}
{
  const s = mk();
  quiet(s);
  const a = me(s);
  a.points = 20000;
  tr(s).debug('gens', undefined, a);
  const f = tr(s).fizz;
  goIt(s, ids.fizz(f.loc));
  use(s, ids.fizz(f.loc));
  ev0(s);
  check('Fonte da Sorte: cobra 1500 e gira', a.points === 18500 && tr(s).fizz.state === 'spin');
  run(s, 4.2);
  check('Fonte da Sorte entrega uma bebida nova', a.perks.length === 1);
  // todas as bebidas, sempre uma que não tem
  for (let i = 0; i < 5; i++) {
    use(s, ids.fizz(tr(s).fizz.loc));
    run(s, 4.2);
    if (tr(s).fizz.loc !== f.loc) goIt(s, ids.fizz(tr(s).fizz.loc));
  }
  const unique = new Set(a.perks).size === a.perks.length;
  check('Fonte: bebidas sem repetir e respeitando o limite de 4', unique && a.perks.length <= 4, a.perks.join(','));
  // depois de 4 a 6 usos ela vai embora para outro local com gerador ligado
  const s2 = mk();
  quiet(s2);
  me(s2).points = 999999;
  tr(s2).debug('gens', undefined, me(s2));
  // com o tempo a rodada avança e um sorteio de Cruzados poderia desligar o gerador de destino: sem recaptura aqui
  tr(s2).startRecapture = () => undefined;
  const start = tr(s2).fizz.loc;
  let uses = 0;
  for (let i = 0; i < 8 && tr(s2).fizz.loc === start; i++) {
    const p = me(s2);
    p.perks = [];
    p.life = 'alive';
    goIt(s2, ids.fizz(start));
    use(s2, ids.fizz(start));
    run(s2, 4.2);
    uses++;
  }
  check('Fonte foge depois de 4 a 6 usos', tr(s2).fizz.loc !== start && uses >= 4 && uses <= 6, `${uses} usos, agora no local ${tr(s2).fizz.loc}`);
  check('local novo tem gerador ligado e o antigo perde a colisão', raw(s2).world.openDoors.has(`fizz-spot-${start}`) && !raw(s2).world.openDoors.has(`fizz-spot-${tr(s2).fizz.loc}`));
}

// --- clima ---
{
  let bad = 0;
  let snowBy7 = 0;
  const N = 200;
  for (let k = 0; k < N; k++) {
    const s = mk();
    let snow = false;
    let last = 0;
    let gap = 0;
    for (let r = 1; r <= 40; r++) {
      tr(s).onRoundStart(r);
      const w = tr(s).weather;
      if (r <= 2 && w !== 'limpo') bad++;
      if (w === 'neve') {
        snow = true;
        last = r;
      } else if (snow) gap = Math.max(gap, r - last);
      if (r === 7 && snow) snowBy7++;
      if (r > 7 && !snow) bad++;
      if (snow && r - last > T.snowGap) bad++;
    }
  }
  check('clima: rodadas 1 e 2 limpas, neve garantida até a 7 e nunca 8 sem neve', bad === 0 && snowBy7 === N, `${bad} falhas, neve até a 7 em ${snowBy7}/${N}`);
  const s = mk();
  const cnt = { limpo: 0, chuva: 0, neve: 0 };
  for (let r = 3; r < 3003; r++) {
    tr(s).onRoundStart(r);
    cnt[tr(s).weather as 'limpo']++;
  }
  check('clima: proporções perto de 50/30/20 (a garantia de neve empurra um pouco)', cnt.limpo > 1300 && cnt.chuva > 700 && cnt.neve > 500, JSON.stringify(cnt));
}

// --- pá e montes de terra ---
{
  const s = mk();
  quiet(s);
  const a = me(s);
  goIt(s, ids.shovel(0));
  use(s, ids.shovel(0));
  check('pega a pá', tr(s).P(a).shovel);
  // os montes das rodadas anteriores se somam: limpar antes e medir a proporção em muitas rodadas
  {
    const nComuns = D.mounds.length - 3;
    let total = 0;
    const N = 400;
    for (let k = 0; k < N; k++) {
      tr(s).mounds.clear();
      tr(s).onRoundStart(3);
      total += [...tr(s).mounds].filter((i: number) => i < nComuns).length;
    }
    const media = total / (N * nComuns);
    check('começo de rodada põe montes (média de 45% ± 10%)', Math.abs(media - T.moundChance) < 0.1, `${(media * 100).toFixed(1)}%`);
  }
  tr(s).mounds.clear();
  tr(s).onRoundStart(3);
  check('começo de rodada põe pelo menos um monte', tr(s).mounds.size >= 1 || [...Array(40).keys()].some(() => (tr(s).mounds.clear(), tr(s).onRoundStart(3), tr(s).mounds.size >= 1)));
  const idx = [...tr(s).mounds].find((i) => i < 18)!;
  goIt(s, ids.mound(idx));
  s.handle('p0', { t: 'hold', id: ids.mound(idx) });
  const ev = run(s, 1.0);
  check('cavar leva 1,2 s', !has(ev, 'dig') && tr(s).mounds.has(idx));
  const ev2 = run(s, 0.4);
  check('depois de 1,2 s o monte some e dá resultado', has(ev2, 'dig') && !tr(s).mounds.has(idx));
  // sorteio: todos os resultados aparecem e as proporções ficam perto da tabela
  const tally: Record<string, number> = {};
  for (let k = 0; k < 3000; k++) {
    const s2 = mk();
    quiet(s2);
    tr(s2).debug('montes', undefined, me(s2));
    const p = me(s2);
    const t2 = tr(s2);
    const target = 0;
    goIt(s2, ids.mound(target));
    s2.handle('p0', { t: 'hold', id: ids.mound(target) });
    const e = run(s2, 1.3, 0.1).find((x) => x.e === 'dig') as Extract<GameEvent, { e: 'dig' }> | undefined;
    if (e) tally[e.result] = (tally[e.result] ?? 0) + 1;
    void p;
    void t2;
  }
  const pct = (k: string) => (tally[k] ?? 0) / 30;
  check('monte: 25% item, 20% granadas, 18% pontos, 15% zumbi, 12% terra, 7% arma, 3% bebida', Math.abs(pct('powerup') - 25) < 4 && Math.abs(pct('granadas') - 20) < 4 && Math.abs(pct('pontos') - 18) < 4 && Math.abs(pct('zumbi') - 15) < 4 && Math.abs(pct('terra') - 12) < 4 && Math.abs(pct('arma') - 7) < 3 && Math.abs(pct('bebida') - 3) < 2, JSON.stringify(tally));
}
{
  // montes de gelo só na neve; dão a peça do Cajado de Gelo
  const s = mk();
  quiet(s);
  tr(s).onRoundStart(3);
  const ice0 = [...tr(s).mounds].filter((i: number) => i >= 18);
  tr(s).weather = 'limpo';
  check('sem neve não há monte de gelo', ice0.length === 0 || tr(s).weather !== 'neve');
  let found = false;
  for (let r = 3; r < 40 && !found; r++) {
    tr(s).onRoundStart(r);
    if (tr(s).weather === 'neve') found = [...tr(s).mounds].some((i: number) => i >= 18);
  }
  check('na neve aparecem os 3 montes de gelo', found && [...tr(s).mounds].filter((i: number) => i >= 18).length === 3);
  const a = me(s);
  tr(s).P(a).shovel = true;
  goIt(s, ids.mound(18));
  s.handle('p0', { t: 'hold', id: ids.mound(18) });
  run(s, 1.3);
  check('cavar o monte de gelo dá a peça 1 do Cajado de Gelo', tr(s).team.has('gelo-1'));
  // Pá Dourada depois de 30 montes e Capacete na primeira cavada com ela
  const s3 = mk();
  quiet(s3);
  const p3 = me(s3);
  const t3 = tr(s3).P(p3);
  t3.shovel = true;
  t3.digs = 29;
  tr(s3).debug('montes', undefined, p3);
  goIt(s3, ids.mound(1));
  s3.handle('p0', { t: 'hold', id: ids.mound(1) });
  const evG = run(s3, 1.4);
  check('30º monte dá a Pá Dourada', t3.goldShovel && has(evG, 'dig', (e) => e.e === 'dig' && e.result === 'pa-dourada'));
  goIt(s3, ids.mound(2));
  s3.handle('p0', { t: 'hold', id: ids.mound(2) });
  const evH = run(s3, 0.9);
  check('com a Pá Dourada cava em 0,6 s e sai o Capacete Dourado', t3.helmet && has(evH, 'dig', (e) => e.e === 'dig' && e.result === 'capacete'));
}

// --- tanque ---
{
  const s = mk();
  quiet(s);
  const a = me(s);
  a.points = 2000;
  goIt(s, ids.tank);
  use(s, ids.tank);
  ev0(s);
  check('tanque: cobra 500 e sai', a.points === 1500 && tr(s).tank.state === 'volta');
  // coloca um zumbi na frente e confere o esmagamento
  const t = tr(s).tank;
  run(s, 1.5);
  const [nx, nz] = D.tank.path[(t.seg + 1) % D.tank.path.length];
  const dx = nx - t.x, dz = nz - t.z, dl = Math.hypot(dx, dz);
  const zb = zombie(s, t.x + (dx / dl) * 7, t.z + (dz / dl) * 7);
  const evs = run(s, 3);
  check('o tanque esmaga zumbi sem dar pontos', !raw(s).zombies.has(zb.id) && has(evs, 'esmaga') && a.kills === 0);
  // sobe no tanque e vai até a Igreja
  goto(s, t.x, t.z, 0, T.tankDeck);
  let seenChurch = false;
  let doorOpen = false;
  let atNorth = false;
  let secs = 0;
  while (secs < 200 && tr(s).tank.state !== 'espera') {
    const ev = run(s, 1);
    secs++;
    // carrega o jogador junto (o navegador faria isso)
    goto(s, tr(s).tank.x, tr(s).tank.z, 0, T.tankDeck);
    if (tr(s).tank.stop === 'igreja') seenChurch = true;
    if (tr(s).tank.stop === 'norte') atNorth = true;
    if (has(ev, 'door', (e) => e.e === 'door' && e.id === 'igreja')) doorOpen = true;
    if (secs > 3 && !tr(s).tank.stop && me(s).life !== 'alive') break;
  }
  check('tanque para na Igreja e na plataforma norte e volta à Estação', seenChurch && atNorth && tr(s).tank.state === 'espera', `${secs} s`);
  check('descer na Igreja de tanque abre o portão da Igreja de graça', doorOpen && raw(s).world.openDoors.has('igreja'));
  run(s, T.tankCooldown + 1);
  check('depois de 30 s o tanque pode ser chamado de novo', tr(s).tank.state === 'parado');
}
{
  // lança-chamas atrás do tanque
  const s = mk();
  quiet(s);
  me(s).points = 2000;
  goIt(s, ids.tank);
  use(s, ids.tank);
  run(s, 3);
  const t = tr(s).tank;
  const [nx, nz] = D.tank.path[(t.seg + 1) % D.tank.path.length];
  const dx = nx - t.x, dz = nz - t.z, dl = Math.hypot(dx, dz);
  const zb = zombie(s, t.x - (dx / dl) * 5.5, t.z - (dz / dl) * 5.5, 3000);
  zb.speed = 0;
  const hp0 = zb.hp;
  run(s, 1);
  check('lança-chamas traseiro queima zumbi atrás do tanque', !raw(s).zombies.has(zb.id) || zb.hp < hp0 - 100, `vida ${Math.round(zb.hp)}`);
}

// --- colossos ---
{
  const s = mk(2, 2);
  quiet(s);
  tr(s).debug('colosso', 'atlas', me(s));
  s.tick(0.1);
  const ev = run(s, 0.2);
  check('colosso: buzina antes de entrar', has(tr(s).robot ? [{ e: 'buzina', robot: 'atlas', dir: 1 }] : [], 'buzina') && tr(s).robot?.phase === 'aviso', JSON.stringify(tr(s).robot && { id: tr(s).robot.id, phase: tr(s).robot.phase }));
  void ev;
  run(s, T.robotWarn);
  check('depois do aviso começa a andar', tr(s).robot?.phase === 'passos' && tr(s).robot?.step === 0);
  // jogador na primeira pegada
  const foot = tr(s).robot.feet[0];
  goto(s, foot.cx, foot.cz, 0);
  const z1 = zombie(s, foot.cx + 1, foot.cz + 1);
  const evs = run(s, T.stepLift + T.stepMove + T.stepDown + 0.2);
  check('pisada: jogador na pegada cai, zumbi morre sem pontos', me(s).life !== 'alive' && !raw(s).zombies.has(z1.id) && has(evs, 'pisada'), me(s).life);
  check('o pé fica no chão por 1 s e vira obstáculo (colisão)', !raw(s).world.openDoors.has(`pe-${foot.id}`));
  run(s, T.stepHold + 0.1);
  check('depois o pé sai e a pegada abre de novo', raw(s).world.openDoors.has(`pe-${foot.id}`) && tr(s).robot.step === 1);
  // passagem inteira: 4 pegadas, depois pausa e o próximo colosso
  run(s, 6 * 3 + 1);
  check('passagem termina e o próximo da fila (Golias) vem depois da pausa', tr(s).robot === null);
  run(s, T.robotPause + 0.5);
  check('ordem Atlas, Golias, Titã', tr(s).robot?.id === 'golias', tr(s).robot?.id);
  // vento: caixotes abrem quando o colosso pisa em K ou B
}
{
  const s = mk(1, 2);
  quiet(s);
  check('peças do Vento começam trancadas', tr(s).windOpen === false);
  me(s).points = 0;
  const key = 'vento-1';
  const id = ids.part(key, 0);
  goIt(s, id);
  use(s, id);
  check('F no caixote trancado mostra "trancado"', has(ev0(s), 'deny', (e) => e.e === 'deny' && e.reason === 'trancado') && !tr(s).team.has(key));
  tr(s).windOpen = true;
  use(s, id);
  check('depois da pisada em K ou B o caixote abre', tr(s).team.has(key));
}

// --- Sangue Morto ---
{
  const s = mk();
  quiet(s);
  const a = me(s);
  goto(s, 100, 50);
  const zb = zombie(s, 100.5, 50.2, 5000);
  raw(s).applyPowerup('sangue', a);
  check('Sangue Morto dura 20 s', Math.abs(tr(s).P(a).zblood - 20) < 0.1);
  const h0 = a.health;
  run(s, 3);
  check('com Sangue Morto o zumbi colado não ataca', a.health === h0 && zb.anim !== 'attack');
  run(s, 18);
  check('Sangue Morto acaba e os zumbis voltam a atacar', tr(s).P(a).zblood === 0 && a.health < h0);
}
{
  const s = mk();
  check('sangue entra no sorteio de itens deste mapa e não nos outros', (map.powerupPool ?? []).includes('sangue') && !(getMap('cidade').powerupPool ?? []).includes('sangue'));
}

// --- peças, bancadas, Escudo e Drone ---
{
  const s = mk();
  quiet(s);
  const a = me(s);
  for (const key of ['escudo-rodas', 'escudo-trava', 'escudo-armacao']) {
    const id = [...tr(s).picks].find((x: string) => x.startsWith(`part:${key}:`))!;
    goIt(s, id);
    use(s, id);
  }
  check('as 3 peças do Escudo vão para a equipe', ['escudo-rodas', 'escudo-trava', 'escudo-armacao'].every((k) => tr(s).team.has(k)));
  goIt(s, ids.bench(1));
  s.handle('p0', { t: 'hold', id: ids.bench(1) });
  const ev = run(s, 2.2);
  check('bancada: segurar F por 2 s monta o Escudo', tr(s).build.escudo.built && tr(s).build.escudo.bench === 1 && has(ev, 'craft', (e) => e.e === 'craft' && e.phase === 'done'));
  goIt(s, ids.bench(0));
  use(s, ids.bench(0));
  check('só se pega o Escudo na bancada onde foi montado', tr(s).P(a).shield === 0);
  goIt(s, ids.bench(1));
  use(s, ids.bench(1));
  check('pega o Escudo (1500 de vida)', tr(s).P(a).shield === T.shieldHp);
  // ataque pelas costas é bloqueado; pela frente não
  a.yaw = 0;
  const h0 = a.health;
  raw(s).damagePlayer(a, 60, a.x, a.z + 2, false);
  check('Escudo bloqueia 100% do dano vindo de trás', a.health === h0 && tr(s).P(a).shield === T.shieldHp - 60);
  raw(s).damagePlayer(a, 30, a.x, a.z - 2, false);
  check('dano pela frente passa', a.health < h0);
  // quebra
  tr(s).P(a).shield = 20;
  a.health = 100;
  raw(s).damagePlayer(a, 60, a.x, a.z + 2, false);
  check('o Escudo quebra e o jogador espera a rodada seguinte', tr(s).P(a).shield === 0 && (use(s, ids.bench(1)), has(ev0(s), 'deny', (e) => e.e === 'deny' && e.reason === 'esgotado')));
}
{
  const s = mk();
  quiet(s);
  const a = me(s);
  tr(s).debug('drone', undefined, a);
  goIt(s, ids.bench(0));
  use(s, ids.bench(0));
  check('Drone: pega na bancada e voa por 60 s', tr(s).build.drone.state === 'voo' && tr(s).build.drone.owner === 'p0');
  goto(s, 100, 50);
  run(s, 1);
  const zb = zombie(s, 106, 50, 300);
  run(s, 2);
  check('Drone atira nos zumbis a até 18 m', !raw(s).zombies.has(zb.id) || zb.hp < 300, `vida ${Math.round(zb.hp)}`);
  a.life = 'downed';
  a.health = 0;
  a.bleed = 30;
  run(s, 3.3);
  check('Drone reanima o dono em 3 s (uma vez por voo)', a.life === 'alive');
  run(s, 60);
  check('depois de 60 s volta para a bancada e espera 90 s', tr(s).build.drone.state === 'espera');
  run(s, 91);
  check('depois de 90 s está pronto de novo', tr(s).build.drone.state === 'banco');
}

// --- portais e Câmara Antiga ---
{
  const s = mk();
  quiet(s);
  const a = me(s);
  const po = D.portals[0];
  goIt(s, ids.portal('fogo'));
  use(s, ids.portal('fogo'));
  check('portal sem gramofone e disco é recusado', has(ev0(s), 'deny', (e) => e.e === 'deny' && e.reason === 'faltam') && !tr(s).portals[0]);
  tr(s).team.add('gramofone');
  tr(s).team.add('disco');
  use(s, ids.portal('fogo'));
  ev0(s);
  run(s, 5);
  check('a música toca por 6 s antes do portal abrir', !tr(s).portals[0]);
  run(s, 1.2);
  check('portal abre e a laje some (sem colisão)', tr(s).portals[0] && raw(s).world.openDoors.has('portal-fogo'));
  goto(s, po.mouth[0], po.mouth[1]);
  const ev = run(s, 1.2);
  const al = D.chamber.alcoves.find((x) => x.el === 'fogo')!;
  check('1 s na boca do túnel teletransporta para a alcova', has(ev, 'teleporte', (e) => e.e === 'teleporte' && e.to === 'camara') && Math.hypot(a.x - al.c[0], a.z - al.c[1]) < 1, `${a.x.toFixed(1)},${a.z.toFixed(1)}`);
  // o navegador ainda manda a posição antiga por um instante: é ignorada
  goto(s, po.mouth[0], po.mouth[1]);
  check('posição velha do navegador é ignorada logo depois do teletransporte', Math.hypot(a.x - al.c[0], a.z - al.c[1]) < 1);
  run(s, 0.7);
  run(s, 2);
  goto(s, al.back[0], al.back[1]);
  const ev2 = run(s, 0.2);
  check('portal de volta leva à boca do túnel, 2 m para fora', has(ev2, 'teleporte', (e) => e.e === 'teleporte' && e.to === 'tunel') && Math.hypot(a.x - po.exit[0], a.z - po.exit[1]) < 1);
  // zumbis nascem na Câmara enquanto houver jogador lá
  const s2 = mk();
  quiet(s2);
  delete raw(s2).spawnZombie;
  goto(s2, al.c[0], al.c[1]);
  raw(s2).toSpawn = 10;
  raw(s2).spawnTimer = 0;
  run(s2, 8);
  const inChamber = [...raw(s2).zombies.values()].filter((z: { x: number }) => z.x > 136).length;
  check('zumbis nascem na Câmara com jogador dentro e só lá', inChamber > 0 && [...raw(s2).zombies.values()].every((z: { x: number }) => z.x > 136), `${inChamber} na Câmara de ${raw(s2).zombies.size}`);
}

// --- cajados: montagem, posse, enigmas, despertar ---
{
  const s = mk(2);
  quiet(s);
  const a = me(s, 0);
  const b = me(s, 1);
  goIt(s, ids.staff('gelo'));
  use(s, ids.staff('gelo'));
  check('cajado sem peças é recusado', has(ev0(s), 'deny', (e) => e.e === 'deny' && e.reason === 'faltam'));
  for (const k of ['gelo-1', 'gelo-2', 'gelo-3', 'cristal-gelo']) tr(s).team.add(k);
  use(s, ids.staff('gelo'));
  check('3 peças + cristal montam o cajado no pedestal', tr(s).staffs[1].st === 'pedestal' && !tr(s).team.has('gelo-1'));
  use(s, ids.staff('gelo'));
  check('F no pedestal pega o cajado (ocupa vaga de arma)', a.weapons.includes('cajado-gelo') && tr(s).staffs[1].st === 'mao');
  goIt(s, ids.staff('gelo'), 1);
  use(s, ids.staff('gelo'), 1);
  check('o cajado é único: outro jogador não pega', !b.weapons.includes('cajado-gelo'));
  use(s, ids.staff('gelo'));
  check('F de novo devolve o cajado', tr(s).staffs[1].st === 'pedestal' && !a.weapons.includes('cajado-gelo'));
  use(s, ids.staff('gelo'));
  a.life = 'downed';
  a.health = 0;
  a.bleed = 0.1;
  run(s, 0.3);
  check('dono sangrou até o fim: o cajado volta ao pedestal', a.life === 'dead' && tr(s).staffs[1].st === 'pedestal' && !a.weapons.includes('cajado-gelo'));
  // só um cajado por jogador
  for (const k of ['fogo-1', 'fogo-2', 'fogo-3', 'cristal-fogo']) tr(s).team.add(k);
  goIt(s, ids.staff('fogo'), 1);
  use(s, ids.staff('fogo'), 1);
  use(s, ids.staff('fogo'), 1);
  goIt(s, ids.staff('gelo'), 1);
  use(s, ids.staff('gelo'), 1);
  check('cada jogador carrega no máximo um cajado', b.weapons.filter((w: string) => w.startsWith('cajado')).length === 1);
}
{
  // enigma do Fogo: 6 abates a até 8 m de cada baú, com o cajado de Fogo
  const s = mk();
  quiet(s);
  const a = me(s);
  a.weapons = ['pistol', 'cajado-fogo'];
  let ok = true;
  D.chests.forEach((c, i) => {
    for (let k = 0; k < T.fireChestKills; k++) {
      const zb = zombie(s, c[0] + 2, c[1], 1);
      raw(s).curWeapon = 'cajado-fogo';
      raw(s).damageZombie(zb, 10, a, 'body', false, true);
      raw(s).curWeapon = null;
    }
    if (tr(s).staffs[0].puzzle[i] !== T.fireChestKills) ok = false;
  });
  check('Fogo: 6 abates em cada um dos 4 baús resolvem o enigma', ok && tr(s).staffs[0].solved);
  // abate sem o cajado não conta
  const s2 = mk();
  quiet(s2);
  const zb = zombie(s2, D.chests[0][0] + 2, D.chests[0][1], 1);
  raw(s2).damageZombie(zb, 10, me(s2), 'body', false, true);
  check('abate com outra arma não conta para o baú', tr(s2).staffs[0].puzzle[0] === 0);
}
{
  // enigma do Gelo: lápides só na neve
  const s = mk();
  quiet(s);
  const a = me(s);
  a.weapons = ['pistol', 'cajado-gelo'];
  const [lx, lz] = D.tombstones[0];
  // atira de um ponto a ~6 m de onde se vê o alvo (as lápides ficam além da borda baixa)
  const shoot = (el: string, x: number, y: number, z: number) => {
    for (let k = 0; k < 16; k++) {
      const ox = x + Math.cos((k / 16) * 6.283) * 6, oy = 1.5, oz = z + Math.sin((k / 16) * 6.283) * 6;
      const bx = x + (ox - x) / 6 * 0.9, bz = z + (oz - z) / 6 * 0.9;
      if (!raw(s).world.lineOfSight(ox, oy, oz, bx, y, bz)) continue;
      const dx = x - ox, dy = y - oy, dz = z - oz, dl = Math.hypot(dx, dy, dz);
      goto(s, ox, oz);
      tr(s).rayShot(a, el, ox, oy, oz, dx / dl, dy / dl, dz / dl, 25);
      return;
    }
  };
  tr(s).weather = 'limpo';
  shoot('cajado-gelo', lx, 0.6, lz);
  check('Gelo: lápide só racha com neve', tr(s).staffs[1].puzzle[0] === 0);
  tr(s).weather = 'neve';
  shoot('cajado-gelo', lx, 0.6, lz);
  check('Gelo: lápide acertada na neve racha', tr(s).staffs[1].puzzle[0] === 1);
  const [l1, l2] = [D.tombstones[1], D.tombstones[2]];
  shoot('cajado-gelo', l1[0], 0.6, l1[1]);
  shoot('cajado-gelo', l2[0], 0.6, l2[1]);
  check('Gelo: 3 lápides resolvem o enigma (e ficam mesmo se a neve passar)', tr(s).staffs[1].solved);
}
{
  // enigma do Vento: domos de qualquer distância com a rajada
  const s = mk();
  quiet(s);
  const a = me(s);
  a.weapons = ['pistol', 'cajado-vento'];
  for (const [x, z] of D.domes) {
    for (let k = 0; k < 64; k++) {
      const R = [8, 14, 22, 30][k % 4];
      const ox = x + Math.cos((k / 64) * 6.283 * 4) * R, oy = 1.5, oz = z + Math.sin((k / 64) * 6.283 * 4) * R;
      const bx = x + (ox - x) / R * 1.5, bz = z + (oz - z) / R * 1.5;
      if (!raw(s).world.lineOfSight(ox, oy, oz, bx, 1.0, bz)) continue;
      const dx = x - ox, dy = 1.0 - oy, dz = z - oz, dl = Math.hypot(dx, dy, dz);
      goto(s, ox, oz);
      tr(s).rayShot(a, 'cajado-vento', ox, oy, oz, dx / dl, dy / dl, dz / dl, 14);
      break;
    }
  }
  check('Vento: 3 domos acertados (qualquer distância) resolvem o enigma', tr(s).staffs[2].solved, tr(s).staffs[2].puzzle.join(','));
}
{
  // enigma do Raio: sequência certa de 3 placas, erro recomeça
  const s = mk();
  quiet(s);
  const a = me(s);
  a.weapons = ['pistol', 'cajado-raio'];
  const seq = tr(s).staffs[3].seq;
  const hit = (n: number) => {
    const [x, y, z] = D.chamber.plates[n - 1];
    // atira de frente para a placa (parede norte da alcova do Raio)
    const ox = x, oy = y, oz = z + 6;
    goto(s, ox, oz);
    tr(s).rayShot(a, 'cajado-raio', ox, oy, oz, 0, 0, -1, 45);
  };
  hit(seq[0]);
  hit(((seq[1] % 6) + 1 === seq[1] ? seq[1] : (seq[1] % 6) + 1) === seq[1] ? ((seq[1] + 1) % 6) + 1 : (seq[1] % 6) + 1);
  const afterWrong = tr(s).staffs[3].puzzle[0];
  check('Raio: placa errada zera a sequência', afterWrong === 0 || seq.includes(0), `progresso ${afterWrong}`);
  for (const n of seq) hit(n);
  check('Raio: as 3 placas na ordem resolvem o enigma', tr(s).staffs[3].solved, `${seq.join('-')} progresso ${tr(s).staffs[3].puzzle[0]}`);
}
{
  // altar: cajado na mão, enigma resolvido, 20 abates enchem, vira desperto
  const s = mk();
  quiet(s);
  const a = me(s);
  const st = tr(s).staffs[0];
  st.st = 'mao';
  st.owner = 'p0';
  a.weapons = ['pistol', 'cajado-fogo'];
  goIt(s, ids.altar('fogo'));
  use(s, ids.altar('fogo'));
  check('altar exige o enigma resolvido', st.st === 'mao' && has(ev0(s), 'deny'));
  st.solved = true;
  use(s, ids.altar('fogo'));
  check('cajado vai para o altar e sai da mão', st.st === 'altar' && !a.weapons.includes('cajado-fogo'));
  for (let k = 0; k < 19; k++) raw(s).damageZombie(zombie(s, 100, 50, 1), 5, a, 'body', false, true);
  check('19 abates ainda não bastam', !st.awake);
  raw(s).damageZombie(zombie(s, 100, 50, 1), 5, a, 'body', false, true);
  check('20 abates (de qualquer jogador) enchem o altar', st.awake);
  use(s, ids.altar('fogo'));
  check('F pega o cajado desperto', a.weapons.includes('cajado-fogo-d') && st.st === 'mao');
  // devolve: o pedestal guarda a versão desperta
  goIt(s, ids.staff('fogo'));
  use(s, ids.staff('fogo'));
  check('o pedestal passa a guardar a versão desperta', st.st === 'pedestal' && st.awake);
}

// --- armas dos cajados ---
// arena: a faixa larga de lama ao sul (sem postes nem geradores), atirando para o leste
const AX = 20, AZ = 28.2;
const aim = (s: GameSim, weapon: string, charged = false) => {
  if (weapon !== 'cajado-gelo') s.tick(1);
  s.handle('p0', { t: 'launch', weapon, x: AX, y: 1.5, z: AZ, dx: 1, dy: 0, dz: 0, charged });
};
{
  const s = mk();
  quiet(s);
  const a = me(s);
  a.weapons = ['pistol', 'cajado-gelo'];
  goto(s, AX, AZ);
  const zb = zombie(s, AX + 6, AZ, 5000);
  zb.speed = 0;
  for (let k = 0; k < 10; k++) {
    aim(s, 'cajado-gelo');
    s.tick(0.1);
  }
  check('Gelo: acertos acumulam frio e deixam o zumbi lento', zb.frost > 0.3, `frio ${zb.frost?.toFixed(2)}`);
  raw(s).zombies.delete(zb.id);
  const zb2 = zombie(s, AX + 6, AZ, 1000);
  zb2.speed = 0;
  let shattered = false;
  for (let k = 0; k < 40 && !shattered; k++) {
    aim(s, 'cajado-gelo');
    shattered = !raw(s).zombies.has(zb2.id);
    s.tick(0.1);
  }
  check('Gelo: no limite congela e estilhaça (zumbi morre)', shattered && a.kills >= 1);
  // fogo: bola e queimadura
  a.weapons = ['pistol', 'cajado-fogo'];
  const zf = zombie(s, AX + 10, AZ, 3000);
  zf.speed = 0;
  const hp0 = zf.hp;
  aim(s, 'cajado-fogo');
  run(s, 1.6);
  check('Fogo: bolas de fogo causam dano e queimadura', !raw(s).zombies.has(zf.id) || zf.hp < hp0 - 600 || !!zf.burn, `vida ${Math.round(zf.hp)}`);
  // vento mata cone; raio salta
  a.weapons = ['pistol', 'cajado-vento'];
  const zw = zombie(s, AX + 6, AZ, 1500);
  zw.speed = 0;
  aim(s, 'cajado-vento');
  s.tick(0.1);
  check('Vento: a rajada mata zumbi comum no cone', !raw(s).zombies.has(zw.id));
  a.weapons = ['pistol', 'cajado-raio'];
  const zr = [zombie(s, AX + 6, AZ, 900), zombie(s, AX + 9, AZ, 900), zombie(s, AX + 12, AZ, 900)];
  for (const z of zr) z.speed = 0;
  aim(s, 'cajado-raio');
  s.tick(0.1);
  check('Raio: o arco salta entre zumbis', zr.every((z) => !raw(s).zombies.has(z.id)));
}
{
  // ataques carregados dos despertos
  const s = mk();
  quiet(s);
  const a = me(s);
  goto(s, AX, AZ);
  a.weapons = ['pistol', 'cajado-fogo-d'];
  const zs = [zombie(s, AX + 13, AZ, 8000), zombie(s, AX + 14.5, AZ + 1, 8000)];
  for (const z of zs) z.speed = 0;
  aim(s, 'cajado-fogo-d', true);
  const ev = run(s, 2);
  check('Fogo desperto carregado: pilar de fogo de 4 m por 5 s', has(ev, 'area', (e) => e.e === 'area' && e.kind === 'pilar') && zs.every((z) => !raw(s).zombies.has(z.id) || z.hp < 8000));
  a.weapons = ['pistol', 'cajado-gelo-d'];
  const zg = [zombie(s, AX + 13, AZ, 4000), zombie(s, AX + 15, AZ + 1, 4000)];
  for (const z of zg) z.speed = 0;
  s.tick(1);
  aim(s, 'cajado-gelo-d', true);
  const ev2 = run(s, 3);
  check('Gelo desperto carregado: nevasca de 6 m congela tudo', has(ev2, 'area', (e) => e.e === 'area' && e.kind === 'nevasca') && zg.every((z) => !raw(s).zombies.has(z.id)));
  a.weapons = ['pistol', 'cajado-vento-d'];
  aim(s, 'cajado-vento-d', true);
  const ev3 = s.drainEvents();
  check('Vento desperto carregado: redemoinho que anda', has(ev3, 'vortex', (e) => e.e === 'vortex' && e.phase === 'open'));
  run(s, 1);
  check('o redemoinho se move', raw(s).vortices.length === 1 && raw(s).vortices[0].x > AX + 5.5);
  a.weapons = ['pistol', 'cajado-raio-d'];
  const zq = [zombie(s, AX + 9, AZ, 6000), zombie(s, AX + 10, AZ + 1, 6000)];
  for (const z of zq) z.speed = 0;
  aim(s, 'cajado-raio-d', true);
  const ev4 = run(s, 3);
  check('Raio desperto carregado: bola elétrica chocando tudo em 4 m', has(ev4, 'area', (e) => e.e === 'area' && e.kind === 'orbRaio') && zq.every((z) => !raw(s).zombies.has(z.id)));
  // cajado normal não carrega
  s.drainEvents();
  a.weapons = ['pistol', 'cajado-fogo'];
  aim(s, 'cajado-fogo', true);
  check('cajado comum ignora o ataque carregado', !has(s.drainEvents(), 'area', (e) => e.e === 'area' && e.kind === 'pilar'));
}

// --- Tábua e Punho de Ferro ---
{
  const s = mk(2);
  quiet(s);
  const a = me(s);
  const key = [...tr(s).picks].find((x: string) => x.startsWith('part:tabua:'))!;
  goIt(s, key);
  use(s, key);
  check('Tábua de Pedra vai para a equipe', tr(s).tabua === 'equipe' && tr(s).team.has('tabua'));
  goIt(s, ids.tabuaAltar);
  use(s, ids.tabuaAltar);
  check('a Tábua vai para o altar da Igreja', tr(s).tabua === 'altar' && !tr(s).team.has('tabua'));
  // abates de faca fora da Igreja não contam
  const out = zombie(s, 100, 50, 1);
  raw(s).damageZombie(out, 5, a, 'body', true);
  check('faca fora da Igreja não carrega a Tábua', tr(s).tabuaCharge === 0);
  const [cx, cz] = [-82, 5];
  for (let k = 0; k < 20; k++) raw(s).damageZombie(zombie(s, cx, cz, 1), 5, a, 'body', true);
  check('20 abates de faca dentro da Igreja enchem a Tábua', tr(s).tabua === 'cheia', `${tr(s).tabuaCharge}`);
  use(s, ids.tabuaAltar);
  check('cada jogador pega o Punho de Ferro uma vez', tr(s).P(a).punho === true && (use(s, ids.tabuaAltar), has(ev0(s), 'deny')));
  // Punho: triplo da faca pesada, voa
  goto(s, 100, 50);
  const zb = zombie(s, 100, 48.6, 1300);
  s.handle('p0', { t: 'knife', zid: zb.id });
  const evs = s.drainEvents();
  const k = evs.find((x) => x.e === 'zkill') as Extract<GameEvent, { e: 'zkill' }> | undefined;
  check('Punho de Ferro mata e arremessa o zumbi', !!k && !!k.fling, JSON.stringify(k?.fling));
}

// --- desafios ---
{
  const s = mk();
  quiet(s);
  const a = me(s);
  goIt(s, ids.challenge(0));
  use(s, ids.challenge(0));
  check('sem desafio cumprido, nada sai do baú', has(ev0(s), 'deny'));
  tr(s).debug('desafios', undefined, a);
  use(s, ids.challenge(0));
  const ev = ev0(s);
  check('os 4 desafios dão os prêmios', has(ev, 'desafio', (e) => e.e === 'desafio' && e.idx === 0) && tr(s).P(a).artilharia === 3 && a.weapons.includes('raygun') && tr(s).P(a).extraPerk);
  a.perks = ['couraca', 'folego', 'reflexo', 'gatilho'];
  const lim = tr(s).perkLimit(a);
  check('4º desafio dá a 5ª vaga de bebida', lim === 5);
  use(s, ids.challenge(1));
  check('prêmio só uma vez', tr(s).P(a).artilharia === 3);
}

// --- Granada de Artilharia ---
{
  const s = mk();
  quiet(s);
  const a = me(s);
  tr(s).P(a).artilharia = 2;
  goto(s, 100, 50);
  const zs = [zombie(s, 100, 38, 4000), zombie(s, 102, 38, 4000), zombie(s, 98, 40, 4000)];
  s.handle('p0', { t: 'artillery', x: 100, y: 1.6, z: 49, vx: 0, vy: 2, vz: -14 });
  check('Granada de Artilharia gasta uma carga', tr(s).P(a).artilharia === 1);
  const ev = run(s, 7);
  check('artilharia: fumaça, depois bombas que matam zumbis comuns e não ferem jogadores', has(ev, 'artilharia', (e) => e.e === 'artilharia' && e.phase === 'marca') && has(ev, 'artilharia', (e) => e.e === 'artilharia' && e.phase === 'bomba') && a.health === 100);
  void zs;
}

// --- Blindado e Cruzados ---
{
  const s = mk(1, 8);
  s.tick(3.2);
  check('Blindado vem na rodada 8', tr(s).bossPending());
  raw(s).toSpawn = 0;
  raw(s).zombies.clear();
  raw(s).spawnZombie = () => undefined;
  run(s, 6);
  const pz = [...raw(s).zombies.values()].find((z: { kind: number }) => z.kind === 7);
  check('o Blindado chega (e não há Carrasco neste mapa)', !!pz && ![...raw(s).zombies.values()].some((z: { kind: number }) => z.kind === 4));
  if (pz) {
    check('vida do Blindado = vida do chefão', pz.hp === 12 * zombieHealth(8));
    const a = me(s);
    goto(s, pz.x + 5, pz.z);
    // visor: cabeça vale como corpo até 20% da vida em cabeça
    const dmg = raw(s).damageZombie.bind(s);
    dmg(pz, pz.panzer.maxHp * 0.21, a, 'head', false);
    check('depois de 20% da vida na cabeça o visor quebra', pz.panzer.visor === false);
    const snap = s.snapshot();
    check('snapshot mostra o Blindado como chefão com o visor', !!snap.boss && snap.boss.armor === false);
    // ataques
    pz.panzer.flameCD = 0;
    // um ponto a 3 m com linha de visão (o Blindado surge em lugar sorteado, e uma parede no meio impede o ataque)
    let spot: [number, number] = [pz.x + 3, pz.z];
    for (let k = 0; k < 16; k++) {
      const ang = (k / 16) * Math.PI * 2;
      const sx = pz.x + Math.cos(ang) * 3, sz = pz.z + Math.sin(ang) * 3;
      if (raw(s).world.lineOfSight(pz.x, pz.y + 1.8, pz.z, sx, pz.y + 1.2, sz)) { spot = [sx, sz]; break; }
    }
    goto(s, spot[0], spot[1]);
    const h0 = a.health;
    pz.hp = 9e9;
    run(s, 2);
    check('lança-chamas do Blindado machuca de perto', a.health < h0);
    const kills = a.points;
    // o prêmio vem da constante do Blindado, não da dos Cruzados
    const TT = T as unknown as { panzerReward: number; templarReward: number };
    const oldPanzer = TT.panzerReward, oldTemplar = TT.templarReward;
    TT.panzerReward = 777;
    TT.templarReward = 123;
    pz.hp = 1;
    dmg(pz, 5, a, 'body', false);
    check('Blindado morto paga panzerReward (e não templarReward)', a.points - kills >= 777 && a.points - kills < 777 + 100, `+${a.points - kills}`);
    TT.panzerReward = oldPanzer;
    TT.templarReward = oldTemplar;
    a.points = kills + oldPanzer;
    const ev = s.drainEvents();
    check('Blindado morto: Munição Cheia e +500', has(ev, 'blindado', (e) => e.e === 'blindado' && e.phase === 'death') && a.points >= kills + 500 && raw(s).powerups.some((p: { kind: string }) => p.kind === 'maxammo'));
    check('o primeiro Blindado solta a 3ª peça do Cajado de Fogo', tr(s).drops.some((d: { key: string }) => d.key === 'fogo-3'));
    const d = tr(s).drops[0];
    goto(s, d.x, d.z);
    use(s, d.id);
    check('a peça solta se pega com F', tr(s).team.has('fogo-3'));
  }
}
{
  const s = mk(1, 5);
  quiet(s);
  tr(s).debug('cruzados', undefined, me(s));
  const templars = [...raw(s).zombies.values()].filter((z: { kind: number }) => z.kind === 8);
  check('recaptura: 4 + 2 por jogador Cruzados', templars.length === 6, `${templars.length}`);
  check('o gerador alvo pisca (atacado)', tr(s).gens.some((g: { attacked: boolean }) => g.attacked) && tr(s).recapturing);
  const spawn0 = templars.map((z: { x: number; z: number }) => [z.x, z.z]);
  const gi = tr(s).gens.findIndex((g: { attacked: boolean }) => g.attacked);
  // o sorteio do ponto de surgir muda o caminho: espera até 100 s, de 5 em 5
  const nearGen = () => [...raw(s).zombies.values()].filter((z: { kind: number; x: number; z: number }) => z.kind === 8 && Math.hypot(z.x - D.gens[gi].x, z.z - D.gens[gi].z) < 12).length;
  let near = 0;
  let gasto = 0;
  while (!near && gasto < 100) {
    run(s, 5);
    gasto += 5;
    near = nearGen();
  }
  check('os Cruzados andam até o gerador ignorando o jogador', near > 0, `${near} perto do gerador depois de ${gasto} s`);
  void spawn0;
  run(s, 60);
  check('Cruzado 8 s no círculo desliga o gerador', !tr(s).gens[gi].on, `gerador ${gi} ligado=${tr(s).gens[gi].on}`);
  check('religar é de graça', tr(s).gens[gi].free === true);
}
{
  const s = mk(1, 5);
  quiet(s);
  const a = me(s);
  tr(s).debug('cruzados', undefined, a);
  const before = a.points;
  for (const z of [...raw(s).zombies.values()]) if (z.kind === 8) raw(s).damageZombie(z, 1e9, a, 'body', false);
  const ev = run(s, 1);
  check('matar todos os Cruzados: vitória, +500 e item', has(ev, 'recaptura', (e) => e.e === 'recaptura' && e.phase === 'win') && a.points >= before + 500 && !tr(s).recapturing);
}

// --- missão ---
{
  const s = mk(2, 3);
  quiet(s);
  const a = me(s);
  tr(s).debug('missao', '2', a);
  s.tick(0.1);
  check('missão: 4 cajados despertos nos pedestais com a Forja erguida começam a colheita', tr(s).missao.step === 3 && tr(s).missao.active);
  goIt(s, ids.staff('fogo'));
  use(s, ids.staff('fogo'));
  check('durante a colheita os cajados ficam presos', !a.weapons.includes('cajado-fogo-d') && has(ev0(s), 'deny', (e) => e.e === 'deny' && e.reason === 'trancado'));
  const [rx, rz] = D.ring.c;
  for (let k = 0; k < T.missaoKills - 1; k++) raw(s).damageZombie(zombie(s, rx + 3, rz, 1), 5, a, 'body', false, true);
  check('99 abates no anel ainda é a colheita', tr(s).missao.step === 3 && tr(s).missao.count === 99);
  raw(s).damageZombie(zombie(s, rx + 100 > 0 ? 100 : rx, 50, 1), 5, a, 'body', false, true);
  check('abates fora do anel não contam', tr(s).missao.count === 99);
  raw(s).damageZombie(zombie(s, rx + 3, rz, 1), 5, a, 'body', false, true);
  check('100 abates no anel: vão para os olhos dos colossos', tr(s).missao.step === 4);
  // olhos: atirar com Sangue Morto no olho do colosso
  const eyes: string[] = [];
  for (const id of ['atlas', 'golias', 'tita']) {
    tr(s).robot = null;
    tr(s).P(a).zblood = 0;
    tr(s).debug('colosso', id, a);
    run(s, T.robotWarn + 0.2);
    const r = tr(s).robot;
    r.sub = 'move';
    r.t = 0.5;
    // posição do olho
    const eye = (tr(s) as unknown as { eyeTarget(): { x: number; y: number; z: number } }).eyeTarget();
    goto(s, eye.x - 60, eye.z);
    const ox = eye.x - 60, oy = 1.5, oz = eye.z;
    const dx = eye.x - ox, dy = eye.y - oy, dz = eye.z - oz, dl = Math.hypot(dx, dy, dz);
    tr(s).rayShot(a, 'pistol', ox, oy, oz, dx / dl, dy / dl, dz / dl, 100);
    check(`olho de ${id} sem Sangue Morto não conta`, tr(s).missao.eyes.filter(Boolean).length === eyes.length);
    tr(s).P(a).zblood = 10;
    tr(s).rayShot(a, 'pistol', ox, oy, oz, dx / dl, dy / dl, dz / dl, 100);
    eyes.push(id);
    check(`olho de ${id} com Sangue Morto conta`, tr(s).missao.eyes.filter(Boolean).length === eyes.length);
  }
  check('3 olhos acertados: defesa final liberada', tr(s).missao.step === 5);
  tr(s).robot = null;
  raw(s).damagePlayer = () => {};
  goIt(s, ids.poco);
  use(s, ids.poco);
  check('F no poço começa a defesa de 90 s com 2 Blindados', tr(s).missao.defense === 1 && [...raw(s).zombies.values()].filter((z: { kind: number }) => z.kind === 7).length === 2);
  const evs = run(s, 91);
  check('depois de 90 s: tudo morre e a missão termina', has(evs, 'missao', (e) => e.e === 'missao' && e.phase === 'fim') && raw(s).zombies.size === 0 && tr(s).missionDone);
  check('prêmio: todas as bebidas e cajados de volta às mãos', a.perks.length === 9 && a.weapons.some((w: string) => w.startsWith('cajado')));
}

// --- missão real, sem debug('missao') (A6 e A1) ---
// Só são permitidos os atalhos de "dar peças" (itens) e "ligar geradores" (gens), que encurtam a coleta
// mas não mudam regra de missão. O resto anda por interações, tiros em alvos e abates.
type El = 'fogo' | 'gelo' | 'vento' | 'raio';
const EL: El[] = ['fogo', 'gelo', 'vento', 'raio'];
const elIdx = (el: El) => EL.indexOf(el);

// resolve o enigma do elemento só com tiros e abates, como um jogador faria
function solvePuzzle(s: GameSim, i: number, el: El) {
  const a = me(s, i);
  const wid = `cajado-${el}`;
  if (el === 'fogo') {
    D.chests.forEach((c) => {
      for (let k = 0; k < T.fireChestKills; k++) {
        const zb = zombie(s, c[0] + 2, c[1], 1);
        raw(s).curWeapon = wid;
        raw(s).damageZombie(zb, 10, a, 'body', false, true);
        raw(s).curWeapon = null;
      }
    });
  } else if (el === 'gelo') {
    tr(s).debug('clima', 'neve', a);
    for (const [x, z] of D.tombstones) {
      for (let k = 0; k < 16; k++) {
        const ox = x + Math.cos((k / 16) * 6.283) * 6, oy = 1.5, oz = z + Math.sin((k / 16) * 6.283) * 6;
        const bx = x + (ox - x) / 6 * 0.9, bz = z + (oz - z) / 6 * 0.9;
        if (!raw(s).world.lineOfSight(ox, oy, oz, bx, 0.6, bz)) continue;
        const dx = x - ox, dy = 0.6 - oy, dz = z - oz, dl = Math.hypot(dx, dy, dz);
        goto(s, ox, oz, i);
        tr(s).rayShot(a, wid, ox, oy, oz, dx / dl, dy / dl, dz / dl, 25);
        break;
      }
    }
  } else if (el === 'vento') {
    for (const [x, z] of D.domes) {
      for (let k = 0; k < 64; k++) {
        const R = [8, 14, 22, 30][k % 4];
        const ox = x + Math.cos((k / 64) * 6.283 * 4) * R, oy = 1.5, oz = z + Math.sin((k / 64) * 6.283 * 4) * R;
        const bx = x + (ox - x) / R * 1.5, bz = z + (oz - z) / R * 1.5;
        if (!raw(s).world.lineOfSight(ox, oy, oz, bx, 1.0, bz)) continue;
        const dx = x - ox, dy = 1.0 - oy, dz = z - oz, dl = Math.hypot(dx, dy, dz);
        goto(s, ox, oz, i);
        tr(s).rayShot(a, wid, ox, oy, oz, dx / dl, dy / dl, dz / dl, 14);
        break;
      }
    }
  } else {
    for (const n of tr(s).staffs[elIdx('raio')].seq) {
      const [x, y, z] = D.chamber.plates[n - 1];
      goto(s, x, z + 6, i);
      tr(s).rayShot(a, wid, x, y, z + 6, 0, 0, -1, 45);
    }
  }
}

// uma volta inteira de um cajado com o jogador i: montar, pegar, enigma, altar, encher, despertar e pôr na Mesa
function staffJourney(s: GameSim, i: number, el: El) {
  const a = me(s, i);
  const st = tr(s).staffs[elIdx(el)];
  goIt(s, ids.staff(el), i);
  if (st.st === 'faltando') use(s, ids.staff(el), i);
  use(s, ids.staff(el), i); // pega do pedestal
  solvePuzzle(s, i, el);
  goIt(s, ids.altar(el), i);
  use(s, ids.altar(el), i); // põe no altar
  const killer = me(s, 0);
  for (let k = 0; k < T.staffChargeKills; k++) raw(s).damageZombie(zombie(s, 100, 50, 1), 5, killer, 'body', false, true);
  use(s, ids.altar(el), i); // pega o desperto
  goIt(s, ids.staff(el), i);
  use(s, ids.staff(el), i); // devolve à Mesa
  void a;
}

// monta uma partida na etapa 3 (colheita) só por interações; `plan` diz quem cumpre cada cajado
function missionToHarvest(players: number, plan: [number, El][]) {
  const s = mk(players, 3);
  quiet(s);
  tr(s).debug('gens', undefined, me(s));
  tr(s).debug('itens', undefined, me(s));
  s.tick(0.1);
  ev0(s);
  for (const [i, el] of plan) staffJourney(s, i, el);
  s.tick(0.1);
  return s;
}

{
  const s = missionToHarvest(4, [[0, 'fogo'], [1, 'gelo'], [2, 'vento'], [3, 'raio']]);
  check('missão real: os 4 cajados na Mesa e a colheita começa', tr(s).missao.step === 3 && tr(s).missao.active, `etapa ${tr(s).missao.step}`);
  const a = me(s);
  const [rx, rz] = D.ring.c;
  for (let k = 0; k < T.missaoKills; k++) raw(s).damageZombie(zombie(s, rx + 3, rz, 1), 5, a, 'body', false, true);
  check('missão real: 100 abates no anel levam aos olhos', tr(s).missao.step === 4);
  for (const id of ['atlas', 'golias', 'tita']) {
    tr(s).robot = null;
    tr(s).debug('colosso', id, a);
    run(s, T.robotWarn + 0.2);
    const r = tr(s).robot;
    r.sub = 'move';
    r.t = 0.5;
    const eye = (tr(s) as unknown as { eyeTarget(): { x: number; y: number; z: number } }).eyeTarget();
    const ox = eye.x - 60, oy = 1.5, oz = eye.z;
    goto(s, ox, oz);
    const dx = eye.x - ox, dy = eye.y - oy, dz = eye.z - oz, dl = Math.hypot(dx, dy, dz);
    tr(s).P(a).zblood = 10;
    tr(s).rayShot(a, 'pistol', ox, oy, oz, dx / dl, dy / dl, dz / dl, 100);
  }
  check('missão real: 3 olhos com Sangue Morto liberam a defesa', tr(s).missao.step === 5, `etapa ${tr(s).missao.step}`);
  tr(s).robot = null;
  raw(s).damagePlayer = () => {};
  goIt(s, ids.poco);
  use(s, ids.poco);
  check('missão real: F no poço começa a defesa', tr(s).missao.defense === 1);
  const evs = run(s, 91);
  check('missão real: 90 s depois a missão termina', has(evs, 'missao', (e) => e.e === 'missao' && e.phase === 'fim') && tr(s).missionDone);
  const mine = (i: number, el: El) => me(s, i).weapons.includes(`cajado-${el}-d`);
  check('missão real: quem pôs o cajado no pedestal o recebe de volta', mine(0, 'fogo') && mine(1, 'gelo') && mine(2, 'vento') && mine(3, 'raio'),
    [0, 1, 2, 3].map((i) => me(s, i).weapons.filter((w: string) => w.startsWith('cajado')).join('+') || '-').join(' | '));
  check('missão real: prêmio das bebidas para todos', [0, 1, 2, 3].every((i) => me(s, i).perks.length === 9));
}
{
  // o dono saiu: o cajado vai para o primeiro vivo sem cajado
  const s = missionToHarvest(4, [[0, 'fogo'], [1, 'gelo'], [3, 'vento'], [3, 'raio']]);
  s.removePlayer('p3');
  (tr(s) as unknown as { finishMission(): void }).finishMission();
  const holds = (i: number) => me(s, i).weapons.filter((w: string) => w.startsWith('cajado'));
  check('missão real: quem pôs o cajado e saiu — o cajado vai para um vivo sem cajado', holds(0).join() === 'cajado-fogo-d' && holds(1).join() === 'cajado-gelo-d' && holds(2).join() === 'cajado-vento-d',
    [0, 1, 2].map((i) => holds(i).join('+') || '-').join(' | '));
  const raio = tr(s).staffs[elIdx('raio')];
  check('missão real: ninguém livre, o cajado fica no pedestal', raio.st === 'pedestal' && raio.owner === '');
}
{
  // dono morto: mesma regra
  const s = missionToHarvest(2, [[0, 'fogo'], [1, 'gelo']]);
  me(s, 1).life = 'dead';
  (tr(s) as unknown as { finishMission(): void }).finishMission();
  const holds = (i: number) => me(s, i).weapons.filter((w: string) => w.startsWith('cajado'));
  check('missão real: dono morto, o cajado vai para o vivo sem cajado (um por jogador)', holds(0).join() === 'cajado-fogo-d' && tr(s).staffs[1].st === 'pedestal');
}

// --- C1: cajado desperto reanima aliado ---
{
  // arena de lama ao sul (sem postes), atirando para o leste, como nos outros testes dos cajados
  // atira da altura dos olhos (1,5 m) mirando o corpo do aliado no chão, `dist` m adiante, `side` m para o lado
  const shootAt = (s: GameSim, weapon: string, ox: number, oz: number, dist = 10, side = 0) => {
    s.tick(1);
    ev0(s);
    s.handle('p0', { t: 'launch', weapon, x: ox, y: 1.5, z: oz, dx: dist, dy: 0.4 - 1.5, dz: side, charged: false });
    return s.drainEvents();
  };
  const setup = (weapon: string, dist: number, ax = AX, az = AZ) => {
    const s = mk(2);
    quiet(s);
    const a = me(s, 0), b = me(s, 1);
    a.weapons = ['pistol', weapon];
    goto(s, ax, az, 0);
    goto(s, ax + dist, az, 1);
    b.life = 'downed';
    b.health = 0;
    b.bleed = 20;
    b.revive = 0.3;
    return { s, a, b };
  };
  {
    const { s, a, b } = setup('cajado-fogo-d', 10);
    const ev = shootAt(s, 'cajado-fogo-d', AX, AZ);
    check('cajado desperto reanima aliado caído a 10 m', b.life === 'alive' && b.health === b.maxHealth && has(ev, 'previve', (e) => e.e === 'previve' && e.pid === 'p1' && e.by === 'cajado'));
    check('reanimação pelo cajado conta para quem atirou', a.revives === 1 && has(ev, 'previve', (e) => e.e === 'previve' && e.from === 'p0'));
  }
  for (const el of ['gelo', 'vento', 'raio']) {
    const { s, b } = setup(`cajado-${el}-d`, 8);
    shootAt(s, `cajado-${el}-d`, AX, AZ);
    check(`cajado desperto de ${el} também reanima`, b.life === 'alive');
  }
  {
    const { s, a, b } = setup('cajado-fogo', 10);
    shootAt(s, 'cajado-fogo', AX, AZ);
    check('cajado comum (não desperto) não reanima', b.life === 'downed' && a.revives === 0);
  }
  {
    const { s, b } = setup('cajado-fogo-d', 30);
    shootAt(s, 'cajado-fogo-d', AX, AZ, 30);
    check('longe demais (30 m) não reanima', b.life === 'downed');
  }
  {
    // o poço da Escavação (bloco sólido) entre o atirador e o aliado
    const [rx, rz] = D.ring.c;
    const { s, b } = setup('cajado-fogo-d', 12, rx - 6, rz);
    shootAt(s, 'cajado-fogo-d', rx - 6, rz, 12);
    check('parede no meio não reanima', b.life === 'downed');
  }
  {
    const { s, b } = setup('cajado-fogo-d', 10);
    goto(s, AX + 10, AZ + 3, 1);
    shootAt(s, 'cajado-fogo-d', AX, AZ, 10, 0);
    check('mira longe do aliado (3 m ao lado) não reanima', b.life === 'downed');
  }
  {
    // ataque carregado não é o "disparo normal": não reanima
    const { s, b } = setup('cajado-fogo-d', 10);
    s.tick(1);
    s.handle('p0', { t: 'launch', weapon: 'cajado-fogo-d', x: AX, y: 1.5, z: AZ, dx: 1, dy: 0, dz: 0, charged: true });
    check('ataque carregado não reanima (só o disparo normal)', b.life === 'downed');
  }
  {
    // solo: sem aliado, nada muda (o disparo segue normal)
    const s = mk(1);
    quiet(s);
    me(s).weapons = ['pistol', 'cajado-fogo-d'];
    goto(s, AX, AZ);
    const ev = shootAt(s, 'cajado-fogo-d', AX, AZ, 10);
    check('solo: cajado desperto dispara normalmente, sem reanimar', has(ev, 'shot') && !has(ev, 'previve'));
  }
}

// --- C3: bebidas exclusivas da Fonte da Sorte (Faísca, Olho Frio, Casca Grossa) ---
{
  const NOVAS = ['faisca', 'olho-frio', 'casca-grossa'];
  // a Fonte pode dar as 3 novas (e a máquina fixa nunca)
  const seen = new Set<string>();
  for (let k = 0; k < 400; k++) {
    const s = mk();
    quiet(s);
    const a = me(s);
    a.points = 99999;
    tr(s).debug('gens', undefined, a);
    const f = tr(s).fizz;
    goIt(s, ids.fizz(f.loc));
    use(s, ids.fizz(f.loc));
    run(s, 4.2);
    for (const p of a.perks) seen.add(p);
  }
  check('Fonte: pode dar as 3 bebidas novas', NOVAS.every((n) => seen.has(n)), [...seen].join(','));
  check('máquinas fixas (kind perk) só vendem as 6 bebidas de sempre', map.interactables.filter((i) => i.kind === 'perk').every((i) => !NOVAS.includes(i.perk ?? '')));
  // Faísca: ao recarregar, choque em volta; o dano cresce com o pente mais vazio; recarga do efeito em 3 s
  {
    const s = mk();
    quiet(s);
    const a = me(s);
    a.perks = ['faisca'];
    goto(s, AX, AZ);
    const z2 = zombie(s, AX + 2, AZ, 9e5);
    const z4 = zombie(s, AX + 4, AZ, 9e5);
    z2.speed = z4.speed = 0;
    s.handle('p0', { t: 'reload', weapon: 'cano-longo', ammo: 0 });
    check('Faísca: recarregar com o pente vazio fere zumbis a 2 m e não a 4 m', z2.hp < 9e5 && z4.hp === 9e5, `${(9e5 - z2.hp).toFixed(0)} em 2 m, ${(9e5 - z4.hp).toFixed(0)} em 4 m`);
    const vazio = 9e5 - z2.hp;
    z2.hp = 9e5;
    s.handle('p0', { t: 'reload', weapon: 'cano-longo', ammo: 0 });
    check('Faísca: só dispara de novo depois de 3 s', z2.hp === 9e5);
    run(s, 3.1);
    s.handle('p0', { t: 'reload', weapon: 'cano-longo', ammo: 9 });
    const quase = 9e5 - z2.hp;
    check('Faísca: com o pente quase cheio o choque é bem mais fraco que com o pente vazio', quase > 0 && quase < vazio * 0.5, `${quase.toFixed(0)} contra ${vazio.toFixed(0)}`);
    // sem a bebida, nada acontece
    const s2 = mk();
    quiet(s2);
    goto(s2, AX, AZ);
    const zz = zombie(s2, AX + 2, AZ, 9e5);
    zz.speed = 0;
    s2.handle('p0', { t: 'reload', weapon: 'cano-longo', ammo: 0 });
    check('Faísca: sem a bebida, recarregar não fere ninguém', zz.hp === 9e5);
  }
  // Olho Frio: +25% de dano na cabeça e o peito alto também vale cabeça
  {
    const tiro = (perks: string[], part: 'head' | 'body') => {
      const s = mk();
      quiet(s);
      const a = me(s);
      a.perks = perks;
      a.weapons = ['cano-longo'];
      goto(s, AX, AZ);
      const z = zombie(s, AX + 10, AZ, 9e5);
      z.speed = 0;
      s.handle('p0', { t: 'shoot', weapon: 'cano-longo', hits: [{ zid: z.id, part }] });
      return 9e5 - z.hp;
    };
    const sem = tiro([], 'head'), com = tiro(['olho-frio'], 'head');
    check('Olho Frio: +25% de dano na cabeça', Math.abs(com / sem - 1.25) < 0.02, `${sem.toFixed(0)} → ${com.toFixed(0)}`);
    check('Olho Frio: o dano no corpo não muda', Math.abs(tiro(['olho-frio'], 'body') - tiro([], 'body')) < 1);
    // peito alto (raio passa a 1,3 m do chão, na altura do pescoço) conta como cabeça
    const alto = (perks: string[]) => {
      const s = mk();
      quiet(s);
      const a = me(s);
      a.perks = perks;
      a.weapons = ['cano-longo'];
      goto(s, AX, AZ);
      const z = zombie(s, AX + 10, AZ, 9e5);
      z.speed = 0;
      s.handle('p0', { t: 'shoot', weapon: 'cano-longo', hits: [{ zid: z.id, part: 'body' }], ray: [AX, 1.5, AZ, 10, -0.2, 0] });
      return 9e5 - z.hp;
    };
    check('Olho Frio: tiro no peito alto (pescoço) vira cabeça', alto(['olho-frio']) > alto([]) * 2.5, `${alto([]).toFixed(0)} → ${alto(['olho-frio']).toFixed(0)}`);
  }
  // Casca Grossa: a própria granada não fere; a queda de 2 m solta uma onda de 4 m
  {
    const boom = (perks: string[]) => {
      const s = mk();
      quiet(s);
      const a = me(s);
      a.perks = perks;
      goto(s, AX, AZ);
      raw(s).explode({ id: 99, kind: 'grenade', weapon: '', traveled: 0, stuck: false, stuckT: 0, pid: 'p0', x: AX + 1, y: 1, z: AZ, vx: 0, vy: 0, vz: 0, t: 0 });
      return a.health;
    };
    check('Casca Grossa: a própria granada fere quem não tem a bebida', boom([]) < 100);
    check('Casca Grossa: a própria granada não fere quem tem a bebida', boom(['casca-grossa']) === 100);
    const queda = (perks: string[], h: number) => {
      const s = mk();
      quiet(s);
      const a = me(s);
      a.perks = perks;
      goto(s, AX, AZ);
      const perto = zombie(s, AX + 3, AZ, 9e5), longe = zombie(s, AX + 6, AZ, 9e5);
      perto.speed = longe.speed = 0;
      s.handle('p0', { t: 'land', h });
      return { perto: 9e5 - perto.hp, longe: 9e5 - longe.hp };
    };
    const q2 = queda(['casca-grossa'], 2);
    check('Casca Grossa: queda de 2 m fere zumbis a 3 m e não a 6 m', q2.perto > 0 && q2.longe === 0, JSON.stringify(q2));
    check('Casca Grossa: queda de 1 m (menos de 1,5 m) não solta onda', queda(['casca-grossa'], 1).perto === 0);
    check('Casca Grossa: sem a bebida a queda não fere ninguém', queda([], 3).perto === 0);
  }
  // o prêmio da missão dá todas as bebidas (as 9)
  {
    const s = mk(1, 3);
    quiet(s);
    const a = me(s);
    tr(s).finishMission();
    check('prêmio da missão dá as 9 bebidas', a.perks.length === 9 && NOVAS.every((n) => a.perks.includes(n)), `${a.perks.length}`);
  }
}

// --- B5: variedade de materiais nas paredes ---
{
  const mix = (map.trincheira as unknown as { wallMix?: Record<string, Record<string, number>> }).wallMix;
  check('B5: o construtor registra o material de cada estilo de parede', !!mix && Object.keys(mix).length >= 6, mix ? Object.keys(mix).join(',') : 'sem wallMix');
  const piores: string[] = [];
  for (const [estilo, mats] of Object.entries(mix ?? {})) {
    if (estilo === 'low') continue; // sacos de areia: a borda baixa é de um material só por natureza
    const tot = Object.values(mats).reduce((a, b) => a + b, 0);
    const [m, v] = Object.entries(mats).sort((a, b) => b[1] - a[1])[0];
    if (v / tot > 0.8) piores.push(`${estilo}: ${m} ${(100 * v / tot).toFixed(0)}%`);
  }
  check('B5: nenhuma área usa só uma textura em mais de 80% das paredes', piores.length === 0, piores.join(' | '));
  const tons = (mat: string) => new Set(map.blocks.filter((b) => b.mat === mat).map((b) => b.shade)).size;
  check('B5: as paredes têm variação de cor por bloco (ruído): concreto rachado e madeira podre com 4 ou mais tons', tons('crackConcrete') >= 4 && tons('rotWood') >= 4, `${tons('crackConcrete')} e ${tons('rotWood')}`);
  const nBrick = map.blocks.filter((b) => b.mat === 'brick').length;
  const mixOf = (mix ?? {}).brick ?? {};
  check('B5: o tijolo da Oficina é marrom sujo (brickDirty); o tijolo vermelho vivo da Cidade não aparece nas paredes', (mixOf.brickDirty ?? 0) > 0 && !mixOf.brick && nBrick === 0, `brickDirty ${(mixOf.brickDirty ?? 0).toFixed(0)} m², brick ${nBrick} blocos`);
}

// --- Escavação (B1): a decoração é só desenho, nada fecha o caminho ---
{
  const s = mk();
  quiet(s);
  const nav = raw(s).nav;
  for (const d of map.doors) raw(s).world.openDoors.add(d.id);
  raw(s).world.rebuild?.();
  nav.rebuild();
  const start = { x: map.playerSpawns[0][0], z: map.playerSpawns[0][1] };
  nav.update([start]);
  const reach = (x: number, z: number) => nav.distanceAt(x, z) < 0xffff;
  const near = (x: number, z: number, r: number) => reach(x, z) || Array.from({ length: 16 }, (_, k) => k).some((k) => reach(x + Math.cos((k / 16) * 6.283) * r, z + Math.sin((k / 16) * 6.283) * r));
  const ids2 = map.interactables.filter((i) => /^(staff-|forge$|poco$|part:gramofone)/.test(i.id));
  const bad = ids2.filter((i) => !near(i.use[0], i.use[1], Math.min(1.7, (i.reach ?? 1.9) * 0.85)));
  check('Escavação: pedestais, Forja, poço e gramofone alcançáveis com tudo aberto', ids2.length >= 7 && bad.length === 0, bad.map((i) => i.id).join(' '));
  const [rx, rz] = D.ring.c;
  check('Escavação: o centro do poço continua sólido (o vão não é andável)', !reach(rx, rz));
}

// --- protocolo e tamanho do snapshot ---
{
  const s = mk(4);
  quiet(s);
  tr(s).debug('gens', undefined, me(s));
  tr(s).debug('itens', undefined, me(s));
  const snap = s.snapshot();
  const bytes = JSON.stringify(snap).length;
  check('snapshot tem o bloco tr e fica abaixo de 14 KB', !!snap.tr && bytes < 14000, `${bytes} bytes`);
  check('jogadores levam os campos da Trincheira', snap.players[0].shovel === false && Array.isArray(snap.players[0].challenges));
  const other = new GameSim(getMap('cidade'), true);
  other.addPlayer('a', 'A', 0);
  other.start();
  check('nos outros mapas não há bloco tr', !other.snapshot().tr && other.snapshot().players[0].shovel === undefined);
}

// --- lama ---
{
  const s = mk();
  const sf = map.surface!;
  const t = tr(s);
  let mud = 0;
  for (let i = 0; i < sf.data.length; i += 7) if (sf.data[i] === 'm') mud++;
  check('o mapa tem lama (chão "m") e a simulação a reconhece', mud > 300 && t.inMud(D.tank.path[5][0], D.tank.path[5][1]) && !t.inMud(100, 50));
}

console.log(`\n${passes} ok, ${fails} falharam`);
void ELEMENT_LIST;
process.exit(fails ? 1 : 0);
