// Página de teste visual da camada "mundo" da Trincheira (só desenvolvimento): mapa real + TrincheiraClient com snapshots falsos.
// Uso: npx vite --port 5201 e abrir /tools/tr-harness.html; window.__h controla câmera, estado e eventos.
import * as THREE from 'three';
import { buildTrincheira } from '../src/shared/map/trincheira';
import { buildMapView } from '../src/client/mapView';
import { buildTextures } from '../src/client/textures';
import { QUALITY } from '../src/client/quality';
import { Hud } from '../src/client/hud';
import { TrincheiraClient } from '../src/client/trincheira';
import type { GameEvent, NetPlayer, Snapshot, TrincheiraSnap } from '../src/shared/protocol';
import '../src/client/styles.css';

const q = QUALITY.media;
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('app')!.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 500);
const map = buildTrincheira();
const tex = buildTextures();
const mv = buildMapView(map, tex, scene, { ...q, shadows: false, lights: 4 });
const hud = new Hud(document.getElementById('app')!);
const T = map.trincheira!;
const audioLog: string[] = [];
const audio = { trSound: (n: string) => audioLog.push(n), setWeather: (w: string) => audioLog.push('w:' + w) };
const client = new TrincheiraClient(scene, map, tex, { quality: q, audio, mapView: mv });
client.attachHud(hud);
client.setLocal('me', () => 'Aliado');

const me = {
  id: 'me', name: 'Eu', slot: 0, x: 100, y: 0, z: 45, yaw: 0, pitch: 0, crouch: false, speed: 0, life: 'alive', health: 100, points: 5000,
  kills: 0, headshots: 0, downs: 0, revives: 0, bleed: 0, revive: 0, maxHealth: 100, perks: [], selfRevives: 0, weapons: ['pistol'], grenades: 2,
  heavyKnife: false, sights: {}, level: 1, earned: 0, challenges: [10, 1, 0, 0], claimed: [false, false, false, false],
} as unknown as NetPlayer;

const tr: TrincheiraSnap = {
  gens: Array.from({ length: 6 }, () => ({ on: false, progress: 0, capturing: false, attacked: false })),
  weather: 'limpo', forjaUp: false,
  fizz: { loc: 0, state: 'idle', t: 0, uses: 0 },
  mounds: [0, 3, 7, 12, 19],
  tank: { x: T.tank.path[0][0], z: T.tank.path[0][1], yaw: 0, state: 'parado', stop: 'estacao', wait: 0, cooldown: 0 },
  robot: null, team: [], pick: [], drops: [], windOpen: false,
  build: { escudo: { built: false, bench: 0 }, drone: { built: false, bench: 0, state: 'banco', owner: '', t: 0, x: 0, y: 0, z: 0 } },
  portals: [false, false, false, false], disco: 0,
  staffs: (['fogo', 'gelo', 'vento', 'raio'] as const).map((el) => ({ el, st: 'faltando' as const, awake: false, owner: '', charge: 0, solved: false, puzzle: [0, 0, 0], seq: el === 'raio' ? [2, 5, 3] : [] })),
  tabua: 'cripta', tabuaCharge: 0, missao: { step: 0, count: 0, t: 0 }, recapture: false,
};
const snap = { time: 0, round: 1, startRound: 1, state: 'active', stateTimer: 0, hell: false, boss: null, ritual: null, bispo: null, power: false, bus: null, zombiesLeft: 0, boards: [], doors: [], projectiles: [], vortices: [], powerups: [], effects: { insta: 0, double: 0, firesale: 0 }, players: [me], zombies: [], tr } as unknown as Snapshot;

let t = 0;
let last = performance.now();
const frame = (now: number) => {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  t += dt * (api.speed as number);
  mv.update(t, camera.position);
  mv.setMood(0, 0);
  client.update(null, snap, dt * (api.speed as number), t, me, camera);
  hud.setRound(1);
  renderer.render(scene, camera);
};
const api = {
  speed: 1,
  tr, me, map, snap, audioLog, hud, client, mv,
  cam(x: number, y: number, z: number, yaw: number, pitch = 0) {
    camera.position.set(x, y, z);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(pitch, yaw, 0);
    me.x = x;
    me.z = z;
  },
  look(x: number, y: number, z: number, tx: number, ty: number, tz: number) {
    camera.position.set(x, y, z);
    camera.lookAt(tx, ty, tz);
    camera.rotation.order = 'YXZ';
    me.x = x;
    me.z = z;
  },
  event(e: GameEvent) {
    client.onEvent(e, { local: 'me', me });
  },
  ready: true,
};
(window as unknown as { __h: typeof api }).__h = api;
requestAnimationFrame(frame);
