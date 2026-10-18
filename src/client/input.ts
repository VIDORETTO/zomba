// Estado de teclado e mouse por quadro. Códigos de tecla = KeyboardEvent.code; mouse = 'Mouse0'...
export class Input {
  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>();
  private readonly released = new Set<string>();
  private dx = 0;
  private dy = 0;
  locked = false;
  onUnlock: (() => void) | null = null;

  // alwaysActive: aceita teclas sem o mouse capturado (testes automáticos)
  constructor(private readonly el: HTMLElement, private readonly alwaysActive = false) {
    window.addEventListener('keydown', this.kd);
    window.addEventListener('keyup', this.ku);
    window.addEventListener('mousedown', this.md);
    window.addEventListener('mouseup', this.mu);
    window.addEventListener('mousemove', this.mm);
    window.addEventListener('wheel', this.wh, { passive: true });
    window.addEventListener('blur', this.blur);
    window.addEventListener('contextmenu', this.ctx);
    document.addEventListener('pointerlockchange', this.plc);
  }

  private kd = (e: KeyboardEvent) => {
    if (!this.locked && !this.alwaysActive) return;
    if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
    if (!e.repeat) {
      this.down.add(e.code);
      this.pressed.add(e.code);
    }
  };
  private ku = (e: KeyboardEvent) => {
    this.down.delete(e.code);
    this.released.add(e.code);
  };
  private md = (e: MouseEvent) => {
    if (!this.locked && !this.alwaysActive) return;
    const k = `Mouse${e.button}`;
    this.down.add(k);
    this.pressed.add(k);
  };
  private mu = (e: MouseEvent) => {
    const k = `Mouse${e.button}`;
    this.down.delete(k);
    this.released.add(k);
  };
  private mm = (e: MouseEvent) => {
    if (!this.locked) return;
    this.dx += e.movementX;
    this.dy += e.movementY;
  };
  private wh = (e: WheelEvent) => {
    if (!this.locked && !this.alwaysActive) return;
    if (e.deltaY !== 0) this.pressed.add(e.deltaY > 0 ? 'WheelDown' : 'WheelUp');
  };
  private blur = () => this.down.clear();
  private ctx = (e: Event) => e.preventDefault();
  private plc = () => {
    this.locked = document.pointerLockElement === this.el;
    if (!this.locked) {
      this.down.clear();
      this.onUnlock?.();
    }
  };

  lock() {
    const p = this.el.requestPointerLock() as unknown as Promise<void> | undefined;
    p?.catch?.(() => {});
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  isDown(code: string) {
    return this.down.has(code);
  }
  wasPressed(code: string) {
    return this.pressed.has(code);
  }
  wasReleased(code: string) {
    return this.released.has(code);
  }

  mouse(): [number, number] {
    const r: [number, number] = [this.dx, this.dy];
    this.dx = 0;
    this.dy = 0;
    return r;
  }

  endFrame() {
    this.pressed.clear();
    this.released.clear();
  }

  dispose() {
    window.removeEventListener('keydown', this.kd);
    window.removeEventListener('keyup', this.ku);
    window.removeEventListener('mousedown', this.md);
    window.removeEventListener('mouseup', this.mu);
    window.removeEventListener('mousemove', this.mm);
    window.removeEventListener('wheel', this.wh);
    window.removeEventListener('blur', this.blur);
    window.removeEventListener('contextmenu', this.ctx);
    document.removeEventListener('pointerlockchange', this.plc);
  }
}
