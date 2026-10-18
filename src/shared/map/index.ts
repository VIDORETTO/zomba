import { buildRota } from './rota';
import { buildTown } from './town';
import type { MapDef } from './types';

// Mapas do jogo. Cada um é montado uma vez só (no navegador e no servidor).
export const MAPS = [
  { id: 'cidade', name: 'Cidade', desc: 'Cruzamento com fenda de lava, quintais e cemitério.' },
  { id: 'rota', name: 'Rota', desc: 'Cinco paradas ligadas por um ônibus, no meio da névoa.' },
] as const;

export type MapId = (typeof MAPS)[number]['id'];

const BUILDERS: Record<MapId, () => MapDef> = { cidade: buildTown, rota: buildRota };
const cache = new Map<string, MapDef>();

export const isMapId = (id: unknown): id is MapId => typeof id === 'string' && id in BUILDERS;

export function getMap(id: string): MapDef {
  const key: MapId = isMapId(id) ? id : 'cidade';
  let m = cache.get(key);
  if (!m) cache.set(key, (m = BUILDERS[key]()));
  return m;
}
