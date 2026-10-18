import * as THREE from 'three';
import { BUS } from '../shared/constants';
import { BUS_DOOR, type BusPose } from '../shared/busBody';
import { angleLerp, lerp } from '../shared/rng';
import type { Sample } from './snapbuffer';
import { signTexture } from './textures';

// Ônibus do mapa Rota: caixas com janelas, portas dos dois lados (abrem na parada), bancos e faróis.
// Frente para +z local, como no corpo de colisão.
export class BusView {
  readonly group = new THREE.Group();
  private readonly doors: THREE.Mesh[] = [];
  private doorOpen = 0;
  // pose desenhada agora (a mesma usada para levar o jogador)
  pose: BusPose | null = null;
  speed = 0;
  private last: BusPose | null = null;

  constructor(scene: THREE.Scene) {
    const HW = BUS.halfWidth, HL = BUS.halfLen, F = BUS.floorY;
    const mat = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
      new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.15, ...extra });
    const teal = mat(0x2a6a6a), cream = mat(0xd8cfb8), dark = mat(0x1a1c1e, { roughness: 0.4 }), tire = mat(0x141414, { roughness: 0.9 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x223038, roughness: 0.15, metalness: 0.6, transparent: true, opacity: 0.55 });
    const seat = mat(0x6a2a24), floor = mat(0x3a3632, { roughness: 0.9 });
    const add = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      this.group.add(mesh);
      return mesh;
    };
    // piso, teto e chassi
    add(HW * 2, 0.1, HL * 2, 0, F - 0.05, 0, floor);
    add(HW * 2 + 0.04, 0.32, HL * 2 + 0.04, 0, 0.42 / 2 + 0.05, 0, dark);
    add(HW * 2 + 0.06, 0.16, HL * 2 + 0.06, 0, 3.0, 0, cream);
    // laterais: faixa de baixo verde, janelas e faixa de cima creme, com o vão das portas
    for (const side of [-1, 1]) {
      const x = side * (HW - 0.06);
      const seg = (z0: number, z1: number) => {
        const len = z1 - z0, cz = (z0 + z1) / 2;
        add(0.12, 1.05, len, x, F + 0.52, cz, teal);
        add(0.1, 0.95, len, x, F + 1.55, cz, glass);
        add(0.12, 0.5, len, x, F + 2.3, cz, cream);
        // colunas entre as janelas
        for (let z = z0 + 1.1; z < z1 - 0.3; z += 1.3) add(0.13, 0.95, 0.12, x, F + 1.55, z, cream);
      };
      seg(-HL, BUS_DOOR.z0);
      seg(BUS_DOOR.z1, HL);
      add(0.12, 0.5, BUS_DOOR.z1 - BUS_DOOR.z0, x, F + 2.3, (BUS_DOOR.z0 + BUS_DOOR.z1) / 2, cream);
      // folhas da porta (deslizam para trás na parada)
      const door = add(0.06, 2.0, (BUS_DOOR.z1 - BUS_DOOR.z0) / 2, x + side * 0.03, F + 1.0, BUS_DOOR.z0 + (BUS_DOOR.z1 - BUS_DOOR.z0) * 0.25, glass);
      door.userData.closedZ = door.position.z;
      this.doors.push(door);
      const door2 = add(0.06, 2.0, (BUS_DOOR.z1 - BUS_DOOR.z0) / 2, x + side * 0.03, F + 1.0, BUS_DOOR.z0 + (BUS_DOOR.z1 - BUS_DOOR.z0) * 0.75, glass);
      door2.userData.closedZ = door2.position.z;
      door2.userData.front = true;
      this.doors.push(door2);
      // rodas
      for (const z of [-HL + 1.3, HL - 1.4]) add(0.3, 0.9, 0.9, side * (HW + 0.05), 0.45, z, tire);
    }
    // frente com para-brisa e faróis, traseira
    add(HW * 2, 1.05, 0.12, 0, F + 0.52, HL - 0.06, teal);
    add(HW * 2 - 0.1, 1.1, 0.08, 0, F + 1.6, HL - 0.05, glass);
    add(HW * 2, 0.4, 0.12, 0, F + 2.35, HL - 0.06, cream);
    add(HW * 2, 2.6, 0.12, 0, F + 1.3, -HL + 0.06, teal);
    const head = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.2, 1.7) });
    for (const x of [-HW + 0.3, HW - 0.3]) add(0.3, 0.16, 0.04, x, F + 0.35, HL + 0.01, head);
    const tail = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 0.15, 0.1) });
    for (const x of [-HW + 0.25, HW - 0.25]) add(0.2, 0.2, 0.04, x, F + 0.5, -HL - 0.01, tail);
    // letreiro de destino
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.32), new THREE.MeshBasicMaterial({ map: signTexture('ROTA', '#ffb030', '#120c06', 1.6, 0.32, true) }));
    sign.position.set(0, F + 2.35, HL + 0.01);
    this.group.add(sign);
    // bancos dos dois lados do corredor
    for (let z = -HL + 0.8; z < BUS_DOOR.z0 - 0.3; z += 1.0) {
      for (const side of [-1, 1]) {
        add(0.8, 0.45, 0.5, side * (HW - 0.55), F + 0.25, z, seat);
        add(0.8, 0.6, 0.1, side * (HW - 0.55), F + 0.75, z - 0.22, seat);
      }
    }
    // luz de dentro (faixa no teto)
    add(0.2, 0.04, HL * 1.6, 0, 2.9, 0, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.85, 0.8, 0.65) }));
    this.group.visible = false;
    scene.add(this.group);
  }

  // Segue a pose interpolada do estado da partida; portas abertas enquanto espera.
  update(sample: Sample | null, dt: number) {
    const a = sample?.a.s.bus;
    const b = sample?.b.s.bus;
    if (!sample || !a || !b) {
      this.group.visible = false;
      this.pose = null;
      return;
    }
    const k = sample.k;
    const pose = { x: lerp(a.x, b.x, k), z: lerp(a.z, b.z, k), yaw: angleLerp(a.yaw, b.yaw, k) };
    if (this.last && dt > 0) this.speed = lerp(this.speed, Math.hypot(pose.x - this.last.x, pose.z - this.last.z) / dt, 1 - Math.exp(-dt * 5));
    this.last = pose;
    this.pose = pose;
    this.group.visible = true;
    this.group.position.set(pose.x, 0, pose.z);
    this.group.rotation.y = pose.yaw;
    const open = b.wait > 0.6 ? 1 : 0;
    this.doorOpen = lerp(this.doorOpen, open, 1 - Math.exp(-dt * 4));
    const len = (BUS_DOOR.z1 - BUS_DOOR.z0) / 2;
    for (const d of this.doors) d.position.z = d.userData.closedZ + (d.userData.front ? 1 : -1) * len * 0.95 * this.doorOpen;
  }

  dispose() {
    this.group.removeFromParent();
  }
}
