// Itens que caem dos zumbis. Valem para todos os jogadores quando alguém pega.

export type PowerupKind = 'maxammo' | 'insta' | 'double' | 'bomb' | 'carpenter' | 'firesale' | 'freeperk' | 'sangue';

export interface PowerupDef {
  kind: PowerupKind;
  name: string;
  color: string;
  glyph: string;
  duration: number;
}

export const POWERUPS: Record<PowerupKind, PowerupDef> = {
  maxammo: { kind: 'maxammo', name: 'Munição Cheia', color: '#7fe07a', glyph: '▮▮▮', duration: 0 },
  insta: { kind: 'insta', name: 'Golpe Fatal', color: '#e8e8e8', glyph: '☠', duration: 30 },
  double: { kind: 'double', name: 'Pontos em Dobro', color: '#ffd23f', glyph: 'x2', duration: 30 },
  bomb: { kind: 'bomb', name: 'Bomba', color: '#ff7a3a', glyph: '✹', duration: 0 },
  carpenter: { kind: 'carpenter', name: 'Carpinteiro', color: '#c8a070', glyph: '⚒', duration: 0 },
  firesale: { kind: 'firesale', name: 'Liquidação', color: '#ff5a8a', glyph: '%', duration: 30 },
  // só o Carrasco deixa: quem pegar ganha uma bebida que não tem (sem contar o limite)
  freeperk: { kind: 'freeperk', name: 'Bebida Grátis', color: '#55b8ff', glyph: '✚', duration: 0 },
  // Trincheira: os zumbis ignoram quem pegou (só vale para quem pegou)
  sangue: { kind: 'sangue', name: 'Sangue Morto', color: '#9b1b1b', glyph: '◆', duration: 20 },
};

// itens que caem de zumbis por padrão (o Sangue Morto só entra nos mapas que o pedem em powerupPool)
export const DEFAULT_POOL: PowerupKind[] = ['maxammo', 'insta', 'double', 'bomb', 'carpenter', 'firesale', 'freeperk'];

export const POWERUP = {
  dropChance: 0.025,
  maxPerRound: 4,
  lifetime: 30,
  blinkAt: 20,
  pickRadius: 1.4,
  bombPoints: 400,
  carpenterPoints: 200,
  // rodadas em que o último zumbi sempre deixa Munição Cheia
  guaranteedAmmoRounds: [2, 5, 10],
};
