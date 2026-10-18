import * as THREE from 'three';
import { ENTRY_BOARDS, type Entry } from '../shared/map/types';
import { mulberry32 } from '../shared/rng';
import type { TexSet } from './textures';

interface Flying {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  t: number;
}

interface EntryView {
  entry: Entry;
  group: THREE.Group;
  planks: THREE.Mesh[];
  shown: number;
  slam: number[];
}

// Tábuas das entradas de zumbis. O número de tábuas vem do snapshot da simulação.
export class Barricades {
  readonly group = new THREE.Group();
  private readonly views: EntryView[] = [];
  private readonly flying: Flying[] = [];
  private readonly geo: THREE.BoxGeometry;
  private readonly mat: THREE.Material;

  constructor(scene: THREE.Scene, entries: Entry[], tex: TexSet, simple: boolean) {
    this.geo = new THREE.BoxGeometry(1, 0.17, 0.05);
    this.mat = simple
      ? new THREE.MeshLambertMaterial({ map: tex.wood, color: 0xc8a882 })
      : new THREE.MeshStandardMaterial({ map: tex.wood, color: 0xc8a882, roughness: 0.9 });
    for (const e of entries) {
      const rnd = mulberry32(1000 + e.id);
      const g = new THREE.Group();
      g.position.set(e.x, 0, e.z);
      g.rotation.y = Math.atan2(e.nx, e.nz);
      const planks: THREE.Mesh[] = [];
      for (let i = 0; i < ENTRY_BOARDS; i++) {
        const m = new THREE.Mesh(this.geo, this.mat);
        m.scale.x = e.w + 0.25;
        m.position.set((rnd() - 0.5) * 0.1, 0.5 + i * 0.27, -0.06 - (i % 2) * 0.03);
        m.rotation.z = (rnd() - 0.5) * 0.28;
        m.castShadow = true;
        g.add(m);
        planks.push(m);
      }
      this.group.add(g);
      this.views.push({ entry: e, group: g, planks, shown: ENTRY_BOARDS, slam: planks.map(() => 0) });
    }
    scene.add(this.group);
  }

  // Ajusta as tábuas visíveis; as que saem voam para fora, as que entram batem no lugar.
  update(boards: number[] | undefined, dt: number) {
    if (boards) {
      for (const v of this.views) {
        const n = boards[v.entry.id] ?? ENTRY_BOARDS;
        while (v.shown > n) {
          v.shown--;
          this.launch(v, v.planks[v.shown]);
          v.planks[v.shown].visible = false;
        }
        while (v.shown < n) {
          v.planks[v.shown].visible = true;
          v.slam[v.shown] = 1;
          v.shown++;
        }
      }
    }
    for (const v of this.views) {
      for (let i = 0; i < v.planks.length; i++) {
        if (v.slam[i] <= 0) continue;
        v.slam[i] = Math.max(0, v.slam[i] - dt * 7);
        v.planks[i].position.z = -0.06 - (i % 2) * 0.03 + v.slam[i] * 0.5;
      }
    }
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i];
      f.t += dt;
      f.vel.y -= 9.8 * dt;
      f.mesh.position.addScaledVector(f.vel, dt);
      f.mesh.rotation.x += f.spin.x * dt;
      f.mesh.rotation.y += f.spin.y * dt;
      f.mesh.rotation.z += f.spin.z * dt;
      if (f.mesh.position.y < 0.05) {
        f.mesh.position.y = 0.05;
        f.vel.multiplyScalar(0.3);
        f.spin.multiplyScalar(0.3);
      }
      if (f.t > 2.5) {
        this.group.remove(f.mesh);
        this.flying.splice(i, 1);
      }
    }
  }

  private launch(v: EntryView, plank: THREE.Mesh) {
    const m = plank.clone();
    plank.getWorldPosition(m.position);
    plank.getWorldQuaternion(m.quaternion);
    m.scale.copy(plank.scale);
    this.group.add(m);
    const e = v.entry;
    // arrancada para fora (para o lado do zumbi)
    const vel = new THREE.Vector3(-e.nx * (1.5 + Math.random()), 1 + Math.random() * 1.5, -e.nz * (1.5 + Math.random()));
    const spin = new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
    this.flying.push({ mesh: m, vel, spin, t: 0 });
  }

  // Ponto central de uma entrada (para sons)
  center(i: number): THREE.Vector3 {
    const e = this.views[i].entry;
    return new THREE.Vector3(e.x, 1.2, e.z);
  }

  dispose() {
    this.group.removeFromParent();
    this.geo.dispose();
    this.mat.dispose();
  }
}
