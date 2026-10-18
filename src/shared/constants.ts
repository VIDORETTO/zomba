// Valores de ajuste do jogo. Tudo em metros, segundos e pontos de vida.

export const TICK_RATE = 20;
export const TICK_DT = 1 / TICK_RATE;
export const MAX_PLAYERS = 4;

export const PLAYER = {
  radius: 0.35,
  height: 1.8,
  crouchHeight: 1.2,
  eye: 1.64,
  crouchEye: 1.08,
  downedEye: 0.55,
  walkSpeed: 4.7,
  sprintSpeed: 6.9,
  adsSpeed: 2.8,
  crouchSpeed: 2.3,
  sprintTime: 4.0,
  sprintRecover: 2.5,
  accel: 42,
  airAccel: 6,
  jumpVelocity: 6.2,
  gravity: 20,
  stepHeight: 0.45,
  maxHealth: 100,
  regenDelay: 3.0,
  regenRate: 70,
  startPoints: 500,
};

export const ZOMBIE = {
  radius: 0.32,
  height: 1.8,
  attackRange: 1.15,
  attackHitRange: 1.7,
  attackWindup: 0.55,
  attackRecover: 0.6,
  damage: 60,
  maxAlive: 24,
  riseTime: 1.7,
  walkSpeed: 1.15,
  runSpeed: 3.3,
  sprintSpeed: 4.7,
  directChaseRange: 14,
  stuckTime: 10,
};

// Rodada infernal: só Cães Infernais, que surgem em raios de fogo perto dos jogadores.
export const DOGS = {
  // a primeira cai entre as rodadas 5 e 7; depois, a cada 4 a 6 rodadas
  firstMin: 5,
  firstMax: 7,
  gapMin: 4,
  gapMax: 6,
  // 6 por jogador, mais 2 a cada rodada infernal anterior, até 30
  perPlayer: 6,
  perHellRound: 2,
  max: 30,
  // vida por rodada infernal (1ª, 2ª, 3ª...; depois fica no último valor)
  health: [220, 450, 900, 1300, 1600],
  speed: 6.2,
  radius: 0.3,
  height: 0.9,
  attackRange: 1.25,
  attackHitRange: 1.8,
  attackWindup: 0.28,
  attackRecover: 0.45,
  damage: 35,
  // o raio cai e o cão aparece depois deste tempo
  arriveTime: 0.9,
  spawnMin: 7,
  spawnMax: 15,
  spawnDelay: 1.1,
  maxAlive: 8,
  // ao morrer explode em fogo
  blastRadius: 1.7,
  blastDamage: 25,
  // pausa antes do primeiro raio (clima mudando)
  warmup: 3.5,
};

// Chefão Carrasco: zumbi gigante de armadura com corrente e gancho.
export const BOSS = {
  // a partir da rodada 12, a cada 6 a 9 rodadas, no meio de uma rodada normal
  firstRound: 12,
  gapMin: 6,
  gapMax: 9,
  // segundos depois do começo da rodada até ele aparecer
  arriveMin: 12,
  arriveMax: 25,
  // vida = 12 x a de um zumbi da rodada x jogadores
  healthMult: 12,
  riseTime: 2.6,
  radius: 0.5,
  height: 1.8,
  walkSpeed: 1.9,
  // golpe de corrente na frente
  swing: { range: 2.4, hitRange: 3.0, windup: 0.75, recover: 0.8, damage: 60 },
  // golpe no chão: dano em área, menor longe do centro
  slam: { range: 4.5, cooldown: 9, windup: 1.1, recover: 1.0, radius: 5, damage: 55, minDamage: 15 },
  // corrente com gancho: puxa o jogador para perto
  chain: { min: 6, max: 18, cooldown: 11, windup: 0.7, fly: 0.35, recover: 0.9, damage: 15, stopAt: 2.6 },
  // investida em linha reta
  charge: { min: 9, max: 26, cooldown: 14, windup: 0.9, speed: 9.5, run: 1.8, hitRadius: 1.5, damage: 55, recover: 1.2 },
  // o capacete quebra depois de 30% do dano; aí o tiro na cabeça vale o triplo
  armorFrac: 0.3,
  headMult: 3,
  reward: 1000,
  perkChance: 0.25,
};

// Ônibus do mapa Rota: dá a volta sozinho e para em cada parada.
export const BUS = {
  speed: 10,
  // perto da parada ele freia
  slowSpeed: 4,
  slowDist: 18,
  wait: 20,
  // na Rodoviária, no começo, ele espera mais
  firstWait: 40,
  honkAt: 5,
  // metade do comprimento e da largura (espaço dele), altura do piso
  halfLen: 5.2,
  halfWidth: 1.3,
  floorY: 0.42,
};

// Vultos: criaturas pequenas da névoa; atacam quem anda fora das paradas e do ônibus.
export const VULTO = {
  // segundos na névoa até eles virem
  delay: 3,
  every: 3,
  maxPerPlayer: 4,
  // somem quando ninguém está mais na névoa há este tempo
  vanishAfter: 2,
  health: 80,
  speed: 6.4,
  radius: 0.25,
  height: 1.0,
  attackRange: 1.1,
  attackHitRange: 1.5,
  attackWindup: 0.25,
  attackRecover: 0.35,
  damage: 12,
  riseTime: 0.5,
  spawnMin: 9,
  spawnMax: 16,
};

export const LAVA_DAMAGE = 12;
export const LAVA_INTERVAL = 0.5;
export const REVIVE_TIME = 3;
export const REVIVE_RANGE = 2.0;
export const BLEEDOUT_TIME = 30;
export const INTERMISSION_TIME = 10;
export const FIRST_ROUND_DELAY = 3;

export const BARRICADE = {
  tearTime: 1.2,
  tearTimeLate: 0.6,
  lateRound: 10,
  repairTime: 0.6,
  repairPoints: 10,
  repairLimit: 500,
  repairRange: 2.2,
  climbTime: 0.9,
};

export const POINTS = {
  hit: 10,
  kill: 60,
  headKill: 100,
  knifeKill: 130,
};

// Cores dos jogadores 1-4 (branco, azul, amarelo, verde), como no HUD clássico.
export const PLAYER_COLORS = ['#ecebe4', '#4fa3ff', '#ffcf3a', '#5fd068'];

export const NET_PORT = 3001;
