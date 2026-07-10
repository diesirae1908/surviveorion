import { MINES, PALETTE, PICKUPS, POWERS, POWER_COLORS, SCORING, SHIP, VIEW_MIN, type PowerId } from "./config";
import { droneRadius } from "./enemies";
import type { TouchStickView } from "./input";
import { clamp01, lerp } from "./math";
import type { Particles } from "./particles";
import type { Popups } from "./popups";
import type { World } from "./types";

interface Star {
  x: number;
  y: number;
  size: number;
  phase: number;
  brightness: number;
}

export interface RenderOpts {
  alpha: number; // interpolation factor between fixed steps
  uiTime: number; // wall-clock seconds for animations that run while paused
  shakeEnabled: boolean;
  showHud: boolean;
  /** false on the menu backdrop, where a parked ship looks odd */
  showShip: boolean;
  bestScore: number;
  touch: TouchStickView | null;
}

const pingPong = (t: number): number => {
  const m = t % 2;
  return m < 1 ? m : 2 - m;
};

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private stars: Star[] = [];
  private cssW = 0;
  private cssH = 0;
  viewW = VIEW_MIN;
  viewH = VIEW_MIN;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
    this.resize();
  }

  /** Fit canvas to window; shorter axis spans VIEW_MIN world units. */
  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cssW = window.innerWidth;
    this.cssH = window.innerHeight;
    this.canvas.width = Math.round(this.cssW * dpr);
    this.canvas.height = Math.round(this.cssH * dpr);
    this.canvas.style.width = `${this.cssW}px`;
    this.canvas.style.height = `${this.cssH}px`;

    const aspect = this.cssW / this.cssH;
    if (aspect >= 1) {
      this.viewH = VIEW_MIN;
      this.viewW = VIEW_MIN * aspect;
    } else {
      this.viewW = VIEW_MIN;
      this.viewH = VIEW_MIN / aspect;
    }
    this.generateStars();
  }

  private generateStars(): void {
    this.stars = [];
    const count = Math.round(1.6 * this.viewW * this.viewH);
    for (let i = 0; i < count; i++) {
      this.stars.push({
        x: (Math.random() - 0.5) * this.viewW * 1.1,
        y: (Math.random() - 0.5) * this.viewH * 1.1,
        size: Math.random() < 0.88 ? 0.01 + Math.random() * 0.02 : 0.03 + Math.random() * 0.025,
        phase: Math.random() * Math.PI * 2,
        brightness: 0.25 + Math.random() * 0.65,
      });
    }
  }

  render(world: World, particles: Particles, popups: Popups, opts: RenderOpts): void {
    const { ctx } = this;
    const dpr = this.canvas.width / this.cssW;
    const scale = this.canvas.height / this.viewH;

    // background
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const grad = ctx.createRadialGradient(
      this.cssW / 2,
      this.cssH / 2,
      0,
      this.cssW / 2,
      this.cssH / 2,
      Math.max(this.cssW, this.cssH) * 0.7,
    );
    grad.addColorStop(0, "#141426");
    grad.addColorStop(1, PALETTE.bgBottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.cssW, this.cssH);

    // world transform (y up), with screen shake
    let shakeX = 0;
    let shakeY = 0;
    if (opts.shakeEnabled && world.shake > 0.01) {
      shakeX = (Math.random() - 0.5) * 2 * world.shake;
      shakeY = (Math.random() - 0.5) * 2 * world.shake;
    }
    ctx.setTransform(
      scale,
      0,
      0,
      -scale,
      (this.cssW / 2 + shakeX * (scale / dpr)) * dpr,
      (this.cssH / 2 + shakeY * (scale / dpr)) * dpr,
    );

    this.drawStars(opts.uiTime);
    this.drawOffscreenThreats(world);
    this.drawSpawnTelegraphs(world, opts.uiTime);
    this.drawTrail(world, opts.uiTime);
    this.drawWaves(world);
    this.drawPickups(world, opts.uiTime);
    this.drawMines(world, opts.uiTime);
    this.drawMagnetField(world, opts.uiTime);
    this.drawProjectiles(world, opts.alpha);
    this.drawMissiles(world, opts.alpha);
    this.drawDrones(world, opts.alpha);
    if (opts.showShip && world.phase === "playing") this.drawShip(world, opts);
    particles.draw(ctx);
    popups.draw(ctx);

    // screen-space UI
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (opts.showHud) this.drawHud(world, opts);
    if (opts.touch?.active || opts.touch?.boostActive) this.drawTouchOverlay(opts.touch);
  }

  // --- world drawing ---

  private drawStars(time: number): void {
    const { ctx } = this;
    for (const s of this.stars) {
      const tw = 0.6 + 0.4 * Math.sin(time * 1.4 + s.phase);
      ctx.globalAlpha = s.brightness * tw;
      ctx.fillStyle = PALETTE.white;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawShip(world: World, opts: RenderOpts): void {
    const { ctx } = this;
    const s = world.ship;
    const x = lerp(s.prevX, s.x, opts.alpha);
    const y = lerp(s.prevY, s.y, opts.alpha);
    const angle = lerp(s.prevAngle, s.angle, opts.alpha);

    // multiplier heat: golden aura that builds as the kill multiplier climbs
    const heat = clamp01((world.multiplier - 1) / (SCORING.multiplierMax - 1));
    if (heat > 0.02) {
      const r = 0.55 + heat * 0.75;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = heat * (0.4 + 0.12 * Math.sin(opts.uiTime * 6));
      const mg = ctx.createRadialGradient(x, y, 0.12, x, y, r);
      mg.addColorStop(0, PALETTE.goldPale);
      mg.addColorStop(0.55, "rgba(255,215,0,0.35)");
      mg.addColorStop(1, "rgba(255,215,0,0)");
      ctx.fillStyle = mg;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(SHIP.visualScale, SHIP.visualScale);

    // engine flame
    const dashing = world.powers.afterburnerDash > 0;
    const boosting = s.boostHeld || dashing;
    if (s.thrusting > 0 || boosting) {
      const flicker = 0.8 + 0.2 * Math.sin(opts.uiTime * 40);
      const flameLen = (boosting ? 1.1 : 0.55) * flicker * Math.max(s.thrusting, boosting ? 1 : 0);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const fg = ctx.createLinearGradient(-0.35, 0, -0.35 - flameLen, 0);
      fg.addColorStop(0, boosting ? "#ffe9b0" : "#ffb347");
      fg.addColorStop(1, "rgba(196,30,58,0)");
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(-0.32, 0.14);
      ctx.lineTo(-0.32 - flameLen, 0);
      ctx.lineTo(-0.32, -0.14);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // hull: sleek gold dart with red accents
    ctx.lineJoin = "round";
    ctx.lineWidth = 0.05;
    const hull = ctx.createLinearGradient(-0.4, 0, 0.55, 0);
    hull.addColorStop(0, PALETTE.goldDark);
    hull.addColorStop(0.6, PALETTE.gold);
    hull.addColorStop(1, PALETTE.goldPale);
    ctx.fillStyle = hull;
    ctx.strokeStyle = "#5a4200";
    ctx.beginPath();
    ctx.moveTo(0.55, 0);
    ctx.lineTo(-0.3, 0.32);
    ctx.lineTo(-0.18, 0);
    ctx.lineTo(-0.3, -0.32);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // red canopy accent
    ctx.fillStyle = PALETTE.red;
    ctx.beginPath();
    ctx.ellipse(0.14, 0, 0.13, 0.07, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // afterburner charge: swelling orange glow before the dash fires
    if (world.powers.afterburnerCharge > 0) {
      const progress = 1 - world.powers.afterburnerCharge / POWERS.afterburner.chargeTime;
      const r = 0.4 + progress * 0.6;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.35 + 0.25 * Math.sin(opts.uiTime * 30);
      const ag = ctx.createRadialGradient(x, y, 0.1, x, y, r);
      ag.addColorStop(0, "#ffd9a0");
      ag.addColorStop(1, "rgba(255,102,51,0)");
      ctx.fillStyle = ag;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // shield bubble (flickers during its final seconds)
    if (world.powers.shieldTimer > 0) {
      const remaining = world.powers.shieldTimer;
      let alpha = 0.35;
      if (remaining <= POWERS.shield.flickerLastSeconds) {
        alpha = lerp(0.2, 0.6, pingPong(opts.uiTime * 5));
      }
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = alpha;
      const sg = ctx.createRadialGradient(x, y, 0.25, x, y, 0.7);
      sg.addColorStop(0, "rgba(102,204,255,0)");
      sg.addColorStop(0.8, "rgba(102,204,255,0.35)");
      sg.addColorStop(1, PALETTE.shield);
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(x, y, 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = PALETTE.shield;
      ctx.lineWidth = 0.05;
      ctx.stroke();
      ctx.restore();
    }

    // pulse shot charge glow at the nose
    if (world.powers.pulseTimer > 0) {
      const progress = 1 - world.powers.pulseTimer / POWERS.pulse.chargeTime;
      const r = 0.1 + progress * 0.4;
      const nx = x + Math.cos(angle) * POWERS.pulse.spawnOffset;
      const ny = y + Math.sin(angle) * POWERS.pulse.spawnOffset;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const pg = ctx.createRadialGradient(nx, ny, 0, nx, ny, r);
      pg.addColorStop(0, "#fff2cc");
      pg.addColorStop(1, "rgba(255,170,51,0)");
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.arc(nx, ny, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /** Red chevrons at the screen edge pointing at approaching off-screen drones. */
  private drawOffscreenThreats(world: World): void {
    if (world.phase !== "playing") return;
    const { ctx } = this;
    const hw = this.viewW / 2;
    const hh = this.viewH / 2;
    const inset = 0.35;

    for (const d of world.drones) {
      if (!d.alive) continue;
      if (Math.abs(d.x) <= hw && Math.abs(d.y) <= hh) continue; // on-screen

      const x = Math.max(-hw + inset, Math.min(hw - inset, d.x));
      const y = Math.max(-hh + inset, Math.min(hh - inset, d.y));
      const dist = Math.hypot(d.x - x, d.y - y);
      if (dist > 6) continue; // only warn about nearby threats

      const angle = Math.atan2(d.y - y, d.x - x);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.globalAlpha = 0.75 * (1 - dist / 6);
      ctx.fillStyle = PALETTE.redBright;
      ctx.beginPath();
      ctx.moveTo(0.22, 0);
      ctx.lineTo(-0.08, 0.14);
      ctx.lineTo(-0.08, -0.14);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  /** Red warning glows where drones are about to materialize. */
  private drawSpawnTelegraphs(world: World, time: number): void {
    if (world.spawnTelegraphs.length === 0) return;
    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const t of world.spawnTelegraphs) {
      const progress = 1 - t.timer / t.duration; // 0 -> 1 as the pop nears
      const pulse = 0.75 + 0.25 * Math.sin(time * 18 + t.x * 3);

      // swelling core glow
      const r = 0.25 + progress * 0.45;
      ctx.globalAlpha = (0.25 + progress * 0.6) * pulse;
      const g = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, r);
      g.addColorStop(0, "#ff8a7a");
      g.addColorStop(0.5, PALETTE.redBright);
      g.addColorStop(1, "rgba(196,30,58,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
      ctx.fill();

      // collapsing ring: reads as a countdown
      ctx.globalAlpha = 0.55 * progress + 0.1;
      ctx.strokeStyle = PALETTE.redBright;
      ctx.lineWidth = 0.045;
      ctx.beginPath();
      ctx.arc(t.x, t.y, 0.28 + (1 - progress) * 0.55, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Burning afterburner trail: lethal embers that fade out. */
  private drawTrail(world: World, time: number): void {
    if (world.powers.trail.length === 0) return;
    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const t of world.powers.trail) {
      const life = 1 - t.age / POWERS.afterburner.trailLifetime;
      const flicker = 0.8 + 0.2 * Math.sin(time * 25 + t.x * 7 + t.y * 5);
      const r = POWERS.afterburner.trailKillRadius * (0.6 + 0.4 * life) * flicker;
      ctx.globalAlpha = life * 0.8;
      const g = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, r);
      g.addColorStop(0, "#ffe9b0");
      g.addColorStop(0.4, PALETTE.afterburner);
      g.addColorStop(1, "rgba(196,30,58,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawDrones(world: World, alpha: number): void {
    const { ctx } = this;
    for (const d of world.drones) {
      if (!d.alive) continue;
      const x = lerp(d.prevX, d.x, alpha);
      const y = lerp(d.prevY, d.y, alpha);
      const r = droneRadius(d);
      const frozen = d.frozen > 0;
      // thawing drones flicker during their last second of freeze
      const thawFlicker = frozen && d.frozen < 1 && Math.sin(d.frozen * 30) > 0;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(d.spin);

      // hexagonal shell
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      const dg = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r);
      if (frozen && !thawFlicker) {
        dg.addColorStop(0, "#e8f8ff");
        dg.addColorStop(1, "#4d88b8");
      } else {
        dg.addColorStop(0, PALETTE.redBright);
        dg.addColorStop(1, PALETTE.redDark);
      }
      ctx.fillStyle = dg;
      ctx.fill();
      ctx.strokeStyle = frozen && !thawFlicker ? "#2a4a66" : "#3d0810";
      ctx.lineWidth = 0.05;
      ctx.stroke();

      // core: warm glow normally, ice crystal when frozen
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = frozen && !thawFlicker ? "#dffaff" : "#ff8866";
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawPickups(world: World, time: number): void {
    const { ctx } = this;
    for (const p of world.pickups) {
      const bob = 1 + 0.1 * Math.sin(p.age * PICKUPS.bobSpeed);
      const r = PICKUPS.radius * bob;
      const color = POWER_COLORS[p.power];

      ctx.save();
      ctx.translate(p.x, p.y);

      // soft glow
      ctx.globalCompositeOperation = "lighter";
      const g = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r * 2);
      g.addColorStop(0, color);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalAlpha = 0.35 + 0.12 * Math.sin(time * 3 + p.age);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r * 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(10,10,18,0.85)";
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.06;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      this.drawPowerGlyph(p.power, r * 0.55, color);
      ctx.restore();
    }
  }

  /** Small vector icon per power, drawn centered at the origin. */
  private drawPowerGlyph(power: PowerId, size: number, color: string): void {
    const { ctx } = this;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 0.06;
    ctx.lineCap = "round";
    ctx.beginPath();
    switch (power) {
      case "shield":
        ctx.moveTo(0, size);
        ctx.quadraticCurveTo(size, size * 0.6, size * 0.75, -size * 0.3);
        ctx.quadraticCurveTo(size * 0.5, -size * 0.9, 0, -size);
        ctx.quadraticCurveTo(-size * 0.5, -size * 0.9, -size * 0.75, -size * 0.3);
        ctx.quadraticCurveTo(-size, size * 0.6, 0, size);
        ctx.closePath();
        ctx.stroke();
        break;
      case "shockwave":
        ctx.arc(0, 0, size * 0.35, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, size * 0.9, -0.4, Math.PI - 0.4);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, size * 0.9, Math.PI - 0.4 + 0.8, Math.PI * 2 - 0.4 - 0.8 + Math.PI);
        ctx.stroke();
        break;
      case "pulse":
        ctx.moveTo(size * 0.3, size);
        ctx.lineTo(-size * 0.4, size * 0.05);
        ctx.lineTo(size * 0.05, size * 0.05);
        ctx.lineTo(-size * 0.3, -size);
        ctx.lineTo(size * 0.4, -size * 0.05);
        ctx.lineTo(-size * 0.05, -size * 0.05);
        ctx.closePath();
        ctx.fill();
        break;
      case "magnet":
        ctx.arc(0, size * 0.15, size * 0.65, Math.PI, 0, true);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-size * 0.65, size * 0.15);
        ctx.lineTo(-size * 0.65, size * 0.75);
        ctx.moveTo(size * 0.65, size * 0.15);
        ctx.lineTo(size * 0.65, size * 0.75);
        ctx.stroke();
        break;
      case "afterburner":
        ctx.moveTo(0, size);
        ctx.quadraticCurveTo(size * 0.8, 0, size * 0.25, -size * 0.35);
        ctx.quadraticCurveTo(size * 0.3, -size * 0.75, 0, -size);
        ctx.quadraticCurveTo(-0.3 * size, -size * 0.75, -size * 0.25, -size * 0.35);
        ctx.quadraticCurveTo(-size * 0.8, 0, 0, size);
        ctx.closePath();
        ctx.fill();
        break;
      case "freeze":
        // snowflake: six spokes with tips
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i;
          const cx = Math.cos(a);
          const cy = Math.sin(a);
          ctx.moveTo(0, 0);
          ctx.lineTo(cx * size, cy * size);
          ctx.moveTo(cx * size * 0.6 - cy * size * 0.2, cy * size * 0.6 + cx * size * 0.2);
          ctx.lineTo(cx * size, cy * size);
          ctx.lineTo(cx * size * 0.6 + cy * size * 0.2, cy * size * 0.6 - cx * size * 0.2);
        }
        ctx.stroke();
        break;
      case "missiles":
        // three darts fanning outward
        for (let i = -1; i <= 1; i++) {
          const a = Math.PI / 2 + i * 0.8;
          const cx = Math.cos(a);
          const cy = Math.sin(a);
          const bx = cx * size * 0.15;
          const by = cy * size * 0.15 - size * 0.4;
          const tx = cx * size + bx;
          const ty = cy * size + by;
          const px = -cy * size * 0.22;
          const pyy = cx * size * 0.22;
          ctx.moveTo(tx, ty);
          ctx.lineTo(bx + px, by + pyy);
          ctx.lineTo(bx - px, by - pyy);
          ctx.closePath();
        }
        ctx.fill();
        break;
    }
  }

  /** Floating mines: dark spiked orbs with a blinking red core. */
  private drawMines(world: World, time: number): void {
    const { ctx } = this;
    for (const m of world.mines) {
      if (!m.alive) continue;
      const r = MINES.radius;

      // fade in while arming, fade out before despawning
      const armT = clamp01(m.age / MINES.armTime);
      const remaining = m.lifetime - m.age;
      const fadeOut = clamp01(remaining / MINES.fadeOutTime);
      const alpha = Math.min(armT, fadeOut);
      const armed = m.age >= MINES.armTime;

      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.globalAlpha = alpha;
      ctx.rotate(m.seed + time * 0.15);

      // danger halo so mines always read against the dark backdrop
      if (armed) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = alpha * (0.16 + 0.08 * Math.sin(time * 3 + m.seed));
        const hg = ctx.createRadialGradient(0, 0, r, 0, 0, r * 3);
        hg.addColorStop(0, "rgba(255,68,85,0.6)");
        hg.addColorStop(1, "rgba(255,68,85,0)");
        ctx.fillStyle = hg;
        ctx.beginPath();
        ctx.arc(0, 0, r * 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.globalAlpha = alpha;
      }

      // spikes
      ctx.strokeStyle = PALETTE.gold;
      ctx.lineWidth = 0.08;
      ctx.lineCap = "round";
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI / 4) * i;
        ctx.moveTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7);
        ctx.lineTo(Math.cos(a) * r * 1.4, Math.sin(a) * r * 1.4);
      }
      ctx.stroke();

      // body
      const bg = ctx.createRadialGradient(-r * 0.25, r * 0.25, r * 0.1, 0, 0, r);
      bg.addColorStop(0, "#585868");
      bg.addColorStop(1, "#22222f");
      ctx.fillStyle = bg;
      ctx.strokeStyle = PALETTE.gold;
      ctx.lineWidth = 0.05;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // blinking core: slow amber while arming, sharp red blink when live
      const blink = armed
        ? Math.sin(time * 6 + m.seed) > 0.2
          ? 1
          : 0.4
        : 0.4 + 0.3 * Math.sin(time * 12);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = alpha * blink;
      const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.6);
      cg.addColorStop(0, armed ? "#ff6655" : "#ffcc66");
      cg.addColorStop(1, "rgba(255,68,85,0)");
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.6, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  /** Guided missiles: bright darts with a short glowing tail. */
  private drawMissiles(world: World, alpha: number): void {
    const { ctx } = this;
    const color = PALETTE.missiles;
    for (const ms of world.powers.missiles) {
      const x = lerp(ms.prevX, ms.x, alpha);
      const y = lerp(ms.prevY, ms.y, alpha);

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ms.angle);

      // tail glow
      ctx.globalCompositeOperation = "lighter";
      const tg = ctx.createLinearGradient(0, 0, -0.9, 0);
      tg.addColorStop(0, color);
      tg.addColorStop(1, "rgba(168,255,158,0)");
      ctx.strokeStyle = tg;
      ctx.lineWidth = 0.09;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-0.05, 0);
      ctx.lineTo(-0.9, 0);
      ctx.stroke();

      // dart body
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#eaffe6";
      ctx.beginPath();
      ctx.moveTo(0.22, 0);
      ctx.lineTo(-0.12, 0.08);
      ctx.lineTo(-0.12, -0.08);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    }
  }

  private drawMagnetField(world: World, time: number): void {
    if (world.powers.magnetTimer <= 0 || world.phase !== "playing") return;
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = 0.12 + 0.05 * Math.sin(time * 4);
    ctx.strokeStyle = PALETTE.magnet;
    ctx.lineWidth = 0.05;
    ctx.setLineDash([0.3, 0.25]);
    ctx.beginPath();
    ctx.arc(world.ship.x, world.ship.y, POWERS.magnet.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawProjectiles(world: World, alpha: number): void {
    const { ctx } = this;
    for (const proj of world.powers.projectiles) {
      const x = lerp(proj.prevX, proj.x, alpha);
      const y = lerp(proj.prevY, proj.y, alpha);
      const t = clamp01(proj.elapsed / POWERS.pulse.projectileLifetime);
      const fade = 1 - t * t;
      const r = POWERS.pulse.projectileRadius;

      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = fade;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "#fff6d8");
      g.addColorStop(0.35, PALETTE.pulse);
      g.addColorStop(1, "rgba(255,170,51,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawWaves(world: World): void {
    const { ctx } = this;
    for (const w of world.powers.waves) {
      const t = clamp01(w.elapsed / w.lifetime);
      // fast expansion that settles (mimics the Unity wave scale curve)
      const expand = 1 - Math.pow(1 - Math.min(1, t / 0.6), 2);
      const radius = w.maxRadius * expand;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = (1 - t) * 0.8;
      ctx.strokeStyle = w.color;
      ctx.lineWidth = 0.18 * (1 - t) + 0.04;
      ctx.beginPath();
      ctx.arc(w.x, w.y, Math.max(0.01, radius), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // --- screen-space HUD ---

  private drawHud(world: World, opts: RenderOpts): void {
    const { ctx } = this;
    const pad = 18;

    ctx.textBaseline = "top";

    // score (top-left)
    ctx.textAlign = "left";
    ctx.fillStyle = PALETTE.gold;
    ctx.font = "bold 26px Georgia, serif";
    ctx.fillText(Math.floor(world.score).toLocaleString(), pad, pad);

    // multiplier (gold-hot as it climbs toward the cap)
    const m = world.multiplier;
    const heat = clamp01((m - 1) / (SCORING.multiplierMax - 1));
    ctx.font = "bold 17px Georgia, serif";
    ctx.fillStyle = heat > 0.55 ? PALETTE.gold : m > 1.01 ? PALETTE.redBright : PALETTE.bronze;
    ctx.fillText(`x${m.toFixed(1)}`, pad, pad + 32);

    // active kill chain
    if (world.chainCount >= 3 && world.chainTimer > 0) {
      ctx.fillStyle = PALETTE.goldPale;
      ctx.font = "bold 13px Georgia, serif";
      ctx.fillText(`CHAIN ×${world.chainCount}`, pad + 64, pad + 35);
    }

    // best (under the score, clear of the pause button top-right)
    ctx.fillStyle = PALETTE.bronze;
    ctx.font = "13px Georgia, serif";
    ctx.fillText(`BEST ${Math.floor(opts.bestScore).toLocaleString()}`, pad, pad + 58);

    // time (top-center)
    const mins = Math.floor(world.time / 60);
    const secs = Math.floor(world.time % 60);
    ctx.textAlign = "center";
    ctx.fillStyle = PALETTE.goldPale;
    ctx.font = "20px Georgia, serif";
    ctx.fillText(`${mins}:${secs.toString().padStart(2, "0")}`, this.cssW / 2, pad);

    // active power timers (bottom-left)
    const powers: Array<[string, number, number, string]> = [];
    const p = world.powers;
    if (p.shieldTimer > 0)
      powers.push(["SHIELD", p.shieldTimer, POWERS.shield.duration, POWER_COLORS.shield]);
    if (p.magnetTimer > 0)
      powers.push(["MAGNET", p.magnetTimer, POWERS.magnet.duration, POWER_COLORS.magnet]);
    if (p.afterburnerCharge > 0)
      powers.push([
        "AFTERBURNER",
        POWERS.afterburner.chargeTime - p.afterburnerCharge,
        POWERS.afterburner.chargeTime,
        POWER_COLORS.afterburner,
      ]);
    if (p.pulseTimer > 0)
      powers.push(["PULSE", p.pulseTimer, POWERS.pulse.chargeTime, POWER_COLORS.pulse]);

    let py = this.cssH - pad - powers.length * 24;
    ctx.textAlign = "left";
    ctx.font = "12px Georgia, serif";
    for (const [name, remaining, total, color] of powers) {
      const frac = clamp01(remaining / total);
      ctx.fillStyle = color;
      ctx.fillText(name, pad, py);
      ctx.globalAlpha = 0.3;
      ctx.fillRect(pad + 90, py + 3, 80, 7);
      ctx.globalAlpha = 1;
      ctx.fillRect(pad + 90, py + 3, 80 * frac, 7);
      py += 24;
    }

    // boost cooldown indicator (bottom-center)
    const s = world.ship;
    if (s.boostHeld || s.boostCooldownTimer > 0) {
      const frac = s.boostHeld
        ? 1 - clamp01(s.boostHoldTimer / SHIP.boost.maxHoldTime)
        : 1 - clamp01(s.boostCooldownTimer / SHIP.boost.cooldown);
      ctx.fillStyle = s.boostHeld ? PALETTE.goldPale : PALETTE.bronze;
      ctx.globalAlpha = 0.35;
      ctx.fillRect(this.cssW / 2 - 60, this.cssH - 26, 120, 6);
      ctx.globalAlpha = 1;
      ctx.fillRect(this.cssW / 2 - 60, this.cssH - 26, 120 * frac, 6);
    }
  }

  private drawTouchOverlay(touch: TouchStickView): void {
    const { ctx } = this;
    if (touch.active) {
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = PALETTE.gold;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(touch.originX, touch.originY, 60, 0, Math.PI * 2);
      ctx.stroke();

      const dx = touch.stickX - touch.originX;
      const dy = touch.stickY - touch.originY;
      const d = Math.hypot(dx, dy);
      const cl = d > 60 ? 60 / d : 1;
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = PALETTE.gold;
      ctx.beginPath();
      ctx.arc(touch.originX + dx * cl, touch.originY + dy * cl, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    if (touch.boostActive) {
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = PALETTE.redBright;
      ctx.font = "bold 16px Georgia, serif";
      ctx.textAlign = "center";
      ctx.fillText("BOOST", this.cssW * 0.75, this.cssH - 40);
      ctx.restore();
    }
  }
}
