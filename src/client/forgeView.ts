import * as THREE from 'three';
import type { MapDef } from '../shared/map/types';
import type { ForgeState } from '../shared/protocol';
import { FORGE, baseId } from '../shared/weapons';
import type { FX } from './fx';
import { buildGun, type GunMats } from './gunModels';

// Forja: boca da fornalha acesa, faíscas ao trabalhar, arma pronta flutuando sobre a bigorna, velas acesas.
export class ForgeView {
  private readonly group = new THREE.Group();
  private readonly mouth: THREE.Mesh;
  private readonly mouthMat: THREE.MeshBasicMaterial;
  private readonly holder = new THREE.Group();
  private shown = '';

  constructor(scene: THREE.Scene, private readonly map: MapDef, private readonly fx: FX, private readonly camo: GunMats) {
    const f = map.forge;
    this.mouthMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.05, 0.03, 0.02) });
    this.mouth = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6), this.mouthMat);
    this.mouth.position.set(f.mouth[0], f.mouth[1], f.mouth[2]);
    this.mouth.rotation.y = Math.atan2(f.mouthNormal[0], f.mouthNormal[1]);
    this.group.add(this.mouth);
    this.holder.position.set(f.anvil[0], f.anvil[1] + 0.35, f.anvil[2]);
    this.group.add(this.holder);
    scene.add(this.group);
  }

  private show(id: string) {
    if (id === this.shown) return;
    this.shown = id;
    this.holder.clear();
    if (!id) return;
    const g = buildGun(baseId(id), this.camo, false).group;
    g.scale.setScalar(1.6);
    this.holder.add(g);
  }

  update(f: ForgeState | undefined, dt: number, t: number) {
    if (!f) return;
    const m = this.map.forge;
    // boca da fornalha: apagada, acesa, ou muito forte enquanto trabalha
    const heat = !f.on ? 0 : f.state === 'working' ? 2.6 + Math.sin(t * 20) * 0.5 : 1.4 + Math.sin(t * 3) * 0.2;
    this.mouthMat.color.setRGB(0.05 + heat * 1.1, 0.03 + heat * 0.45, 0.02 + heat * 0.08);
    if (f.on) this.fx.flame(`forja`, new THREE.Vector3(m.mouth[0] - 0.1, m.mouth[1] - 0.15, m.mouth[2]), dt, f.state === 'working' ? 30 : 10);
    if (f.state === 'working') this.fx.sparks('forja-sp', new THREE.Vector3(m.anvil[0], m.anvil[1] + 0.1, m.anvil[2]), dt);
    m.candles.forEach((c, i) => {
      if (f.candles[i]) this.fx.flame(`vela${i}`, new THREE.Vector3(c[0], c[1] + 0.02, c[2]), dt, 6, 0.25);
    });
    if (f.state === 'ready' && f.weapon) {
      this.show(f.weapon);
      this.holder.position.y = m.anvil[1] + 0.35 + 0.15 * (f.t / FORGE.offerTime) + Math.sin(t * 2) * 0.03;
      this.holder.rotation.y = Math.PI / 2 + Math.sin(t * 1.2) * 0.4;
      // aura de brasa em volta da arma pronta
      const hp = this.holder.position;
      this.fx.flame('forja-pronta', new THREE.Vector3(hp.x + (Math.random() - 0.5) * 0.5, hp.y - 0.15, hp.z + (Math.random() - 0.5) * 0.5), dt, 22, 0.22);
      this.fx.sparks('forja-pronta-sp', new THREE.Vector3(hp.x, hp.y, hp.z), dt * 0.25);
    } else {
      this.show('');
    }
  }

  dispose() {
    this.group.removeFromParent();
  }
}
