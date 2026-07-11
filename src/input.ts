import { clamp01, type Vec2 } from "./math";
import { TiltControl } from "./tilt";

export type ControlMode = "stick" | "tilt";

export interface InputState {
  turn: number; // -1..1 (positive = turn right / clockwise)
  thrust: number; // 0..1
  boost: boolean;
  /**
   * Touch: desired world-space heading (rad). The ship auto-rotates toward it
   * and `thrust` is the stick magnitude, so any drag direction accelerates —
   * a thumb arcing sideways-and-down still means "go that way", unlike the
   * old drag-up-to-thrust mapping. null on keyboard.
   */
  heading: number | null;
  /**
   * Tilt mode: desired velocity as a fraction of max speed, world axes.
   * When set, the ship flies Tilt to Live style (no inertia) and
   * turn/thrust/heading are ignored. null in classic (keyboard/stick) mode.
   */
  moveVector: Vec2 | null;
  /**
   * Classic-mode inertia toggle (settings). When false, keyboard/stick runs
   * use direct velocity control (tilt rules) — such runs score as "tilt".
   * Ignored in tilt mode, which is always direct.
   */
  inertia: boolean;
}

export interface TouchStickView {
  active: boolean;
  originX: number;
  originY: number;
  stickX: number;
  stickY: number;
  boostActive: boolean;
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
  private boostTouchId: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private stickPos = { x: 0, y: 0 };
  touchUsed = false;

  readonly tilt = new TiltControl();
  /** Player preference; tilt only takes effect once the sensor is ready. */
  controlMode: ControlMode = "stick";
  /** Mirrors the settings toggle (main.ts keeps it in sync). */
  inertia = true;

  onPause: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === "Escape" || e.code === "KeyP") this.onPause?.();
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
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

  /** Tilt steers the ship, so touch is only used for boost (and pause). */
  get tiltActive(): boolean {
    return this.controlMode === "tilt" && this.tilt.ready;
  }

  private onTouchStart = (e: TouchEvent): void => {
    e.preventDefault();
    this.touchUsed = true;
    for (const t of Array.from(e.changedTouches)) {
      if (this.tiltActive) {
        // tilt mode: hold anywhere on screen to boost
        if (this.boostTouchId === null) this.boostTouchId = t.identifier;
      } else if (t.clientX < window.innerWidth / 2) {
        if (this.stickTouchId === null) {
          this.stickTouchId = t.identifier;
          this.stickOrigin = { x: t.clientX, y: t.clientY };
          this.stickPos = { x: t.clientX, y: t.clientY };
        }
      } else if (this.boostTouchId === null) {
        this.boostTouchId = t.identifier;
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
      if (t.identifier === this.boostTouchId) this.boostTouchId = null;
    }
  };

  sample(): InputState {
    let turn = 0;
    let thrust = 0;
    let boost = false;
    let heading: number | null = null;
    let moveVector: Vec2 | null = null;

    if (this.keys.has("ArrowLeft") || this.keys.has("KeyA")) turn -= 1;
    if (this.keys.has("ArrowRight") || this.keys.has("KeyD")) turn += 1;
    if (this.keys.has("ArrowUp") || this.keys.has("KeyW")) thrust = 1;
    if (this.keys.has("Space")) boost = true;

    if (this.tiltActive) {
      moveVector = this.tilt.vector();
      if (this.boostTouchId !== null) boost = true;
      return { turn: 0, thrust: 0, boost, heading: null, moveVector, inertia: this.inertia };
    }

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
    if (this.boostTouchId !== null) boost = true;

    return { turn, thrust, boost, heading, moveVector, inertia: this.inertia };
  }

  /** For rendering the virtual joystick overlay (hidden in tilt mode). */
  getTouchView(): TouchStickView {
    return {
      active: !this.tiltActive && this.stickTouchId !== null,
      originX: this.stickOrigin.x,
      originY: this.stickOrigin.y,
      stickX: this.stickPos.x,
      stickY: this.stickPos.y,
      boostActive: this.boostTouchId !== null,
    };
  }
}
