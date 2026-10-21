// De onde a arma vem: define o preço da munição no caixote.
export type WeaponSource = 'start' | 'wall' | 'box' | 'wonder';

// Família da arma: escolhe o som do tiro e o estilo de recarga.
export type WeaponClass = 'pistol' | 'rifle' | 'smg' | 'shotgun';

export interface WeaponDef {
  id: string;
  name: string;
  source: WeaponSource;
  cls: WeaponClass;
  cost: number;
  upgraded?: boolean;
  damage: number;
  headMult: number;
  limbMult: number;
  pellets: number;
  fireDelay: number;
  auto: boolean;
  mag: number;
  reserve: number;
  reloadTime: number;
  reloadEmptyTime: number;
  // projétil em vez de tiro instantâneo (explode no impacto, depois de grudar ou no pavio; a lâmina só corta)
  // armas maravilha: vento (cone na hora), arpão (raio que salta na hora) e vórtice (esfera que vira buraco negro)
  projectile?: 'launcher' | 'bolt' | 'ray' | 'rocket' | 'blade' | 'drum' | 'wind' | 'arc' | 'vortex' | 'fogo' | 'frost';
  // arma maravilha única: só um jogador pode ter cada uma
  unique?: boolean;
  // cajado elemental (Trincheira): elemento, se é a versão desperta e quanto tempo segurar o gatilho para o ataque carregado (s)
  staff?: 'fogo' | 'gelo' | 'vento' | 'raio';
  awake?: boolean;
  charge?: number;
  // queimadura do cajado de Fogo (dano por segundo, duração) e frio do cajado de Gelo (acertos por zumbi na rodada 10; menos = congela mais rápido)
  burn?: { dps: number; time: number };
  frost?: number;
  // não pode ir à Forja
  noForge?: boolean;
  // Arpão Elétrico: em quantos zumbis o raio salta
  chain?: number;
  // Vórtice: raio do buraco negro (m) e quanto tempo ele fica aberto (s)
  vortex?: { radius: number; time: number };
  // rajada: quantos tiros por puxada do gatilho e o intervalo entre eles
  burst?: number;
  burstDelay?: number;
  // mira que já vem montada na arma
  optic?: SightKind;
  // timbre do tiro, quando difere da família
  sound?: 'magnum' | 'sniper';
  // altura do som do tiro (1 = normal; armas de época soam mais graves)
  pitch?: number;
  // velocidade de andar com a arma na mão (1 = normal; o Tripé é pesado)
  moveMult?: number;
  // quantos zumbis um tiro atravessa (fuzil de precisão)
  pierce?: number;
  // luneta: ao mirar, mostra a tela da luneta e aproxima mais
  scope?: boolean;
  // duas armas, uma em cada mão
  dual?: boolean;
  // explosão pequena onde o tiro acerta um zumbi (versões da Forja)
  splash?: { radius: number; damage: number };
  // dispersão: só as escopetas têm, num padrão fixo (previsível); as outras acertam o centro da mira
  spreadHip: number;
  spreadAds: number;
  range: number;
  falloffStart: number;
  minDamageMult: number;
  adsTime: number;
  recoil: number;
}

const base = {
  headMult: 3,
  limbMult: 0.8,
  pellets: 1,
  spreadHip: 0,
  spreadAds: 0,
  adsTime: 0.2,
};

export const WEAPONS: Record<string, WeaponDef> = {
  pistol: {
    ...base, id: 'pistol', name: 'Pistola .45', source: 'start', cls: 'pistol', cost: 0,
    damage: 50, fireDelay: 0.13, auto: false, mag: 8, reserve: 80,
    reloadTime: 1.5, reloadEmptyTime: 1.85, range: 80, falloffStart: 22, minDamageMult: 0.6, adsTime: 0.16, recoil: 1,
  },
  carbine: {
    ...base, id: 'carbine', name: 'Carabina semiautomática', source: 'wall', cls: 'rifle', cost: 500,
    damage: 100, fireDelay: 0.17, auto: false, mag: 8, reserve: 96,
    reloadTime: 2.0, reloadEmptyTime: 2.4, range: 100, falloffStart: 45, minDamageMult: 0.7, recoil: 1.5,
  },
  doublebarrel: {
    ...base, id: 'doublebarrel', name: 'Escopeta de dois canos', source: 'wall', cls: 'shotgun', cost: 500,
    damage: 70, headMult: 1.5, pellets: 8, fireDelay: 0.22, auto: false, mag: 2, reserve: 32,
    reloadTime: 2.1, reloadEmptyTime: 2.1, spreadHip: 0.075, spreadAds: 0.06, range: 26, falloffStart: 7, minDamageMult: 0.2, recoil: 2.6,
  },
  smg: {
    ...base, id: 'smg', name: 'Submetralhadora', source: 'wall', cls: 'smg', cost: 1000,
    damage: 45, headMult: 2.5, fireDelay: 0.075, auto: true, mag: 30, reserve: 120,
    reloadTime: 2.0, reloadEmptyTime: 2.3, range: 55, falloffStart: 16, minDamageMult: 0.5, adsTime: 0.17, recoil: 0.42,
  },
  rifle: {
    ...base, id: 'rifle', name: 'Fuzil de assalto', source: 'wall', cls: 'rifle', cost: 1400,
    damage: 70, fireDelay: 0.1, auto: true, mag: 30, reserve: 150,
    reloadTime: 2.3, reloadEmptyTime: 2.7, range: 100, falloffStart: 38, minDamageMult: 0.6, recoil: 0.6,
  },
  pump: {
    ...base, id: 'pump', name: 'Escopeta de repetição', source: 'wall', cls: 'shotgun', cost: 1500,
    damage: 95, headMult: 1.5, pellets: 8, fireDelay: 0.85, auto: false, mag: 6, reserve: 54,
    reloadTime: 2.8, reloadEmptyTime: 3.2, spreadHip: 0.065, spreadAds: 0.05, range: 30, falloffStart: 9, minDamageMult: 0.25, recoil: 2.8,
  },

  // ---------- armas que só saem na Caixa Misteriosa ----------
  lmg: {
    ...base, id: 'lmg', name: 'Metralhadora leve', source: 'wall', cls: 'rifle', cost: 2500,
    damage: 80, fireDelay: 0.085, auto: true, mag: 100, reserve: 300,
    reloadTime: 4.2, reloadEmptyTime: 4.6, range: 100, falloffStart: 40, minDamageMult: 0.6, adsTime: 0.3, recoil: 0.55,
  },
  sniper: {
    ...base, id: 'sniper', name: 'Fuzil de precisão', source: 'wall', cls: 'rifle', cost: 2400, sound: 'sniper',
    damage: 500, headMult: 3, fireDelay: 1.1, auto: false, mag: 5, reserve: 40, pierce: 3, scope: true,
    reloadTime: 3.0, reloadEmptyTime: 3.4, range: 200, falloffStart: 200, minDamageMult: 1, adsTime: 0.28, recoil: 3,
  },
  dualpistol: {
    ...base, id: 'dualpistol', name: 'Pistolas duplas', source: 'box', cls: 'pistol', cost: 0, dual: true,
    damage: 70, fireDelay: 0.09, auto: false, mag: 20, reserve: 160,
    reloadTime: 2.3, reloadEmptyTime: 2.6, range: 70, falloffStart: 22, minDamageMult: 0.6, adsTime: 0.16, recoil: 0.8,
  },
  autoshotgun: {
    ...base, id: 'autoshotgun', name: 'Escopeta automática', source: 'wall', cls: 'shotgun', cost: 2000,
    damage: 75, headMult: 1.5, pellets: 7, fireDelay: 0.2, auto: true, mag: 20, reserve: 80,
    reloadTime: 3.2, reloadEmptyTime: 3.6, spreadHip: 0.07, spreadAds: 0.055, range: 28, falloffStart: 8, minDamageMult: 0.25, recoil: 1.8,
  },
  launcher: {
    ...base, id: 'launcher', name: 'Lança-granadas', source: 'box', cls: 'shotgun', cost: 0, projectile: 'launcher',
    damage: 650, fireDelay: 0.6, auto: false, mag: 1, reserve: 18,
    reloadTime: 2.4, reloadEmptyTime: 2.4, range: 80, falloffStart: 80, minDamageMult: 1, recoil: 2.2,
  },
  crossbow: {
    ...base, id: 'crossbow', name: 'Besta explosiva', source: 'box', cls: 'pistol', cost: 0, projectile: 'bolt',
    damage: 900, fireDelay: 0.5, auto: false, mag: 1, reserve: 12,
    reloadTime: 2.2, reloadEmptyTime: 2.2, range: 90, falloffStart: 90, minDamageMult: 1, recoil: 1.2,
  },
  // ---------- novas armas ----------
  burstrifle: {
    ...base, id: 'burstrifle', name: 'Fuzil de rajada', source: 'wall', cls: 'rifle', cost: 1200,
    damage: 85, fireDelay: 0.3, burst: 3, burstDelay: 0.07, auto: false, mag: 30, reserve: 180,
    reloadTime: 2.2, reloadEmptyTime: 2.6, range: 100, falloffStart: 40, minDamageMult: 0.65, recoil: 0.55,
  },
  revolver: {
    ...base, id: 'revolver', name: 'Revólver .44', source: 'wall', cls: 'pistol', cost: 1100, sound: 'magnum',
    damage: 200, fireDelay: 0.32, auto: false, mag: 6, reserve: 48,
    reloadTime: 2.4, reloadEmptyTime: 2.4, range: 90, falloffStart: 30, minDamageMult: 0.6, adsTime: 0.18, recoil: 2.4,
  },
  burstpistol: {
    ...base, id: 'burstpistol', name: 'Pistola de rajada', source: 'wall', cls: 'pistol', cost: 900,
    damage: 65, fireDelay: 0.3, burst: 3, burstDelay: 0.06, auto: false, mag: 15, reserve: 150,
    reloadTime: 1.6, reloadEmptyTime: 1.95, range: 70, falloffStart: 22, minDamageMult: 0.6, adsTime: 0.15, recoil: 0.6,
  },
  machinepistol: {
    ...base, id: 'machinepistol', name: 'Metralhadora de mão', source: 'wall', cls: 'smg', cost: 1200,
    damage: 42, headMult: 2.5, fireDelay: 0.052, auto: true, mag: 24, reserve: 168,
    reloadTime: 1.7, reloadEmptyTime: 2.0, range: 45, falloffStart: 12, minDamageMult: 0.5, adsTime: 0.14, recoil: 0.38,
  },
  dmr: {
    ...base, id: 'dmr', name: 'Fuzil de atirador', source: 'wall', cls: 'rifle', cost: 1800, optic: 'red',
    damage: 230, fireDelay: 0.22, auto: false, mag: 10, reserve: 80, pierce: 2,
    reloadTime: 2.5, reloadEmptyTime: 2.9, range: 150, falloffStart: 80, minDamageMult: 0.8, adsTime: 0.24, recoil: 1.6,
  },
  rocket: {
    ...base, id: 'rocket', name: 'Lança-foguetes', source: 'box', cls: 'shotgun', cost: 0, projectile: 'rocket',
    damage: 1300, fireDelay: 0.8, auto: false, mag: 1, reserve: 10,
    reloadTime: 2.8, reloadEmptyTime: 2.8, range: 120, falloffStart: 120, minDamageMult: 1, adsTime: 0.3, recoil: 2.6,
  },
  blade: {
    ...base, id: 'blade', name: 'Faca balística', source: 'box', cls: 'pistol', cost: 0, projectile: 'blade',
    damage: 700, headMult: 2, fireDelay: 0.4, auto: false, mag: 1, reserve: 8,
    reloadTime: 1.6, reloadEmptyTime: 1.6, range: 60, falloffStart: 60, minDamageMult: 1, recoil: 0.8,
  },
  drum: {
    ...base, id: 'drum', name: 'Lança-granadas de tambor', source: 'box', cls: 'shotgun', cost: 0, projectile: 'drum',
    damage: 500, fireDelay: 0.45, auto: false, mag: 6, reserve: 24,
    reloadTime: 3.4, reloadEmptyTime: 3.4, range: 60, falloffStart: 60, minDamageMult: 1, recoil: 1.8,
  },
  raygun: {
    ...base, id: 'raygun', name: 'Desintegrador', source: 'wonder', cls: 'smg', cost: 0, projectile: 'ray',
    damage: 1000, fireDelay: 0.28, auto: false, mag: 20, reserve: 160,
    reloadTime: 2.6, reloadEmptyTime: 2.6, range: 120, falloffStart: 120, minDamageMult: 1, recoil: 0.9,
  },
  // ---------- armas maravilha (só na Caixa, 2% cada, uma de cada por partida) ----------
  wind: {
    ...base, id: 'wind', name: 'Canhão de Vento', source: 'wonder', cls: 'shotgun', cost: 0, projectile: 'wind', unique: true,
    damage: 3000, fireDelay: 0.9, auto: false, mag: 2, reserve: 12,
    reloadTime: 2.6, reloadEmptyTime: 2.6, range: 13, falloffStart: 13, minDamageMult: 1, adsTime: 0.3, recoil: 3,
  },
  arc: {
    ...base, id: 'arc', name: 'Arpão Elétrico', source: 'wonder', cls: 'rifle', cost: 0, projectile: 'arc', unique: true, chain: 10,
    damage: 2500, fireDelay: 0.7, auto: false, mag: 4, reserve: 32,
    reloadTime: 2.4, reloadEmptyTime: 2.4, range: 45, falloffStart: 45, minDamageMult: 1, adsTime: 0.25, recoil: 1.4,
  },
  vortex: {
    ...base, id: 'vortex', name: 'Vórtice', source: 'wonder', cls: 'shotgun', cost: 0, projectile: 'vortex', unique: true,
    vortex: { radius: 7.5, time: 6 },
    damage: 4000, fireDelay: 1.0, auto: false, mag: 1, reserve: 6,
    reloadTime: 2.2, reloadEmptyTime: 2.2, range: 60, falloffStart: 60, minDamageMult: 1, adsTime: 0.3, recoil: 2,
  },
  // ---------- armas de 1918 (só na Trincheira) ----------
  'cano-longo': {
    ...base, id: 'cano-longo', name: 'Pistola de Cano Longo', source: 'start', cls: 'pistol', cost: 0, pitch: 0.88,
    damage: 55, fireDelay: 0.14, auto: false, mag: 10, reserve: 90,
    reloadTime: 1.6, reloadEmptyTime: 1.95, range: 85, falloffStart: 24, minDamageMult: 0.6, adsTime: 0.16, recoil: 1.1,
  },
  ferrolho: {
    ...base, id: 'ferrolho', name: 'Fuzil de Ferrolho', source: 'wall', cls: 'rifle', cost: 500, pitch: 0.82, pierce: 2,
    damage: 260, fireDelay: 0.45, auto: false, mag: 5, reserve: 55,
    reloadTime: 2.8, reloadEmptyTime: 3.2, range: 110, falloffStart: 60, minDamageMult: 0.75, adsTime: 0.22, recoil: 2.2,
  },
  'trincheira-smg': {
    ...base, id: 'trincheira-smg', name: 'Submetralhadora de Trincheira', source: 'wall', cls: 'smg', cost: 1000, pitch: 0.9,
    damage: 40, headMult: 2.5, fireDelay: 0.068, auto: true, mag: 32, reserve: 160,
    reloadTime: 2.2, reloadEmptyTime: 2.5, range: 50, falloffStart: 14, minDamageMult: 0.5, adsTime: 0.17, recoil: 0.45,
  },
  'assalto-antigo': {
    ...base, id: 'assalto-antigo', name: 'Fuzil de Assalto Antigo', source: 'wall', cls: 'rifle', cost: 1400, pitch: 0.9,
    damage: 66, fireDelay: 0.1, auto: true, mag: 30, reserve: 150,
    reloadTime: 2.5, reloadEmptyTime: 2.9, range: 90, falloffStart: 34, minDamageMult: 0.6, recoil: 0.65,
  },
  tripe: {
    ...base, id: 'tripe', name: 'Metralhadora de Tripé', source: 'box', cls: 'rifle', cost: 0, pitch: 0.75, moveMult: 0.9,
    damage: 85, fireDelay: 0.1, auto: true, mag: 100, reserve: 300,
    reloadTime: 4.6, reloadEmptyTime: 5.0, range: 100, falloffStart: 40, minDamageMult: 0.6, adsTime: 0.45, recoil: 0.6,
  },
  // ---------- cajados elementais da Trincheira (únicos; só se montam na Mesa dos Cajados) ----------
  'cajado-fogo': {
    ...base, id: 'cajado-fogo', name: 'Cajado de Fogo', source: 'wonder', cls: 'shotgun', cost: 0, projectile: 'fogo', unique: true,
    staff: 'fogo', noForge: true, burn: { dps: 150, time: 3 },
    damage: 600, fireDelay: 0.7, auto: false, mag: 8, reserve: 48,
    reloadTime: 2.4, reloadEmptyTime: 2.4, range: 70, falloffStart: 70, minDamageMult: 1, adsTime: 0.25, recoil: 1.6,
  },
  'cajado-gelo': {
    ...base, id: 'cajado-gelo', name: 'Cajado de Gelo', source: 'wonder', cls: 'rifle', cost: 0, projectile: 'frost', unique: true,
    staff: 'gelo', noForge: true, frost: 15,
    damage: 40, fireDelay: 0.1, auto: true, mag: 300, reserve: 1800,
    reloadTime: 2.2, reloadEmptyTime: 2.2, range: 22, falloffStart: 22, minDamageMult: 1, adsTime: 0.2, recoil: 0.1,
  },
  'cajado-vento': {
    ...base, id: 'cajado-vento', name: 'Cajado de Vento', source: 'wonder', cls: 'shotgun', cost: 0, projectile: 'wind', unique: true,
    staff: 'vento', noForge: true,
    damage: 3000, fireDelay: 0.9, auto: false, mag: 6, reserve: 36,
    reloadTime: 2.4, reloadEmptyTime: 2.4, range: 14, falloffStart: 14, minDamageMult: 1, adsTime: 0.3, recoil: 2.6,
  },
  'cajado-raio': {
    ...base, id: 'cajado-raio', name: 'Cajado de Raio', source: 'wonder', cls: 'rifle', cost: 0, projectile: 'arc', unique: true, chain: 6,
    staff: 'raio', noForge: true,
    damage: 2500, fireDelay: 0.7, auto: false, mag: 10, reserve: 60,
    reloadTime: 2.2, reloadEmptyTime: 2.2, range: 45, falloffStart: 45, minDamageMult: 1, adsTime: 0.25, recoil: 1.3,
  },

};

// ---------- Forja: versões melhoradas ----------
// Padrão: dano x2, pente 50% maior, reserva x2; cada arma ganha ainda um bônus próprio.
const UPGRADES: Record<string, { name: string; mod: (d: WeaponDef) => Partial<WeaponDef> }> = {
  pistol: { name: 'Pistola Infernal', mod: () => ({ splash: { radius: 1.6, damage: 260 } }) },
  carbine: { name: 'Carabina de Brasa', mod: () => ({ pierce: 2 }) },
  doublebarrel: { name: 'Boca de Dragão', mod: () => ({ pellets: 10 }) },
  smg: { name: 'Enxame', mod: () => ({ mag: 60 }) },
  rifle: { name: 'Martelo de Ferro', mod: () => ({ mag: 50 }) },
  pump: { name: 'Tempestade', mod: (d) => ({ reloadTime: d.reloadTime * 0.5, reloadEmptyTime: d.reloadEmptyTime * 0.5 }) },
  lmg: { name: 'Moedor', mod: () => ({ mag: 160 }) },
  sniper: { name: 'Olho do Corvo', mod: () => ({ splash: { radius: 2.2, damage: 1200 } }) },
  dualpistol: { name: 'Gêmeas Infernais', mod: () => ({ splash: { radius: 1.2, damage: 180 } }) },
  autoshotgun: { name: 'Ceifadora', mod: () => ({ mag: 32 }) },
  launcher: { name: 'Chuva de Fogo', mod: () => ({ mag: 2 }) },
  crossbow: { name: 'Besta Sombria', mod: () => ({ mag: 3 }) },
  raygun: { name: 'Desintegrador Rubro', mod: () => ({ mag: 40 }) },
  burstrifle: { name: 'Tríade', mod: (d) => ({ fireDelay: d.fireDelay * 0.7 }) },
  revolver: { name: 'Sentença', mod: () => ({ mag: 8, pierce: 3 }) },
  burstpistol: { name: 'Trinca de Brasa', mod: () => ({ splash: { radius: 1.2, damage: 150 } }) },
  machinepistol: { name: 'Vespeiro', mod: () => ({ mag: 48 }) },
  dmr: { name: 'Olho de Brasa', mod: () => ({ pierce: 4 }) },
  rocket: { name: 'Dragão', mod: () => ({ mag: 3 }) },
  blade: { name: 'Presa de Ferro', mod: () => ({ mag: 2 }) },
  drum: { name: 'Tambor do Inferno', mod: () => ({ mag: 9 }) },
  wind: { name: 'Furacão', mod: (d) => ({ range: d.range * 1.4, falloffStart: d.range * 1.4 }) },
  arc: { name: 'Tempestade de Ferro', mod: () => ({ chain: 16 }) },
  vortex: { name: 'Singularidade', mod: () => ({ vortex: { radius: 10.5, time: 8 }, mag: 2 }) },
  // armas de 1918: a pistola vira a "Velha Senhora" (automática, de coronha e pente de 40)
  'cano-longo': { name: 'Velha Senhora', mod: () => ({ auto: true, mag: 40, fireDelay: 0.09 }) },
  ferrolho: { name: 'Ferrolho Rúnico', mod: () => ({ pierce: 4 }) },
  'trincheira-smg': { name: 'Tempestade de Aço', mod: () => ({ mag: 64 }) },
  'assalto-antigo': { name: 'Veterano de Ferro', mod: () => ({ mag: 50 }) },
  tripe: { name: 'Trovão de Tripé', mod: () => ({ mag: 160 }) },
};

export const upgradeId = (id: string) => `${id}_pap`;
export const baseId = (id: string) => id.replace(/_pap$/, '');

// ---------- miras da bancada da Oficina ----------
// zoom = quanto o campo de visão encolhe com a mira toda (a mira de ferro é 0,8)
export type SightKind = 'red' | 'scope';
export const SIGHTS: Record<SightKind, { name: string; cost: number; weapons: string[]; zoom: number }> = {
  red: { name: 'Ponto vermelho', cost: 1000, weapons: ['carbine', 'smg', 'rifle', 'lmg'], zoom: 0.68 },
  scope: { name: 'Luneta 2×', cost: 1500, weapons: ['carbine', 'rifle'], zoom: 0.5 },
};
export const sightFits = (kind: SightKind, weapon: string) => SIGHTS[kind].weapons.includes(baseId(weapon));

for (const [id, up] of Object.entries(UPGRADES)) {
  const d = WEAPONS[id];
  WEAPONS[upgradeId(id)] = {
    ...d,
    id: upgradeId(id),
    name: up.name,
    upgraded: true,
    damage: d.damage * 2,
    mag: Math.round(d.mag * 1.5),
    reserve: d.reserve * 2,
    ...up.mod(d),
  };
}

// Cajados despertos: dano maior, mais munição e ataque carregado (segurar o gatilho)
const AWAKE: Record<string, Partial<WeaponDef> & { name: string }> = {
  'cajado-fogo': { name: 'Cajado de Fogo Desperto', damage: 1500, burn: { dps: 400, time: 3 }, mag: 12, reserve: 72 },
  'cajado-gelo': { name: 'Cajado de Gelo Desperto', frost: 7.5, mag: 400, reserve: 2400 },
  'cajado-vento': { name: 'Cajado de Vento Desperto', range: 18, falloffStart: 18, mag: 8, reserve: 48 },
  'cajado-raio': { name: 'Cajado de Raio Desperto', chain: 10, mag: 14, reserve: 84 },
};
for (const [id, a] of Object.entries(AWAKE)) {
  WEAPONS[`${id}-d`] = { ...WEAPONS[id], ...a, id: `${id}-d`, awake: true, charge: 1.5 };
}
export const isStaff = (id: string) => !!WEAPONS[id]?.staff;
export const STAFF_ELEMENTS = ['fogo', 'gelo', 'vento', 'raio'] as const;
export type StaffElement = (typeof STAFF_ELEMENTS)[number];

export const FORGE = {
  cost: 5000,
  workTime: 4,
  offerTime: 12,
};

// Projéteis das armas da caixa: velocidade (m/s), gravidade, raio da explosão (0 = não explode),
// dano mínimo na borda, distância para armar, tempo grudado (besta) e pavio (tambor quica e explode).
export interface ProjectileCfg {
  speed: number;
  gravity: number;
  radius: number;
  minDamage: number;
  armDist: number;
  stickTime?: number;
  fuse?: number;
}
export const PROJECTILES: Record<NonNullable<WeaponDef['projectile']> | 'artilharia', ProjectileCfg> = {
  launcher: { speed: 38, gravity: 9, radius: 4.2, minDamage: 0.25, armDist: 3 },
  bolt: { speed: 60, gravity: 3, radius: 3.2, minDamage: 0.3, armDist: 0, stickTime: 1.0 },
  ray: { speed: 70, gravity: 0, radius: 2.2, minDamage: 0.35, armDist: 0 },
  rocket: { speed: 30, gravity: 0, radius: 5.2, minDamage: 0.3, armDist: 2.5 },
  blade: { speed: 48, gravity: 4, radius: 0, minDamage: 1, armDist: 0 },
  drum: { speed: 22, gravity: 15, radius: 3.8, minDamage: 0.25, armDist: 0, fuse: 1.3 },
  // vento e arpão agem na hora (sem projétil); o vórtice voa em arco e abre onde bater
  wind: { speed: 0, gravity: 0, radius: 0, minDamage: 1, armDist: 0 },
  arc: { speed: 0, gravity: 0, radius: 0, minDamage: 1, armDist: 0 },
  vortex: { speed: 26, gravity: 10, radius: 0, minDamage: 1, armDist: 0 },
  // bola de fogo do Cajado de Fogo; o raio de gelo age na hora (sem projétil)
  fogo: { speed: 42, gravity: 2, radius: 2.6, minDamage: 0.5, armDist: 0 },
  frost: { speed: 0, gravity: 0, radius: 0, minDamage: 1, armDist: 0 },
  // Granada de Artilharia: quica como a granada e marca o chão (as bombas caem depois)
  artilharia: { speed: 15, gravity: 15, radius: 0, minDamage: 0, armDist: 0, fuse: 1.2 },
};

// Granada de Artilharia (não é arma): voa em arco como a granada; a fumaça marca o chão e as bombas caem depois
export const ARTILLERY_THROW = { speed: 15 };

// Medidas das armas maravilha: abertura do cone do vento (rad), empurrão e subida dos zumbis arremessados,
// distância do salto do arpão (m), força com que o vórtice puxa (m/s), o raio do centro que mata
// e de quanto em quanto tempo o vórtice machuca os chefões (s).
export const WONDER = {
  windCone: 0.42,
  windPush: 16,
  windLift: 6,
  arcJump: 7,
  vortexPull: 7,
  vortexCore: 0.9,
  vortexPulse: 0.5,
};

// Caixa Misteriosa: pesos do sorteio (somam 100).
export const BOX_POOL: [string, number][] = [
  ['carbine', 5], ['doublebarrel', 5], ['smg', 5], ['rifle', 5], ['pump', 5],
  ['lmg', 5], ['sniper', 5], ['dualpistol', 6], ['autoshotgun', 6],
  ['launcher', 6], ['crossbow', 5], ['raygun', 3],
  ['revolver', 6], ['burstpistol', 5], ['machinepistol', 6], ['dmr', 5],
  ['rocket', 4], ['blade', 3], ['drum', 4],
  ['wind', 2], ['arc', 2], ['vortex', 2],
];

export const BOX = {
  cost: 950,
  spinTime: 4,
  offerTime: 12,
  moveTime: 6,
  crowFrom: 4,
  crowChance: 0.15,
};

// Faca: a pesada (comprada no Cemitério) mata com um golpe até a rodada 4.
export const KNIFE = {
  damage: 150,
  heavyDamage: 450,
  heavyCost: 3000,
  range: 1.9,
  cooldown: 0.65,
};

export const GRENADE = {
  cost: 250,
  max: 4,
  start: 2,
  perRound: 2,
  fuse: 2.2,
  radius: 4.5,
  damage: 420,
  minDamage: 90,
  throwSpeed: 15,
};

export type HitPart = 'head' | 'body' | 'limb';

// Preço para encher a arma da mão num caixote de munição.
export function ammoPrice(weaponId: string): number | null {
  const def = WEAPONS[weaponId];
  if (!def) return null;
  if (def.upgraded) return 4500;
  switch (def.source) {
    case 'start':
      return 150;
    case 'wall':
      return Math.round((def.cost * 0.6) / 10) * 10;
    case 'box':
      return 1000;
    case 'wonder':
      return 2500;
  }
}

// Munição comprada na própria parede: metade do preço da arma.
export function wallAmmoPrice(weaponId: string): number {
  const def = WEAPONS[weaponId];
  return def.upgraded ? 4500 : Math.round(def.cost / 2 / 10) * 10;
}

// Direções fixas dos chumbos da escopeta: um no centro e os outros num anel.
export function pelletOffsets(n: number): [number, number][] {
  if (n <= 1) return [[0, 0]];
  const out: [number, number][] = [[0, 0]];
  for (let i = 1; i < n; i++) {
    const a = ((i - 1) / (n - 1)) * Math.PI * 2;
    out.push([Math.cos(a), Math.sin(a)]);
  }
  return out;
}

export function damageFor(def: WeaponDef, part: HitPart, dist: number): number {
  const mult = part === 'head' ? def.headMult : part === 'limb' ? def.limbMult : 1;
  let fall = 1;
  if (dist > def.falloffStart) {
    const k = Math.min(1, (dist - def.falloffStart) / (def.range - def.falloffStart));
    fall = 1 - k * (1 - def.minDamageMult);
  }
  return def.damage * mult * fall;
}
