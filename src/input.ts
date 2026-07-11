import { DIRECT, SHIP } from "./config";
import { clamp01, type Vec2 } from "./math";
import { DEFAULT_KEYBINDS, type KeyAction, type KeyBindings } from "./save";
import { TiltControl } from "./tilt";

export type ControlMode = "stick" | "tilt";

export interface InputState {
  turn: number; // -1..1 (positive = turn right / clockwise)
  thrust: number; // 0..1
  /**
   * Touch: desired world-space heading (rad). The ship auto-rotates toward it
   * and `thrust` is the stick magnitude, so any drag direction accelerates —
   * a thumb arcing sideways-and-down still means "go that way", unlike the
   * old drag-up-to-thrust mapping. null on keyboard.
   */
  heading: number | null;
  /**
   * Direct control: desired velocity as a fraction of max (tilt) or a unit
   * direction (keyboard/stick with inertia off). When set, turn/thrust/heading
   * are ignored and the ship flies without drift.
   */
  moveVector: Vec2 | null;
  /**
   * Inertia toggle (settings, flavor only). When false, keyboard/stick builds
   * a moveVector (directional WASD) instead of thrust-and-drift.
   */
  inertia: boolean;
  /** Flight speed for direct control (tilt passes the ship's max speed). */
  cruiseSpeed: number;
}

export interface TouchStickView {
  active: boolean;
  originX: number;
  originY: number;
  stickX: number;
  stickY: number;
}

const STICK_RANGE_PX = 60;
const STICK_DEADZONE_PX = 10;

/**
 * Keyboard + touch input. Keys are sampled per fixed tick from held state, so
 * inputs are never dropped (fixes the Unity Update/FixedUpdate race).
 */
export class Input {
  private keys = new Set<string>();
  private stickTouchId: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private stickPos = { x: 0, y: 0 };
  touchUsed = false;

  readonly tilt = new TiltControl();
  /** Player preference; tilt only takes effect once the sensor is ready. */
  controlMode: ControlMode = "stick";
  /** Mirrors the settings toggle (main.ts keeps it in sync). */
  inertia = false;
  /** Flight speed for directional no-inertia mode (from directSpeed setting). */
  cruiseSpeed = DIRECT.cruiseSpeed;
  /** Remappable keyboard bindings (main.ts keeps them in sync with localStorage). */
  bindings: KeyBindings = {
    up: [...DEFAULT_KEYBINDS.up],
    down: [...DEFAULT_KEYBINDS.down],
    left: [...DEFAULT_KEYBINDS.left],
    right: [...DEFAULT_KEYBINDS.right],
    pause: [...DEFAULT_KEYBINDS.pause],
  };

  onPause: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (this.pressed("pause")) this.onPause?.();
      // stop arrows/space (and any rebound equivalents) from scrolling the page
      if (this.isBound(e.code) || e.code.startsWith("Arrow") || e.code === "Space") {
        e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => this.keys.clear());

    canvas.addEventListener("touchstart", this.onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", this.onTouchMove, { passive: false });
    canvas.addEventListener("touchend", this.onTouchEnd, { passive: false });
    canvas.addEventListener("touchcancel", this.onTouchEnd, { passive: false });
  }

  setBindings(b: KeyBindings): void {
    this.bindings = {
      up: [...b.up],
      down: [...b.down],
      left: [...b.left],
      right: [...b.right],
      pause: [...b.pause],
    };
  }

  private pressed(action: KeyAction): boolean {
    return this.bindings[action].some((c) => this.keys.has(c));
  }

  private isBound(code: string): boolean {
    return (Object.keys(this.bindings) as KeyAction[]).some((a) =>
      this.bindings[a].includes(code),
    );
  }

  /** Tilt steers the ship; touch is only used for the pause button (DOM). */
  get tiltActive(): boolean {
    return this.controlMode === "tilt" && this.tilt.ready;
  }

  private onTouchStart = (e: TouchEvent): void => {
    e.preventDefault();
    this.touchUsed = true;
    if (this.tiltActive) return;
    // the stick spawns wherever the first finger lands — anywhere on screen
    for (const t of Array.from(e.changedTouches)) {
      if (this.stickTouchId === null) {
        this.stickTouchId = t.identifier;
        this.stickOrigin = { x: t.clientX, y: t.clientY };
        this.stickPos = { x: t.clientX, y: t.clientY };
      }
    }
  };

  private onTouchMove = (e: TouchEvent): void => {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.stickTouchId) {
        this.stickPos = { x: t.clientX, y: t.clientY };
        // follow-origin: if the finger overshoots the stick range, drag the
        // origin along so direction changes stay instantly responsive
        const dx = this.stickPos.x - this.stickOrigin.x;
        const dy = this.stickPos.y - this.stickOrigin.y;
        const dist = Math.hypot(dx, dy);
        if (dist > STICK_RANGE_PX) {
          const k = STICK_RANGE_PX / dist;
          this.stickOrigin = {
            x: this.stickPos.x - dx * k,
            y: this.stickPos.y - dy * k,
          };
        }
      }
    }
  };

  private onTouchEnd = (e: TouchEvent): void => {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.stickTouchId) this.stickTouchId = null;
    }
  };

  /** Stick drag as a world-space move vector (y up), magnitude 0..1. */
  private stickVector(): Vec2 | null {
    if (this.stickTouchId === null) return null;
    const dx = this.stickPos.x - this.stickOrigin.x;
    const dy = this.stickPos.y - this.stickOrigin.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= STICK_DEADZONE_PX) return { x: 0, y: 0 };
    const mag = clamp01((dist - STICK_DEADZONE_PX) / (STICK_RANGE_PX - STICK_DEADZONE_PX));
    // screen y grows downward, world y grows upward
    return { x: (dx / dist) * mag, y: (-dy / dist) * mag };
  }

  sample(): InputState {
    let turn = 0;
    let thrust = 0;
    let heading: number | null = null;
    let moveVector: Vec2 | null = null;

    if (this.tiltActive) {
      // tilt lean is analog, so it targets the full max speed by itself
      return {
        turn: 0,
        thrust: 0,
        heading: null,
        moveVector: this.tilt.vector(),
        inertia: this.inertia,
        cruiseSpeed: SHIP.maxSpeed,
      };
    }

    // Directional no-inertia: bound keys (and stick) map straight to velocity
    if (!this.inertia) {
      const stick = this.stickVector();
      if (stick) {
        moveVector = stick;
      } else {
        let mx = 0;
        let my = 0;
        if (this.pressed("left")) mx -= 1;
        if (this.pressed("right")) mx += 1;
        if (this.pressed("up")) my += 1;
        if (this.pressed("down")) my -= 1;
        const len = Math.hypot(mx, my);
        moveVector = len > 0 ? { x: mx / len, y: my / len } : { x: 0, y: 0 };
      }
      return {
        turn: 0,
        thrust: 0,
        heading: null,
        moveVector,
        inertia: false,
        cruiseSpeed: this.cruiseSpeed,
      };
    }

    if (this.pressed("left")) turn -= 1;
    if (this.pressed("right")) turn += 1;
    if (this.pressed("up")) thrust = 1;

    if (this.stickTouchId !== null) {
      const dx = this.stickPos.x - this.stickOrigin.x;
      const dy = this.stickPos.y - this.stickOrigin.y;
      const dist = Math.hypot(dx, dy);
      turn = 0;
      if (dist > STICK_DEADZONE_PX) {
        // screen y grows downward, world y grows upward
        heading = Math.atan2(-dy, dx);
        thrust = clamp01((dist - STICK_DEADZONE_PX) / (STICK_RANGE_PX - STICK_DEADZONE_PX));
      } else {
        thrust = 0;
      }
    }

    return {
      turn,
      thrust,
      heading,
      moveVector,
      inertia: true,
      cruiseSpeed: this.cruiseSpeed,
    };
  }

  /** For rendering the virtual joystick overlay (hidden in tilt mode). */
  getTouchView(): TouchStickView {
    return {
      active: !this.tiltActive && this.stickTouchId !== null,
      originX: this.stickOrigin.x,
      originY: this.stickOrigin.y,
      stickX: this.stickPos.x,
      stickY: this.stickPos.y,
    };
  }
}
