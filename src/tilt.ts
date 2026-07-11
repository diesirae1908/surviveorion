// Tilt controls (mobile only): wraps the deviceorientation sensor.
// Handles the iOS 13+ permission flow (must be requested from a user tap),
// neutral-attitude calibration, and remapping device tilt into screen axes so
// portrait and landscape both steer correctly.

import { TILT } from "./config";
import type { Vec2 } from "./math";

export interface TiltReading {
  beta: number; // front-back tilt, degrees
  gamma: number; // left-right tilt, degrees
}

export class TiltControl {
  private reading: TiltReading | null = null;
  private neutral: TiltReading | null = null;
  private listening = false;
  private granted = !TiltControl.needsPermission();

  static supported(): boolean {
    return typeof DeviceOrientationEvent !== "undefined";
  }

  /** iOS 13+ gates motion sensors behind an explicit permission dialog. */
  static needsPermission(): boolean {
    return (
      TiltControl.supported() &&
      typeof (DeviceOrientationEvent as unknown as { requestPermission?: unknown })
        .requestPermission === "function"
    );
  }

  /** True when the sensor is live and calibrated — safe to fly on. */
  get ready(): boolean {
    return this.listening && this.reading !== null && this.neutral !== null;
  }

  setNeutral(n: TiltReading | null): void {
    this.neutral = n;
  }

  /** Must be called from a user gesture on iOS; resolves true elsewhere. */
  async requestPermission(): Promise<boolean> {
    if (!TiltControl.supported()) return false;
    if (!TiltControl.needsPermission()) {
      this.granted = true;
      return true;
    }
    try {
      const r = await (
        DeviceOrientationEvent as unknown as { requestPermission(): Promise<string> }
      ).requestPermission();
      this.granted = r === "granted";
    } catch {
      this.granted = false;
    }
    return this.granted;
  }

  start(): void {
    if (this.listening || !this.granted || !TiltControl.supported()) return;
    this.listening = true;
    window.addEventListener("deviceorientation", this.onOrientation);
  }

  private onOrientation = (e: DeviceOrientationEvent): void => {
    // desktop browsers fire one event with nulls — ignore it
    if (typeof e.beta !== "number" || typeof e.gamma !== "number") return;
    this.reading = { beta: e.beta, gamma: e.gamma };
  };

  /** Capture the current attitude as "ship at rest". Null if no data yet. */
  calibrate(): TiltReading | null {
    if (this.reading) this.neutral = { ...this.reading };
    return this.reading ? this.neutral : null;
  }

  /**
   * Desired velocity as a fraction of max speed, in world axes (y up).
   * Deadzone absorbs resting-hand jitter; full speed at TILT.maxTiltDeg.
   */
  vector(): Vec2 | null {
    if (!this.reading || !this.neutral) return null;
    const db = this.reading.beta - this.neutral.beta;
    const dg = this.reading.gamma - this.neutral.gamma;

    // remap device-frame tilt into screen axes (sx = right, sy = down)
    let angle =
      screen.orientation?.angle ??
      (window as unknown as { orientation?: number }).orientation ??
      0;
    angle = ((angle % 360) + 360) % 360;
    let sx: number;
    let sy: number;
    if (angle === 90) {
      sx = db;
      sy = -dg;
    } else if (angle === 180) {
      sx = -dg;
      sy = -db;
    } else if (angle === 270) {
      sx = -db;
      sy = dg;
    } else {
      sx = dg;
      sy = db;
    }

    const mag = Math.hypot(sx, sy);
    if (mag <= TILT.deadzoneDeg) return { x: 0, y: 0 };
    const strength = Math.min(1, (mag - TILT.deadzoneDeg) / (TILT.maxTiltDeg - TILT.deadzoneDeg));
    // screen y grows downward, world y grows upward
    return { x: (sx / mag) * strength, y: (-sy / mag) * strength };
  }
}
