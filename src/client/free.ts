import * as THREE from 'three';
import type { TexSet } from './textures';

// Libera da placa de vídeo tudo o que está pendurado na cena (as texturas do cenário ficam para a próxima).
export function freeScene(roots: THREE.Object3D[], tex: TexSet) {
  const keep = new Set<THREE.Texture>(Object.values(tex).filter((t): t is THREE.Texture => t instanceof THREE.Texture));
  const seen = new Set<object>();
  for (const root of roots) root.traverse((obj) => {
    // luzes com sombra guardam um mapa de sombra na placa
    if (obj instanceof THREE.Light) obj.dispose();
    const m = obj as THREE.Mesh;
    if (m.geometry && !seen.has(m.geometry)) {
      seen.add(m.geometry);
      m.geometry.dispose();
    }
    const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
    for (const mat of mats) {
      if (seen.has(mat)) continue;
      seen.add(mat);
      for (const v of Object.values(mat)) if (v instanceof THREE.Texture && !keep.has(v)) v.dispose();
      mat.dispose();
    }
  });
}
