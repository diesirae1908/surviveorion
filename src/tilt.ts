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

function nativeMotionBridge(): { postMessage: (m: unknown) => void } | undefined {
  try {
    return (
      window as unknown as {
        webkit?: { messageHandlers?: { orion?: { postMessage: (m: unknown) => void } } };
      }
    ).webkit?.messageHandlers?.orion;
  } catch {
    return undefined;
  }
}

export class TiltControl {
  private reading: TiltReading | null = null;
  private neutral: TiltReading | null = null;
  private listening = false;
  private granted = !TiltControl.needsPermission();
  /** Full-speed lean angle; set from the tiltSensitivity setting. */
  maxTiltDeg = TILT.maxTiltDeg;

  static supported(): boolean {
    return typeof DeviceOrientationEvent !== "undefined" || !!nativeMotionBridge();
  }

  /** iOS 13+ gates motion sensors behind an explicit permission dialog. */
  static needsPermission(): boolean {
    if (nativeMotionBridge()) return true;
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
    const native = nativeMotionBridge();
    if (native) {
      this.granted = await new Promise<boolean>((resolve) => {
        let settled = false;
        const done = (ok: boolean): void => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          window.removeEventListener("orion-native-motion", onNative as EventListener);
          resolve(ok);
        };
        const onNative = (e: Event): void => {
          const ev = e as CustomEvent<{ granted?: boolean }>;
          done(!!ev.detail?.granted);
        };
        const timer = window.setTimeout(() => done(false), 20_000);
        window.addEventListener("orion-native-motion", onNative as EventListener);
        try {
          native.postMessage({ type: "requestMotion" });
        } catch {
          done(false);
        }
      });
      return this.granted;
    }
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
    window.addEventListener("oriontilt", this.onNativeTilt);
  }

  /** Drop listeners and tell the native shell to stop Core Motion. */
  stop(): void {
    if (this.listening) {
      this.listening = false;
      window.removeEventListener("deviceorientation", this.onOrientation);
      window.removeEventListener("oriontilt", this.onNativeTilt);
    }
    try {
      nativeMotionBridge()?.postMessage({ type: "stopMotion" });
    } catch {
      // website, or the Swift bridge is not installed
    }
  }

  private onNativeTilt = (e: Event): void => {
    const ev = e as CustomEvent<TiltReading>;
    if (typeof ev.detail?.beta !== "number" || typeof ev.detail?.gamma !== "number") return;
    this.reading = { beta: ev.detail.beta, gamma: ev.detail.gamma };
  };

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
   * Deadzone absorbs resting-hand jitter; full speed at maxTiltDeg.
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
    const strength = Math.min(
      1,
      (mag - TILT.deadzoneDeg) / (this.maxTiltDeg - TILT.deadzoneDeg),
    );
    // screen y grows downward, world y grows upward
    return { x: (sx / mag) * strength, y: (-sy / mag) * strength };
  }
}
