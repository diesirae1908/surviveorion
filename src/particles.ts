import { PALETTE } from "./config";

// Cosmetic randomness only: particles fire on player-dependent events
// (kills, pickups), so they must never draw from the seeded gameplay streams.
const cosmeticRange = (min: number, max: number): number =>
  min + Math.random() * (max - min);

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

/** Short goldPale crescent on the hull side a drone just passed. Visual only. */
interface GrazeArc {
  angle: number;
  life: number;
  maxLife: number;
}

/** Gold ring that expands off the hull on a graze (ui.hud pops). Visual only. */
interface RingPulse {
  life: number;
}
const RING_LIFE = 0.32;
const RING_R0 = 0.5;
const RING_R1 = 1.05;

const GRAZE_ARC_LIFE = 0.34;
const GRAZE_ARC_HALF = 0.82;
const GRAZE_ARC_RADIUS = 0.52;

export class Particles {
  private pool: Particle[] = [];
  private grazeArcs: GrazeArc[] = [];
  private rings: RingPulse[] = [];

  burst(
    x: number,
    y: number,
    colors: string[],
    count: number,
    speed: number,
    life: number,
    size: number,
  ): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = cosmeticRange(speed * 0.3, speed);
      this.pool.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: cosmeticRange(life * 0.5, life),
        maxLife: life,
        size: cosmeticRange(size * 0.5, size),
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  }

  /** Hull-following goldPale slash. `angle` is ship-to-drone at the graze instant. */
  grazeArc(angle: number): void {
    this.grazeArcs.push({ angle, life: GRAZE_ARC_LIFE, maxLife: GRAZE_ARC_LIFE });
  }

  /** Gold ring around the ship (position follows the hull at draw time). */
  ringPulse(): void {
    this.rings.push({ life: RING_LIFE });
  }

  update(dt: number): void {
    for (let i = this.pool.length - 1; i >= 0; i--) {
      const p = this.pool[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.pool.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - 1.5 * dt;
      p.vy *= 1 - 1.5 * dt;
    }
    for (let i = this.grazeArcs.length - 1; i >= 0; i--) {
      this.grazeArcs[i].life -= dt;
      if (this.grazeArcs[i].life <= 0) this.grazeArcs.splice(i, 1);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      this.rings[i].life -= dt;
      if (this.rings[i].life <= 0) this.rings.splice(i, 1);
    }
  }

  clear(): void {
    this.pool.length = 0;
    this.grazeArcs.length = 0;
    this.rings.length = 0;
  }

  /** Draw in world space; assumes the world transform is already applied. */
  draw(ctx: CanvasRenderingContext2D, ship?: { x: number; y: number }): void {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const p of this.pool) {
      const t = p.life / p.maxLife;
      ctx.globalAlpha = t;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.5 + 0.5 * t), 0, Math.PI * 2);
      ctx.fill();
    }
    if (ship && this.grazeArcs.length > 0) {
      ctx.lineCap = "round";
      for (const a of this.grazeArcs) {
        const t = a.life / a.maxLife;
        const expand = 1 + (1 - t) * 0.18;
        const r = GRAZE_ARC_RADIUS * expand;
        ctx.strokeStyle = PALETTE.goldPale;
        ctx.lineWidth = 0.11;
        ctx.globalAlpha = 0.95 * t;
        ctx.beginPath();
        ctx.arc(ship.x, ship.y, r, a.angle - GRAZE_ARC_HALF, a.angle + GRAZE_ARC_HALF);
        ctx.stroke();
        ctx.strokeStyle = PALETTE.goldPale;
        ctx.lineWidth = 0.045;
        ctx.globalAlpha = 0.85 * t;
        ctx.beginPath();
        ctx.arc(ship.x, ship.y, r, a.angle - GRAZE_ARC_HALF, a.angle + GRAZE_ARC_HALF);
        ctx.stroke();
      }
    }
    if (ship && this.rings.length > 0) {
      ctx.strokeStyle = PALETTE.gold;
      for (const r of this.rings) {
        const k = 1 - r.life / RING_LIFE; // 0 -> 1
        ctx.globalAlpha = 0.8 * (1 - k);
        ctx.lineWidth = 0.07 * (1 - k * 0.6);
        ctx.beginPath();
        ctx.arc(ship.x, ship.y, RING_R0 + (RING_R1 - RING_R0) * (1 - (1 - k) * (1 - k)), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}
