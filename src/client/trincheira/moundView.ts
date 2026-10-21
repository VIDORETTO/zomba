import * as THREE from 'three';
import type { GameEvent, TrincheiraSnap } from '../../shared/protocol';
import { boxMesh, cylMesh, glowSprite } from './common';
import type { TrCtx } from './ctx';

const ICE_FROM = 18;

// Montes de terra (e os de gelo, azuis, só durante a neve) e as pás espetadas nos postos.
export class MoundView {
  private readonly dirt: THREE.InstancedMesh;
  private readonly ice: THREE.InstancedMesh;
  private readonly glows: THREE.Sprite[] = [];
  private key = '';
  private readonly m4 = new THREE.Matrix4();

  constructor(private readonly c: TrCtx) {
    const cone = new THREE.ConeGeometry(1, 0.7, 9, 1).translate(0, 0.35, 0);
    cone.scale(1, 1, 1);
    const dirtMat = c.q.simpleMaterials ? new THREE.MeshLambertMaterial({ color: 0x4a3828 }) : new THREE.MeshStandardMaterial({ color: 0x4a3828, roughness: 1 });
    const iceMat = new THREE.MeshStandardMaterial({ color: 0x9fd2ff, roughness: 0.25, metalness: 0.1, emissive: new THREE.Color(0x2a6cc0), emissiveIntensity: 0.7 });
    this.dirt = new THREE.InstancedMesh(cone, dirtMat, 24);
    this.ice = new THREE.InstancedMesh(cone, iceMat, 4);
    for (const m of [this.dirt, this.ice]) {
      m.frustumCulled = false;
      m.count = 0;
      c.scene.add(m);
    }
    c.T.mounds.forEach((p, i) => {
      const g = glowSprite(i >= ICE_FROM ? 0x66bbff : 0xffc27a, i >= ICE_FROM ? 2.6 : 1.4, 0);
      g.position.set(p[0], 0.7, p[1]);
      c.scene.add(g);
      this.glows.push(g);
    });
    // pás espetadas na terra
    const wood = new THREE.MeshStandardMaterial({ color: 0x6a4a2c, roughness: 0.9 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x8a8c8c, roughness: 0.5, metalness: 0.6 });
    for (const [x, z] of c.T.shovels) {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = (x * 7 + z * 3) % 6.28;
      const handle = cylMesh(0.03, 0.03, 1.5, wood, 6, 0, 0.9, 0);
      handle.rotation.z = 0.12;
      g.add(handle);
      g.add(boxMesh(0.14, 0.04, 0.12, wood, 0.1, 1.65, 0));
      const blade = boxMesh(0.24, 0.3, 0.025, steel, -0.05, 0.2, 0);
      blade.rotation.z = 0.12;
      g.add(blade);
      g.add(boxMesh(0.5, 0.12, 0.4, new THREE.MeshStandardMaterial({ color: 0x4a3828, roughness: 1 }), 0, 0.03, 0));
      c.scene.add(g);
    }
  }

  update(tr: TrincheiraSnap, t: number) {
    const key = tr.mounds.join(',');
    if (key !== this.key) {
      this.key = key;
      let nd = 0, ni = 0;
      this.glows.forEach((g) => ((g.material as THREE.SpriteMaterial).opacity = 0));
      for (const i of tr.mounds) {
        const p = this.c.T.mounds[i];
        if (!p) continue;
        const isIce = i >= ICE_FROM;
        const s = isIce ? 1.0 : 0.85 + ((i * 37) % 10) / 40;
        this.m4.makeRotationY(i * 1.7).scale(new THREE.Vector3(s, isIce ? 1.3 : 1, s)).setPosition(p[0], 0, p[1]);
        (isIce ? this.ice : this.dirt).setMatrixAt(isIce ? ni++ : nd++, this.m4);
      }
      this.dirt.count = nd;
      this.ice.count = ni;
      this.dirt.instanceMatrix.needsUpdate = true;
      this.ice.instanceMatrix.needsUpdate = true;
    }
    for (const i of tr.mounds) {
      const g = this.glows[i];
      if (!g) continue;
      (g.material as THREE.SpriteMaterial).opacity = (i >= ICE_FROM ? 0.9 : 0.4) * (0.7 + 0.3 * Math.sin(t * 2.4 + i));
    }
  }

  onEvent(e: GameEvent, local: string) {
    if (e.e !== 'dig') return;
    const p = this.c.T.mounds[e.mound];
    const x = p ? p[0] : e.x, z = p ? p[1] : e.z;
    const pos = new THREE.Vector3(x, 0.5, z);
    this.c.fx.burst(x, 0.4, z, 22, 3.5, 0x6a4c34, 0.9, 0.35, { dull: true, grav: 9, up: 3 });
    if (e.mound >= ICE_FROM) this.c.fx.burst(x, 0.6, z, 20, 3, 0xaee0ff, 1, 0.3, { up: 2 });
    this.c.snd.play('cavar-fim', pos);
    if (e.result === 'peca') this.c.snd.play('achou-peca', pos);
    if (e.result === 'pa-dourada') {
      this.c.fx.ring(x, 0, z, 1, 6, 0xffd23a, 1);
      if (e.pid === local) this.c.notify('<b style="color:#ffd23a">Pá Dourada!</b> Cavar fica mais rápido.');
    } else if (e.result === 'capacete' && e.pid === local) {
      this.c.fx.ring(x, 0, z, 1, 6, 0xffd23a, 1);
      this.c.notify('<b style="color:#ffd23a">Capacete Dourado!</b> Metade do fogo do Blindado.');
    }
    if (e.pid === local && e.text) this.c.notify(e.text);
  }
}
