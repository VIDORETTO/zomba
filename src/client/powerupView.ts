import * as THREE from 'three';
import { POWERUP, POWERUPS, type PowerupKind } from '../shared/powerups';
import type { Snapshot } from '../shared/protocol';

function iconTexture(kind: PowerupKind): THREE.Texture {
  const d = POWERUPS[kind];
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = d.color;
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 6;
  ctx.font = "900 72px 'Segoe UI Symbol', 'Segoe UI', Georgia, sans-serif";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeText(d.glyph, 64, 68);
  ctx.fillText(d.glyph, 64, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

interface Item {
  group: THREE.Group;
  icon: THREE.Mesh;
}

// Itens no chão: ícone girando com brilho verde, piscando quando está para sumir.
export class PowerupView {
  private readonly group = new THREE.Group();
  private readonly items = new Map<number, Item>();
  private readonly mats = new Map<PowerupKind, THREE.MeshBasicMaterial>();
  private readonly glowMat: THREE.SpriteMaterial;
  private readonly geo = new THREE.PlaneGeometry(0.75, 0.75);

  constructor(scene: THREE.Scene) {
    this.glowMat = new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(0.25, 0.9, 0.3), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    scene.add(this.group);
  }

  private mat(kind: PowerupKind) {
    let m = this.mats.get(kind);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ map: iconTexture(kind), color: new THREE.Color(1.6, 1.6, 1.6), transparent: true, side: THREE.DoubleSide, depthWrite: false });
      this.mats.set(kind, m);
    }
    return m;
  }

  update(s: Snapshot | undefined, t: number) {
    const list = s?.powerups ?? [];
    const seen = new Set<number>();
    for (const p of list) {
      seen.add(p.id);
      let it = this.items.get(p.id);
      if (!it) {
        const g = new THREE.Group();
        const icon = new THREE.Mesh(this.geo, this.mat(p.kind));
        const glow = new THREE.Sprite(this.glowMat);
        glow.scale.setScalar(1.1);
        g.add(icon, glow);
        g.position.set(p.x, p.y, p.z);
        this.group.add(g);
        it = { group: g, icon };
        this.items.set(p.id, it);
      }
      it.icon.position.y = 1.0 + Math.sin(t * 2.5 + p.id) * 0.12;
      it.icon.rotation.y = t * 2;
      it.group.children[1].position.y = it.icon.position.y;
      // pisca nos últimos segundos
      it.group.visible = p.t < POWERUP.blinkAt || Math.sin(t * 18) > -0.2;
    }
    for (const [id, it] of this.items) {
      if (seen.has(id)) continue;
      this.group.remove(it.group);
      this.items.delete(id);
    }
  }

  dispose() {
    this.group.removeFromParent();
    for (const m of [...this.mats.values(), this.glowMat]) {
      m.map?.dispose();
      m.dispose();
    }
    this.geo.dispose();
  }
}

// Anúncio falado com a voz do navegador (grave e lenta, em português).
export function announce(text: string, volume: number) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'pt-BR';
    const v = synth.getVoices().find((x) => x.lang.toLowerCase().startsWith('pt'));
    if (v) u.voice = v;
    u.pitch = 0.3;
    u.rate = 0.85;
    u.volume = Math.max(0, Math.min(1, volume));
    synth.speak(u);
  } catch {
    // sem voz no navegador: segue só com o aviso na tela
  }
}
