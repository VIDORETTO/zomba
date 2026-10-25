import * as THREE from 'three';
import { POWERUP, POWERUPS, type PowerupKind } from '../shared/powerups';
import type { Snapshot } from '../shared/protocol';

// Emblema do item: disco escuro com aro e símbolo na cor própria do item (cada um tem a sua cor, para se distinguirem de longe).
function iconTexture(kind: PowerupKind): THREE.Texture {
  const d = POWERUPS[kind];
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgba(8,8,12,0.92)';
  ctx.beginPath();
  ctx.arc(64, 64, 58, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = d.color;
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.arc(64, 64, 54, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = d.color;
  if (kind === 'sangue') {
    // gota de sangue
    ctx.beginPath();
    ctx.moveTo(64, 26);
    ctx.bezierCurveTo(90, 58, 96, 70, 90, 84);
    ctx.bezierCurveTo(84, 100, 44, 100, 38, 84);
    ctx.bezierCurveTo(32, 70, 38, 58, 64, 26);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.font = "900 58px 'Segoe UI Symbol', 'Segoe UI', Georgia, sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(d.glyph, 64, 68);
  }
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
  // brilho, coluna de luz e anel de cada item na cor dele
  private readonly tints = new Map<PowerupKind, { glow: THREE.SpriteMaterial; beam: THREE.MeshBasicMaterial; ring: THREE.MeshBasicMaterial }>();
  private readonly glowTex = glowTexture();
  private readonly beamTex = beamTexture();
  private readonly ringTex = ringTexture();
  private readonly geo = new THREE.PlaneGeometry(1.05, 1.05);
  private readonly beamGeo = new THREE.CylinderGeometry(0.2, 0.2, 16, 12, 1, true).translate(0, 8, 0);
  private readonly ringGeo = new THREE.PlaneGeometry(2.6, 2.6).rotateX(-Math.PI / 2);
  // item novo no chão (a Game toca um som)
  onSpawn: ((kind: PowerupKind, pos: THREE.Vector3) => void) | null = null;
  private first = true;

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  private tint(kind: PowerupKind) {
    let t = this.tints.get(kind);
    if (!t) {
      const col = new THREE.Color(POWERUPS[kind].color).multiplyScalar(1.15);
      t = {
        glow: new THREE.SpriteMaterial({ map: this.glowTex, color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
        beam: new THREE.MeshBasicMaterial({ map: this.beamTex, color: col, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, opacity: 0.3 }),
        ring: new THREE.MeshBasicMaterial({ map: this.ringTex, color: col, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.8 }),
      };
      this.tints.set(kind, t);
    }
    return t;
  }

  private mat(kind: PowerupKind) {
    let m = this.mats.get(kind);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ map: iconTexture(kind), transparent: true, side: THREE.DoubleSide, depthWrite: false });
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
        const tint = this.tint(p.kind);
        const glow = new THREE.Sprite(tint.glow);
        const beam = new THREE.Mesh(this.beamGeo, tint.beam);
        const ring = new THREE.Mesh(this.ringGeo, tint.ring);
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
      it.glow.scale.setScalar(1.3 + pulse * 0.45);
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
    for (const m of this.mats.values()) {
      m.map?.dispose();
      m.dispose();
    }
    for (const t of this.tints.values()) {
      t.glow.dispose();
      t.beam.dispose();
      t.ring.dispose();
    }
    this.glowTex.dispose();
    this.beamTex.dispose();
    this.ringTex.dispose();
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
