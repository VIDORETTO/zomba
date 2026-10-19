// Lista blocos visíveis que não colidem mas estão na altura do corpo (candidatos a "dá para atravessar").
// Uso: npx tsx tools/passthru.ts [cidade|rota]
import { getMap } from '../src/shared/map';
const map = getMap(process.argv[2] ?? 'rota');
const groups = new Map<string, number>();
const list: string[] = [];
for (const b of map.blocks) {
  if (b.solid || b.hidden) continue;
  const h = b.max[1] - b.min[1];
  const w = b.max[0] - b.min[0], d = b.max[2] - b.min[2];
  if (b.min[1] > 1.7 || b.max[1] < 0.5) continue;
  if (Math.min(w, d) < 0.12 && Math.max(w, d) < 0.5) continue;
  if (h < 0.3) continue;
  const k = `${b.mat}${b.rot ? ' (girado)' : ''}`;
  groups.set(k, (groups.get(k) ?? 0) + 1);
  if (list.length < 400) list.push(`${k} [${b.min.map((v) => v.toFixed(1))}] -> [${b.max.map((v) => v.toFixed(1))}]`);
}
console.log([...groups].sort((a, b) => b[1] - a[1]));
if (process.argv[3]) console.log(list.filter((l) => l.startsWith(process.argv[3])).join('\n'));
