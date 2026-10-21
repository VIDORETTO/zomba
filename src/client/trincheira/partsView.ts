import * as THREE from 'three';
import type { GameEvent, TrincheiraSnap } from '../../shared/protocol';
import type { Interactable } from '../../shared/map/types';
import { ELEMENTS, TEAM_ITEMS } from '../../shared/trincheira-info';
import type { Element } from '../../shared/protocol';
import { basic, beamMesh, boxMesh, cylMesh, glowSprite, glowy, solid } from './common';
import type { TrCtx } from './ctx';

interface Item {
  group: THREE.Group;
  spin: THREE.Object3D;
  y: number;
  seed: number;
}

// Peças e objetos da equipe flutuando devagar, girando, com uma luz fraca; caixotes trancados do Vento.
export class PartsView {
  private readonly items = new Map<string, Item>();
  private readonly spots = new Map<string, Interactable>();
  private readonly crates: { group: THREE.Group; lid: THREE.Group; lock: THREE.Sprite; glow: THREE.Sprite }[] = [];
  private readonly templates = new Map<string, THREE.Group>();
  private windWas = false;
  private readonly brass: THREE.Material;
  private readonly dark: THREE.Material;
  private readonly wood: THREE.Material;

  constructor(private readonly c: TrCtx) {
    for (const it of c.map.interactables) if (it.kind === 'part') this.spots.set(it.id, it);
    const simple = c.q.simpleMaterials;
    this.brass = glowy(c.tex, 0xe0b858, simple);
    this.dark = glowy(c.tex, 0x8a8478, simple);
    this.wood = solid(c.tex, 'boards', 0x7a5a3a, simple, 0.9, 0);
    // caixotes trancados das peças do Vento
    c.T.windCrates.forEach((p, i) => {
      const g = new THREE.Group();
      g.position.set(p[0], 0, p[1]);
      g.rotation.y = 0.6 + i * 1.9;
      g.add(boxMesh(1.1, 0.7, 0.8, this.wood, 0, 0.35, 0));
      g.add(boxMesh(1.14, 0.08, 0.84, this.dark, 0, 0.18, 0));
      g.add(boxMesh(1.14, 0.08, 0.84, this.dark, 0, 0.56, 0));
      const lid = new THREE.Group();
      lid.position.set(0, 0.72, -0.4);
      lid.add(boxMesh(1.14, 0.08, 0.84, this.wood, 0, 0.04, 0.4));
      g.add(lid);
      const lock = glowSprite(0xff3a2a, 0.7, 0.9);
      lock.position.set(0, 0.62, 0.45);
      g.add(lock);
      const glow = glowSprite(0xffe14a, 2.2, 0);
      glow.position.y = 0.9;
      g.add(glow);
      c.scene.add(g);
      this.crates.push({ group: g, lid, lock, glow });
    });
  }

  private template(key: string): THREE.Group {
    let g = this.templates.get(key);
    if (g) return g;
    g = new THREE.Group();
    const el = (['fogo', 'gelo', 'vento', 'raio'] as Element[]).find((e) => key.endsWith(`-${e}`) || key.startsWith(`${e}-`));
    const ec = el ? new THREE.Color(ELEMENTS[el].hex) : new THREE.Color(0xe8c070);
    const em = basic(ec.clone().multiplyScalar(1.6));
    const { brass, dark } = this;
    const m = (a: THREE.Object3D) => g!.add(a);
    switch (key) {
      case 'escudo-rodas':
        for (const x of [-0.2, 0.2]) {
          const w = cylMesh(0.22, 0.22, 0.07, dark, 14, x, 0, 0);
          w.rotation.z = Math.PI / 2;
          m(w);
          const hub = cylMesh(0.08, 0.08, 0.09, brass, 8, x, 0, 0);
          hub.rotation.z = Math.PI / 2;
          m(hub);
        }
        m(cylMesh(0.03, 0.03, 0.5, dark, 6)).rotation.z = Math.PI / 2;
        break;
      case 'escudo-trava':
        m(boxMesh(0.34, 0.22, 0.12, dark));
        m(boxMesh(0.1, 0.32, 0.08, brass, 0.12, 0.1, 0));
        m(boxMesh(0.18, 0.06, 0.06, brass, -0.05, 0.15, 0));
        break;
      case 'escudo-armacao':
        m(boxMesh(0.6, 0.06, 0.06, dark, 0, 0.3, 0));
        m(boxMesh(0.6, 0.06, 0.06, dark, 0, -0.3, 0));
        m(boxMesh(0.06, 0.66, 0.06, dark, -0.3, 0, 0));
        m(boxMesh(0.06, 0.66, 0.06, dark, 0.3, 0, 0));
        m(boxMesh(0.5, 0.05, 0.05, brass, 0, 0, 0));
        break;
      case 'drone-cerebro':
        m(boxMesh(0.34, 0.26, 0.34, brass));
        m(boxMesh(0.2, 0.2, 0.2, basic(0x6aff8a), 0, 0.2, 0));
        break;
      case 'drone-helice':
        m(boxMesh(0.9, 0.03, 0.12, dark));
        m(boxMesh(0.12, 0.03, 0.9, dark));
        m(cylMesh(0.07, 0.07, 0.1, brass, 8));
        break;
      case 'drone-corpo':
        m(boxMesh(0.5, 0.26, 0.5, brass));
        m(boxMesh(0.36, 0.1, 0.36, dark, 0, 0.18, 0));
        m(boxMesh(0.14, 0.14, 0.05, basic(0x6aff8a), 0, 0, 0.27));
        break;
      case 'gramofone': {
        m(boxMesh(0.5, 0.16, 0.5, this.wood));
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.55, 12, 1, true), brass);
        horn.position.set(0, 0.4, 0);
        horn.rotation.z = -0.5;
        (horn.material as THREE.Material).side = THREE.DoubleSide;
        m(horn);
        break;
      }
      case 'disco':
        m(cylMesh(0.3, 0.3, 0.025, basic(0x080808), 20)).rotation.x = Math.PI / 2;
        m(cylMesh(0.09, 0.09, 0.03, basic(0xaa1a14), 12)).rotation.x = Math.PI / 2;
        break;
      case 'tabua':
        m(boxMesh(0.6, 0.85, 0.1, solid(this.c.tex, 'rune', 0x8a857c, this.c.q.simpleMaterials)));
        m(boxMesh(0.4, 0.5, 0.02, em, 0, 0.05, 0.06));
        break;
      default:
        if (key.startsWith('cristal-')) {
          const cr = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), em);
          cr.scale.y = 1.5;
          m(cr);
        } else {
          // peça de cajado: cabeça, haste ou ponteira
          const n = Number(key.split('-')[1]) || 1;
          if (n === 1) {
            m(boxMesh(0.2, 0.2, 0.2, brass));
            m(boxMesh(0.4, 0.05, 0.05, brass));
            m(new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), em));
          } else if (n === 2) {
            const s = cylMesh(0.04, 0.05, 0.9, this.wood, 8);
            s.rotation.z = 0.9;
            m(s);
            m(cylMesh(0.065, 0.065, 0.1, brass, 8, 0, 0, 0)).rotation.z = 0.9;
          } else {
            const cone = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.45, 8), dark);
            cone.rotation.z = Math.PI;
            m(cone);
            m(new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.025, 6, 12), brass)).rotation.x = Math.PI / 2;
          }
        }
    }
    g.scale.setScalar(1.35);
    this.templates.set(key, g);
    return g;
  }

  private make(key: string, x: number, y: number, z: number): Item {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const spin = new THREE.Group();
    spin.add(this.template(key).clone());
    spin.position.y = y;
    group.add(spin);
    const el = (['fogo', 'gelo', 'vento', 'raio'] as Element[]).find((e) => key.endsWith(`-${e}`) || key.startsWith(`${e}-`));
    const col = el ? ELEMENTS[el].hex : TEAM_ITEMS[key]?.group === 'drone' ? 0x6aff8a : 0xffd890;
    const glow = glowSprite(col, 1.8, 0.7);
    glow.position.y = y;
    group.add(glow);
    const beam = beamMesh(col, 0.12, 7, 0.28);
    group.add(beam);
    this.c.scene.add(group);
    return { group, spin, y, seed: x * 3.1 + z };
  }

  update(tr: TrincheiraSnap, dt: number, t: number) {
    const live = new Set<string>();
    const place = (id: string, key: string, x: number, z: number, y: number) => {
      live.add(id);
      let it = this.items.get(id);
      if (!it) {
        it = this.make(key, x, y, z);
        this.items.set(id, it);
      }
      it.group.visible = true;
      it.spin.rotation.y = t * 1.2 + it.seed;
      it.spin.position.y = it.y + Math.sin(t * 1.6 + it.seed) * 0.12;
    };
    for (const id of tr.pick) {
      const sp = this.spots.get(id);
      if (!sp) continue;
      const key = sp.ref ?? id.split(':')[1];
      // peças do Vento só aparecem depois que os caixotes abrem
      if (key.startsWith('vento-') && !tr.windOpen) continue;
      const y = sp.minY !== undefined ? 2.5 : key === 'tabua' || key === 'gramofone' || key === 'disco' ? 0.95 : 1.05;
      place(id, key, sp.use[0], sp.use[1], y);
    }
    for (const d of tr.drops) place(d.id, d.key, d.x, d.z, 1.0);
    for (const [id, it] of this.items) it.group.visible = live.has(id);
    // caixotes do Vento
    if (tr.windOpen !== this.windWas) this.windWas = tr.windOpen;
    for (const cr of this.crates) {
      const k = tr.windOpen ? 1 : 0;
      cr.lid.rotation.x += (-1.7 * k - cr.lid.rotation.x) * Math.min(1, dt * 3);
      (cr.lock.material as THREE.SpriteMaterial).opacity = k ? 0 : 0.55 + 0.4 * Math.sin(t * 3);
      (cr.glow.material as THREE.SpriteMaterial).opacity = k * 0.6;
    }
  }

  onEvent(e: GameEvent, local: string, who: (pid: string) => string) {
    if (e.e === 'peca') {
      const name = TEAM_ITEMS[e.key]?.name ?? e.key;
      this.c.snd.play('achou-peca');
      this.c.notify(e.pid === local ? `Você pegou: <b>${name}</b> (da equipe).` : `${who(e.pid)} pegou: <b>${name}</b>.`);
    }
  }
}
