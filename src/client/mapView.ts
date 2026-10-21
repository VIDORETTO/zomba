import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Block, MapDef, MaterialId } from '../shared/map/types';
import type { QualityConfig } from './quality';
import { chalkTexture, signTexture, type TexSet } from './textures';

// Metros por repetição da textura. 0 = estica a textura em cada face.
const SCALE: Record<MaterialId, number> = {
  asphalt: 6, sidewalk: 3, dirt: 5, concrete: 4, pavement: 6, brick: 3, brickDark: 3, plaster: 4,
  wood: 2.5, woodDark: 2.5, boards: 0, floorWood: 3, tile: 2, roof: 4, ceiling: 4,
  rotWood: 2.5, brickDirty: 3, crackConcrete: 4, metal: 3, rust: 2, glass: 0, glassLit: 0, trim: 2, paintYellow: 1, paintWhite: 1,
  carPaint: 4, tire: 1, lamp: 0, lava: 3, awning: 2, sandbag: 1.5, stone: 2.5, neon: 0, mud: 5, rune: 2.5, rivet: 2,
};

const DEFAULT_TINT: Partial<Record<MaterialId, number>> = {
  plaster: 0xd0c4ac,
  trim: 0xb8b0a0,
  metal: 0x8a8c8c,
  ceiling: 0xb0a898,
  carPaint: 0x777777,
};

// materiais que ganham uma camada de neve (e a cor para onde vão)
const SNOWY = new Set<MaterialId>(['dirt', 'mud', 'sandbag', 'roof', 'floorWood', 'wood']);
const SNOW_COLOR = new THREE.Color(0xdfe6ee);
const SNOW_FOG = new THREE.Color(0x9a9a9e);
const SKY_FLASH = new THREE.Color(0xc4d4ff);

const NO_SHADOW = new Set<MaterialId>(['asphalt', 'pavement', 'dirt', 'paintYellow', 'paintWhite', 'lava', 'glass', 'glassLit', 'lamp', 'mud']);

// direção do sol do céu (as poças da Trincheira refletem a mesma)
export const SKY_SUN_DIR = new THREE.Vector3(-0.75, 0.32, 0.55).normalize();
export const FOG_COLOR = 0x5c3c27;
export const FOG_DENSITY = 0.032;

export interface MapView {
  group: THREE.Group;
  update(t: number, cam: THREE.Vector3): void;
  // portas/entulhos abertos: afundam no chão e somem
  setDoors(open: string[]): void;
  // clima: 0 = normal, 1 = rodada infernal; flash = clarão de um raio (0..1)
  setMood(hell: number, flash: number): void;
  // cor da névoa atual (as partículas usam a mesma)
  readonly fogColor: THREE.Color;
  readonly fogDensity: number;
  // névoa de base (Rota: mais fechada e mais clara na estrada que nas paradas); road = 0 parada .. 1 estrada
  setFogBase(d: number, road?: number): void;
  // a sombra precisa ser redesenhada (ela acompanha o jogador em mapas grandes)
  takeShadowDirty(): boolean;
  // energia (mapa Rota): sem ela as luzes das máquinas de bebida ficam quase apagadas
  setPower(on: boolean): void;
  // geradores da Trincheira: as luzes com `gen` só acendem com o gerador ligado
  setGens(on: boolean[]): void;
  // neve (Trincheira): 0 a 1; clareia o chão, a lama, os sacos e a névoa
  // k: quanto neva (névoa clara); ground: quanto já cobriu o chão (padrão = k)
  setSnow(k: number, ground?: number): void;
  // escurece o sol e o céu (Câmara Antiga): 0 normal .. 1 bem escuro
  setDim(k: number): void;
  // clarão do céu (relâmpago): 0 a 1
  setSkyFlash(k: number): void;
  dispose(): void;
}

// clima da rodada infernal: névoa vermelha, céu quase preto, sol cor de sangue
const HELL = {
  fog: new THREE.Color(0x4a0e08),
  density: 0.04,
  top: new THREE.Color(0x0e0303),
  sun: new THREE.Color(0xff2a10),
  hemi: new THREE.Color(0xb05040),
  sunLight: new THREE.Color(0xff3a18),
};

type AnyMat = THREE.MeshStandardMaterial | THREE.MeshLambertMaterial;

// simple=true usa Lambert: bem mais barato por pixel, ideal para placas fracas ou sem aceleração.
function makeMaterial(mat: MaterialId, tint: number | undefined, tex: TexSet, simple: boolean, shaded = false): AnyMat {
  const color = new THREE.Color(tint ?? DEFAULT_TINT[mat] ?? 0xffffff);
  const map = tex[mat] ?? null;
  const p: THREE.MeshStandardMaterialParameters = { color, map, roughness: 0.92, metalness: 0, ...(shaded ? { vertexColors: true } : {}) };
  switch (mat) {
    case 'glass':
      Object.assign(p, { roughness: 0.18, metalness: 0.5 });
      break;
    case 'glassLit':
      Object.assign(p, { emissive: new THREE.Color(0xffffff), emissiveMap: map, emissiveIntensity: 0.9, roughness: 0.3 });
      break;
    case 'metal':
      Object.assign(p, { roughness: 0.55, metalness: 0.55 });
      break;
    case 'carPaint':
      Object.assign(p, { roughness: 0.6, metalness: 0.35 });
      break;
    case 'mud':
      // lama molhada: brilha um pouco com a luz baixa do céu
      Object.assign(p, { roughness: 0.62, metalness: 0.04 });
      break;
    case 'lamp':
      Object.assign(p, { emissive: new THREE.Color(0xffe2b0), emissiveIntensity: 1.3 });
      break;
    case 'neon':
      // luz suave na cor do bloco (tint), sem estourar no brilho
      Object.assign(p, { color: new THREE.Color(0x151515), emissive: new THREE.Color(tint ?? 0xffc880), emissiveIntensity: 0.85 });
      break;
    case 'lava':
      Object.assign(p, { color: new THREE.Color(0x220800), emissive: new THREE.Color(0xffffff), emissiveMap: map, emissiveIntensity: 2.4 });
      break;
    case 'paintYellow':
    case 'paintWhite':
      Object.assign(p, { transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      break;
  }
  if (simple) {
    const { roughness: _r, metalness: _m, ...lambert } = p;
    return new THREE.MeshLambertMaterial(lambert as THREE.MeshLambertMaterialParameters);
  }
  return new THREE.MeshStandardMaterial(p);
}

// Ajusta UVs pelo tamanho real do bloco, alinhados ao mundo: texturas emendam entre blocos vizinhos.
function worldUVs(g: THREE.BufferGeometry, scale: number, ox: number, oy: number, oz: number) {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nor = g.attributes.normal as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + ox;
    const y = pos.getY(i) + oy;
    const z = pos.getZ(i) + oz;
    const ax = Math.abs(nor.getX(i));
    const ay = Math.abs(nor.getY(i));
    if (ax > 0.5) uv.setXY(i, z / scale, y / scale);
    else if (ay > 0.5) uv.setXY(i, x / scale, z / scale);
    else uv.setXY(i, x / scale, y / scale);
  }
}

export function buildMapView(map: MapDef, tex: TexSet, scene: THREE.Scene, q: QualityConfig): MapView {
  const group = new THREE.Group();
  type Batch = Map<string, { mat: MaterialId; tint?: number; shaded: boolean; geos: THREE.BufferGeometry[] }>;
  const byKey: Batch = new Map();
  // mapas grandes: blocos agrupados em pedaços de 64 m, para a placa de vídeo pular o que está longe
  const big = map.bounds.maxX - map.bounds.minX > 200 || map.bounds.maxZ - map.bounds.minZ > 200;
  const CHUNK = 64;
  const CULL = 150;
  const chunkMeshes: THREE.Mesh[] = [];

  for (const b of map.blocks) {
    if (b.hidden || b.door) continue;
    addBlock(b, byKey);
  }

  function addBlock(b: Block, byKey: Batch) {
    const w = b.max[0] - b.min[0];
    const h = b.max[1] - b.min[1];
    const d = b.max[2] - b.min[2];
    const cx = (b.min[0] + b.max[0]) / 2;
    const cy = (b.min[1] + b.max[1]) / 2;
    const cz = (b.min[2] + b.max[2]) / 2;
    const g = new THREE.BoxGeometry(w, h, d);
    const s = SCALE[b.mat];
    if (s > 0) worldUVs(g, s, b.rot ? 0 : cx, b.rot ? 0 : cy, b.rot ? 0 : cz);
    if (b.rot) g.rotateX(b.rot[0]).rotateY(b.rot[1]).rotateZ(b.rot[2]);
    g.translate(cx, cy, cz);
    g.clearGroups();
    // variação de brilho por bloco: vira cor de vértice (um material só para todos os tons)
    const shaded = b.shade !== undefined;
    if (shaded) {
      const n = g.getAttribute('position').count;
      const arr = new Float32Array(n * 3).fill(b.shade!);
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    }
    const chunk = big ? `${Math.floor(cx / CHUNK)},${Math.floor(cz / CHUNK)}` : '';
    const key = `${b.mat}:${b.tint ?? ''}:${chunk}${shaded ? ':s' : ''}`;
    let e = byKey.get(key);
    if (!e) byKey.set(key, (e = { mat: b.mat, tint: b.tint, shaded, geos: [] }));
    e.geos.push(g);
  }

  const materials: THREE.Material[] = [];
  const lavaMats: AnyMat[] = [];
  const snowMats: { mat: AnyMat; base: THREE.Color; amount: number }[] = [];
  // Junta os blocos de mesmo material numa malha só (poucas chamadas de desenho).
  function mergeInto(batch: Batch, target: THREE.Group, isStatic: boolean) {
    for (const e of batch.values()) {
      const geo = mergeGeometries(e.geos, false);
      e.geos.forEach((g) => g.dispose());
      const m = makeMaterial(e.mat, e.tint, tex, q.simpleMaterials, e.shaded);
      materials.push(m);
      if (e.mat === 'lava') lavaMats.push(m);
      if (SNOWY.has(e.mat)) snowMats.push({ mat: m, base: m.color.clone(), amount: e.mat === 'dirt' || e.mat === 'mud' || e.mat === 'sandbag' ? 0.92 : e.mat === 'roof' ? 0.8 : 0.55 });
      const mesh = new THREE.Mesh(geo, m);
      mesh.castShadow = q.shadows && !NO_SHADOW.has(e.mat);
      mesh.receiveShadow = q.shadows && e.mat !== 'lava' && e.mat !== 'lamp';
      if (isStatic) {
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
      }
      if (big) {
        geo.computeBoundingSphere();
        chunkMeshes.push(mesh);
      }
      target.add(mesh);
    }
  }
  mergeInto(byKey, group, true);

  // portas e entulhos: um grupo por porta, para poder afundar e esconder quando abrir
  const doorGroups = new Map<string, { group: THREE.Group; t: number; opening: boolean }>();
  for (const d of map.doors) {
    const batch: Batch = new Map();
    for (const b of map.blocks) if (b.door === d.id && !b.hidden) addBlock(b, batch);
    const g = new THREE.Group();
    mergeInto(batch, g, false);
    group.add(g);
    doorGroups.set(d.id, { group: g, t: 0, opening: false });
  }

  // placas
  const neon: { mat: THREE.MeshBasicMaterial; seed: number }[] = [];
  for (const s of map.signs) {
    if (s.chalk) {
      const cm = new THREE.MeshLambertMaterial({ map: chalkTexture(s.chalk, s.text), transparent: true, alphaTest: 0.04, depthWrite: false });
      materials.push(cm);
      const cmesh = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), cm);
      cmesh.position.set(s.pos[0], s.pos[1], s.pos[2]);
      cmesh.rotation.y = Math.atan2(s.normal[0], s.normal[1]);
      group.add(cmesh);
      continue;
    }
    const t = signTexture(s.text, s.fg, s.bg, s.w, s.h, !!s.glow);
    const m = s.glow
      ? new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(1.3, 1.3, 1.3) })
      : q.simpleMaterials
        ? new THREE.MeshLambertMaterial({ map: t })
        : new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 });
    if (s.glow) neon.push({ mat: m as THREE.MeshBasicMaterial, seed: Math.random() * 100 });
    materials.push(m);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), m);
    mesh.position.set(s.pos[0], s.pos[1], s.pos[2]);
    mesh.rotation.y = Math.atan2(s.normal[0], s.normal[1]);
    (s.door ? doorGroups.get(s.door)?.group ?? group : group).add(mesh);
  }

  // Luzes pontuais: um número fixo de "vagas" que acompanham as fontes mais próximas da câmera.
  // Cada luz custa em todo pixel desenhado, e trocar a quantidade recompila os shaders; assim o custo é fixo.
  const sources = map.lights.map((l) => ({ def: l, seed: Math.random() * 100, d: 0 }));
  const slots: { light: THREE.PointLight; src: (typeof sources)[number] | null }[] = [];
  for (let i = 0; i < Math.min(q.lights, sources.length); i++) {
    const light = new THREE.PointLight(0xffffff, 0, 10, 2);
    group.add(light);
    slots.push({ light, src: null });
  }
  let assignT = 0;
  function assignLights(cam: THREE.Vector3) {
    for (const s of sources) s.d = Math.hypot(s.def.pos[0] - cam.x, s.def.pos[1] - cam.y, s.def.pos[2] - cam.z) - s.def.distance * 0.5;
    const best = [...sources].sort((a, b) => a.d - b.d).slice(0, slots.length);
    // mantém nas mesmas vagas as fontes que continuam entre as mais próximas (evita piscar)
    const free = slots.filter((sl) => !sl.src || !best.includes(sl.src));
    for (const src of best) {
      if (slots.some((sl) => sl.src === src)) continue;
      const sl = free.shift()!;
      sl.src = src;
      sl.light.color.setHex(src.def.color);
      sl.light.distance = src.def.distance;
      sl.light.position.set(src.def.pos[0], src.def.pos[1], src.def.pos[2]);
    }
  }

  // céu: gradiente esfumaçado com um brilho de sol baixo atrás da névoa
  const sunDir = SKY_SUN_DIR.clone();
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(map.sky?.top ?? 0x2a1a12) },
      horizon: { value: new THREE.Color(map.fogColor ?? FOG_COLOR) },
      sun: { value: new THREE.Color(map.sky?.sun ?? 0xff8a3a) },
      sunDir: { value: sunDir },
      warm: { value: new THREE.Color(map.sky?.warm ?? 0x000000) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top; uniform vec3 horizon; uniform vec3 sun; uniform vec3 sunDir; uniform vec3 warm;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y, 0.0, 1.0);
        vec3 c = mix(horizon, top, pow(h, 0.55));
        // faixa laranja-avermelhada logo acima do horizonte (a base continua na cor da névoa, sem emenda)
        c += warm * smoothstep(0.0, 0.07, h) * (1.0 - smoothstep(0.07, 0.34, h));
        float s = max(dot(normalize(vDir), sunDir), 0.0);
        c += sun * (pow(s, 24.0) * 0.55 + pow(s, 4.0) * 0.12);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), skyMat);
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  group.add(sky);
  materials.push(skyMat);

  const stopFog = new THREE.Color(map.fogColor ?? FOG_COLOR);
  const roadFog = new THREE.Color(map.fogRoadColor ?? map.fogColor ?? FOG_COLOR);
  scene.fog = new THREE.FogExp2(stopFog.getHex(), FOG_DENSITY);
  scene.background = stopFog.clone();

  // com menos luzes pontuais, um pouco mais de luz ambiente compensa
  const hemi = new THREE.HemisphereLight(0xc49a78, 0x4a3426, q.lights < 4 ? 2.3 : 1.9);
  group.add(hemi);
  const sunLight = new THREE.DirectionalLight(0xffa868, 2.4);
  sunLight.position.copy(sunDir).multiplyScalar(70);
  sunLight.castShadow = q.shadows;
  sunLight.shadow.mapSize.set(q.shadowSize, q.shadowSize);
  const sc = sunLight.shadow.camera;
  sc.left = sc.bottom = -60;
  sc.right = sc.top = 60;
  sc.near = 1;
  sc.far = 180;
  sunLight.shadow.bias = -0.0005;
  sunLight.shadow.normalBias = 0.04;
  group.add(sunLight);
  group.add(sunLight.target);

  scene.add(group);
  let lastT = 0;
  // centro da área coberta pela sombra (segue o jogador)
  const shadowCenter = new THREE.Vector3(0, 0, 0);
  let shadowDirty = false;
  let fogBase = map.fogDensity ?? FOG_DENSITY;
  let fogRoad = 0;
  let powerK = map.perksNeedPower ? 0.08 : 1;
  let snowK = 0;
  let groundK = 0;
  let skyFlashK = 0;
  let dimK = 0;
  // geradores: alvo (ligado ou não) e valor suavizado de cada um
  let genOn: boolean[] = [];
  const genK: number[] = [];

  // valores normais, para misturar com o clima infernal
  const base = {
    fog: stopFog.clone(),
    top: skyMat.uniforms.top.value.clone() as THREE.Color,
    sun: skyMat.uniforms.sun.value.clone() as THREE.Color,
    hemi: hemi.color.clone(),
    hemiI: hemi.intensity,
    sunLight: sunLight.color.clone(),
    sunI: sunLight.intensity,
  };
  const fogColor = stopFog.clone();
  const fog = scene.fog as THREE.FogExp2;
  const bg = scene.background as THREE.Color;
  let moodKey = '';

  return {
    group,
    fogColor,
    get fogDensity() {
      return fog.density;
    },
    setFogBase(d: number, road = 0) {
      if (Math.abs(d - fogBase) < 1e-5 && Math.abs(road - fogRoad) < 1e-3) return;
      fogBase = d;
      fogRoad = road;
      base.fog.copy(stopFog).lerp(roadFog, road).lerp(SNOW_FOG, snowK);
      moodKey = '';
    },
    setPower(on: boolean) {
      powerK = on || !map.perksNeedPower ? 1 : 0.08;
    },
    setGens(on: boolean[]) {
      genOn = on;
    },
    setSnow(k: number, ground = k) {
      k = Math.max(0, Math.min(1, k));
      ground = Math.max(0, Math.min(1, ground));
      if (Math.abs(ground - groundK) >= 0.004) {
        groundK = ground;
        for (const m of snowMats) {
          m.mat.color.copy(m.base).lerp(SNOW_COLOR, ground * m.amount);
          // um brilho próprio leve: a neve aparece mesmo na sombra e sob a luz alaranjada
          m.mat.emissive.setRGB(0.5, 0.52, 0.56).multiplyScalar(ground * m.amount * 0.22);
        }
      }
      if (Math.abs(k - snowK) < 0.004) return;
      snowK = k;
      base.fog.copy(stopFog).lerp(roadFog, fogRoad).lerp(SNOW_FOG, k);
      moodKey = '';
    },
    // clarão do céu (relâmpago da Trincheira): sol, luz ambiente e névoa acendem juntos
    setSkyFlash(k: number) {
      k = Math.max(0, Math.min(1, k));
      if (Math.abs(k - skyFlashK) < 0.004) return;
      skyFlashK = k;
      moodKey = '';
    },
    setDim(k: number) {
      k = Math.max(0, Math.min(1, k));
      if (Math.abs(k - dimK) < 0.004) return;
      dimK = k;
      moodKey = '';
    },
    takeShadowDirty() {
      const d = shadowDirty;
      shadowDirty = false;
      return d;
    },
    setMood(hell: number, flash: number) {
      const key = hell.toFixed(3) + ':' + flash.toFixed(3) + ':' + skyFlashK.toFixed(2);
      if (key === moodKey) return;
      moodKey = key;
      fogColor.copy(base.fog).lerp(HELL.fog, hell);
      // clarão do raio: a névoa acende em laranja
      if (flash > 0) fogColor.lerp(new THREE.Color(0xff8a40), flash * 0.35);
      if (skyFlashK > 0) fogColor.lerp(SKY_FLASH, skyFlashK * 0.45);
      fog.color.copy(fogColor);
      fog.density = fogBase + (HELL.density - FOG_DENSITY) * hell;
      bg.copy(fogColor);
      skyMat.uniforms.horizon.value.copy(fogColor);
      skyMat.uniforms.top.value.copy(base.top).lerp(HELL.top, hell);
      skyMat.uniforms.sun.value.copy(base.sun).lerp(HELL.sun, hell);
      hemi.color.copy(base.hemi).lerp(HELL.hemi, hell);
      hemi.intensity = (base.hemiI * (1 - 0.15 * hell) + flash * 2.5 + skyFlashK * 2.2) * (1 - 0.4 * dimK);
      sunLight.color.copy(base.sunLight).lerp(HELL.sunLight, hell);
      sunLight.intensity = base.sunI * (1 - 0.35 * hell) * (1 - 0.8 * dimK) + skyFlashK * 3.2;
    },
    setDoors(open: string[]) {
      for (const id of open) {
        const d = doorGroups.get(id);
        if (d && !d.opening) {
          d.opening = true;
          // shadow map é estática: precisa ser refeita sem a porta (a Game cuida disso)
        }
      }
    },
    update(t: number, cam: THREE.Vector3) {
      // céu sempre em volta da câmera
      sky.position.set(cam.x, 0, cam.z);
      if (big) {
        // pedaços longe demais (a névoa já esconde) não são desenhados
        for (const m of chunkMeshes) {
          const s = m.geometry.boundingSphere!;
          m.visible = Math.hypot(s.center.x - cam.x, s.center.z - cam.z) - s.radius < CULL;
        }
      }
      // a sombra acompanha o jogador: recentra e pede um novo desenho a cada 30 m
      if (q.shadows && Math.hypot(cam.x - shadowCenter.x, cam.z - shadowCenter.z) > 30) {
        shadowCenter.set(cam.x, 0, cam.z);
        sunLight.position.copy(sunDir).multiplyScalar(70).add(shadowCenter);
        sunLight.target.position.copy(shadowCenter);
        sunLight.target.updateMatrixWorld();
        shadowDirty = true;
      }
      const dt = Math.min(0.1, Math.max(0, t - lastT));
      lastT = t;
      for (const d of doorGroups.values()) {
        if (!d.opening || !d.group.visible) continue;
        d.t += dt;
        d.group.position.y = -2.8 * Math.min(1, (d.t / 1.2) ** 2);
        d.group.position.x = Math.sin(d.t * 40) * 0.03 * (1 - Math.min(1, d.t));
        if (d.t > 1.2) d.group.visible = false;
      }
      if (t >= assignT) {
        assignT = t + 0.25;
        assignLights(cam);
      }
      for (const sl of slots) {
        if (!sl.src) continue;
        const k = sl.src.seed;
        const kind = sl.src.def.kind;
        let f = 1;
        if (kind === 'fire') f = 0.75 + 0.18 * Math.sin(t * 13 + k) + 0.12 * Math.sin(t * 27.3 + k * 2) + 0.08 * Math.sin(t * 5.1 + k);
        else if (kind === 'lava') f = 0.85 + 0.15 * Math.sin(t * 1.3 + k);
        else if (kind === 'lamp') f = Math.sin(t * 0.7 + k) > 0.97 ? 0.15 : 1;
        else if (kind === 'interior') f = 0.92 + 0.08 * Math.sin(t * 9 + k) * Math.sin(t * 3.1);
        const gi = sl.src.def.gen;
        const gk = gi === undefined ? 1 : genK[gi] ?? 0.06;
        sl.light.intensity = sl.src.def.intensity * f * (sl.src.def.perk ? powerK : 1) * gk;
      }
      for (let i = 0; i < genOn.length; i++) {
        const target = genOn[i] ? 1 : 0.06;
        genK[i] = (genK[i] ?? 0.06) + (target - (genK[i] ?? 0.06)) * Math.min(1, dt * 2.5);
      }
      for (const m of lavaMats) {
        m.emissiveIntensity = 2.1 + 0.5 * Math.sin(t * 1.7);
        m.emissiveMap!.offset.set(t * 0.012, t * 0.007);
      }
      for (const n of neon) {
        const flick = Math.sin(t * 2.3 + n.seed) > 0.985 || Math.sin(t * 31 + n.seed) > 0.995 ? 0.25 : 1.3;
        n.mat.color.setScalar(flick);
      }
    },
    dispose() {
      scene.remove(group);
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      materials.forEach((m) => m.dispose());
    },
  };
}
