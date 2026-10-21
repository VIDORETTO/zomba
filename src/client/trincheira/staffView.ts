import * as THREE from 'three';
import { TRINCHEIRA } from '../../shared/constants';
import type { Element, GameEvent, TrincheiraSnap } from '../../shared/protocol';
import { ELEMENTS } from '../../shared/trincheira-info';
import { buildStaffMesh } from '../gunModels';
import { additive, basic, beamMesh, boxMesh, flatRing, glowSprite, labelTex } from './common';
import type { TrCtx } from './ctx';

const EI: Record<Element, number> = { fogo: 0, gelo: 1, vento: 2, raio: 3 };

// modelo do cajado (o mesmo da arma, em pé)
function staffModel(el: Element, awake: boolean): THREE.Group {
  return buildStaffMesh(el, awake);
}

// Texto pequeno que muda (contagem no altar)
class CountLabel {
  readonly sprite: THREE.Sprite;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly tex: THREE.CanvasTexture;
  private text = '';
  constructor(private readonly color: string, w = 1.6) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 96;
    this.ctx = c.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthTest: false, fog: false }));
    this.sprite.scale.set(w, w * 0.375, 1);
    this.sprite.renderOrder = 9;
  }
  set(text: string) {
    if (text === this.text) return;
    this.text = text;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, 256, 96);
    ctx.font = '900 54px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(text, 128, 50);
    ctx.fillStyle = this.color;
    ctx.fillText(text, 128, 50);
    this.tex.needsUpdate = true;
  }
}

interface Pedestal {
  group: THREE.Group;
  staff: THREE.Group | null;
  staffKey: string;
  glow: THREE.Sprite;
  shards: THREE.Mesh[];
  beam: THREE.Mesh;
}

// Tudo ligado aos cajados: pedestais da Mesa, altares da Câmara, baús de almas, lápides, domos, placas e lâmpadas do Raio,
// altar da Tábua de Pedra e os feixes da missão.
export class StaffView {
  private readonly ped: Pedestal[] = [];
  private readonly altars: { group: THREE.Group; staff: THREE.Group | null; key: string; label: CountLabel; ring: THREE.Mesh; glow: THREE.Sprite }[] = [];
  private readonly chestGlow: THREE.Sprite[] = [];
  private readonly chestSeal: THREE.Mesh[] = [];
  private readonly tombGlow: THREE.Sprite[] = [];
  private readonly domeGlow: THREE.Sprite[] = [];
  private readonly plates: { mesh: THREE.Mesh; flash: number; color: THREE.Color }[] = [];
  private readonly lampDigit: CountLabel;
  private readonly lamps: THREE.Sprite[] = [];
  private readonly tabua: { group: THREE.Group; glow: THREE.Sprite; label: CountLabel; beam: THREE.Mesh };
  private readonly poco: { beams: THREE.Mesh[]; ring: THREE.Mesh };
  private prev = { fire: [0, 0, 0, 0], altar: [0, 0, 0, 0], tabua: 0, mission: 0 };
  private readonly rnd = Math.random;

  constructor(private readonly c: TrCtx) {
    const T = c.T;
    // pedestais da Mesa dos Cajados
    for (const p of T.staffTable) {
      const group = new THREE.Group();
      group.position.set(p.x, 0, p.z);
      const col = ELEMENTS[p.el].hex;
      const glow = glowSprite(col, 2.4, 0.5);
      glow.position.y = 1.5;
      const beam = beamMesh(col, 0.25, 40, 0);
      beam.position.y = 1.2;
      const shards: THREE.Mesh[] = [];
      for (let k = 0; k < 4; k++) {
        const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), basic(new THREE.Color(col).multiplyScalar(1.8)));
        s.visible = false;
        group.add(s);
        shards.push(s);
      }
      group.add(glow, beam);
      c.scene.add(group);
      this.ped.push({ group, staff: null, staffKey: '', glow, shards, beam });
    }
    // altares da Câmara
    for (const a of T.chamber.alcoves) {
      const group = new THREE.Group();
      group.position.set(a.altar[0], 0, a.altar[1]);
      const col = ELEMENTS[a.el].hex;
      const label = new CountLabel(ELEMENTS[a.el].color);
      label.sprite.position.y = 3.1;
      label.sprite.visible = false;
      const ring = flatRing(col, 1.5, 0.0);
      const glow = glowSprite(col, 2.6, 0.4);
      glow.position.y = 1.4;
      group.add(label.sprite, ring, glow);
      c.scene.add(group);
      this.altars.push({ group, staff: null, key: '', label, ring, glow });
    }
    // baús de almas (Fogo), lápides (Gelo), domos (Vento)
    for (const [x, z] of T.chests) {
      const g = glowSprite(0xff7a2a, 2.2, 0.2);
      g.position.set(x, 0.9, z);
      c.scene.add(g);
      this.chestGlow.push(g);
      const seal = new THREE.Mesh(new THREE.CircleGeometry(0.7, 20).rotateX(-Math.PI / 2), additive(0xffb050, { opacity: 0.9, fog: false }));
      seal.position.set(x, 0.86, z);
      seal.visible = false;
      c.scene.add(seal);
      this.chestSeal.push(seal);
    }
    for (const [x, z] of T.tombstones) {
      const g = glowSprite(0x6ab8ff, 2.2, 0);
      g.position.set(x, 0.7, z);
      c.scene.add(g);
      this.tombGlow.push(g);
    }
    for (const [x, z] of T.domes) {
      const g = glowSprite(0xffe14a, 1.8, 0);
      g.position.set(x, 1.8, z);
      c.scene.add(g);
      this.domeGlow.push(g);
    }
    // placas numeradas do enigma do Raio
    const rai = T.chamber.alcoves.find((a) => a.el === 'raio');
    T.chamber.plates.forEach((p, i) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), new THREE.MeshBasicMaterial({ map: labelTex(String(i + 1), '#e8e0d0', 'rgba(24,22,28,0.92)'), color: new THREE.Color(0.9, 0.9, 0.9) }));
      let nx = 0, nz = 1;
      if (rai) {
        const dx = rai.c[0] - p[0], dz = rai.c[1] - p[2];
        const l = Math.hypot(dx, dz) || 1;
        nx = dx / l;
        nz = dz / l;
      }
      mesh.position.set(p[0] + nx * 0.07, p[1], p[2] + nz * 0.07);
      mesh.rotation.y = Math.atan2(nx, nz);
      c.scene.add(mesh);
      this.plates.push({ mesh, flash: 0, color: new THREE.Color(1, 1, 1) });
    });
    // lâmpadas e número em laço sobre o altar do Raio
    this.lampDigit = new CountLabel('#d6b0ff', 1.3);
    if (rai) {
      this.lampDigit.sprite.position.set(rai.altar[0], 3.3, rai.altar[1]);
      c.scene.add(this.lampDigit.sprite);
      for (let k = 0; k < 3; k++) {
        const l = glowSprite(0xb06aff, 0.7, 0.15);
        l.position.set(rai.altar[0] + (k - 1) * 0.7, 2.5, rai.altar[1]);
        c.scene.add(l);
        this.lamps.push(l);
      }
    }
    // Tábua de Pedra no altar da Igreja
    const tg = new THREE.Group();
    const [tx, tz] = T.tabuaAltar;
    tg.position.set(tx, 0, tz);
    tg.add(boxMesh(0.6, 0.85, 0.1, new THREE.MeshStandardMaterial({ color: 0x8a857c, roughness: 0.9 }), 0, 1.4, 0));
    const tgl = glowSprite(0x9fd8ff, 2.2, 0);
    tgl.position.y = 1.4;
    const tlab = new CountLabel('#cfe8ff', 1.5);
    tlab.sprite.position.y = 2.4;
    const tbeam = beamMesh(0x9fd8ff, 0.3, 40, 0);
    tbeam.position.y = 1.4;
    tg.add(tgl, tlab.sprite, tbeam);
    tg.visible = false;
    c.scene.add(tg);
    this.tabua = { group: tg, glow: tgl, label: tlab, beam: tbeam };
    // poço da missão: 4 feixes e um anel de runas
    const [rx, rz] = T.ring.c;
    const beams: THREE.Mesh[] = [];
    for (const p of T.staffTable) {
      const b = beamMesh(ELEMENTS[p.el].hex, 0.35, 80, 0.0);
      b.position.set(p.x, 0, p.z);
      b.visible = false;
      c.scene.add(b);
      beams.push(b);
    }
    const mring = flatRing(0x9fd8ff, T.ring.r - 1.5, 0);
    mring.position.set(rx, 0.1, rz);
    c.scene.add(mring);
    this.poco = { beams, ring: mring };
    void EI;
  }

  private setStaff(slot: { group: THREE.Group; staff: THREE.Group | null }, key: string, curKey: string, el: Element, awake: boolean, y: number): string {
    if (key === curKey) return curKey;
    if (slot.staff) slot.group.remove(slot.staff);
    slot.staff = null;
    if (key) {
      const s = staffModel(el, awake);
      s.position.y = y;
      slot.group.add(s);
      slot.staff = s;
    }
    return key;
  }

  update(tr: TrincheiraSnap, dt: number, t: number, cam: THREE.Vector3) {
    const T = this.c.T;
    // pedestais
    T.staffTable.forEach((tp, i) => {
      const st = tr.staffs[EI[tp.el]];
      const p = this.ped[i];
      if (!st) return;
      const show = st.st === 'pedestal';
      p.staffKey = this.setStaff(p, show ? `${tp.el}${st.awake ? '-d' : ''}` : '', p.staffKey, tp.el, st.awake, 1.1);
      if (p.staff) {
        p.staff.rotation.y = t * 0.8;
        p.staff.position.y = 1.1 + Math.sin(t * 1.6 + i) * 0.06;
      }
      // peças que a equipe já tem deste elemento (3 + cristal) orbitando o pedestal vazio
      let have = 0;
      for (const k of [`${tp.el}-1`, `${tp.el}-2`, `${tp.el}-3`, `cristal-${tp.el}`]) if (tr.team.includes(k)) have++;
      p.shards.forEach((s, k) => {
        s.visible = st.st === 'faltando' && k < have;
        const a = t * 1.2 + (k / 4) * Math.PI * 2;
        s.position.set(Math.cos(a) * 0.45, 1.25 + Math.sin(t * 2 + k) * 0.08, Math.sin(a) * 0.45);
        s.rotation.y = t * 2;
      });
      (p.glow.material as THREE.SpriteMaterial).opacity = show ? 0.8 : 0.15 + have * 0.1;
      p.glow.scale.setScalar(show ? 2.8 + Math.sin(t * 3) * 0.3 : 1.6);
      // feixe da missão
      const beamOn = tr.missao.step >= 1 && tr.missao.step <= 4 && show;
      (p.beam.material as THREE.MeshBasicMaterial).opacity = beamOn ? 0.55 : 0;
      p.beam.visible = beamOn;
    });
    // altares da Câmara
    T.chamber.alcoves.forEach((a, i) => {
      const al = this.altars[i];
      const st = tr.staffs[EI[a.el]];
      if (!al || !st) return;
      const here = st.st === 'altar';
      al.key = this.setStaff(al, here ? `${a.el}${st.awake ? '-d' : ''}` : '', al.key, a.el, st.awake, 1.5);
      if (al.staff) {
        al.staff.rotation.y = t * 0.7;
        al.staff.position.y = 1.5 + Math.sin(t * 1.4) * 0.07;
      }
      al.label.sprite.visible = here;
      if (here) al.label.set(st.awake ? 'Desperto' : `${Math.round(st.charge * TRINCHEIRA.staffChargeKills)}/${TRINCHEIRA.staffChargeKills}`);
      const rm = al.ring.material as THREE.MeshBasicMaterial;
      rm.opacity = here ? 0.25 + st.charge * 0.6 : 0.12 + 0.05 * Math.sin(t * 2 + i);
      al.ring.scale.setScalar(0.9 + st.charge * 0.5);
      (al.glow.material as THREE.SpriteMaterial).opacity = here ? 0.4 + st.charge * 0.5 : 0.2;
      // almas entrando no altar
      if (st.charge > this.prev.altar[i] + 0.03) {
        this.prev.altar[i] = st.charge;
        const ch = T.chamber.center;
        const ang = this.rnd() * Math.PI * 2;
        this.c.fx.soul(new THREE.Vector3(ch[0] + Math.cos(ang) * 8, 1.5, ch[1] + Math.sin(ang) * 8), new THREE.Vector3(a.altar[0], 1.6, a.altar[1]), ELEMENTS[a.el].hex);
      } else if (st.charge < this.prev.altar[i]) this.prev.altar[i] = st.charge;
      if (here && st.awake && this.prev.altar[i] >= 0.99) this.c.fx.stream(`altar${i}`, dt, 10, () => ({ x: a.altar[0] + (this.rnd() - 0.5) * 0.8, y: 1.2, z: a.altar[1] + (this.rnd() - 0.5) * 0.8, vy: 1.6, life: 1, size: 0.18, color: ELEMENTS[a.el].hex }));
    });
    // baús de almas
    const fire = tr.staffs[0];
    this.chestGlow.forEach((g, k) => {
      const kills = fire?.puzzle[k] ?? 0;
      const done = kills >= TRINCHEIRA.fireChestKills;
      const [x, z] = T.chests[k];
      (g.material as THREE.SpriteMaterial).opacity = 0.2 + (kills / TRINCHEIRA.fireChestKills) * 0.6 + 0.1 * Math.sin(t * 6 + k);
      g.scale.setScalar(1.6 + (kills / TRINCHEIRA.fireChestKills) * 1.4);
      this.chestSeal[k].visible = done;
      if (!done) this.c.fx.flame(`chest${k}`, x, 0.85, z, dt, 3 + kills * 2.5, 0.5, 0xff7a20);
      else this.c.fx.flame(`chest${k}`, x, 0.9, z, dt, 4, 0.35, 0xffe0a0);
      if (kills > this.prev.fire[k]) {
        // uma alma entra no baú
        const ang = this.rnd() * Math.PI * 2;
        this.c.fx.soul(new THREE.Vector3(x + Math.cos(ang) * 5, 1.4, z + Math.sin(ang) * 5), new THREE.Vector3(x, 1, z), 0xff9a50, 0.7, 1.5);
        this.c.snd.play('cristal', new THREE.Vector3(x, 1, z), 0.4);
      }
      this.prev.fire[k] = kills;
    });
    // lápides (Gelo)
    const gelo = tr.staffs[1];
    this.tombGlow.forEach((g, k) => {
      const hit = (gelo?.puzzle[k] ?? 0) > 0;
      (g.material as THREE.SpriteMaterial).opacity = hit ? 0.7 + 0.2 * Math.sin(t * 3 + k) : 0;
      if (hit) {
        const [x, z] = T.tombstones[k];
        this.c.fx.stream(`tomb${k}`, dt, 4, () => ({ x: x + (this.rnd() - 0.5), y: 0.4, z: z + (this.rnd() - 0.5), vy: 0.7, life: 1.2, size: 0.13, color: 0xaee0ff }));
      }
    });
    // domos (Vento): soltam fumaça até serem acertados
    const vento = tr.staffs[2];
    this.domeGlow.forEach((g, k) => {
      const hit = (vento?.puzzle[k] ?? 0) > 0;
      const [x, z] = T.domes[k];
      (g.material as THREE.SpriteMaterial).opacity = hit ? 0.5 : 0;
      if (!hit && Math.hypot(x - cam.x, z - cam.z) < 160) this.c.fx.smoke(`dome${k}`, x, 1.7, z, dt, 4, 1.4, 0x8a867e, 2);
    });
    // placas e lâmpadas (Raio)
    const raio = tr.staffs[3];
    this.plates.forEach((p) => {
      p.flash = Math.max(0, p.flash - dt * 2);
      (p.mesh.material as THREE.MeshBasicMaterial).color.setRGB(0.9, 0.9, 0.9).lerp(p.color, p.flash);
    });
    const showLamps = !!raio && raio.st !== 'faltando' && !raio.solved && raio.seq.length > 0;
    this.lampDigit.sprite.visible = showLamps;
    this.lamps.forEach((l) => (l.visible = showLamps));
    if (showLamps) {
      // mostra a sequência em laço: um número por vez, com uma pausa no fim
      const n = raio.seq.length;
      const cyc = (t * 0.8) % (n + 1);
      const idx = Math.floor(cyc);
      this.lampDigit.set(idx < n ? String(raio.seq[idx]) : '·');
      this.lamps.forEach((l, k) => ((l.material as THREE.SpriteMaterial).opacity = k < (raio.puzzle[0] ?? 0) ? 1 : k === idx ? 0.8 : 0.15));
      this.lamps.forEach((l, k) => l.scale.setScalar(k === idx ? 0.9 : 0.6));
    }
    // Tábua de Pedra no altar
    const tb = tr.tabua;
    this.tabua.group.visible = tb === 'altar' || tb === 'cheia';
    if (this.tabua.group.visible) {
      const full = tb === 'cheia';
      (this.tabua.glow.material as THREE.SpriteMaterial).opacity = full ? 0.9 : 0.25 + (tr.tabuaCharge / TRINCHEIRA.punhoKills) * 0.5;
      (this.tabua.beam.material as THREE.MeshBasicMaterial).opacity = full ? 0.5 : 0;
      this.tabua.beam.visible = full;
      this.tabua.label.sprite.visible = true;
      this.tabua.label.set(full ? 'Pronta' : `${tr.tabuaCharge}/${TRINCHEIRA.punhoKills}`);
      this.tabua.group.children[0].rotation.y = Math.sin(t * 0.7) * 0.15;
      if (tr.tabuaCharge > this.prev.tabua) {
        const [x, z] = T.tabuaAltar;
        const ang = this.rnd() * Math.PI * 2;
        this.c.fx.soul(new THREE.Vector3(x + Math.cos(ang) * 8, 1.2, z + Math.sin(ang) * 8), new THREE.Vector3(x, 1.5, z), 0x9fd8ff);
      }
    }
    this.prev.tabua = tr.tabuaCharge;
    // poço da missão
    const ms = tr.missao.step;
    const active = ms >= 1 && ms <= 4;
    const ringMat = this.poco.ring.material as THREE.MeshBasicMaterial;
    ringMat.opacity = active ? 0.35 + 0.25 * Math.sin(t * (ms === 4 ? 6 : 2)) : 0;
    this.poco.beams.forEach((b, i) => {
      // os feixes de cada pedestal só sobem se o cajado está lá (feito no pedestal acima); aqui só gira
      b.visible = false;
      void i;
    });
    if (ms === 2 && tr.missao.count > this.prev.mission) {
      const [rx, rz] = T.ring.c;
      const ang = this.rnd() * Math.PI * 2;
      this.c.fx.soul(new THREE.Vector3(rx + Math.cos(ang) * 12, 1.4, rz + Math.sin(ang) * 12), new THREE.Vector3(rx, 1.2, rz), 0xb8e8ff, 0.8, 2);
    }
    this.prev.mission = tr.missao.count;
  }

  onEvent(e: GameEvent, local: string, who: (pid: string) => string) {
    switch (e.e) {
      case 'alvo': {
        let pos: THREE.Vector3 | null = null;
        const T = this.c.T;
        if (e.kind === 'lapide' && T.tombstones[e.idx]) pos = new THREE.Vector3(T.tombstones[e.idx][0], 0.8, T.tombstones[e.idx][1]);
        else if (e.kind === 'domo' && T.domes[e.idx]) pos = new THREE.Vector3(T.domes[e.idx][0], 1.7, T.domes[e.idx][1]);
        else if (e.kind === 'bau' && T.chests[e.idx]) pos = new THREE.Vector3(T.chests[e.idx][0], 0.9, T.chests[e.idx][1]);
        else if (e.kind === 'placa' && T.chamber.plates[e.idx]) {
          const p = T.chamber.plates[e.idx];
          pos = new THREE.Vector3(p[0], p[1], p[2]);
          const pl = this.plates[e.idx];
          if (pl) {
            pl.flash = 1;
            pl.color.set(e.ok ? 0x55ff88 : 0xff4433);
          }
        }
        if (pos) {
          const col = e.kind === 'lapide' ? 0x6ab8ff : e.kind === 'domo' ? 0xffe14a : e.kind === 'placa' ? (e.ok ? 0x55ff88 : 0xff4433) : 0xff8a30;
          this.c.fx.burst(pos.x, pos.y, pos.z, 18, 3, col, 0.8, 0.25);
          this.c.snd.play(e.ok ? 'alvo-ok' : 'alvo-erro', pos);
        }
        break;
      }
      case 'enigma': {
        const p = this.c.T.chamber.alcoves.find((a) => a.el === e.el);
        const col = ELEMENTS[e.el].hex;
        const me = this.c.me();
        if (me) this.c.fx.ring(me.x, me.y, me.z, 1, 8, col, 1);
        if (p) this.c.fx.ring(p.altar[0], 0, p.altar[1], 1, 6, col, 1);
        this.c.snd.play('missao-passo');
        this.c.notify(`Enigma do <b style="color:${ELEMENTS[e.el].color}">Cajado de ${ELEMENTS[e.el].name}</b> resolvido: leve-o ao altar da Câmara.`);
        break;
      }
      case 'cajado': {
        const tp = this.c.T.staffTable.find((s) => s.el === e.el);
        const name = `Cajado de ${ELEMENTS[e.el].name}`;
        const col = ELEMENTS[e.el].color;
        if (e.phase === 'monta' && tp) {
          this.c.snd.play('cajado-monta', new THREE.Vector3(tp.x, 1.2, tp.z));
          this.c.fx.burst(tp.x, 1.3, tp.z, 40, 4, ELEMENTS[e.el].hex, 1, 0.3, { up: 2 });
          this.c.fx.ring(tp.x, 0, tp.z, 1, 5, ELEMENTS[e.el].hex, 0.9);
          this.c.notify(`${who(e.pid)} montou o <b style="color:${col}">${name}</b> na Mesa dos Cajados.`);
        } else if (e.phase === 'pega' && e.pid === local) {
          this.c.notify(`<b style="color:${col}">${name}</b> na mão. Só pode carregar um cajado.`);
        } else if (e.phase === 'devolve' && e.pid === local) {
          this.c.notify(`Você devolveu o <b style="color:${col}">${name}</b> ao pedestal.`);
        } else if (e.phase === 'altar') {
          this.c.notify(`O <b style="color:${col}">${name}</b> está no altar: ele enche com abates de qualquer jogador.`);
        } else if (e.phase === 'cheio') {
          this.c.snd.play('cristal');
          this.c.notify(`O altar do <b style="color:${col}">${name}</b> está cheio: pegue o cajado desperto.`);
        } else if (e.phase === 'perde') {
          this.c.notify(`O <b style="color:${col}">${name}</b> voltou ao pedestal.`);
        }
        break;
      }
      case 'desperto': {
        const a = this.c.T.chamber.alcoves.find((x) => x.el === e.el);
        this.c.snd.play('cajado-desperto');
        if (a) {
          this.c.fx.burst(a.altar[0], 1.5, a.altar[1], 60, 6, ELEMENTS[e.el].hex, 1.2, 0.35, { up: 2 });
          this.c.fx.ring(a.altar[0], 0, a.altar[1], 1, 9, ELEMENTS[e.el].hex, 1.2);
        }
        this.c.quake(0.4);
        this.c.notify(`<b style="color:${ELEMENTS[e.el].color}">Cajado de ${ELEMENTS[e.el].name} Desperto!</b>`);
        break;
      }
      case 'tabua':
        if (e.phase === 'pega') this.c.snd.play('tabua');
        else if (e.phase === 'altar') {
          this.c.snd.play('tabua');
          this.c.notify('A <b>Tábua de Pedra</b> está no altar: mate com a faca dentro da Igreja para enchê-la.');
        } else if (e.phase === 'cheia') {
          this.c.snd.play('cristal');
          this.c.notify('A <b>Tábua</b> brilha! Cada jogador pode pegar o <b>Punho de Ferro</b>.');
        } else if (e.phase === 'punho' && e.pid === local) {
          this.c.notify('<b>Punho de Ferro</b>: substitui a faca e arremessa os zumbis.');
        }
        break;
      case 'area':
        this.areaFx(e);
        break;
      default:
    }
  }

  // pilar de fogo, nevasca, redemoinho, bola de raio: efeitos de partículas por `dur` segundos
  private areaFx(e: Extract<GameEvent, { e: 'area' }>) {
    const { x, y, z, r, dur } = e;
    const pos = new THREE.Vector3(x, y, z);
    const col = e.kind === 'pilar' ? 0xff7a20 : e.kind === 'nevasca' ? 0xcfeaff : e.kind === 'redemoinho' ? 0xfff0a0 : 0xc08aff;
    this.c.fx.ring(x, y, z, 0.5, r, col, Math.min(1.2, dur));
    const name = e.kind === 'pilar' ? 'fogo-pilar' : e.kind === 'nevasca' ? 'nevasca' : e.kind === 'redemoinho' ? 'redemoinho' : e.kind === 'orbRaio' ? 'raio-bola' : 'trovao';
    this.c.snd.play(name, pos);
    this.zones.push({ kind: e.kind, x, y, z, r, t: 0, dur });
  }

  private zones: { kind: string; x: number; y: number; z: number; r: number; t: number; dur: number }[] = [];

  // chamado todo quadro para manter os efeitos de área vivos
  tickZones(dt: number) {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      z.t += dt;
      if (z.t >= z.dur) {
        this.zones.splice(i, 1);
        continue;
      }
      const fx = this.c.fx;
      const R = () => (this.rnd() - 0.5) * 2;
      if (z.kind === 'pilar') {
        fx.stream(`z${i}f`, dt, 90, () => {
          const a = this.rnd() * Math.PI * 2, rr = Math.sqrt(this.rnd()) * z.r * 0.8;
          return { x: z.x + Math.cos(a) * rr, y: z.y + 0.1, z: z.z + Math.sin(a) * rr, vx: 0, vy: 6 + this.rnd() * 8, vz: 0, life: 0.9, size: 0.9, color: this.rnd() < 0.5 ? 0xff6a10 : 0xffb030, alpha: 0.8, grow: 0.3 };
        });
      } else if (z.kind === 'nevasca') {
        fx.stream(`z${i}n`, dt, 120, () => ({ x: z.x + R() * z.r, y: z.y + 0.5 + this.rnd() * 5, z: z.z + R() * z.r, vx: -3 - this.rnd() * 3, vy: -1, vz: R() * 2, life: 0.9, size: 0.28, color: 0xe8f4ff, alpha: 0.9 }));
      } else if (z.kind === 'redemoinho') {
        const a0 = z.t * 6;
        fx.stream(`z${i}r`, dt, 100, () => {
          const h = this.rnd() * 6, a = a0 + h * 1.1 + this.rnd() * 6.28;
          const rr = z.r * (0.3 + h / 9);
          return { x: z.x + Math.cos(a) * rr, y: z.y + h, z: z.z + Math.sin(a) * rr, vx: -Math.sin(a) * 5, vy: 1, vz: Math.cos(a) * 5, life: 0.6, size: 0.4, color: 0xfff4b0, alpha: 0.7 };
        });
      } else if (z.kind === 'orbRaio') {
        fx.stream(`z${i}o`, dt, 60, () => ({ x: z.x + R() * 0.5, y: z.y + R() * 0.5, z: z.z + R() * 0.5, vx: R() * 3, vy: R() * 3, vz: R() * 3, life: 0.4, size: 0.5, color: 0xc08aff, alpha: 1 }));
        if (this.rnd() < dt * 9) fx.bolt(new THREE.Vector3(z.x, z.y, z.z), new THREE.Vector3(z.x + R() * z.r, z.y + R() * 1.5, z.z + R() * z.r), 0xd8b0ff, 0.2, 0.3);
      }
    }
  }
}
