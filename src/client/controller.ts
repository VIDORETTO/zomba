import * as THREE from 'three';
import { PLAYER, TRINCHEIRA, ZOMBIE } from '../shared/constants';
import { clamp, lerp } from '../shared/rng';
import type { World } from '../shared/world';
import type { Input } from './input';
import { TANK_BODY, busCollide, busGround, standingIn, toLocal, toWorld, type BusPose } from '../shared/busBody';

export interface ControllerFlags {
  ads: boolean;
  blockSprint: boolean;
  downed: boolean;
  frozen: boolean;
}

// Movimento em primeira pessoa no estilo dos FPS clássicos: aceleração rápida,
// corrida com fôlego limitado, degrau automático e zumbis como obstáculos sólidos.
export class PlayerController {
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  onGround = true;
  crouched = false;
  crouchT = 0;
  sprinting = false;
  stamina = PLAYER.sprintTime;
  // multiplicadores das bebidas (Passo Firme)
  mods = { sprintSpeed: 1, stamina: 1 };
  // arma pesada na mão (Metralhadora de Tripé: 0,9): anda e corre mais devagar
  weaponMove = 1;
  private sprintLock = 0;
  // corrente do Carrasco: arrastado até perto dele
  private pullTo: { x: number; z: number; stop: number; t: number } | null = null;
  // ônibus do mapa Rota (pose atual e a do quadro anterior, para levar quem está dentro)
  private bus: BusPose | null = null;
  private prevBus: BusPose | null = null;
  // tanque da Trincheira (mesma ideia do ônibus, com as medidas do tanque)
  private tank: BusPose | null = null;
  private prevTank: BusPose | null = null;
  // lama (Trincheira): devolve se o ponto é de lama; anda 30% mais devagar e pula menos
  mudAt: ((x: number, z: number) => boolean) | null = null;
  inMud = false;

  setBus(b: BusPose | null) {
    this.bus = b ? { ...b } : null;
  }

  setTank(b: BusPose | null) {
    this.tank = b ? { ...b } : null;
  }

  // o jogador está em pé em cima do tanque
  get onTank() {
    return !!this.tank && standingIn(this.tank, this.pos.x, this.pos.y, this.pos.z, TANK_BODY);
  }
  bobPhase = 0;
  bobAmount = 0;
  stepSmooth = 0;
  landKick = 0;
  downT = 0;
  speed2d = 0;
  onStep: (() => void) | null = null;
  onLand: ((impact: number) => void) | null = null;
  private lastStepPhase = 0;

  constructor(private readonly world: World) {}

  spawn(x: number, z: number, yaw: number) {
    this.pos.set(x, this.world.groundHeight(x, z, PLAYER.radius, 1), z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.crouched = false;
    this.stamina = PLAYER.sprintTime;
  }

  get height() {
    return lerp(PLAYER.height, PLAYER.crouchHeight, this.crouchT);
  }

  get eyeHeight() {
    const e = lerp(PLAYER.eye, PLAYER.crouchEye, this.crouchT);
    return lerp(e, PLAYER.downedEye, this.downT);
  }

  look(dx: number, dy: number, sens: number) {
    this.yaw -= dx * sens;
    this.pitch = clamp(this.pitch - dy * sens, -1.52, 1.52);
  }

  // A corrente do Carrasco pegou: arrasta em linha reta até ficar a `stop` metros dele.
  pull(x: number, z: number, stop: number) {
    this.pullTo = { x, z, stop, t: 0 };
  }

  get pulled() {
    return this.pullTo !== null;
  }

  update(dt: number, input: Input, f: ControllerFlags, zombies: { x: number; y: number; z: number }[]) {
    this.downT = lerp(this.downT, f.downed ? 1 : 0, 1 - Math.exp(-dt * 6));
    // dentro do ônibus: anda e gira junto com ele
    if (this.bus && this.prevBus && standingIn(this.prevBus, this.pos.x, this.pos.y, this.pos.z)) {
      const [lx, lz] = toLocal(this.prevBus, this.pos.x, this.pos.z);
      [this.pos.x, this.pos.z] = toWorld(this.bus, lx, lz);
      let dy = this.bus.yaw - this.prevBus.yaw;
      if (dy > Math.PI) dy -= Math.PI * 2;
      if (dy < -Math.PI) dy += Math.PI * 2;
      this.yaw += dy;
    }
    this.prevBus = this.bus ? { ...this.bus } : null;
    // em cima do tanque: vai junto com ele
    if (this.tank && this.prevTank && standingIn(this.prevTank, this.pos.x, this.pos.y, this.pos.z, TANK_BODY)) {
      const [lx, lz] = toLocal(this.prevTank, this.pos.x, this.pos.z);
      [this.pos.x, this.pos.z] = toWorld(this.tank, lx, lz);
      let dy = this.tank.yaw - this.prevTank.yaw;
      if (dy > Math.PI) dy -= Math.PI * 2;
      if (dy < -Math.PI) dy += Math.PI * 2;
      this.yaw += dy;
    }
    this.prevTank = this.tank ? { ...this.tank } : null;
    this.inMud = !!this.mudAt && this.onGround && this.pos.y < 0.3 && this.mudAt(this.pos.x, this.pos.z);
    // caído ainda se arrasta, mas sem agachar, correr nem pular
    const frozen = f.frozen;
    const down = f.downed;
    if (down) this.crouched = false;

    if (!frozen && !down && input.hit('crouch')) this.crouched = !this.crouched;
    const wantCrouch = !frozen && !down && (this.crouched || input.held('crouchHold'));
    this.crouchT = lerp(this.crouchT, wantCrouch ? 1 : 0, 1 - Math.exp(-dt * 12));

    let fwd = 0;
    let str = 0;
    if (!frozen) {
      if (input.held('forward')) fwd += 1;
      if (input.held('back')) fwd -= 1;
      if (input.held('right')) str += 1;
      if (input.held('left')) str -= 1;
    }
    const sy = Math.sin(this.yaw);
    const cy = Math.cos(this.yaw);
    let wx = -sy * fwd + cy * str;
    let wz = -cy * fwd - sy * str;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) {
      wx /= wl;
      wz /= wl;
    }

    this.sprintLock = Math.max(0, this.sprintLock - dt);
    const sprintKey = input.held('sprint');
    if (sprintKey && wantCrouch && fwd > 0) this.crouched = false;
    const canSprint = sprintKey && fwd > 0 && !down && !wantCrouch && !f.ads && !f.blockSprint && this.onGround && this.sprintLock <= 0;
    if (canSprint && this.stamina > 0) {
      this.sprinting = true;
      this.stamina -= dt;
      if (this.stamina <= 0) {
        this.stamina = 0;
        this.sprintLock = 1.2;
      }
    } else {
      if (this.sprinting && !this.onGround) {
        // mantém a corrida no ar
      } else {
        this.sprinting = false;
      }
      const maxStamina = PLAYER.sprintTime * this.mods.stamina;
      this.stamina = Math.min(maxStamina, this.stamina + (dt * maxStamina) / PLAYER.sprintRecover);
    }

    let speed = PLAYER.walkSpeed;
    if (this.sprinting) speed = PLAYER.sprintSpeed * this.mods.sprintSpeed;
    else if (wantCrouch) speed = PLAYER.crouchSpeed;
    if (f.ads && !this.sprinting) speed = Math.min(speed, PLAYER.adsSpeed);
    if (fwd < 0) speed *= 0.85;
    if (down) speed = PLAYER.crawlSpeed;
    speed *= this.weaponMove;
    // lama da Terra de Ninguém: 30% mais devagar
    if (this.inMud) speed *= TRINCHEIRA.mudMult;

    const tx = wx * speed;
    const tz = wz * speed;
    if (this.onGround) {
      const dx = tx - this.vel.x;
      const dz = tz - this.vel.z;
      const dl = Math.hypot(dx, dz);
      const maxD = PLAYER.accel * dt;
      if (dl <= maxD) {
        this.vel.x = tx;
        this.vel.z = tz;
      } else {
        this.vel.x += (dx / dl) * maxD;
        this.vel.z += (dz / dl) * maxD;
      }
    } else {
      const k = Math.min(1, PLAYER.airAccel * dt * 0.4);
      if (wl > 0) {
        this.vel.x += (tx - this.vel.x) * k;
        this.vel.z += (tz - this.vel.z) * k;
      }
    }

    if (!frozen && !down && input.hit('jump') && this.onGround) {
      if (this.crouchT > 0.5) {
        this.crouched = false;
      } else {
        this.vel.y = PLAYER.jumpVelocity * (this.inMud ? TRINCHEIRA.mudJump : 1);
        this.onGround = false;
      }
    }
    if (this.pullTo) {
      const p = this.pullTo;
      p.t += dt;
      const dx = p.x - this.pos.x;
      const dz = p.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d <= p.stop || p.t > 1.2 || f.downed) {
        this.pullTo = null;
        this.vel.x *= 0.2;
        this.vel.z *= 0.2;
      } else {
        this.vel.x = (dx / d) * 15;
        this.vel.z = (dz / d) * 15;
        this.sprinting = false;
      }
    }
    this.vel.y -= PLAYER.gravity * dt;
    if (frozen) {
      this.vel.x = 0;
      this.vel.z = 0;
    }

    const travel = Math.hypot(this.vel.x, this.vel.y, this.vel.z) * dt;
    const steps = Math.max(1, Math.ceil(travel / 0.15));
    const sdt = dt / steps;
    const wasGround = this.onGround;
    let fallSpeed = 0;
    for (let i = 0; i < steps; i++) {
      this.pos.x += this.vel.x * sdt;
      this.pos.z += this.vel.z * sdt;
      this.pos.y += this.vel.y * sdt;
      this.world.collideCylinder(this.pos, PLAYER.radius, this.height);
      if (this.bus) busCollide(this.bus, this.pos, PLAYER.radius);
      if (this.tank) busCollide(this.tank, this.pos, PLAYER.radius, TANK_BODY);
      this.pushOutOfZombies(zombies);

      let g = this.world.groundHeight(this.pos.x, this.pos.z, PLAYER.radius, this.pos.y);
      if (this.bus) g = Math.max(g, busGround(this.bus, this.pos.x, this.pos.z, PLAYER.radius, this.pos.y, PLAYER.stepHeight));
      if (this.tank) g = Math.max(g, busGround(this.tank, this.pos.x, this.pos.z, PLAYER.radius, this.pos.y, PLAYER.stepHeight, TANK_BODY));
      if (this.pos.y <= g) {
        if (this.onGround && g - this.pos.y > 0.02) this.stepSmooth -= g - this.pos.y;
        if (!this.onGround) fallSpeed = -this.vel.y;
        this.pos.y = g;
        this.vel.y = 0;
        this.onGround = true;
      } else if (this.onGround && this.vel.y <= 0 && this.pos.y - g < 0.35) {
        this.stepSmooth += this.pos.y - g;
        this.pos.y = g;
        this.vel.y = 0;
      } else {
        this.onGround = false;
      }
      const ceil = this.world.ceiling(this.pos.x, this.pos.z, PLAYER.radius, this.pos.y, this.height);
      if (this.pos.y + this.height > ceil) {
        this.pos.y = ceil - this.height;
        if (this.vel.y > 0) this.vel.y = 0;
      }
    }
    if (!wasGround && this.onGround) {
      this.landKick = Math.min(1, fallSpeed / 9);
      this.onLand?.(fallSpeed);
    }

    this.stepSmooth = lerp(this.stepSmooth, 0, 1 - Math.exp(-dt * 14));
    this.landKick = lerp(this.landKick, 0, 1 - Math.exp(-dt * 7));

    this.speed2d = Math.hypot(this.vel.x, this.vel.z);
    const moving = this.onGround ? clamp(this.speed2d / PLAYER.walkSpeed, 0, 1.5) : 0;
    this.bobAmount = lerp(this.bobAmount, moving, 1 - Math.exp(-dt * 8));
    this.bobPhase += dt * this.speed2d * (this.sprinting ? 1.45 : 1.7);
    const stepPhase = Math.floor(this.bobPhase / Math.PI);
    if (stepPhase !== this.lastStepPhase) {
      this.lastStepPhase = stepPhase;
      if (this.onGround && this.speed2d > 1.2 && !wantCrouch) this.onStep?.();
    }
  }

  private pushOutOfZombies(zombies: { x: number; y: number; z: number }[]) {
    const r = PLAYER.radius + ZOMBIE.radius;
    for (const z of zombies) {
      if (Math.abs(z.y - this.pos.y) > 1.5) continue;
      const dx = this.pos.x - z.x;
      const dz = this.pos.z - z.z;
      const d = Math.hypot(dx, dz);
      if (d >= r || d < 1e-5) continue;
      this.pos.x += (dx / d) * (r - d);
      this.pos.z += (dz / d) * (r - d);
      this.world.collideCylinder(this.pos, PLAYER.radius, this.height);
    }
  }

  applyCamera(cam: THREE.PerspectiveCamera, t: number) {
    const bob = this.bobAmount * (1 - this.downT);
    const by = Math.abs(Math.sin(this.bobPhase)) * 0.045 * bob * (this.sprinting ? 1.5 : 1);
    const bx = Math.cos(this.bobPhase) * 0.03 * bob;
    const breathe = Math.sin(t * 1.5) * 0.004;
    cam.position.set(
      this.pos.x + Math.cos(this.yaw) * bx,
      this.pos.y + this.eyeHeight + by + this.stepSmooth - this.landKick * 0.12 + breathe,
      this.pos.z - Math.sin(this.yaw) * bx,
    );
    cam.rotation.order = 'YXZ';
    cam.rotation.y = this.yaw;
    cam.rotation.x = this.pitch - this.landKick * 0.04;
    cam.rotation.z = Math.cos(this.bobPhase) * 0.004 * bob + this.downT * 0.25;
  }
}
