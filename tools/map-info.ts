// Resumo dos mapas: blocos, entradas, portas, locais da Caixa e armas de parede. Uso: npx tsx tools/map-info.ts
import { MAPS, getMap } from '../src/shared/map';

for (const { id } of MAPS) {
  const m = getMap(id);
  console.log(`${id}: ${m.blocks.length} blocos (${m.blocks.filter((b) => b.solid).length} sólidos), ${m.entries.length} entradas, ${m.doors.length} portas, ${m.boxSpots.length} locais da Caixa, ${m.lights.length} luzes`);
  console.log(`  armas de parede: ${m.interactables.filter((i) => i.kind === 'weapon').map((i) => i.weapon).join(', ')}`);
}
