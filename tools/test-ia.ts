// Mede o comportamento dos zumbis (sem navegador): quanto tempo ficam parados longe do alvo,
// se alcançam o jogador, se erram o golpe. Uso: npx tsx tools/test-ia.ts [--verbose]
import { buildTown } from '../src/shared/map/town';
import { buildRota } from '../src/shared/map/rota';
import { buildTrincheira } from '../src/shared/map/trincheira';
import { GameSim } from '../src/shared/sim';
import type { GameEvent } from '../src/shared/protocol';

const verbose = process.argv.includes('--verbose');
let map = buildTown();
let fails = 0;
let passes = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) passes++;
  else fails++;
  console.log(`${ok ? 'ok  ' : 'FALHOU'} ${name}${detail ? ` (${detail})` : ''}`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const raw = (s: GameSim) => s as any;

interface Stats {
  zombieSeconds: number;
  idleSeconds: number;
  reached: number;
  spawned: number;
  attacks: number;
  hits: number;
  climbs: number;
  leaps: number;
  kinds: Record<number, number>;
  firstContact: number[];
  reachedKinds: Record<number, number>;
  eligible: number;
  eligibleReached: number;
  nearEnd: number;
  aliveEnd: number;
  effNum: number;
  effDen: number;
}

// Roda `secs` segundos com o jogador seguindo `path(t)`; devolve estatísticas dos zumbis.
function run(opts: { round: number; secs: number; seed: number; path: (t: number) => [number, number, number]; players?: number; onlyKind?: number; mapOverride?: typeof map }): Stats {
  const useMap = opts.mapOverride ?? map;
  const s = new GameSim(useMap, true, { startRound: opts.round, seed: opts.seed });
  s.addPlayer('a', 'A', 0);
  s.start();
  const p = s.players.get('a')!;
  const st: Stats = { zombieSeconds: 0, idleSeconds: 0, reached: 0, spawned: 0, attacks: 0, hits: 0, climbs: 0, leaps: 0, kinds: {}, firstContact: [], reachedKinds: {}, eligible: 0, eligibleReached: 0, nearEnd: 0, aliveEnd: 0, effNum: 0, effDen: 0 };
  const dt = 0.05;
  const trail = new Map<number, { x: number; z: number; t: number; born: number; contact: boolean; anim: string }>();
  // abre todas as portas para o teste não depender de compras
  for (const d of useMap.doors) raw(s).world.openDoors.add(d.id);
  raw(s).nav.rebuild();
  let hp = 0;
  for (let t = 0; t < opts.secs; t += dt) {
    const [px, py, pz] = opts.path(t);
    s.handle('a', { t: 'state', x: px, y: py, z: pz, yaw: 0, pitch: 0, crouch: false, speed: 0 });
    p.health = p.maxHealth = 1e9;
    p.life = 'alive';
    s.tick(dt);
    for (const e of s.drainEvents() as GameEvent[]) {
      if (e.e === 'zattack') st.attacks++;
    }
    hp = p.health;
    for (const z of raw(s).zombies.values()) {
      let tr = trail.get(z.id);
      if (!tr) {
        tr = { x: z.x, z: z.z, t, born: t, contact: false, anim: z.anim };
        trail.set(z.id, tr);
        st.spawned++;
        if (t < opts.secs - 30) st.eligible++;
        st.kinds[z.kind] = (st.kinds[z.kind] ?? 0) + 1;
      }
      if (z.anim !== tr.anim) {
        if (z.anim === 'wall') st.climbs++;
        if (z.anim === 'leap') st.leaps++;
        tr.anim = z.anim;
      }
      const td = Math.hypot(z.x - px, z.z - pz);
      if (z.anim === 'rise' || z.phase !== 'none') {
        tr.x = z.x; tr.z = z.z; tr.t = t;
        continue;
      }
      st.zombieSeconds += dt;
      if (td < 1.6 && !tr.contact) {
        tr.contact = true;
        st.reached++;
        st.reachedKinds[z.kind] = (st.reachedKinds[z.kind] ?? 0) + 1;
        if (tr.born < opts.secs - 30) st.eligibleReached++;
        st.firstContact.push(t - tr.born);
      }
      if (t - tr.t >= 1) {
        const moved = Math.hypot(z.x - tr.x, z.z - tr.z);
        if (moved < 0.15 && td > 3 && z.anim === 'move') st.idleSeconds += 1;
        if (td > 3 && z.anim === 'move') {
          st.effNum += moved;
          st.effDen += z.speed;
        }
        tr.x = z.x; tr.z = z.z; tr.t = t;
      }
    }
  }
  for (const z of raw(s).zombies.values()) {
    if (z.anim === 'rise' || z.phase !== 'none') continue;
    st.aliveEnd++;
    const [px, , pz] = opts.path(opts.secs);
    if (Math.hypot(z.x - px, z.z - pz) < 12) st.nearEnd++;
  }
  void hp;
  return st;
}

const fmt = (st: Stats) => {
  const fc = st.firstContact.slice().sort((a, b) => a - b);
  const med = fc.length ? fc[Math.floor(fc.length / 2)].toFixed(1) : '-';
  return `gerados ${st.spawned}, chegaram ${st.reached}, parados ${(100 * st.idleSeconds / Math.max(1, st.zombieSeconds)).toFixed(1)}%, eficiência ${(100 * st.effNum / Math.max(1, st.effDen)).toFixed(0)}%, golpes ${st.attacks}, escaladas ${st.climbs}, saltos ${st.leaps}, tipos ${JSON.stringify(st.kinds)}, chegaram por tipo ${JSON.stringify(st.reachedKinds)}`;
};

const spawns = map.playerSpawns;
const [sx, sz] = spawns[0];

// 1) jogador parado no ponto inicial
{
  const st = run({ round: 8, secs: 70, seed: 1, path: () => [sx, 0, sz] });
  if (verbose) console.log(fmt(st));
  check('parado: quase todos chegam', st.eligibleReached >= st.eligible * 0.95, fmt(st));
  check('parado: pouco tempo parado', st.idleSeconds / Math.max(1, st.zombieSeconds) < 0.04, fmt(st));
}

// 2) jogador correndo em círculo largo (os zumbis têm que cortar caminho, não seguir o rastro)
{
  const R = 9;
  const st = run({ round: 8, secs: 70, seed: 2, path: (t) => [sx + Math.sin(t * 0.5) * R, 0, sz + Math.cos(t * 0.5) * R] });
  if (verbose) console.log(fmt(st));
  check('em círculo: o bando acompanha o jogador', st.nearEnd >= st.aliveEnd * 0.5, fmt(st) + `, perto no fim ${st.nearEnd}/${st.aliveEnd}`);
  check('em círculo: pouco tempo parado', st.idleSeconds / Math.max(1, st.zombieSeconds) < 0.05, fmt(st));
}

// 3) cada ponto de início de jogador (cobre várias partes do mapa)
for (let i = 1; i < spawns.length; i++) {
  const [x, z] = spawns[i];
  const st = run({ round: 10, secs: 60, seed: 10 + i, path: () => [x, 0, z] });
  if (verbose) console.log(fmt(st));
  check(`ponto ${i}: chegam e não ficam parados`, st.eligibleReached >= st.eligible * 0.9 && st.idleSeconds / Math.max(1, st.zombieSeconds) < 0.05, fmt(st));
}


// 4) muro de 2,2 m em volta do jogador, sem teto: só quem escala (Rastejador) chega
{
  const m = buildTown();
  const R = 5;
  const wall = (x0: number, z0: number, x1: number, z1: number) =>
    m.blocks.push({ min: [x0, 0, z0], max: [x1, 2.2, z1], mat: 'concrete', solid: true } as (typeof m.blocks)[number]);
  wall(sx - R, sz - R, sx + R, sz - R + 0.4);
  wall(sx - R, sz + R - 0.4, sx + R, sz + R);
  wall(sx - R, sz - R, sx - R + 0.4, sz + R);
  wall(sx + R - 0.4, sz - R, sx + R, sz + R);
  const st = run({ round: 12, secs: 90, seed: 3, path: () => [sx, 0, sz], mapOverride: m });
  if (verbose) console.log(fmt(st));
  const walkersIn = (st.reachedKinds[0] ?? 0) + (st.reachedKinds[1] ?? 0) + (st.reachedKinds[2] ?? 0);
  check('muro: andarilhos não passam', walkersIn === 0, fmt(st));
  check('muro: Rastejadores escalam e chegam', (st.reachedKinds[9] ?? 0) >= 1 && st.climbs >= 1, fmt(st));
}

// 5) jogador em cima de um caixote de 1,7 m (os andarilhos ficam embaixo; o Rastejador sobe)
{
  const m = buildTown();
  m.blocks.push({ min: [sx - 1.5, 0, sz - 1.5], max: [sx + 1.5, 1.7, sz + 1.5], mat: 'concrete', solid: true } as (typeof m.blocks)[number]);
  const st = run({ round: 12, secs: 90, seed: 4, path: () => [sx, 1.7, sz], mapOverride: m });
  if (verbose) console.log(fmt(st));
  check('caixote alto: Rastejadores sobem', st.climbs >= 1, fmt(st));
}

// 6) os outros mapas: jogador parado em cada ponto de início (Rota e Trincheira têm campo de caminho limitado)
for (const [nome, build] of [['rota', buildRota], ['trincheira', buildTrincheira]] as const) {
  const m = build();
  for (let i = 0; i < Math.min(2, m.playerSpawns.length); i++) {
    const [x, z] = m.playerSpawns[i];
    const st = run({ round: 8, secs: 60, seed: 20 + i, path: () => [x, 0, z], mapOverride: m });
    if (verbose) console.log(nome, fmt(st));
    check(`${nome} ponto ${i}: poucos parados`, st.idleSeconds / Math.max(1, st.zombieSeconds) < 0.08, fmt(st));
  }
}

console.log(`\n${passes} ok, ${fails} falharam`);
process.exit(fails ? 1 : 0);
