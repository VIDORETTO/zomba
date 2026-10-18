// Testes das regras da simulação (sem navegador). Uso: npx tsx tools/test-sim.ts
import { buildTown } from '../src/shared/map/town';
import { getMap } from '../src/shared/map';
import { GameSim, bossHealth, dogHealth, dogsForRound, zombieHealth } from '../src/shared/sim';
import type { GameEvent } from '../src/shared/protocol';
import { BOX_POOL, WEAPONS as WEAPONS_ } from '../src/shared/weapons';
import { levelFromXp, matchXp, rankOf, startPoints } from '../src/shared/progress';
import { BUS } from '../src/shared/constants';
import { BUS_DOOR, toLocal, toWorld } from '../src/shared/busBody';

const map = buildTown();
let fails = 0;
let passes = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) passes++;
  else fails++;
  console.log(`${ok ? 'ok  ' : 'FALHOU'} ${name}${detail ? ` (${detail})` : ''}`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const raw = (s: GameSim) => s as any;
const goTo = (s: GameSim, pid: string, id: string) => {
  const it = map.interactables.find((i) => i.id === id)!;
  s.handle(pid, { t: 'state', x: it.use[0], y: 0, z: it.use[1], yaw: 0, pitch: 0, crouch: false, speed: 0 });
};
const events = (s: GameSim) => s.drainEvents();
const has = (ev: GameEvent[], e: string, extra: (x: GameEvent) => boolean = () => true) => ev.some((x) => x.e === e && extra(x));

check('mapa tem 6 máquinas e 3 caixotes', map.interactables.filter((i) => i.kind === 'perk').length === 6 && map.interactables.filter((i) => i.kind === 'ammo').length === 3);

// --- munição ---
{
  const s = new GameSim(map, true);
  s.addPlayer('a', 'A', 0);
  s.start();
  const p = s.players.get('a')!;
  s.handle('a', { t: 'interact', id: 'ammo-0', weapon: 'pistol' });
  check('caixote longe é recusado', has(events(s), 'deny', (e) => e.e === 'deny' && e.reason === 'longe'));
  goTo(s, 'a', 'ammo-0');
  s.handle('a', { t: 'interact', id: 'ammo-0', weapon: 'pistol' });
  const ev = events(s);
  check('munição da pistola custa 150', p.points === 350, `pontos ${p.points}`);
  check('evento de recarga enviado', has(ev, 'refill'));
  p.points = 100;
  s.handle('a', { t: 'interact', id: 'ammo-0', weapon: 'pistol' });
  check('sem pontos é recusado', has(events(s), 'deny', (e) => e.e === 'deny' && e.reason === 'pontos') && p.points === 100);
}

// --- bebidas ---
{
  const s = new GameSim(map, true);
  s.addPlayer('a', 'A', 0);
  s.start();
  const p = s.players.get('a')!;
  goTo(s, 'a', 'perk-couraca');
  s.handle('a', { t: 'interact', id: 'perk-couraca', weapon: 'pistol' });
  check('Couraça sem pontos é recusada', has(events(s), 'deny') && p.perks.length === 0);
  p.points = 20000;
  s.handle('a', { t: 'interact', id: 'perk-couraca', weapon: 'pistol' });
  check('Couraça comprada por 2500', p.perks.includes('couraca') && p.points === 17500);
  check('Couraça dá 250 de vida', p.maxHealth === 250 && p.health === 250);
  s.handle('a', { t: 'interact', id: 'perk-couraca', weapon: 'pistol' });
  check('não compra a mesma bebida duas vezes', has(events(s), 'deny', (e) => e.e === 'deny' && e.reason === 'possui') && p.points === 17500);
  for (const id of ['folego', 'reflexo', 'gatilho']) {
    goTo(s, 'a', `perk-${id}`);
    s.handle('a', { t: 'interact', id: `perk-${id}`, weapon: 'pistol' });
  }
  check('Segundo Fôlego custa 500 no solo', p.points === 17500 - 500 - 3000 - 2000, `pontos ${p.points}`);
  goTo(s, 'a', 'perk-mula');
  s.handle('a', { t: 'interact', id: 'perk-mula', weapon: 'pistol' });
  check('limite de 4 bebidas', p.perks.length === 4 && has(events(s), 'deny', (e) => e.e === 'deny' && e.reason === 'limite'));

  // Gatilho: +30% de dano. Força um zumbi e atira no corpo.
  for (let i = 0; i < 20 * 6; i++) s.tick(0.05);
  events(s);
  const z = [...raw(s).zombies.values()][0];
  const hp0 = z.hp;
  s.handle('a', { t: 'shoot', weapon: 'pistol', hits: [{ zid: z.id, part: 'body' }] });
  const dist = Math.hypot(z.x - p.x, z.z - p.z);
  check('Gatilho aumenta o dano em 30%', Math.abs(hp0 - z.hp - 65) < 1 || dist > 22, `dano ${hp0 - z.hp}`);

  // Segundo Fôlego no solo: cai, levanta sozinho e perde as bebidas
  raw(s).damagePlayer(p, 999, p.x, p.z, false);
  check('cair no solo com Fôlego não acaba o jogo', s.state !== 'gameover' && p.life === 'downed');
  for (let i = 0; i < 20 * 5; i++) s.tick(0.05);
  const ev = events(s);
  check('levanta sozinho após 4 s', p.life === 'alive' && has(ev, 'selfrevive'));
  check('perde todas as bebidas ao cair', p.perks.length === 0 && p.maxHealth === 100 && p.selfRevives === 1);
  raw(s).damagePlayer(p, 999, p.x, p.z, false);
  check('sem Fôlego, cair no solo é fim de jogo', s.state === 'gameover');
}

// --- co-op: Fôlego reanima em 1,5 s ---
{
  const s = new GameSim(map, false);
  s.addPlayer('a', 'A', 0);
  s.addPlayer('b', 'B', 1);
  s.start();
  const a = s.players.get('a')!;
  const b = s.players.get('b')!;
  a.points = 5000;
  goTo(s, 'a', 'perk-folego');
  s.handle('a', { t: 'interact', id: 'perk-folego', weapon: 'pistol' });
  check('Segundo Fôlego custa 1500 no co-op', a.points === 3500);
  b.x = a.x + 1;
  b.z = a.z;
  raw(s).damagePlayer(b, 999, b.x, b.z, false);
  s.handle('a', { t: 'revive', target: 'b' });
  for (let i = 0; i < 32; i++) s.tick(0.05);
  check('reanima em ~1,5 s com Fôlego', b.life === 'alive', `estado ${b.life} após 1,6 s`);
}

// --- barricadas ---
{
  check('mapa tem 4 entradas com tábuas nas ruas', map.entries.filter((e) => !e.area).length === 4);
  // sem pontos de surgir da terra: todo zumbi vem por uma entrada
  const m2 = { ...map, zombieSpawns: [] };
  const s = new GameSim(m2, true);
  s.addPlayer('a', 'A', 0);
  s.start();
  const p = s.players.get('a')!;
  // jogador a ~14 m da entrada norte: só ela fica no alcance de nascimento
  const at = (x: number, z: number) => s.handle('a', { t: 'state', x, y: 0, z, yaw: 0, pitch: 0, crouch: false, speed: 0 });
  at(2.4, -28);
  let tore = 0;
  let climbed = false;
  let sawTear = false;
  for (let i = 0; i < 20 * 30 && !climbed; i++) {
    at(2.4, -28);
    s.tick(0.05);
    for (const e of s.drainEvents()) if (e.e === 'board' && e.kind === 'tear') tore++;
    const zs = s.snapshot().zombies;
    if (zs.some((z) => z.anim === 'tear')) sawTear = true;
    if (zs.some((z) => z.z > -41.5 && z.anim === 'move')) climbed = true;
  }
  check('zumbi arranca as tábuas na janela', sawTear && tore >= 6, `tábuas arrancadas ${tore}`);
  check('zumbi pula para dentro sem tábuas', climbed && s.boards[0] === 0);

  // conserto: +10 por tábua (sem zumbis por perto, para o jogador de teste não cair)
  raw(s).zombies.clear();
  raw(s).toSpawn = 0;
  raw(s).occupant[0] = null;
  const pts0 = p.points;
  const inside = [2.4, -42.15];
  for (let i = 0; i < 20 * 2; i++) {
    at(inside[0], inside[1] + 0.8);
    s.handle('a', { t: 'repair', entry: 0 });
    s.tick(0.05);
  }
  s.handle('a', { t: 'repair', entry: null });
  check('consertar repõe tábuas', s.boards[0] >= 3, `tábuas ${s.boards[0]}`);
  check('cada tábua dá +10', p.points - pts0 === s.boards[0] * 10 || p.life !== 'alive', `pontos +${p.points - pts0}`);
  const raw2 = raw(s);
  raw2.players.get('a').repairPts = 500;
  s.boards[0] = 0;
  const pts1 = p.points;
  for (let i = 0; i < 20; i++) {
    at(inside[0], inside[1] + 0.8);
    s.handle('a', { t: 'repair', entry: 0 });
    s.tick(0.05);
  }
  check('limite de 500 pontos por rodada', p.points === pts1 && s.boards[0] > 0, `pontos ${pts1}->${p.points} tábuas ${s.boards[0]} vida ${p.life} estado ${s.state}`);
}

// --- portas e áreas ---
{
  check('mapa tem 16 portas (2 lojas, 4 quintais e 10 prédios)', map.doors.length === 16);
  const s = new GameSim(map, true);
  s.addPlayer('a', 'A', 0);
  s.start();
  let rose = 0;
  let viaEntry = 0;
  for (let i = 0; i < 20 * 40; i++) {
    s.tick(0.05);
    for (const e of s.drainEvents()) if (e.e === 'zrise') rose++;
    viaEntry = Math.max(viaEntry, [...raw(s).zombies.values()].filter((z) => z.phase !== 'none').length);
    if (s.state === 'gameover') break;
  }
  check('com tudo fechado, ninguém surge da terra', rose === 0 && viaEntry > 0, `da terra ${rose}, por entradas ${viaEntry}`);

  const s2 = new GameSim(map, true);
  s2.addPlayer('a', 'A', 0);
  s2.start();
  const p2 = s2.players.get('a')!;
  const nav = raw(s2).nav;
  const bankInside = { x: -17, z: -17 };
  const bankDoor = map.interactables.find((i) => i.door === 'banco')!.id;
  nav.update([bankInside]);
  const closed = nav.distanceAt(0, -12);
  s2.handle('a', { t: 'interact', id: bankDoor, weapon: 'pistol' });
  check('porta longe é recusada', s2.drainEvents().some((e) => e.e === 'deny'));
  goTo(s2, 'a', bankDoor);
  s2.handle('a', { t: 'interact', id: bankDoor, weapon: 'pistol' });
  check('porta sem pontos é recusada', !raw(s2).world.openDoors.has('banco'));
  p2.points = 2000;
  s2.handle('a', { t: 'interact', id: bankDoor, weapon: 'pistol' });
  const ev = s2.drainEvents();
  check('Banco abre por 750', raw(s2).world.openDoors.has('banco') && p2.points === 1250 && ev.some((e) => e.e === 'door'));
  check('estado da partida lista a porta aberta', s2.snapshot().doors.includes('banco'));
  nav.update([bankInside]);
  const open = nav.distanceAt(0, -12);
  check('zumbis passam a ter caminho até o Banco', closed === 0xffff && open < 0xffff, `antes ${closed}, depois ${open}`);
  const spawnsBefore = raw(s2).openSpawns().length;
  const qDoor = map.interactables.find((i) => i.door === 'q-no')!.id;
  goTo(s2, 'a', qDoor);
  s2.handle('a', { t: 'interact', id: qDoor, weapon: 'pistol' });
  check('abrir o quintal ativa os pontos de surgir da terra dele', spawnsBefore === 0 && raw(s2).openSpawns().length === 5, `${spawnsBefore} -> ${raw(s2).openSpawns().length}`);
}

// --- prédios da Cidade: cada um fechado até comprar a porta ---
{
  const s = new GameSim(map, true);
  s.addPlayer('a', 'A', 0);
  s.start();
  const nav = raw(s).nav;
  const start = { x: -3, z: 11.5 };
  const reach = (x: number, z: number) => {
    nav.update([start]);
    return nav.distanceAt(x, z) < 0xffff;
  };
  const areas = [...new Set(map.zombieSpawns.map((p) => p.area).filter((a): a is string => !!a))];
  // com tudo fechado: nenhum ponto de surgir (de prédio ou quintal) é alcançável a partir da rua
  const leaks = map.zombieSpawns.filter((p) => reach(p.x, p.z));
  check('com tudo fechado, nenhum prédio ou quintal é alcançável a pé', leaks.length === 0, leaks.map((p) => p.area).join(' '));
  // as portas dos prédios ficam na rua: dá para chegar até elas de graça
  const buildings = map.doors.filter((d) => d.kind === 'door');
  const doorsOk = buildings.every((d) => map.interactables.filter((i) => i.door === d.id).every((i) => reach(i.use[0], i.use[1])));
  check(`as ${buildings.length} portas de prédio ficam alcançáveis da rua`, doorsOk && buildings.length === 12);
  // cada prédio, aberto sozinho, fica alcançável (e só ele)
  const bad: string[] = [];
  for (const d of buildings) {
    raw(s).world.openDoors.clear();
    raw(s).world.openDoors.add(d.id);
    nav.rebuild();
    const mine = map.zombieSpawns.filter((p) => p.area === d.id);
    const others = map.zombieSpawns.filter((p) => p.area !== d.id && p.area);
    if (!mine.every((p) => reach(p.x, p.z)) || others.some((p) => reach(p.x, p.z))) bad.push(d.id);
  }
  check('cada prédio aberto fica alcançável, sem abrir outros lugares', bad.length === 0, bad.join(' '));
  // tudo aberto: armas de parede, Caixa e bebidas alcançáveis
  raw(s).world.openDoors.clear();
  for (const d of map.doors) raw(s).world.openDoors.add(d.id);
  for (let i = 0; i < map.boxSpots.length; i++) raw(s).world.openDoors.add(`box-spot-${i}`);
  nav.rebuild();
  const unreach = map.interactables.filter((i) => ['weapon', 'box', 'perk', 'ammo'].includes(i.kind) && !reach(i.use[0], i.use[1]));
  check('com tudo aberto, toda arma de parede, Caixa e bebida é alcançável', unreach.length === 0, unreach.map((i) => i.id).join(' '));
  check(`${map.entries.length - 4} janelas de prédio com tábuas, presas aos prédios`, map.entries.length > 20 && map.entries.slice(4).every((e) => e.area && areas.includes(e.area)));
  // janelas de prédio fechado não soltam zumbis
  raw(s).world.openDoors.clear();
  nav.rebuild();
  check('janelas de prédio fechado não valem como entrada', raw(s).openEntries().length === 4);
  raw(s).world.openDoors.add('cinema');
  check('abrir o Cinema ativa as janelas dele', raw(s).openEntries().length === 4 + map.entries.filter((e) => e.area === 'cinema').length);
}

// --- armas de parede, granadas e faca pesada ---
{
  const s = new GameSim(map, true);
  s.addPlayer('a', 'A', 0);
  s.start();
  const p = s.players.get('a')!;
  p.points = 20000;
  const buy = (id: string, held = 'pistol') => {
    goTo(s, 'a', id);
    s.handle('a', { t: 'interact', id, weapon: held });
    return s.drainEvents();
  };
  check('mapa tem 13 armas de parede, granadas e faca', map.interactables.filter((i) => i.kind === 'weapon').length === 13 && map.interactables.some((i) => i.kind === 'grenade') && map.interactables.some((i) => i.kind === 'knife'));
  let ev = buy('wall-carbine');
  check('compra a Carabina por 500', p.weapons.join() === 'pistol,carbine' && p.points === 19500 && ev.some((e) => e.e === 'weapon'));
  ev = buy('wall-carbine', 'carbine');
  check('comprar de novo só repõe munição (250)', p.points === 19250 && ev.some((e) => e.e === 'refill') && p.weapons.length === 2);
  ev = buy('wall-smg', 'carbine');
  check('com 2 armas, troca a da mão', p.weapons.join() === 'pistol,smg' && ev.some((e) => e.e === 'weapon' && e.replaced === 'carbine'));
  s.handle('a', { t: 'shoot', weapon: 'rifle', hits: [] });
  check('tiro com arma que não tem é ignorado', !s.drainEvents().some((e) => e.e === 'shot'));
  p.perks.push('mula');
  buy('wall-rifle', 'smg');
  check('com a Mula, cabe uma 3ª arma', p.weapons.join() === 'pistol,smg,rifle');
  raw(s).clearPerks(p);
  check('sem a Mula, perde a 3ª arma', p.weapons.join() === 'pistol,smg');

  check('começa com 2 granadas', p.grenades === 2);
  ev = buy('grenades');
  check('banca enche as granadas (250)', p.grenades === 4 && ev.some((e) => e.e === 'gear'));
  ev = buy('grenades');
  check('banca recusa com 4 granadas', ev.some((e) => e.e === 'deny' && e.reason === 'cheio'));

  // granada explode e mata um zumbi perto
  for (let i = 0; i < 20 * 6; i++) s.tick(0.05);
  s.drainEvents();
  const z = [...raw(s).zombies.values()][0];
  const zid = z.id;
  z.phase = 'none';
  z.anim = 'move';
  z.speed = 0;
  z.x = p.x + 3;
  z.z = p.z;
  s.handle('a', { t: 'grenade', x: p.x, y: 1.4, z: p.z, vx: 2.5, vy: 2, vz: 0 });
  let boom = false;
  for (let i = 0; i < 60; i++) {
    z.x = p.x + 3;
    z.z = p.z;
    s.tick(0.05);
    for (const e of s.drainEvents()) if (e.e === 'boom') boom = true;
  }
  check('granada explode depois do pavio', boom && p.grenades === 3);
  check('explosão mata zumbi perto (rodada 1)', !raw(s).zombies.has(zid));

  ev = buy('knife');
  check('faca pesada por 3000', p.heavyKnife && ev.some((e) => e.e === 'gear'));
}

// --- Caixa Misteriosa ---
{
  check('mapa tem 7 locais da caixa (começa no Banco)', map.boxSpots.length === 7 && map.boxSpots[0].name === 'Banco');
  const s = new GameSim(map, false);
  s.addPlayer('a', 'A', 0);
  s.addPlayer('b', 'B', 1);
  s.start();
  const a = s.players.get('a')!;
  const w = raw(s).world;
  check('só o local atual da caixa tem colisão', !w.openDoors.has('box-spot-0') && w.openDoors.has('box-spot-1'));
  a.points = 50000;
  goTo(s, 'a', 'box-0');
  s.handle('a', { t: 'interact', id: 'box-0', weapon: 'pistol' });
  check('girar custa 950', a.points === 49050 && s.box.state === 'spinning');
  for (let i = 0; i < 20 * 4.2; i++) s.tick(0.05);
  check('depois de 4 s oferece uma arma', s.box.state === 'offer' && !!s.box.weapon && s.box.weapon !== 'pistol', String(s.box.weapon));
  goTo(s, 'b', 'box-0');
  s.players.get('b')!.points = 5000;
  s.handle('b', { t: 'interact', id: 'box-0', weapon: 'pistol' });
  check('só quem girou pode pegar', s.box.state === 'offer');
  const offered = s.box.weapon!;
  s.handle('a', { t: 'interact', id: 'box-0', weapon: 'pistol' });
  check('pega a arma da caixa', a.weapons.includes(offered) && s.box.state === 'idle');

  // nunca repete arma que o jogador tem
  let repeats = 0;
  for (let i = 0; i < 300; i++) if (a.weapons.includes(raw(s).pickBoxWeapon(a))) repeats++;
  check('nunca sorteia arma que já tem', repeats === 0);

  // o Corvo: força o sorteio
  raw(s).boxSpins = 10;
  const rnd = Math.random;
  Math.random = () => 0.01;
  const before = a.points;
  s.handle('a', { t: 'interact', id: 'box-0', weapon: 'pistol' });
  Math.random = rnd;
  for (let i = 0; i < 20 * 4.2; i++) s.tick(0.05);
  check('Corvo devolve os pontos', a.points === before && s.box.state === 'moving');
  for (let i = 0; i < 20 * 6.5; i++) s.tick(0.05);
  check('caixa reaparece em outro local', s.box.state === 'idle' && s.box.loc !== 0, `local ${s.box.loc}`);
  check('colisão acompanha a caixa', w.openDoors.has('box-spot-0') && !w.openDoors.has(`box-spot-${s.box.loc}`));
}

// --- projéteis das armas da caixa ---
{
  for (const weapon of ['launcher', 'raygun', 'crossbow']) {
    const s = new GameSim(map, true);
    s.addPlayer('a', 'A', 0);
    s.start();
    const p = s.players.get('a')!;
    p.weapons = ['pistol', weapon];
    for (let i = 0; i < 20 * 6; i++) s.tick(0.05);
    const z = [...raw(s).zombies.values()][0];
    const zid = z.id;
    Object.assign(z, { phase: 'none', anim: 'move', speed: 0, x: p.x, z: p.z - 9 });
    s.drainEvents();
    s.handle('a', { t: 'launch', weapon, x: p.x, y: 1.3, z: p.z - 0.5, dx: 0, dy: -0.02, dz: -1 });
    let boom = false;
    for (let i = 0; i < 40; i++) {
      Object.assign(z, { x: p.x, z: p.z - 9 });
      s.tick(0.05);
      for (const e of s.drainEvents()) if (e.e === 'boom') boom = true;
    }
    check(`${weapon}: projétil explode e mata o zumbi`, boom && !raw(s).zombies.has(zid));
  }
}

// --- itens que caem ---
{
  const mk = () => {
    const s = new GameSim(map, false);
    s.addPlayer('a', 'A', 0);
    s.addPlayer('b', 'B', 1);
    s.start();
    for (let i = 0; i < 20 * 6; i++) s.tick(0.05);
    s.drainEvents();
    return s;
  };
  const drop = (s: GameSim, kind: string) => {
    const a = s.players.get('a')!;
    raw(s).powerups.push({ id: 999, kind, x: a.x, y: a.y, z: a.z, t: 0 });
    s.tick(0.05);
    return s.drainEvents();
  };
  let s = mk();
  let a = s.players.get('a')!;
  let b = s.players.get('b')!;
  a.grenades = 0;
  let ev = drop(s, 'maxammo');
  check('pegar um item avisa todos', ev.some((e) => e.e === 'powerup' && e.kind === 'maxammo'));
  check('Munição Cheia enche as granadas', a.grenades === 4 && b.grenades === 4);

  s = mk();
  a = s.players.get('a')!;
  drop(s, 'insta');
  const z = [...raw(s).zombies.values()][0];
  Object.assign(z, { x: a.x + 3, z: a.z, hp: 99999 });
  s.handle('a', { t: 'shoot', weapon: 'pistol', hits: [{ zid: z.id, part: 'limb' }] });
  check('Golpe Fatal mata com qualquer acerto', !raw(s).zombies.has(z.id));

  s = mk();
  a = s.players.get('a')!;
  drop(s, 'double');
  const p0 = a.points;
  const z2 = [...raw(s).zombies.values()][0];
  Object.assign(z2, { x: a.x + 3, z: a.z, hp: 99999 });
  s.handle('a', { t: 'shoot', weapon: 'pistol', hits: [{ zid: z2.id, part: 'body' }] });
  check('Pontos em Dobro: acerto vale 20', a.points - p0 === 20, `+${a.points - p0}`);
  check('efeitos aparecem no estado da partida', s.snapshot().effects.double > 29);

  s = mk();
  a = s.players.get('a')!;
  b = s.players.get('b')!;
  const pa = a.points;
  const pb = b.points;
  const alive = raw(s).zombies.size;
  ev = drop(s, 'bomb');
  check('Bomba mata todos os zumbis', alive > 0 && raw(s).zombies.size === 0 && ev.filter((e) => e.e === 'zkill').length === alive);
  check('Bomba dá +400 a cada jogador', a.points - pa === 400 && b.points - pb === 400);

  s = mk();
  s.boards[0] = 0;
  s.boards[2] = 3;
  drop(s, 'carpenter');
  check('Carpinteiro conserta todas as barricadas', s.boards.every((n) => n === 6));

  s = mk();
  drop(s, 'firesale');
  check('Liquidação: caixa por 10', s.box.fireSale);
  const ax = s.players.get('a')!;
  const before = ax.points;
  goTo(s, 'a', 'box-0');
  s.handle('a', { t: 'interact', id: 'box-0', weapon: 'pistol' });
  check('girar na Liquidação custa 10', before - ax.points === 10);

  // sorteio: até 4 por rodada, nunca repete o anterior
  s = mk();
  const rnd = Math.random;
  Math.random = () => 0.001;
  for (let i = 0; i < 10; i++) raw(s).maybeDrop({ x: 0, y: 0, z: 0 });
  Math.random = rnd;
  const kinds = raw(s).powerups.map((p: { kind: string }) => p.kind);
  check('no máximo 4 itens por rodada', kinds.length === 4, String(kinds.length));
  check('nunca o mesmo item duas vezes seguidas', kinds.every((k: string, i: number) => i === 0 || k !== kinds[i - 1]));
  check('Liquidação só depois da caixa fugir', !kinds.includes('firesale'));
}

// --- Forja ---
{
  const s = new GameSim(map, false);
  s.addPlayer('a', 'A', 0);
  s.addPlayer('b', 'B', 1);
  s.start();
  const a = s.players.get('a')!;
  a.points = 50000;
  a.weapons = ['pistol', 'smg'];
  goTo(s, 'a', 'forge');
  s.handle('a', { t: 'interact', id: 'forge', weapon: 'smg' });
  check('Forja começa desligada', s.drainEvents().some((e) => e.e === 'deny' && e.reason === 'desligada') && a.points === 50000);
  for (let i = 0; i < 3; i++) {
    goTo(s, 'a', `candle-${i}`);
    s.handle('a', { t: 'interact', id: `candle-${i}`, weapon: 'smg' });
  }
  check('três velas acendem a Forja', s.forge.on && s.drainEvents().some((e) => e.e === 'forge' && e.phase === 'on'));
  goTo(s, 'a', 'forge');
  s.handle('a', { t: 'interact', id: 'forge', weapon: 'smg' });
  check('forjar custa 5000 e entrega a arma', a.points === 45000 && !a.weapons.includes('smg') && s.forge.state === 'working');
  for (let i = 0; i < 20 * 4.2; i++) s.tick(0.05);
  check('arma pronta depois de 4 s', s.forge.state === 'ready' && s.forge.weapon === 'smg_pap');
  goTo(s, 'b', 'forge');
  s.handle('b', { t: 'interact', id: 'forge', weapon: 'pistol' });
  check('só o dono pega a arma forjada', s.forge.state === 'ready');
  s.handle('a', { t: 'interact', id: 'forge', weapon: 'pistol' });
  check('pega a Enxame', a.weapons.includes('smg_pap') && s.forge.state === 'idle');
  check('versão forjada: dano x2 e pente 60', WEAPONS_.smg_pap.damage === 90 && WEAPONS_.smg_pap.mag === 60 && WEAPONS_.smg_pap.upgraded === true);
  s.handle('a', { t: 'interact', id: 'forge', weapon: 'smg_pap' });
  check('não forja duas vezes a mesma arma', s.drainEvents().some((e) => e.e === 'deny'));
  a.weapons = ['pistol'];
  s.handle('a', { t: 'interact', id: 'forge', weapon: 'pistol' });
  check('não aceita a única arma do jogador', s.drainEvents().some((e) => e.e === 'deny' && e.reason === 'unica'));
  // munição da forjada na parede: 4500
  a.weapons = ['pistol', 'smg_pap'];
  const p0 = a.points;
  goTo(s, 'a', 'wall-smg');
  s.handle('a', { t: 'interact', id: 'wall-smg', weapon: 'smg_pap' });
  check('munição da arma forjada na parede custa 4500', p0 - a.points === 4500 && a.weapons.join() === 'pistol,smg_pap');
  // Pistola Infernal: explosão onde acerta
  a.weapons = ['pistol_pap', 'smg_pap'];
  for (let i = 0; i < 20 * 6; i++) s.tick(0.05);
  const zs = [...raw(s).zombies.values()];
  if (zs.length >= 2) {
    Object.assign(zs[0], { x: a.x + 4, z: a.z, hp: 50000 });
    Object.assign(zs[1], { x: a.x + 4.8, z: a.z, hp: 200 });
    s.handle('a', { t: 'shoot', weapon: 'pistol_pap', hits: [{ zid: zs[0].id, part: 'body' }] });
    check('Pistola Infernal explode e atinge o vizinho', !raw(s).zombies.has(zs[1].id));
  }
}

// --- Fase 2: rodada inicial, banco, XP e níveis ---
{
  check('pontos iniciais da rodada 1, 10, 50 e 100', startPoints(1) === 500 && startPoints(10) === 14540 && startPoints(50) === 155340 && startPoints(100) === 511340);
  const s = new GameSim(map, true, { startRound: 20 });
  s.addPlayer('a', 'A', 0, 7);
  s.start();
  const a = s.players.get('a')!;
  check('começa com os pontos da rodada 20', a.points === startPoints(20));
  for (let i = 0; i < 20 * 3.5; i++) s.tick(0.05);
  check('a primeira rodada é a 20', s.round === 20 && s.snapshot().startRound === 20);
  check('nível do jogador vai no estado da partida', s.snapshot().players[0].level === 7);

  const bankUse = map.interactables.filter((i) => i.kind === 'bank');
  check('Banco tem guichê de depósito e de saque', bankUse.length === 2);
  goTo(s, 'a', 'bank-deposit');
  const p0 = a.points;
  s.handle('a', { t: 'interact', id: 'bank-deposit', weapon: 'pistol' });
  check('depositar tira 1000 pontos', p0 - a.points === 1000 && s.drainEvents().some((e) => e.e === 'bank' && e.action === 'deposit'));
  goTo(s, 'a', 'bank-withdraw');
  const p1 = a.points;
  s.handle('a', { t: 'interact', id: 'bank-withdraw', weapon: 'pistol' });
  check('sacar dá 900 (taxa de 100)', a.points - p1 === 900);
  a.points = 500;
  goTo(s, 'a', 'bank-deposit');
  s.handle('a', { t: 'interact', id: 'bank-deposit', weapon: 'pistol' });
  check('não deposita sem 1000 pontos', a.points === 500);

  check('XP da partida', matchXp({ kills: 10, headshots: 4, revives: 1, startRound: 1, round: 4 }) === 100 + 100 + 100 + 50 * (1 + 2 + 3));
  check('nível 1 com 0 XP', levelFromXp(0).level === 1 && levelFromXp(1999).level === 1 && levelFromXp(2000).level === 2);
  check('nível máximo 60', levelFromXp(1e12).level === 60);
  check('patentes a cada 10 níveis', rankOf(1).patente === 'osso' && rankOf(11).patente === 'ossos' && rankOf(35).patente === 'faca' && rankOf(60).patente === 'lenda');
  check('material muda a cada 2 níveis', rankOf(1).tier === 'ferro' && rankOf(3).tier === 'bronze' && rankOf(10).tier === 'brilho');
}

// --- bancada de miras da Oficina ---
{
  const s = new GameSim(map, true);
  s.addPlayer('a', 'A', 0);
  s.start();
  const a = s.players.get('a')!;
  a.points = 20000;
  a.weapons = ['pistol', 'rifle'];
  check('bancada tem ponto vermelho e luneta', map.interactables.some((i) => i.id === 'sight-red') && map.interactables.some((i) => i.id === 'sight-scope'));
  goTo(s, 'a', 'sight-red');
  s.drainEvents();
  s.handle('a', { t: 'interact', id: 'sight-red', weapon: 'pistol' });
  check('pistola não aceita mira', has(events(s), 'deny', (e) => e.e === 'deny' && e.reason === 'mira') && a.points === 20000);
  s.handle('a', { t: 'interact', id: 'sight-red', weapon: 'rifle' });
  check('ponto vermelho no fuzil custa 1000', a.points === 19000 && a.sights.rifle === 'red' && s.snapshot().players[0].sights.rifle === 'red');
  s.handle('a', { t: 'interact', id: 'sight-red', weapon: 'rifle' });
  check('não compra a mesma mira duas vezes', a.points === 19000 && has(events(s), 'deny'));
  goTo(s, 'a', 'sight-scope');
  s.handle('a', { t: 'interact', id: 'sight-scope', weapon: 'rifle' });
  check('luneta 2x troca o ponto vermelho por 1500', a.points === 17500 && a.sights.rifle === 'scope');
  a.weapons = ['pistol', 'smg'];
  s.handle('a', { t: 'interact', id: 'sight-scope', weapon: 'smg' });
  check('luneta não serve na submetralhadora', a.points === 17500 && !a.sights.smg);
  // mira sobrevive à Forja e some quando a arma é trocada
  a.weapons = ['pistol', 'rifle_pap'];
  goTo(s, 'a', 'sight-red');
  s.handle('a', { t: 'interact', id: 'sight-red', weapon: 'rifle_pap' });
  check('arma forjada usa a mira da original', a.sights.rifle === 'red');
  goTo(s, 'a', 'wall-carbine');
  s.handle('a', { t: 'interact', id: 'wall-carbine', weapon: 'rifle_pap' });
  check('trocar a arma leva a mira junto', a.weapons.includes('carbine') && !a.sights.rifle);
}

// --- rodada infernal ---
{
  const firsts = Array.from({ length: 200 }, () => new GameSim(map, true).nextHellRound);
  check('primeira rodada infernal entre a 5 e a 7', firsts.every((r) => r >= 5 && r <= 7) && new Set(firsts).size === 3);
  const late = Array.from({ length: 100 }, () => new GameSim(map, true, { startRound: 20 }).nextHellRound);
  check('começando na 20, a infernal vem entre a 22 e a 24', late.every((r) => r >= 22 && r <= 24));
  check('quantidade de cães: 6 por jogador + 2 por infernal anterior, até 30', dogsForRound(1, 0) === 6 && dogsForRound(2, 1) === 14 && dogsForRound(4, 9) === 30);
  check('vida dos cães sobe a cada infernal', dogHealth(0) === 220 && dogHealth(1) === 450 && dogHealth(9) === 1600);

  const s = new GameSim(map, true);
  s.addPlayer('a', 'A', 0);
  s.start();
  s.nextHellRound = 1;
  const a = s.players.get('a')!;
  for (let i = 0; i < 20 * 3.2; i++) s.tick(0.05);
  let ev = events(s);
  check('rodada 1 virou infernal', s.round === 1 && s.hell && s.snapshot().hell && has(ev, 'roundStart', (e) => e.e === 'roundStart' && e.hell));
  // clima muda antes do primeiro raio
  for (let i = 0; i < 20 * 2; i++) s.tick(0.05);
  check('nenhum cão antes do clima mudar', raw(s).zombies.size === 0);
  for (let i = 0; i < 20 * 4; i++) s.tick(0.05);
  ev = events(s);
  const dogs = [...raw(s).zombies.values()];
  check('cães caem em raios', dogs.length > 0 && dogs.every((z: { kind: number }) => z.kind === 3) && has(ev, 'dogspawn'));
  const bolts = ev.filter((e) => e.e === 'dogspawn') as { x: number; z: number }[];
  const dist = bolts.map((e) => Math.hypot(e.x - a.x, e.z - a.z));
  check('raios caem perto, mas não colados no jogador', dist.length > 0 && dist.every((d) => d >= 5.5 && d <= 40), dist.map((d) => d.toFixed(1)).join(' '));
  check('cão tem a vida da 1ª infernal', dogs.every((z: { hp: number }) => z.hp === 220));
  // o cão corre até o jogador e morde
  a.health = 100;
  for (let i = 0; i < 20 * 6 && a.health === 100; i++) s.tick(0.05);
  check('cão alcança e morde o jogador', a.health < 100 && a.health >= 100 - 35 * 3, `vida ${a.health}`);
  // mata todos: cada um explode; o último deixa Munição Cheia
  a.health = 100;
  a.perks = [];
  let booms = 0;
  for (let guard = 0; guard < 400 && (raw(s).toSpawn > 0 || raw(s).zombies.size > 0); guard++) {
    for (const z of [...raw(s).zombies.values()]) {
      z.x = a.x + 6;
      z.z = a.z;
      raw(s).damageZombie(z, 99999, a, 'body', false);
    }
    s.tick(0.05);
    booms += events(s).filter((e) => e.e === 'boom' && e.kind === 'fire').length;
    a.health = 100;
  }
  check('cada cão explode em fogo', booms === 6, `${booms} explosões`);
  check('rodada infernal acaba e conta', s.state === 'intermission' && !s.hell && s.hellRounds === 1);
  const pu = s.snapshot().powerups;
  check('último cão deixa Munição Cheia', pu.length === 1 && pu[0].kind === 'maxammo');
  check('próxima infernal 4 a 6 rodadas depois', s.nextHellRound >= 5 && s.nextHellRound <= 7);
  // explosão queima quem está colado
  for (let i = 0; i < 20 * 11; i++) s.tick(0.05);
  check('rodada seguinte é normal', s.round === 2 && !s.hell);
  const dog = { id: 999, x: a.x + 0.8, y: 0, z: a.z, yaw: 0, hp: 10, kind: 3, speed: 0, anim: 'move', t: 0, look: 1, attackT: 0, attackHit: false, losT: 9, los: false, bestNav: 0xffff, stuckT: 0, entry: -1, phase: 'none', phaseT: 0 };
  raw(s).zombies.set(999, dog);
  a.health = 100;
  raw(s).damageZombie(dog, 50, a, 'body', false);
  check('explosão do cão queima quem está perto', a.health === 75, `vida ${a.health}`);
}

// --- chefão Carrasco ---
{
  const place = (s: GameSim, pid: string, x: number, z: number) => s.handle(pid, { t: 'state', x, y: 0, z, yaw: 0, pitch: 0, crouch: false, speed: 0 });
  check('Carrasco vem pela primeira vez na rodada 12', Array.from({ length: 50 }, () => new GameSim(map, true).nextBossRound).every((r) => r === 12));
  const lateBoss = Array.from({ length: 100 }, () => new GameSim(map, true, { startRound: 30 }));
  check('começando na 30, ele vem 2 a 4 rodadas depois e nunca junto da infernal', lateBoss.every((g) => g.nextBossRound >= 32 && g.nextBossRound <= 35 && g.nextBossRound !== g.nextHellRound));
  check('vida do Carrasco = 12 x zumbi x jogadores', bossHealth(12, 2) === 12 * zombieHealth(12) * 2);

  const s = new GameSim(map, true, { startRound: 12 });
  s.addPlayer('a', 'A', 0);
  s.start();
  s.nextHellRound = 99;
  s.nextBossRound = 12;
  const a = s.players.get('a')!;
  a.perks = [];
  for (let i = 0; i < 20 * 3.2; i++) s.tick(0.05);
  check('rodada do Carrasco marca a chegada dele', s.round === 12 && s.bossTimer >= 11 && s.bossTimer <= 25, `${s.bossTimer.toFixed(1)} s`);
  // tira os zumbis comuns: ele chega na hora e a rodada não acaba sem ele
  raw(s).toSpawn = 0;
  raw(s).zombies.clear();
  events(s);
  s.tick(0.05);
  let ev = events(s);
  const boss = [...raw(s).zombies.values()].find((z: { kind: number }) => z.kind === 4);
  check('sem zumbis, o Carrasco aparece na hora', !!boss && has(ev, 'boss', (e) => e.e === 'boss' && e.phase === 'spawn') && s.state === 'active');
  check('estado mostra a vida e o capacete', JSON.stringify(s.snapshot().boss) === JSON.stringify({ hp: 1, armor: true }));
  for (let i = 0; i < 20 * 3; i++) s.tick(0.05);
  check('a rodada não acaba com ele vivo', s.state === 'active');

  // na rua de baixo: Carrasco em (0, 12)
  const put = (bx: number, bz: number, px: number, pz: number) => {
    boss.x = bx;
    boss.z = bz;
    boss.y = 0;
    boss.anim = 'move';
    boss.attackT = 0;
    place(s, 'a', px, pz);
    a.health = 100;
    a.life = 'alive';
  };
  const hp0 = boss.hp;
  put(0, 12, 0, 22);
  s.handle('a', { t: 'shoot', weapon: 'pistol', hits: [{ zid: boss.id, part: 'body' }] });
  const body = hp0 - boss.hp;
  s.handle('a', { t: 'shoot', weapon: 'pistol', hits: [{ zid: boss.id, part: 'head' }] });
  const headArmored = hp0 - body - boss.hp;
  check('com capacete, tiro na cabeça vale como no corpo', body > 0 && Math.abs(headArmored - body) < 1e-6, `${body} / ${headArmored}`);
  raw(s).effects.insta = 10;
  const hpI = boss.hp;
  s.handle('a', { t: 'shoot', weapon: 'pistol', hits: [{ zid: boss.id, part: 'body' }] });
  check('Golpe Fatal não mata o Carrasco', boss.hp > 0 && Math.abs(hpI - boss.hp - body) < 1e-6);
  raw(s).effects.insta = 0;
  raw(s).applyPowerup('bomb', a);
  check('Bomba não mata o Carrasco', raw(s).zombies.has(boss.id));
  events(s);
  raw(s).damageZombie(boss, boss.boss.maxHp * 0.3, a, 'body', false);
  check('capacete quebra com 30% do dano', !boss.boss.armor && has(events(s), 'boss', (e) => e.e === 'boss' && e.phase === 'armor'));
  const hpH = boss.hp;
  s.handle('a', { t: 'shoot', weapon: 'pistol', hits: [{ zid: boss.id, part: 'head' }] });
  check('sem capacete, tiro na cabeça vale o triplo', Math.abs(hpH - boss.hp - body * 3) < 1e-6, `${hpH - boss.hp}`);

  // golpe no chão
  put(0, 12, 0, 15);
  boss.boss.slamCD = 0;
  for (let i = 0; i < 20 * 2.5 && !has(ev = events(s), 'boss', (e) => e.e === 'boss' && e.phase === 'slam'); i++) s.tick(0.05);
  check('golpe no chão machuca quem está perto', a.health < 100 && a.health >= 100 - 55, `vida ${a.health}`);
  // corrente
  put(0, 12, 0, 23);
  boss.boss.chainCD = 0;
  boss.boss.chargeCD = 99;
  boss.boss.slamCD = 99;
  let pulled = false;
  let chained = false;
  for (let i = 0; i < 20 * 2.5 && !pulled; i++) {
    s.tick(0.05);
    place(s, 'a', 0, 23);
    ev = events(s);
    chained ||= has(ev, 'boss', (e) => e.e === 'boss' && e.phase === 'chain' && e.pid === 'a');
    pulled = has(ev, 'bosspull', (e) => e.e === 'bosspull' && e.pid === 'a');
  }
  check('corrente acerta e puxa o jogador', chained && pulled && a.health < 100);
  // investida
  for (let i = 0; i < 20 * 2; i++) s.tick(0.05);
  put(0, 12, 0, 24);
  boss.boss.chainCD = 99;
  boss.boss.chargeCD = 0;
  let charged = false;
  for (let i = 0; i < 20 * 3.5; i++) {
    s.tick(0.05);
    place(s, 'a', 0, 24);
    charged ||= has(events(s), 'boss', (e) => e.e === 'boss' && e.phase === 'charge');
  }
  check('investida atropela o jogador no caminho', charged && a.health <= 100 - 55 + 1 && boss.z > 18, `vida ${a.health}, chegou a z=${boss.z.toFixed(1)}`);

  // morte: 1000 pontos, item garantido e a rodada pode acabar
  a.health = 100;
  a.life = 'alive';
  const pts = a.points;
  events(s);
  raw(s).damageZombie(boss, 1e9, a, 'body', false);
  ev = events(s);
  check('morte do Carrasco dá 1000 pontos e um item', has(ev, 'boss', (e) => e.e === 'boss' && e.phase === 'death') && a.points - pts >= 1000 && s.snapshot().powerups.length >= 1);
  s.tick(0.05);
  check('sem ele a rodada acaba', s.state === 'intermission' && s.snapshot().boss === null);
  check('próximo Carrasco 6 a 9 rodadas depois', s.nextBossRound >= 18 && s.nextBossRound <= 22);
  raw(s).applyPowerup('freeperk', a);
  check('Bebida Grátis dá uma bebida que o jogador não tinha', a.perks.length === 1 && has(events(s), 'perk'));
}

// --- armas novas e projéteis ---
{
  const bases = Object.keys(WEAPONS_).filter((id) => !id.endsWith('_pap'));
  check('24 armas, todas com versão da Forja', bases.length === 24 && bases.every((id) => WEAPONS_[`${id}_pap`]?.upgraded), `${bases.length} armas`);
  check('pesos da Caixa somam 100 e só têm armas que existem', BOX_POOL.reduce((a, [, w]) => a + w, 0) === 100 && BOX_POOL.every(([id]) => WEAPONS_[id]));
  check('rajadas e mira de fábrica', WEAPONS_.burstrifle.burst === 3 && WEAPONS_.burstpistol.burst === 3 && WEAPONS_.dmr.optic === 'red');

  const s = new GameSim(map, true);
  s.addPlayer('a', 'A', 0);
  s.start();
  const a = s.players.get('a')!;
  a.points = 5000;
  goTo(s, 'a', 'wall-burstrifle');
  s.handle('a', { t: 'interact', id: 'wall-burstrifle', weapon: 'pistol' });
  check('Fuzil de rajada na parede da Farmácia por 1200', a.weapons.includes('burstrifle') && a.points === 3800);

  // um zumbi parado na rua e um tiro de cada projétil nele (o jogador a 10 m)
  const shootAt = (weapon: string, aimY = 1.2) => {
    raw(s).zombies.clear();
    raw(s).grenades = [];
    raw(s).toSpawn = 0;
    raw(s).spawnZombie();
    const z = [...raw(s).zombies.values()].pop();
    Object.assign(z, { x: 0, z: 14, y: 0, anim: 'move', speed: 0, hp: 1e6, entry: -1, phase: 'none' });
    s.handle('a', { t: 'state', x: 0, y: 0, z: 24, yaw: 0, pitch: 0, crouch: false, speed: 0 });
    a.weapons = ['pistol', weapon];
    raw(s).time += 5;
    const dy = aimY - 1.4;
    s.handle('a', { t: 'launch', weapon, x: 0, y: 1.4, z: 23.4, dx: 0, dy: dy / 9.4, dz: -1 });
    events(s);
    let booms = 0;
    for (let i = 0; i < 20 * 3; i++) {
      s.tick(0.05);
      z.x = 0; z.z = 14; z.anim = 'move';
      booms += events(s).filter((e) => e.e === 'boom').length;
    }
    return { dmg: 1e6 - z.hp, booms };
  };
  const rk = shootAt('rocket');
  check('foguete explode no zumbi', rk.booms === 1 && rk.dmg > 1000, JSON.stringify(rk));
  const bl = shootAt('blade');
  check('lâmina corta sem explodir', bl.booms === 0 && Math.abs(bl.dmg - 700) < 1, JSON.stringify(bl));
  const bh = shootAt('blade', 1.75);
  check('lâmina na cabeça vale o dobro', Math.abs(bh.dmg - 1400) < 1, JSON.stringify(bh));
  const dr = shootAt('drum');
  check('granada do tambor explode no zumbi', dr.booms === 1 && dr.dmg > 300, JSON.stringify(dr));
  // granada do tambor sem acertar ninguém: quica e explode no pavio
  raw(s).zombies.clear();
  raw(s).time += 5;
  s.handle('a', { t: 'launch', weapon: 'drum', x: 0, y: 1.4, z: 23.4, dx: 0, dy: 0.2, dz: 1 });
  events(s);
  let fuseT = 0;
  for (let i = 0; i < 40 && raw(s).grenades.length; i++) {
    s.tick(0.05);
    fuseT += 0.05;
  }
  check('granada do tambor explode no pavio de 1,3 s', Math.abs(fuseT - 1.3) < 0.11, `${fuseT.toFixed(2)} s`);
}

// --- armas maravilha ---
{
  const s = new GameSim(map, true);
  s.addPlayer('a', 'A', 0);
  s.addPlayer('b', 'B', 1);
  s.start();
  const a = s.players.get('a')!;
  a.health = a.maxHealth = 99999;
  raw(s).round = 25;
  const put = (pts: [number, number][]) => {
    raw(s).zombies.clear();
    raw(s).toSpawn = 0;
    const ids: number[] = [];
    for (const [x, z] of pts) {
      raw(s).spawnZombie();
      const zb = [...raw(s).zombies.values()].pop();
      Object.assign(zb, { x, z, y: 0, anim: 'move', speed: 0, hp: 20000, entry: -1, phase: 'none' });
      ids.push(zb.id);
    }
    return ids;
  };
  const fire = (weapon: string, dy = -0.03) => {
    s.handle('a', { t: 'state', x: 0, y: 0, z: 24, yaw: 0, pitch: 0, crouch: false, speed: 0 });
    a.weapons = ['pistol', weapon];
    raw(s).time += 5;
    s.handle('a', { t: 'launch', weapon, x: 0, y: 1.4, z: 23.4, dx: 0, dy, dz: -1 });
  };
  check('3 armas maravilha na Caixa, 2% cada (sorteio soma 100)', ['wind', 'arc', 'vortex'].every((w) => BOX_POOL.find(([x]) => x === w)?.[1] === 2) && BOX_POOL.reduce((t, [, w]) => t + w, 0) === 100);

  // Canhão de Vento: mata os do cone (mesmo com muita vida) e arremessa; o de trás fica
  const ids = put([[0, 18], [1.5, 16], [-1.5, 15], [0, 13], [0, 30]]);
  events(s);
  fire('wind');
  const ev = events(s);
  const kills = ev.filter((e) => e.e === 'zkill' && e.fling);
  check('Canhão de Vento mata e arremessa os 4 zumbis do cone', kills.length === 4 && has(ev, 'wind'), `${kills.length} arremessados`);
  check('quem está atrás do Canhão de Vento fica', raw(s).zombies.has(ids[4]));
  const fl = kills[0] as Extract<GameEvent, { e: 'zkill' }>;
  check('arremesso vai para longe do jogador e para cima', !!fl.fling && fl.fling[2] < -5 && fl.fling[1] > 2, JSON.stringify(fl.fling));
  put([[0, 4]]);
  fire('wind');
  check('Canhão de Vento não alcança a 20 m', raw(s).zombies.size === 1);

  // Arpão Elétrico: salta de zumbi em zumbi (até 10), cada um a 3 m do outro
  const line: [number, number][] = [];
  for (let i = 0; i < 13; i++) line.push([(i % 2) * 1.5, 18 - i * 2.5]);
  put(line);
  events(s);
  fire('arc', -0.02);
  const ev2 = events(s);
  const arc = ev2.find((e) => e.e === 'arc') as Extract<GameEvent, { e: 'arc' }> | undefined;
  const shocked = ev2.filter((e) => e.e === 'zkill' && e.shock).length;
  check('Arpão Elétrico salta e mata 10 zumbis', shocked === 10 && !!arc && arc.pts.length === 33, `${shocked} mortos, ${arc?.pts.length} coordenadas`);
  check('sobram os 3 além do limite de saltos', raw(s).zombies.size === 3);
  put(line);
  a.weapons = ['pistol', 'arc_pap'];
  raw(s).time += 5;
  s.handle('a', { t: 'launch', weapon: 'arc_pap', x: 0, y: 1.4, z: 23.4, dx: 0, dy: -0.02, dz: -1 });
  check('na Forja o arpão salta em todos os 13', raw(s).zombies.size === 0 && events(s).filter((e) => e.e === 'zkill').length === 13);

  // Vórtice: a esfera cai na rua, abre e engole os zumbis em volta em poucos segundos
  put([]);
  events(s);
  fire('vortex', -0.12);
  let opened: Extract<GameEvent, { e: 'vortex' }> | undefined;
  for (let i = 0; i < 40 && !opened; i++) {
    s.tick(0.05);
    for (const e of events(s)) if (e.e === 'vortex' && e.phase === 'open') opened = e;
  }
  // quatro zumbis parados a 2–6 m do centro e um longe dele
  const o = opened ?? { x: 0, z: 14 };
  const near = put([[o.x + 2, o.z], [o.x - 3.5, o.z + 1], [o.x, o.z - 5], [o.x + 4, o.z + 4], [30, 0]]);
  const far = raw(s).zombies.get(near[4]);
  let eaten = 0;
  let closed = false;
  for (let i = 0; i < 20 * 8; i++) {
    raw(s).toSpawn = 0;
    s.tick(0.05);
    for (const e of events(s)) {
      if (e.e === 'vortex' && e.phase === 'close') closed = true;
      if (e.e === 'zkill' && e.sucked && near.includes(e.zid)) eaten++;
    }
    far.speed = 0;
  }
  check('Vórtice abre na rua e aparece no estado da partida', !!opened && opened.z > 8 && opened.z < 20, JSON.stringify(opened));
  check('Vórtice engole os 4 zumbis perto', eaten === 4, `${eaten} engolidos; sobraram ${[...raw(s).zombies.values()].map((z: { x: number; z: number }) => z.x.toFixed(1) + ',' + z.z.toFixed(1)).join(' ')}`);
  check('zumbi longe do Vórtice fica e o buraco fecha em 6 s', raw(s).zombies.has(far.id) && closed && s.snapshot().vortices.length === 0);

  // única: com o Canhão de Vento na mão de B, a Caixa nunca o sorteia para A
  s.players.get('b')!.weapons = ['pistol', 'wind'];
  a.weapons = ['pistol'];
  let gotWind = 0, gotArc = 0;
  for (let i = 0; i < 4000; i++) {
    const w = raw(s).pickBoxWeapon(a);
    if (w === 'wind') gotWind++;
    if (w === 'arc') gotArc++;
  }
  check('arma maravilha única: a Caixa não dá a que outro jogador tem', gotWind === 0 && gotArc > 30, `vento ${gotWind}, arpão ${gotArc}`);
}

// --- ritual e Bispo (Cidade) ---
{
  const s = new GameSim(map, true);
  s.addPlayer('a', 'A', 0);
  s.start();
  const a = s.players.get('a')!;
  a.health = a.maxHealth = 99999;
  raw(s).round = 12;
  raw(s).world.openDoors.add('igreja');
  const light = (i: number) => {
    goTo(s, 'a', `ritual-${i}`);
    s.handle('a', { t: 'interact', id: `ritual-${i}`, weapon: 'pistol' });
  };
  check('mapa tem 3 velas pretas no altar da Igreja', map.interactables.filter((i) => i.kind === 'ritual').length === 3 && map.ritual?.candles.length === 3);
  events(s);
  light(0);
  check('vela preta não acende com a Forja apagada', !s.ritual!.candles[0] && has(events(s), 'deny'));
  s.forge.on = true;
  for (const i of [0, 1, 2]) light(i);
  const ev = events(s);
  check('três velas pretas começam o ritual', s.ritual!.state === 'summoning' && has(ev, 'ritual', (e) => e.e === 'ritual' && e.phase === 'start'));
  let spawned: GameEvent | undefined;
  for (let i = 0; i < 20 * 5 && !spawned; i++) {
    s.tick(0.05);
    spawned = events(s).find((e) => e.e === 'bispo' && e.phase === 'spawn');
  }
  const bz = [...raw(s).zombies.values()].find((z: { kind: number }) => z.kind === 6);
  check('o Bispo sobe da lava do cruzamento', !!spawned && !!bz && Math.hypot(bz.x, bz.z) < 1 && s.snapshot().bispo?.phase === 1);
  const maxHp = bz.bispo.maxHp;
  check('vida do Bispo = 25 x zumbi da rodada x jogadores', Math.abs(maxHp - 25 * zombieHealth(s.round)) < 1, `${Math.round(maxHp)} na rodada ${s.round}`);
  const left = raw(s).toSpawn;
  raw(s).toSpawn = Math.max(left, 10);
  const before = raw(s).toSpawn;
  for (let i = 0; i < 20 * 3; i++) s.tick(0.05);
  check('enquanto o Bispo vive, a rodada não solta zumbis', raw(s).toSpawn === before);
  raw(s).applyPowerup('bomb', a);
  check('a Bomba não mata o Bispo', raw(s).zombies.has(bz.id));
  // bola de fogo: o jogador a 10 m, à vista
  bz.anim = 'move';
  bz.bispo.orbT = 0;
  bz.bispo.summonT = 99;
  const at = (x: number, z: number) => s.handle('a', { t: 'state', x, y: 0, z, yaw: 0, pitch: 0, crouch: false, speed: 0 });
  events(s);
  let orb = false, burned = false;
  for (let i = 0; i < 20 * 4; i++) {
    at(bz.x, bz.z + 10);
    s.tick(0.05);
    for (const e of events(s)) {
      if (e.e === 'bispo' && e.phase === 'orb') orb = true;
      if (e.e === 'phurt' && e.pid === 'a') burned = true;
    }
  }
  check('o Bispo lança bola de fogo que acerta o jogador', orb && burned);
  // dano grande: troca de fase em vez de morrer, e fica imune por alguns segundos
  raw(s).damageZombie(bz, maxHp * 0.9, a, 'body', false);
  check('dano grande só leva à fase 2 (não pula fase)', raw(s).zombies.has(bz.id) && bz.bispo.phase === 2 && Math.abs(bz.hp - maxHp * 2 / 3) < 1);
  const hpShield = bz.hp;
  raw(s).damageZombie(bz, 5000, a, 'body', false);
  check('imune enquanto troca de fase', bz.hp === hpShield && s.snapshot().bispo?.shield === true);
  for (let i = 0; i < 20 * 6; i++) s.tick(0.05);
  // pilares de fogo na fase 2: aviso, depois o fogo onde o jogador estava
  bz.bispo.pillarT = 0;
  bz.bispo.orbT = 99;
  events(s);
  let warned = false, pillarHit = false;
  const [px, pz] = [bz.x + 12, bz.z];
  for (let i = 0; i < 20 * 3; i++) {
    at(px, pz);
    const before2 = a.health;
    s.tick(0.05);
    for (const e of events(s)) if (e.e === 'bispo' && e.phase === 'pillar') warned = true;
    if (warned && a.health < before2) pillarHit = true;
  }
  check('na fase 2 vêm pilares de fogo sob o jogador (com aviso antes)', warned && pillarHit);
  raw(s).damageZombie(bz, maxHp, a, 'body', false);
  check('fase 3 depois de 2/3 do dano', bz.bispo.phase === 3);
  for (let i = 0; i < 20 * 6; i++) s.tick(0.05);
  const pts0 = a.points;
  a.perks = [];
  events(s);
  raw(s).damageZombie(bz, maxHp, a, 'body', false);
  const evd = events(s);
  check('o Bispo morre na fase 3', !raw(s).zombies.has(bz.id) && has(evd, 'bispo', (e) => e.e === 'bispo' && e.phase === 'death'));
  check('recompensa: todas as bebidas e 5000 pontos', a.perks.length === 6 && a.points - pts0 >= 5000, `${a.perks.length} bebidas, +${a.points - pts0}`);
  check('ritual termina (só uma vez por partida)', s.snapshot().ritual?.state === 'done');
}

// --- mapa Rota ---
{
  const rota = getMap('rota');
  check('Rota: 5 paradas, 5 pontos de ônibus, 5 locais da Caixa', rota.zones!.length === 5 && rota.bus!.stops.length === 5 && rota.boxSpots.length === 5);
  check('Rota: as 6 bebidas, a alavanca e a Forja', rota.interactables.filter((i) => i.kind === 'perk').length === 6 && rota.interactables.some((i) => i.kind === 'power') && rota.interactables.some((i) => i.kind === 'forge'));
  const s = new GameSim(rota, true);
  s.addPlayer('a', 'A', 0);
  s.start();
  const a = s.players.get('a')!;
  const place = (x: number, z: number, y = 0) => s.handle('a', { t: 'state', x, y, z, yaw: 0, pitch: 0, crouch: false, speed: 0 });
  const goR = (id: string) => {
    const it = rota.interactables.find((i) => i.id === id)!;
    place(it.use[0], it.use[1], it.y);
  };
  check('ônibus começa parado na Rodoviária', s.bus?.stop === 'rodoviaria' && s.snapshot().bus?.stop === 'rodoviaria');
  check('jogador começa na Rodoviária', s.zoneAt(a.x, a.z) === 'rodoviaria');

  // zumbis surgem perto do jogador
  for (let i = 0; i < 20 * 12; i++) s.tick(0.05);
  const zs = [...raw(s).zombies.values()];
  check('zumbis surgem perto (não do outro lado do mapa)', zs.length > 0 && zs.every((z: { x: number; z: number }) => Math.hypot(z.x - a.x, z.z - a.z) < 60), zs.map((z: { x: number; z: number }) => Math.hypot(z.x - a.x, z.z - a.z).toFixed(0)).join(' '));

  // energia: bebidas apagadas até puxar a alavanca
  a.points = 10000;
  goR('perk-gatilho');
  events(s);
  s.handle('a', { t: 'interact', id: 'perk-gatilho', weapon: 'pistol' });
  check('sem energia a bebida não sai', !a.perks.includes('gatilho') && has(events(s), 'deny', (e) => e.e === 'deny' && e.reason === 'desligada'));
  goR('power');
  s.handle('a', { t: 'interact', id: 'power', weapon: 'pistol' });
  const ev = events(s);
  check('alavanca liga a energia, abre o cofre e acende a Forja', s.power && s.world.openDoors.has('cofre') && s.forge.on && has(ev, 'power') && s.snapshot().power);
  goR('perk-gatilho');
  s.handle('a', { t: 'interact', id: 'perk-gatilho', weapon: 'pistol' });
  check('com energia a bebida sai', a.perks.includes('gatilho'));

  // Vultos na névoa (estrada entre a Rodoviária e a Lanchonete)
  raw(s).zombies.clear();
  raw(s).toSpawn = 0;
  a.health = a.maxHealth = 99999;
  let vult = 0;
  for (let i = 0; i < 20 * 10; i++) {
    place(-80, -40);
    s.tick(0.05);
    vult = Math.max(vult, [...raw(s).zombies.values()].filter((z: { kind: number }) => z.kind === 5).length);
  }
  check('na névoa aparecem Vultos', vult >= 2, `${vult} Vultos`);
  check('Vultos não contam para a rodada', s.snapshot().zombiesLeft === 0);
  for (let i = 0; i < 20 * 3; i++) {
    place(0, 9);
    s.tick(0.05);
  }
  check('Vultos somem quando o jogador volta para a parada', [...raw(s).zombies.values()].every((z: { kind: number }) => z.kind !== 5) && has(events(s), 'zvanish'));

  // ônibus: espera, buzina, sai, chega na Lanchonete
  const busEv: string[] = [];
  let t = 0;
  for (; t < 160 && !busEv.includes('arrive:lanchonete'); t += 0.05) {
    place(0, 9);
    s.tick(0.05);
    for (const e of events(s)) if (e.e === 'bus') busEv.push(`${e.phase}:${e.zone}`);
  }
  check('ônibus buzina, sai da Rodoviária e chega na Lanchonete', busEv[0] === 'honk:rodoviaria' && busEv[1] === 'leave:rodoviaria' && busEv.includes('arrive:lanchonete'), `${busEv.join(' ')} em ${t.toFixed(0)} s`);
  check('ônibus para na Lanchonete', s.bus!.stop === 'lanchonete' && Math.hypot(s.bus!.x + 170, s.bus!.z + 120) < 0.5);
  place(s.bus!.x, s.bus!.z, 0.55);
  check('jogador dentro do ônibus é reconhecido', s.onBus(a));
  // zumbi ao lado do ônibus parado: não atravessa a parede, dá a volta e entra pela porta
  {
    raw(s).zombies.clear();
    raw(s).toSpawn = 0;
    const b = s.bus!;
    raw(s).spawnZombie();
    const z = [...raw(s).zombies.values()].pop();
    const [zx, zz] = toWorld(b, BUS.halfWidth + 1.5, -3);
    Object.assign(z, { x: zx, z: zz, y: 0, anim: 'move', kind: 1, speed: 3, entry: -1, phase: 'none' });
    let firstInside: [number, number] | null = null;
    let reached = false;
    for (let i = 0; i < 20 * 10 && !reached; i++) {
      place(b.x, b.z, BUS.floorY);
      s.tick(0.05);
      if (!raw(s).zombies.has(z.id)) break;
      const [lx, lz] = toLocal(b, z.x, z.z);
      if (!firstInside && Math.abs(lx) < BUS.halfWidth - 0.15) firstInside = [lx, lz];
      reached = Math.hypot(z.x - b.x, z.z - b.z) < 1.3;
    }
    check('zumbi entra no ônibus parado só pela porta', reached && !!firstInside && firstInside[1] > BUS_DOOR.z0 - 0.4 && firstInside[1] < BUS_DOOR.z1 + 0.4, JSON.stringify(firstInside));
    raw(s).zombies.clear();
  }
  // atropelamento: zumbi na frente do ônibus andando
  for (let i = 0; i < 20 * 21 && s.bus!.wait > 0; i++) s.tick(0.05);
  for (let i = 0; i < 20; i++) s.tick(0.05);
  raw(s).spawnZombie();
  const z = [...raw(s).zombies.values()].pop();
  const b = s.bus!;
  Object.assign(z, { x: b.x + Math.sin(b.yaw) * 6, z: b.z + Math.cos(b.yaw) * 6, anim: 'move', speed: 0, entry: -1, phase: 'none' });
  events(s);
  let ran = false;
  for (let i = 0; i < 40 && !ran; i++) {
    s.tick(0.05);
    ran = has(events(s), 'runover');
  }
  check('ônibus atropela zumbi na frente', ran);

  // desempenho: 24 zumbis correndo atrás do jogador no mapa grande
  raw(s).zombies.clear();
  place(-170, -125);
  for (let i = 0; i < 24; i++) {
    raw(s).spawnZombie();
    const zz = [...raw(s).zombies.values()].pop();
    Object.assign(zz, { anim: 'move', kind: 1, speed: 3.3, entry: -1, phase: 'none' });
  }
  const t0 = performance.now();
  for (let i = 0; i < 200; i++) {
    place(-170, -125);
    s.tick(0.05);
  }
  const ms = (performance.now() - t0) / 200;
  check('simulação do Rota leve (menos de 4 ms por passo)', ms < 4, `${ms.toFixed(2)} ms`);
}

console.log(`\n${passes} ok, ${fails} falharam`);
process.exit(fails ? 1 : 0);
