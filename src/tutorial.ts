import { spawnDroneDirect } from "./enemies";
import { clamp } from "./math";
import type { Drone, World } from "./types";

/** How the player flies, for writing the step-1 instructions. */
export interface TutorialEnv {
  touch: boolean;
  inertia: boolean;
  moveKeys: string; // e.g. "W A S D" (formatted key list)
}

const MOVE_DISTANCE = 12; // world units of flying before step 1 completes
const DODGE_SECONDS = 6;

/**
 * Scripted flight-school sequence over a sandbox world (no ambient spawns).
 * Five beats: fly → meet static (frozen) drones → they hunt, dodge → grab a
 * power to clear them → the goal. main.ts ticks it once per fixed step.
 */
export class Tutorial {
  /** True once the outro finished; main.ts shows the "ready" screen. */
  done = false;
  /** True while a message is up: main.ts freezes the world until dismiss(). */
  waiting = false;

  private step = 0;
  private moved = 0;
  private lastX: number;
  private lastY: number;
  private timer = 0;
  private staticDrones: Drone[] = [];

  constructor(
    private world: World,
    private env: TutorialEnv,
    private showMessage: (html: string) => void,
  ) {
    this.lastX = world.ship.x;
    this.lastY = world.ship.y;
    this.message(this.flyText());
  }

  /** Show a blocking message; the caller resumes us via dismiss(). */
  private message(html: string): void {
    this.waiting = true;
    this.showMessage(html);
  }

  dismiss(): void {
    this.waiting = false;
  }

  private flyText(): string {
    if (this.env.touch) {
      return (
        "<b>FLIGHT SCHOOL</b><br/>Drag anywhere on the screen to fly —" +
        "<br/>the ship goes where you point. Take her for a spin!"
      );
    }
    if (this.env.inertia) {
      return (
        `<b>FLIGHT SCHOOL</b><br/>Thrust with ${this.env.moveKeys.split(" ")[0] ?? "W"}, ` +
        "turn with the side keys.<br/>Take her for a spin!"
      );
    }
    return (
      `<b>FLIGHT SCHOOL</b><br/>Fly with ${this.env.moveKeys} — ship goes that way.` +
      "<br/>Take her for a spin!"
    );
  }

  /** Ring of frozen drones around the ship — the "static enemies" exhibit. */
  private spawnStaticDrones(): void {
    const w = this.world;
    const hw = w.viewW / 2 - 1;
    const hh = w.viewH / 2 - 1;
    const n = 5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.4;
      let x = clamp(w.ship.x + Math.cos(a) * 4.5, -hw, hw);
      let y = clamp(w.ship.y + Math.sin(a) * 4.5, -hh, hh);
      // wall-clamping can shove drones onto the ship or each other; nudge away
      const dx = x - w.ship.x;
      const dy = y - w.ship.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 2.5) {
        const k = dist > 0.01 ? 2.5 / dist : 0;
        x = clamp(w.ship.x + dx * k, -hw, hw);
        y = clamp(w.ship.y + dy * k, -hh, hh);
      }
      const d = spawnDroneDirect(w, x, y, 0.65, 0.75);
      d.frozen = 9999;
      this.staticDrones.push(d);
    }
  }

  /** Call once per fixed simulation step, right after tick(). */
  update(dt: number): void {
    if (this.done) return;
    const w = this.world;

    // keep the exhibit drones frozen solid until the hunt begins
    if (this.step <= 1) {
      for (const d of this.staticDrones) {
        if (d.alive) d.frozen = 9999;
      }
    }

    switch (this.step) {
      case 0: {
        this.moved += Math.hypot(w.ship.x - this.lastX, w.ship.y - this.lastY);
        this.lastX = w.ship.x;
        this.lastY = w.ship.y;
        if (this.moved >= MOVE_DISTANCE) {
          this.step = 1;
          this.spawnStaticDrones();
          this.message(
            "<b>DRONES</b><br/>One touch and you're space dust — but these are frozen." +
              "<br/>Frozen drones shatter harmlessly. Ram one!",
          );
        }
        break;
      }
      case 1: {
        if (this.staticDrones.some((d) => !d.alive)) {
          this.step = 2;
          this.timer = DODGE_SECONDS;
          // thaw the survivors with a short warning beat, then they hunt
          for (const d of this.staticDrones) {
            if (d.alive) d.frozen = 1.4;
          }
          this.message(
            "<b>THEY HUNT</b><br/>In a real run drones chase you, forever, in growing swarms." +
              `<br/>Dodge them for ${DODGE_SECONDS} seconds!`,
          );
        }
        break;
      }
      case 2: {
        this.timer -= dt;
        if (this.timer <= 0) {
          this.step = 3;
          // a shockwave drop between the ship and the pack — grabbing it fires
          const hw = w.viewW / 2 - 1.5;
          const hh = w.viewH / 2 - 1.5;
          w.pickups.push({
            x: clamp(w.ship.x * 0.4, -hw, hw),
            y: clamp(w.ship.y * 0.4, -hh, hh),
            power: "shockwave",
            age: 0,
          });
          this.message(
            "<b>POWERS</b><br/>Pickups auto-fire the instant you grab them — no button needed." +
              "<br/>Grab the shockwave and clear the pack!",
          );
        }
        break;
      }
      case 3: {
        if (w.pickups.length === 0) {
          this.step = 4;
          this.message(
            "<b>SCORING</b><br/>Kills heat up your multiplier — everything you score is" +
              " multiplied, but it drains fast, so keep hunting." +
              "<br/>And the deeper you fly, the more every second and kill pays.",
          );
        }
        break;
      }
      case 4: {
        if (!this.waiting) {
          this.step = 5;
          this.message(
            "<b>THE GOAL</b><br/>Score the best score. Be the best of the galaxy." +
              "<br/>And above all… <b>SURVIVE</b>.",
          );
        }
        break;
      }
      case 5: {
        // final message dismissed → straight to the send-off screen
        if (!this.waiting) this.done = true;
        break;
      }
    }
  }
}
