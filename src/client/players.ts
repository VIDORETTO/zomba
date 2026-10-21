import * as THREE from 'three';
import { PLAYER_COLORS } from '../shared/constants';
import type { NetPlayer } from '../shared/protocol';
import { angleLerp, lerp } from '../shared/rng';
import { buildHumanoid, flatMat, type Humanoid } from './humanoid';
import type { Sample } from './snapbuffer';
import type { TexSet } from './textures';
import { emblemCanvas } from './emblems';

// Nome do aliado com o emblema da patente dele à esquerda.
function nameSprite(name: string, color: string, level: number): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 320;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(emblemCanvas(level, 60), 2, 2);
  ctx.font = '700 34px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.strokeText(name, 190, 32);
  ctx.fillStyle = color;
  ctx.fillText(name, 190, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(1.5, 0.3, 1);
  s.renderOrder = 10;
  return s;
}

// Sangue Morto: o aliado fica translúcido e avermelhado
const GHOST = new THREE.MeshBasicMaterial({ color: 0xb04030, transparent: true, opacity: 0.32, depthWrite: false });

class PlayerView {
  readonly h: Humanoid;
  readonly label: THREE.Sprite;
  // Escudo de Trincheira nas costas (Trincheira)
  readonly shield: THREE.Group;
  private ghost: Map<THREE.Mesh, THREE.Material | THREE.Material[]> | null = null;
  phase = 0;
  speed = 0;
  lastX = 0;
  lastZ = 0;

  constructor(readonly p: NetPlayer, tex: TexSet) {
    const color = PLAYER_COLORS[p.slot % PLAYER_COLORS.length];
    this.h = buildHumanoid({
      skin: flatMat(0xc49a7c),
      shirt: flatMat(0x4c5438, tex.cloth),
      pants: flatMat(0x3a3a30, tex.cloth),
      shoes: flatMat(0x18140f),
      hair: flatMat(0x3a3a2c, tex.cloth),
      eyes: flatMat(0x111111),
    });
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.06, 0.13), flatMat(new THREE.Color(color).getHex(), null, new THREE.Color(color).getHex(), 0.6));
    band.position.y = -0.08;
    this.h.armL.upper.add(band);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.2), flatMat(0x222222));
    gun.position.set(0, -0.36, 0.08);
    this.h.armR.lower.add(gun);
    this.label = nameSprite(p.name, color, p.level ?? 1);
    this.label.position.y = 2.15;
    this.h.root.add(this.label);
    // placa de aço rebitada com visor estreito, nas costas (o boneco olha para +z)
    this.shield = new THREE.Group();
    const steel = flatMat(0x6e6e68, tex.rivet ?? null);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.05), steel);
    plate.position.set(0, 0.3, -0.18);
    const slit = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.02), flatMat(0x0a0a0a));
    slit.position.set(0, 0.5, -0.215);
    this.shield.add(plate, slit);
    this.shield.visible = false;
    this.h.torso.add(this.shield);
  }

  // translúcido enquanto está com Sangue Morto
  setGhost(on: boolean) {
    if (on === !!this.ghost) return;
    if (on) {
      this.ghost = new Map();
      this.h.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && m.userData.keep !== true && o.name !== 'blob' && !this.shield.getObjectById(o.id)) {
          this.ghost!.set(m, m.material);
          m.material = GHOST;
        }
      });
    } else {
      for (const [m, mat] of this.ghost!) m.material = mat;
      this.ghost = null;
    }
  }
}

export class RemotePlayers {
  readonly group = new THREE.Group();
  private readonly views = new Map<string, PlayerView>();

  constructor(scene: THREE.Scene, private readonly tex: TexSet, private readonly localId: string) {
    scene.add(this.group);
  }

  positions(): NetPlayer[] {
    return [...this.views.values()].map((v) => v.p);
  }

  update(sample: Sample | null, dt: number) {
    if (!sample) return;
    const { a, b, k } = sample;
    for (const pb of b.s.players) {
      if (pb.id === this.localId) continue;
      const pa = a.players.get(pb.id) ?? pb;
      let v = this.views.get(pb.id);
      if (!v) {
        v = new PlayerView(pb, this.tex);
        this.views.set(pb.id, v);
        this.group.add(v.h.root);
      }
      Object.assign(v.p, pb);
      v.shield.visible = (pb.shield ?? 0) > 0;
      // na mão: o escudo vai para a frente do corpo (o boneco olha para +z); nas costas fica atrás
      v.shield.position.z = pb.shieldHand ? 0.14 : 0;
      v.shield.rotation.y = pb.shieldHand ? Math.PI : 0;
      v.setGhost((pb.zblood ?? 0) > 0);
      const r = v.h.root;
      r.visible = pb.life !== 'dead';
      r.position.set(lerp(pa.x, pb.x, k), lerp(pa.y, pb.y, k), lerp(pa.z, pb.z, k));
      r.rotation.y = angleLerp(pa.yaw, pb.yaw, k) + Math.PI;
      this.animate(v, pb, dt, lerp(pa.pitch, pb.pitch, k));
    }
    for (const [id, v] of this.views) {
      if (!b.players.has(id)) {
        this.group.remove(v.h.root);
        this.views.delete(id);
      }
    }
  }

  private animate(v: PlayerView, p: NetPlayer, dt: number, pitch: number) {
    const h = v.h;
    const pos = h.root.position;
    const moved = Math.hypot(pos.x - v.lastX, pos.z - v.lastZ);
    v.lastX = pos.x;
    v.lastZ = pos.z;
    v.speed = lerp(v.speed, dt > 0 ? Math.min(moved / dt, 8) : 0, 1 - Math.exp(-dt * 10));
    v.phase += dt * v.speed * 2.2;
    const s = Math.sin(v.phase);
    const amp = Math.min(1, v.speed / 5) * 0.7;

    h.root.rotation.order = 'YXZ';
    const blob = h.root.getObjectByName('blob');
    if (blob) blob.visible = p.life !== 'downed';
    if (p.life === 'downed') {
      h.root.rotation.x = 0;
      h.root.rotation.z = Math.PI / 2.3;
      h.body.position.y = 0.25;
      h.armR.upper.rotation.x = -1.6;
      h.armL.upper.rotation.x = -0.3;
      return;
    }
    h.root.rotation.z = 0;
    h.body.position.y = 0;
    const crouch = p.crouch ? 1 : 0;
    h.hips.position.y = 0.92 - crouch * 0.35 - Math.abs(s) * 0.03 * amp;
    h.legL.upper.rotation.x = s * amp - crouch * 1.1;
    h.legR.upper.rotation.x = -s * amp - crouch * 0.6;
    h.legL.lower.rotation.x = Math.max(0, -Math.cos(v.phase)) * amp + crouch * 1.6;
    h.legR.lower.rotation.x = Math.max(0, Math.cos(v.phase)) * amp + crouch * 1.1;
    h.torso.rotation.x = 0.08 + crouch * 0.25;
    // braços apontando a arma para onde o jogador olha
    const aim = -1.5 - pitch;
    h.armR.upper.rotation.x = aim;
    h.armL.upper.rotation.x = aim + 0.1;
    h.armL.upper.rotation.z = 0.5;
    h.armR.upper.rotation.z = 0.05;
    h.armL.lower.rotation.x = -0.3;
    h.armR.lower.rotation.x = -0.1;
    h.neck.rotation.x = -pitch * 0.6;
  }

  dispose() {
    this.group.removeFromParent();
  }
}
