// Geometria dos colossos da Trincheira, igual na simulação e no navegador: ordem das pegadas, posição do corpo,
// do pé que anda e do olho em cada instante do passo.
import type { R4, TrincheiraData } from './map/types';
import type { TrRobot } from './protocol';

export interface FootRect {
  id: string;
  r: R4;
  cx: number;
  cz: number;
}

export type Axis = 'x' | 'z';

// Atlas e Golias andam de norte a sul (eixo z); Titã de oeste a leste (eixo x)
export const robotAxis = (id: TrRobot['id']): Axis => (id === 'tita' ? 'x' : 'z');

// metros fora do mapa onde estavam os pés antes do primeiro passo
export const FAR_STRIDE = 42;
export const LIFT_HEIGHT = 14;
export const BODY_HEIGHT = 27;
export const EYE_RADIUS = 2.6;
export const SOLE_RADIUS = 3.2;

// pegadas do colosso na ordem em que ele pisa (dir 1 = do começo da lista ao fim)
export function colossusFeet(data: TrincheiraData, id: TrRobot['id'], dir: 1 | -1): FootRect[] {
  const axis = robotAxis(id);
  const list = data.feet
    .filter((f) => f.robot === id)
    .map((f) => ({ id: f.id, r: f.r, cx: (f.r[0] + f.r[2]) / 2, cz: (f.r[1] + f.r[3]) / 2 }))
    .sort((a, b) => (axis === 'z' ? a.cz - b.cz : a.cx - b.cx));
  return dir === 1 ? list : list.reverse();
}

export interface ColossusPose {
  // centro do corpo no chão
  x: number;
  z: number;
  // para onde olha (yaw de THREE: atan2(dx, dz))
  yaw: number;
  // pé que pisa agora: pegada, lado, posição (com altura) e se está no ar
  foot: 'L' | 'R';
  footId: string;
  fx: number;
  fy: number;
  fz: number;
  // pé que ficou plantado no passo anterior
  px: number;
  pz: number;
  eye: [number, number, number];
}

const smooth = (t: number) => t * t * (3 - 2 * t);

// ponto da linha de pegadas: índice negativo = fora do mapa, antes do começo
function footPoint(feet: FootRect[], axis: Axis, dir: 1 | -1, k: number): [number, number] {
  if (k >= 0) return [feet[Math.min(k, feet.length - 1)].cx, feet[Math.min(k, feet.length - 1)].cz];
  const f0 = feet[0];
  const vx = axis === 'x' ? dir : 0, vz = axis === 'z' ? dir : 0;
  return [f0.cx + vx * FAR_STRIDE * k, f0.cz + vz * FAR_STRIDE * k];
}

// pose do colosso no passo `step` (índice da pegada), parte `sub` e fração `t` (0 a 1) dessa parte
export function colossusPose(feet: FootRect[], id: TrRobot['id'], dir: 1 | -1, step: number, sub: TrRobot['sub'], t: number): ColossusPose {
  const axis = robotAxis(id);
  const P = (k: number) => footPoint(feet, axis, dir, k);
  const from = [(P(step - 2)[0] + P(step - 1)[0]) / 2, (P(step - 2)[1] + P(step - 1)[1]) / 2];
  const to = [(P(step - 1)[0] + P(step)[0]) / 2, (P(step - 1)[1] + P(step)[1]) / 2];
  const w = sub === 'sobe' ? 0.1 * t : sub === 'move' ? 0.1 + 0.8 * smooth(t) : sub === 'desce' ? 0.9 + 0.1 * t : 1;
  const x = from[0] + (to[0] - from[0]) * w;
  const z = from[1] + (to[1] - from[1]) * w;
  const vx = axis === 'x' ? dir : 0, vz = axis === 'z' ? dir : 0;
  // o pé sai da pegada de dois passos atrás, sobe, passa por cima e pousa na deste passo
  const a = P(step - 2), b = P(step);
  const k = sub === 'sobe' ? 0 : sub === 'move' ? smooth(t) : 1;
  const fx = a[0] + (b[0] - a[0]) * k;
  const fz = a[1] + (b[1] - a[1]) * k;
  const h = sub === 'sobe' ? LIFT_HEIGHT * t : sub === 'move' ? LIFT_HEIGHT : sub === 'desce' ? LIFT_HEIGHT * (1 - t) : 0;
  const p = P(step - 1);
  return {
    x, z, yaw: Math.atan2(vx, vz),
    foot: step % 2 === 0 ? 'L' : 'R',
    footId: feet[Math.min(Math.max(step, 0), feet.length - 1)]?.id ?? '',
    fx, fy: h, fz,
    px: p[0], pz: p[1],
    eye: [x + vx * 4, BODY_HEIGHT, z + vz * 4],
  };
}
