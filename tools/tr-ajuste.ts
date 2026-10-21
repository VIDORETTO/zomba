// F2: partida automática da Trincheira para medir os números de ajuste (sem navegador).
// Dois "jogadores" robôs: ligam os 6 geradores em ordem, matam o que chega perto, voltam a ficar de pé quando caem
// (a queda fica no registro) e seguem até a rodada pedida. Usa as regras reais (GameSim com registro ligado).
// Uso: npx tsx tools/test-... não; npx tsx tools/tr-ajuste.ts [partidas=3] [rodadaFinal=22] [semente=1]
import { TRINCHEIRA as T } from '../src/shared/constants';
import { getMap } from '../src/shared/map';
import type { GameEvent } from '../src/shared/protocol';
import { GameSim } from '../src/shared/sim';
import { ids } from '../src/shared/trincheira-info';

const partidas = Number(process.argv[2] ?? 3);
const alvo = Number(process.argv[3] ?? 22);
const semente = Number(process.argv[4] ?? 1);
const map = getMap('trincheira');
const D = map.trincheira!;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const raw = (s: GameSim) => s as any;

interface Resumo {
  seed: number;
  segundos: number;
  rodadaFinal: number;
  colossoPassagens: number;
  colossoSegundosPresente: number;
  recapturas: { inicio: number; ganhas: number; perdidas: number };
  blindados: number[];
  rodadasBlindado: number[];
  geradoresLigadoRodada: number[];
  montes: number;
  cavados: number;
  paDouradaRodada: number;
  locaisDeMonte: number;
  quedas: Record<string, number>;
  tempoRodada: number[];
}

function jogar(seed: number): Resumo {
  const s = new GameSim(map, false, { startRound: 1, seed, log: true });
  s.addPlayer('p0', 'P0', 0);
  s.addPlayer('p1', 'P1', 1);
  s.start();
  const out: GameEvent[] = [];
  const dt = 0.05;
  let t = 0;
  let rodadaAtual = 1;
  let rodadaInicioT = 0;
  const tempoRodada: number[] = [];
  const rodadasBlindado: number[] = [];
  let montes = 0;
  let cavados = 0;
  let pa = 0;
  let colossoT = 0;
  let proximo = 0; // próximo gerador a ligar
  const players = [s.players.get('p0')!, s.players.get('p1')!];
  const tr = raw(s).tr;
  for (const p of players) tr.P(p).shovel = true;
  const limite = 60 * 60 * 3; // 3 h de jogo simulado, no máximo
  while (t < limite && raw(s).round < alvo + 1) {
    // robôs: ficam de pé, com vida cheia e pontos de sobra; ficam no gerador da vez (ou no centro, se todos ligaram)
    const alvoGen = proximo < D.gens.length ? D.gens[proximo] : null;
    for (const [i, p] of players.entries()) {
      if (p.life === 'downed') {
        p.life = 'alive';
        p.health = 100;
      }
      if (p.life !== 'alive') continue;
      p.health = 100;
      p.points = Math.max(p.points, 5000);
      // o segundo robô cava os montes (um de cada vez, 1,2 s parado em cima); o primeiro cuida do gerador
      if (i === 1 && tr.mounds.size) {
        const idx = [...tr.mounds][0] as number;
        const pt = D.mounds[idx];
        s.handle(p.id, { t: 'state', x: pt[0], y: 0, z: pt[1], yaw: 0, pitch: 0, crouch: false, speed: 0 });
        s.handle(p.id, { t: 'hold', id: ids.mound(idx) });
        continue;
      }
      const base = alvoGen ?? D.gens[(Math.floor(t / 30) + i) % D.gens.length];
      const a = i * 1.2;
      s.handle(p.id, { t: 'state', x: base.x + Math.cos(a) * 1.3, y: 0, z: base.z + Math.sin(a) * 1.3, yaw: 0, pitch: 0, crouch: false, speed: 0 });
    }
    // liga o gerador da vez; o próximo só quando este terminar (ou for perdido e ligado de novo)
    if (alvoGen) {
      const g = tr.gens[proximo];
      if (!g.on && !g.capturing) s.handle('p0', { t: 'interact', id: ids.gen(proximo), weapon: 'pistol' });
      if (g.on) proximo++;
    }
    // mata o que chega a 10 m de algum robô (os zumbis vêm até eles de qualquer jeito)
    for (const z of [...raw(s).zombies.values()]) {
      if (z.hp <= 0) continue;
      for (const p of players) {
        if (p.life !== 'alive') continue;
        if (Math.hypot(z.x - p.x, z.z - p.z) < 10) {
          raw(s).damageZombie(z, 1e9, p, 'body', false);
          break;
        }
      }
    }
    // com a Forja erguida sem zumbis por perto, os que sobram demoram: limpa depois de 40 s na mesma rodada
    if (t - rodadaInicioT > 40) for (const z of [...raw(s).zombies.values()]) if (z.hp > 0) raw(s).damageZombie(z, 1e9, players[0], 'body', false);
    s.tick(dt);
    t += dt;
    if (tr.robot) colossoT += dt;
    for (const e of s.drainEvents()) {
      out.push(e);
      if (e.e === 'roundStart') {
        tempoRodada.push(t - rodadaInicioT);
        rodadaInicioT = t;
        rodadaAtual = e.round;
        if (e.boss) rodadasBlindado.push(e.round);
        montes += tr.mounds.size;
      }
      if (e.e === 'dig') {
        cavados++;
        if (e.result === 'pa-dourada') pa = raw(s).round;
      }
    }
    void rodadaAtual;
  }
  const L = s.devLog() as unknown as {
    rodadaFinal: number;
    segundos: number;
    gens: { ligadoRodada: number[] }[];
    quedas: Record<string, number>;
    recapturas: { ganhas: number; perdidas: number };
    colossos: { passagens: number };
  };
  return {
    seed,
    segundos: Math.round(t),
    rodadaFinal: L.rodadaFinal,
    colossoPassagens: L.colossos.passagens,
    colossoSegundosPresente: Math.round(colossoT),
    recapturas: { inicio: out.filter((e) => e.e === 'recaptura' && e.phase === 'start').length, ganhas: L.recapturas.ganhas, perdidas: L.recapturas.perdidas },
    blindados: rodadasBlindado,
    rodadasBlindado,
    geradoresLigadoRodada: L.gens.map((g) => g.ligadoRodada[0] ?? -1),
    montes,
    cavados,
    paDouradaRodada: pa,
    locaisDeMonte: D.mounds.length - 3,
    quedas: L.quedas,
    tempoRodada: tempoRodada.map((x) => Math.round(x)),
  };
}

for (let i = 0; i < partidas; i++) {
  const r = jogar(semente + i);
  console.log(JSON.stringify(r));
}
void T;
