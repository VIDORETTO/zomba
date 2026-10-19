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
  glow: THREE.Sprite;
  beam: THREE.Mesh;
  ring: THREE.Mesh;
}

// coluna de luz: some para cima (textura vertical em degradê)
function beamTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 128, 0, 0);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 128);
  return new THREE.CanvasTexture(c);
}

function ringTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 20, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.7)');
  g.addColorStop(0.85, 'rgba(255,255,255,0.25)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// Itens no chão: ícone grande girando, brilho verde pulsante, coluna de luz que aparece de longe (atravessa a névoa)
// e anel no chão; tudo pisca quando está para sumir.
export class PowerupView {
  private readonly group = new THREE.Group();
  readonly items = new Map<number, Item>();
  private readonly mats = new Map<PowerupKind, THREE.MeshBasicMaterial>();
  private readonly glowMat: THREE.SpriteMaterial;
  private readonly beamMat: THREE.MeshBasicMaterial;
  private readonly ringMat: THREE.MeshBasicMaterial;
  private readonly geo = new THREE.PlaneGeometry(1.05, 1.05);
  private readonly beamGeo = new THREE.CylinderGeometry(0.32, 0.32, 16, 12, 1, true).translate(0, 8, 0);
  private readonly ringGeo = new THREE.PlaneGeometry(2.6, 2.6).rotateX(-Math.PI / 2);
  // item novo no chão (a Game toca um som)
  onSpawn: ((kind: PowerupKind, pos: THREE.Vector3) => void) | null = null;
  private first = true;

  constructor(scene: THREE.Scene) {
    const green = new THREE.Color(0.35, 1.4, 0.45);
    this.glowMat = new THREE.SpriteMaterial({ map: glowTexture(), color: green, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.beamMat = new THREE.MeshBasicMaterial({ map: beamTexture(), color: green, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, opacity: 0.55 });
    this.ringMat = new THREE.MeshBasicMaterial({ map: ringTexture(), color: green, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.8 });
    scene.add(this.group);
  }

  private mat(kind: PowerupKind) {
    let m = this.mats.get(kind);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ map: iconTexture(kind), color: new THREE.Color(1.8, 1.8, 1.8), transparent: true, side: THREE.DoubleSide, depthWrite: false });
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
        const beam = new THREE.Mesh(this.beamGeo, this.beamMat);
        const ring = new THREE.Mesh(this.ringGeo, this.ringMat);
        ring.position.y = 0.04;
        beam.renderOrder = 2;
        g.add(beam, ring, icon, glow);
        g.position.set(p.x, p.y, p.z);
        this.group.add(g);
        it = { group: g, icon, glow, beam, ring };
        this.items.set(p.id, it);
        if (!this.first) this.onSpawn?.(p.kind, g.position.clone());
      }
      const pulse = 0.5 + 0.5 * Math.sin(t * 4 + p.id);
      it.icon.position.y = 1.1 + Math.sin(t * 2.5 + p.id) * 0.14;
      it.icon.rotation.y = t * 2;
      it.glow.position.y = it.icon.position.y;
      it.glow.scale.setScalar(1.9 + pulse * 0.7);
      it.ring.scale.setScalar(0.85 + pulse * 0.3);
      it.ring.rotation.y = t * 0.8;
      it.beam.scale.set(1, 0.92 + pulse * 0.08, 1);
      // pisca nos últimos segundos (cada vez mais rápido)
      const blinkHz = p.t < POWERUP.blinkAt ? 0 : p.t < POWERUP.lifetime - 4 ? 9 : 18;
      it.group.visible = blinkHz === 0 || Math.sin(t * blinkHz) > -0.2;
    }
    this.first = false;
    for (const [id, it] of this.items) {
      if (seen.has(id)) continue;
      this.group.remove(it.group);
      this.items.delete(id);
    }
  }

  dispose() {
    this.group.removeFromParent();
    for (const m of [...this.mats.values(), this.glowMat, this.beamMat, this.ringMat]) {
      m.map?.dispose();
      m.dispose();
    }
    this.geo.dispose();
    this.beamGeo.dispose();
    this.ringGeo.dispose();
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
