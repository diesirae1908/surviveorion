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

/** Full-screen cinematic overlays (launch warp, arrival flash, death veil, boot intro). */
export interface TransitionFx {
  kind: "warp" | "flash" | "death" | "intro";
  t: number; // 0..1 progress
}

export interface RenderOpts {
  alpha: number; // interpolation factor between fixed steps
  uiTime: number; // wall-clock seconds for animations that run while paused
  shakeEnabled: boolean;
  showHud: boolean;
  /** false on the menu backdrop, where a parked ship looks odd */
  showShip: boolean;
  bestScore: number;
  /** Daily Patrol run/launch: tags the HUD and warp so the mode is visible. */
  daily: boolean;
  touch: TouchStickView | null;
  fx: TransitionFx | null;
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
  /** Notch / home-indicator insets so the HUD never hides under phone chrome. */
  private safe = { top: 0, right: 0, bottom: 0, left: 0 };
  viewW = VIEW_MIN;
  viewH = VIEW_MIN;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
    this.resize();
  }

  /** env(safe-area-inset-*) is CSS-only, so measure it off a probe element. */
  private measureSafeArea(): void {
    const probe = document.createElement("div");
    probe.style.cssText =
      "position:fixed;inset:0;visibility:hidden;pointer-events:none;" +
      "padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);";
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe);
    this.safe = {
      top: parseFloat(cs.paddingTop) || 0,
      right: parseFloat(cs.paddingRight) || 0,
      bottom: parseFloat(cs.paddingBottom) || 0,
      left: parseFloat(cs.paddingLeft) || 0,
    };
    probe.remove();
  }

  /** Fit canvas to window; shorter axis spans VIEW_MIN world units. */
  resize(): void {
    this.measureSafeArea();
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
    this.drawArenaBoundary(world);
    this.drawOffscreenThreats(world);
    this.drawSpawnTelegraphs(world, opts.uiTime);
    this.drawTrail(world, opts.uiTime);
    this.drawWaves(world);
    this.drawVortices(world, opts.uiTime);
    this.drawArcBolts(world);
    this.drawPickups(world, opts.uiTime);
    this.drawMines(world, opts.uiTime);
    this.drawMagnetField(world, opts.uiTime);
    this.drawProjectiles(world, opts.alpha);
    this.drawBullets(world, opts.alpha);
    this.drawMissiles(world, opts.alpha);
    this.drawDrones(world, opts.alpha);
    if (opts.showShip && world.phase === "playing") this.drawShip(world, opts);
    particles.draw(ctx);
    popups.draw(ctx);

    // screen-space UI
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (opts.showHud) this.drawHud(world, opts);
    if (opts.touch?.active) this.drawTouchOverlay(opts.touch);

    // cinematic overlays (drawn above everything, below the DOM UI)
    if (opts.fx) {
      if (opts.fx.kind === "warp") this.drawWarpFx(opts.fx.t, opts.uiTime, opts.daily);
      else if (opts.fx.kind === "flash") this.drawFlashFx(opts.fx.t);
      else if (opts.fx.kind === "intro") this.drawIntroFx(opts.fx.t, opts.uiTime);
      else this.drawDeathFx(opts.fx.t, opts.uiTime);
    }
  }

  // --- cinematic transitions ---

  /**
   * Launch warp: a golden stargate ring forms in the void, star lines
   * stretch into a hyperspace tunnel, and the view plunges into the core.
   */
  private drawWarpFx(t: number, uiTime: number, daily: boolean): void {
    const { ctx } = this;
    const cx = this.cssW / 2;
    const cy = this.cssH / 2;
    const maxR = Math.hypot(cx, cy);

    // gently dim the backdrop as the gate takes over
    ctx.fillStyle = `rgba(4, 4, 12, ${0.35 * clamp01(t * 2)})`;
    ctx.fillRect(0, 0, this.cssW, this.cssH);

    const ease = t * t * (3 - 2 * t); // smoothstep
    const open = clamp01(t / 0.45); // gate forming
    const plunge = clamp01((t - 0.45) / 0.55); // flying into it
    const ringR = lerp(maxR * 0.06, maxR * 1.35, ease * ease);

    // hyperspace star streaks, radiating from the gate
    const streaks = 150;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < streaks; i++) {
      // deterministic pseudo-random per streak
      const h = Math.sin(i * 127.1) * 43758.5453;
      const rnd = h - Math.floor(h);
      const ang = (i / streaks) * Math.PI * 2 + rnd * 0.35;
      const speed = 0.35 + rnd * 0.65;
      const d0 = maxR * (0.08 + rnd * 0.55) * (1 - plunge * 0.7);
      const len = maxR * (0.02 + (open * 0.12 + plunge * 1.1) * speed);
      const a = clamp01(open * 0.5 + plunge) * (0.25 + rnd * 0.5);
      const gold = rnd < 0.6;
      ctx.strokeStyle = gold ? `rgba(255, 216, 120, ${a})` : `rgba(150, 210, 255, ${a})`;
      ctx.lineWidth = 1 + rnd * 1.6 + plunge * 1.2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * d0, cy + Math.sin(ang) * d0);
      ctx.lineTo(cx + Math.cos(ang) * (d0 + len), cy + Math.sin(ang) * (d0 + len));
      ctx.stroke();
    }
    ctx.restore();

    // the stargate ring itself: layered strokes + rotating rune dashes
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const ringAlpha = clamp01(open * 1.4) * (1 - plunge * 0.55);
    ctx.shadowColor = "rgba(255, 200, 80, 0.9)";
    ctx.shadowBlur = 30 + open * 40;
    ctx.strokeStyle = `rgba(255, 215, 0, ${ringAlpha})`;
    ctx.lineWidth = 5 + open * 6 + plunge * 10;
    ctx.beginPath();
    ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
    ctx.stroke();

    // inner cyan rim
    ctx.shadowColor = "rgba(140, 220, 255, 0.8)";
    ctx.shadowBlur = 22;
    ctx.strokeStyle = `rgba(170, 230, 255, ${ringAlpha * 0.8})`;
    ctx.lineWidth = 2 + open * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, ringR * 0.93, 0, Math.PI * 2);
    ctx.stroke();

    // rotating rune segments
    ctx.shadowBlur = 0;
    ctx.strokeStyle = `rgba(255, 238, 136, ${ringAlpha * 0.9})`;
    ctx.lineWidth = 3 + open * 3;
    ctx.setLineDash([ringR * 0.09, ringR * 0.16]);
    ctx.lineDashOffset = uiTime * 90;
    ctx.beginPath();
    ctx.arc(cx, cy, ringR * 1.06, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // the core: dark void that ignites as we dive in
    const coreR = Math.max(ringR * 0.92, 1);
    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
    const glow = clamp01(plunge * 1.3);
    core.addColorStop(0, `rgba(${255}, ${244 - 60 * (1 - glow)}, ${200 * glow + 30}, ${0.15 + glow * 0.85})`);
    core.addColorStop(0.55, `rgba(90, 70, 160, ${0.25 + glow * 0.4})`);
    core.addColorStop(1, "rgba(10, 8, 24, 0)");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
    ctx.fill();

    // Daily Patrol briefing: name the mission during the jump so launching
    // the daily never feels like a plain launch
    if (daily) {
      const minDim = Math.min(this.cssW, this.cssH);
      const a = clamp01(t / 0.25) * (1 - clamp01((t - 0.75) / 0.15));
      if (a > 0) {
        ctx.save();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `bold ${minDim * 0.05}px Georgia, serif`;
        ctx.fillStyle = `rgba(255, 215, 0, ${a})`;
        ctx.shadowColor = "rgba(255, 200, 60, 0.85)";
        ctx.shadowBlur = 24;
        ctx.fillText("D A I L Y   P A T R O L", cx, cy - minDim * 0.16);
        ctx.font = `${minDim * 0.022}px Georgia, serif`;
        ctx.shadowBlur = 8;
        ctx.fillStyle = `rgba(255, 238, 136, ${a * 0.85})`;
        ctx.fillText("same swarm for every pilot, today's board", cx, cy - minDim * 0.105);
        ctx.restore();
      }
    }

    // white-out at the very end, handing over to the arrival flash
    const white = clamp01((t - 0.86) / 0.14);
    if (white > 0) {
      ctx.fillStyle = `rgba(255, 250, 235, ${white})`;
      ctx.fillRect(0, 0, this.cssW, this.cssH);
    }
  }

  /**
   * Boot cinematic (~5s), storyboarded like a mini-trailer: a slow push-in
   * through deep space, the gold dart cruising across frame, a hexagonal
   * drone swarm pouring in behind it — then on the braam the ship dashes off,
   * a golden shockwave detonates the pursuers, and ORION slams in letter by
   * letter before the whole thing hands over to the menu.
   */
  private drawIntroFx(t: number, uiTime: number): void {
    const { ctx } = this;
    const W = this.cssW;
    const H = this.cssH;
    const cx = W / 2;
    const cy = H / 2;
    const maxR = Math.hypot(cx, cy);
    const minDim = Math.min(W, H);

    const HIT = 0.42; // the braam / title slam moment
    const fadeOut = clamp01((t - 0.9) / 0.1); // hand-over to the menu

    // deterministic pseudo-random per element (stable across frames)
    const rnd = (i: number, salt: number): number => {
      const h = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
      return h - Math.floor(h);
    };

    // the hero flight line: a gentle weave from off-screen left to the
    // two-thirds mark, where the slam happens
    const pathAt = (p: number): { x: number; y: number } => ({
      x: lerp(-W * 0.16, W * 0.62, p),
      y: cy + Math.sin(p * 3.6 + 0.6) * H * 0.07,
    });
    const shipAppear = 0.1;
    const shipP = (t - shipAppear) / (HIT - shipAppear); // >1 after the hit

    ctx.save();
    ctx.globalAlpha = 1 - fadeOut;

    // black void over the menu backdrop
    ctx.fillStyle = "rgb(3, 3, 9)";
    ctx.fillRect(0, 0, W, H);

    // camera shake right after the slam (the frame itself stays stable)
    const shakeAmp = t >= HIT ? (1 - clamp01((t - HIT) / 0.12)) * minDim * 0.012 : 0;
    const sx = Math.sin(uiTime * 61) * shakeAmp;
    const sy = Math.cos(uiTime * 53) * shakeAmp;
    ctx.save();
    ctx.translate(sx, sy);

    // faint nebulae in the palette purple / gold, barely there
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const neb1 = ctx.createRadialGradient(W * 0.3, H * 0.34, 0, W * 0.3, H * 0.34, maxR * 0.8);
    neb1.addColorStop(0, "rgba(136, 119, 255, 0.07)");
    neb1.addColorStop(1, "rgba(136, 119, 255, 0)");
    ctx.fillStyle = neb1;
    ctx.fillRect(0, 0, W, H);
    const neb2 = ctx.createRadialGradient(W * 0.74, H * 0.7, 0, W * 0.74, H * 0.7, maxR * 0.7);
    neb2.addColorStop(0, "rgba(255, 200, 80, 0.05)");
    neb2.addColorStop(1, "rgba(255, 200, 80, 0)");
    ctx.fillStyle = neb2;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    // parallax starfield with a slow camera push-in
    const push = t * 0.3;
    for (let i = 0; i < 110; i++) {
      const layer = 0.35 + rnd(i, 1) * 0.65; // depth, 1 = closest
      const k = 1 + push * layer;
      const x = cx + (rnd(i, 2) - 0.5) * W * 1.3 * k;
      const y = cy + (rnd(i, 3) - 0.5) * H * 1.3 * k;
      const tw = 0.55 + 0.45 * Math.sin(uiTime * (0.8 + rnd(i, 4) * 2.4) + rnd(i, 5) * Math.PI * 2);
      const a = (0.2 + layer * 0.55) * tw;
      ctx.fillStyle = rnd(i, 6) < 0.85 ? `rgba(255, 247, 224, ${a})` : `rgba(150, 210, 255, ${a})`;
      ctx.beginPath();
      ctx.arc(x, y, 0.5 + layer * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // red threat glow building at the edges as the swarm closes in,
    // snuffed out right after the shockwave clears them
    const threat =
      clamp01((t - 0.24) / (HIT - 0.24)) * (t < HIT ? 1 : 1 - clamp01((t - HIT) / 0.15));
    if (threat > 0.01) {
      const tg = ctx.createRadialGradient(cx, cy, maxR * 0.55, cx, cy, maxR * 1.05);
      tg.addColorStop(0, "rgba(196, 30, 58, 0)");
      tg.addColorStop(1, `rgba(196, 30, 58, ${0.32 * threat})`);
      ctx.fillStyle = tg;
      ctx.fillRect(0, 0, W, H);
    }

    // hero ship: cruises along the flight line, afterburner-dashes off on the hit
    const dashT = t >= HIT ? clamp01((t - HIT) / 0.12) : 0;
    if (shipP > -0.05 && dashT < 1) {
      const p = Math.min(shipP, 1);
      let pos = pathAt(p);
      const ahead = pathAt(p + 0.01);
      let angle = Math.atan2(ahead.y - pos.y, ahead.x - pos.x);
      if (dashT > 0) {
        pos = { x: pos.x + dashT * dashT * W * 1.4, y: pos.y };
        angle *= 1 - dashT;
      }
      const size = minDim * 0.1;

      // fading gold wake behind the ship
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let k = 1; k <= 12; k++) {
        const tp = p - k * 0.018;
        if (tp < -0.05) break;
        const wp = pathAt(tp);
        const fade = 1 - k / 12;
        ctx.fillStyle = `rgba(255, 200, 80, ${0.16 * fade * (1 - dashT)})`;
        ctx.beginPath();
        ctx.arc(wp.x, wp.y, size * 0.09 * (0.4 + fade * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      this.drawIntroShip(pos.x, pos.y, angle, size, dashT > 0 ? 1 + dashT : 0.7, uiTime);
    }

    // slam shockwave, centered where the ship was when it dashed
    const shockOrigin = pathAt(1);
    const ringT = t >= HIT ? clamp01((t - HIT) / 0.3) : 0;
    const ringR = lerp(minDim * 0.05, maxR * 1.2, ringT * ringT * (3 - 2 * ringT));

    // the swarm: real hex drones pouring in behind the ship, gaining on it
    for (let i = 0; i < 14; i++) {
      const closeIn = clamp01((t - 0.24) / (HIT - 0.24)) * 0.45;
      const lag = (0.16 + rnd(i, 7) * 0.3) * (1 - closeIn);
      // frozen at the slam so the shockwave catches them where they stood
      const q = Math.min(shipP, 1) - lag;
      if (q < -0.3) continue;
      const pos = pathAt(q);
      pos.y +=
        (rnd(i, 8) - 0.5) * H * 0.24 * (1 - closeIn * 0.5) +
        Math.sin(t * 46 + i * 2.7) * H * 0.008;
      const r = minDim * (0.016 + rnd(i, 12) * 0.018);
      const spin = uiTime * (0.8 + rnd(i, 9) * 2) * (rnd(i, 11) < 0.5 ? -1 : 1);

      // when does the expanding shockwave reach this drone?
      let sinceDeath = -1;
      if (t >= HIT) {
        const dist = Math.hypot(pos.x - shockOrigin.x, pos.y - shockOrigin.y);
        const f = clamp01((dist - minDim * 0.05) / (maxR * 1.2 - minDim * 0.05));
        // inverse smoothstep: when the eased ring radius sweeps past `dist`
        const invT = 0.5 - Math.sin(Math.asin(1 - 2 * f) / 3);
        sinceDeath = t - (HIT + 0.3 * invT);
      }

      if (sinceDeath < 0) {
        this.drawIntroDrone(pos.x, pos.y, r, spin);
        continue;
      }

      // detonation flash as the ring passes
      const flashA = 1 - clamp01(sinceDeath / 0.05);
      if (flashA > 0) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const g = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, r * 3.2);
        g.addColorStop(0, `rgba(255, 250, 235, ${0.9 * flashA})`);
        g.addColorStop(0.5, `rgba(255, 180, 70, ${0.5 * flashA})`);
        g.addColorStop(1, "rgba(255, 180, 70, 0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r * 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // shrapnel shards flying outward
      const shardLife = clamp01(sinceDeath / 0.11);
      if (shardLife < 1) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.lineCap = "round";
        for (let k = 0; k < 6; k++) {
          const ang = rnd(i, 20 + k) * Math.PI * 2;
          const d = minDim * (2 + rnd(i, 30 + k) * 3) * sinceDeath;
          const px = pos.x + Math.cos(ang) * d;
          const py = pos.y + Math.sin(ang) * d;
          const a = (1 - shardLife) * 0.8;
          ctx.strokeStyle =
            rnd(i, 40 + k) < 0.5 ? `rgba(255, 120, 90, ${a})` : `rgba(255, 210, 120, ${a})`;
          ctx.lineWidth = Math.max(1, r * 0.22 * (1 - shardLife));
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + Math.cos(ang) * r * 0.9, py + Math.sin(ang) * r * 0.9);
          ctx.stroke();
        }
        ctx.restore();
      }

      // drifting embers that linger through the title beat
      const emberLife = clamp01(sinceDeath / 0.45);
      if (emberLife < 1 && sinceDeath > 0.03) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (let k = 0; k < 2; k++) {
          const ang = -Math.PI / 2 + (rnd(i, 50 + k) - 0.5) * 1.6;
          const drift = minDim * (0.12 + rnd(i, 60 + k) * 0.18) * sinceDeath;
          const ex = pos.x + Math.cos(ang) * drift + Math.sin(uiTime * 2 + i + k) * minDim * 0.004;
          const ey = pos.y + Math.sin(ang) * drift;
          const a = (1 - emberLife) * (0.4 + 0.25 * Math.sin(uiTime * 9 + i * 3 + k * 5));
          if (a <= 0) continue;
          ctx.fillStyle = `rgba(255, 200, 100, ${a})`;
          ctx.beginPath();
          ctx.arc(ex, ey, Math.max(1, r * 0.16), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    // the shockwave ring itself
    if (t >= HIT && ringT < 1) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = `rgba(255, 215, 0, ${0.7 * (1 - ringT)})`;
      ctx.lineWidth = 3 + (1 - ringT) * 9;
      ctx.shadowColor = "rgba(255, 200, 80, 0.9)";
      ctx.shadowBlur = 26;
      ctx.beginPath();
      ctx.arc(shockOrigin.x, shockOrigin.y, ringR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = `rgba(255, 250, 235, ${0.5 * (1 - ringT)})`;
      ctx.lineWidth = 1.5 + (1 - ringT) * 3;
      ctx.beginPath();
      ctx.arc(shockOrigin.x, shockOrigin.y, ringR * 0.9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // ORION slams in letter by letter: overshooting scale, gold gradient,
    // a hot white core pass right at each letter's impact
    if (t >= HIT) {
      const titleSize = minDim * 0.17;
      const letters = ["O", "R", "I", "O", "N"];
      ctx.save();
      ctx.font = `bold ${titleSize}px Georgia, serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const spacing = titleSize * 0.24;
      const widths = letters.map((ch) => ctx.measureText(ch).width);
      const total = widths.reduce((a, b) => a + b, 0) + spacing * (letters.length - 1);
      const ty = cy - minDim * 0.02;
      // local-space gradient, painted inside each letter's translate
      const grad = ctx.createLinearGradient(0, -titleSize * 0.5, 0, titleSize * 0.5);
      grad.addColorStop(0, PALETTE.goldPale);
      grad.addColorStop(0.55, PALETTE.gold);
      grad.addColorStop(1, PALETTE.goldDark);
      let lx = cx - total / 2;
      for (let i = 0; i < letters.length; i++) {
        const slam = clamp01((t - HIT - i * 0.014) / 0.09);
        const letterX = lx + widths[i] / 2;
        lx += widths[i] + spacing;
        if (slam <= 0) continue;
        const ease = 1 - (1 - slam) ** 3;
        ctx.save();
        ctx.translate(letterX, ty);
        ctx.scale(lerp(2.4, 1, ease), lerp(2.4, 1, ease));
        ctx.globalAlpha = ease * (1 - fadeOut);
        ctx.shadowColor = "rgba(255, 200, 60, 0.85)";
        ctx.shadowBlur = 34 + Math.sin(uiTime * 3.2) * 8;
        ctx.fillStyle = grad;
        ctx.fillText(letters[i], 0, 0);
        ctx.shadowBlur = 0;
        ctx.fillStyle = `rgba(255, 250, 235, ${(1 - slam) * 0.9})`;
        ctx.fillText(letters[i], 0, 0);
        ctx.restore();
      }
      ctx.restore();

      // tagline fades in after the slam settles
      const tagA = clamp01((t - HIT - 0.22) / 0.15);
      if (tagA > 0) {
        ctx.save();
        ctx.globalAlpha = tagA * (1 - fadeOut);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `${minDim * 0.032}px Georgia, serif`;
        ctx.fillStyle = "rgb(228, 60, 84)";
        ctx.shadowColor = "rgba(196, 30, 58, 0.7)";
        ctx.shadowBlur = 14;
        ctx.fillText("S U R V I V E   T H E   S W A R M", cx, cy + minDim * 0.11);
        ctx.restore();
      }
    }

    // white impact flash at the slam
    const flash = t >= HIT ? clamp01(1 - (t - HIT) / 0.1) : 0;
    if (flash > 0) {
      ctx.fillStyle = `rgba(255, 250, 235, ${flash * flash * 0.9})`;
      ctx.fillRect(-sx, -sy, W, H);
    }

    ctx.restore(); // end of shaken space

    // vignette over everything for the filmic look
    const vg = ctx.createRadialGradient(cx, cy, maxR * 0.45, cx, cy, maxR * 1.05);
    vg.addColorStop(0, "rgba(0, 0, 0, 0)");
    vg.addColorStop(1, "rgba(0, 0, 0, 0.45)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    // letterbox bars: slide in at the start, retract during the hand-over
    const barH = H * 0.075 * clamp01(t / 0.06) * (1 - fadeOut);
    if (barH > 0) {
      ctx.fillStyle = "rgb(0, 0, 0)";
      ctx.fillRect(0, 0, W, barH);
      ctx.fillRect(0, H - barH, W, barH);
    }

    // skip hint, resting in the bottom letterbox bar
    const hintA = clamp01((t - 0.2) / 0.08) * (1 - fadeOut);
    if (hintA > 0) {
      ctx.save();
      ctx.globalAlpha = hintA * (0.45 + 0.15 * Math.sin(uiTime * 2.4));
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `${Math.max(11, minDim * 0.016)}px Georgia, serif`;
      ctx.fillStyle = PALETTE.goldPale;
      ctx.fillText("tap or press any key to skip", cx, H - Math.max(barH / 2, minDim * 0.03));
      ctx.restore();
    }

    ctx.restore();
  }

  /** The hero ship at screen scale — same silhouette as the in-game dart. */
  private drawIntroShip(
    x: number,
    y: number,
    angle: number,
    size: number,
    flame: number,
    uiTime: number,
  ): void {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(size, size);

    // engine flame (hotter and longer during the dash)
    if (flame > 0) {
      const flicker = 0.8 + 0.2 * Math.sin(uiTime * 40);
      const flameLen = 0.55 * flicker * flame;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const fg = ctx.createLinearGradient(-0.35, 0, -0.35 - flameLen, 0);
      fg.addColorStop(0, flame > 1.2 ? "#ffe9b0" : "#ffb347");
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

    // hull: the same sleek gold dart with red canopy as drawShip
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

    ctx.fillStyle = PALETTE.red;
    ctx.beginPath();
    ctx.ellipse(0.14, 0, 0.13, 0.07, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /** A pursuing drone at screen scale — same hex shell as the in-game swarm. */
  private drawIntroDrone(x: number, y: number, r: number, spin: number): void {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(spin);
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
    dg.addColorStop(0, PALETTE.redBright);
    dg.addColorStop(1, PALETTE.redDark);
    ctx.fillStyle = dg;
    ctx.fill();
    ctx.strokeStyle = "#3d0810";
    ctx.lineWidth = Math.max(1, r * 0.18);
    ctx.stroke();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = "#ff8866";
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Arrival flash: the warp's white-out fading to reveal gameplay. */
  private drawFlashFx(t: number): void {
    const { ctx } = this;
    const a = clamp01(1 - t);
    ctx.fillStyle = `rgba(255, 250, 235, ${a * a})`;
    ctx.fillRect(0, 0, this.cssW, this.cssH);
  }

  /**
   * Death veil: the field darkens and a slow crimson tide rises from the
   * bottom of the screen while the wreckage drifts.
   */
  private drawDeathFx(t: number, uiTime: number): void {
    const { ctx } = this;
    const ease = t * t * (3 - 2 * t);

    // darken the world
    ctx.fillStyle = `rgba(2, 2, 8, ${ease * 0.6})`;
    ctx.fillRect(0, 0, this.cssW, this.cssH);

    // rising red tide with a slow heartbeat pulse
    const pulse = 0.85 + 0.15 * Math.sin(uiTime * 2.4);
    const rise = ease * pulse;
    const tide = ctx.createLinearGradient(0, this.cssH, 0, this.cssH * (1 - rise * 1.15));
    tide.addColorStop(0, `rgba(140, 10, 30, ${0.55 * ease})`);
    tide.addColorStop(0.5, `rgba(196, 30, 58, ${0.28 * ease})`);
    tide.addColorStop(1, "rgba(196, 30, 58, 0)");
    ctx.fillStyle = tide;
    ctx.fillRect(0, 0, this.cssW, this.cssH);

    // blood-red vignette closing in from the corners
    const vig = ctx.createRadialGradient(
      this.cssW / 2,
      this.cssH / 2,
      Math.min(this.cssW, this.cssH) * (0.55 - ease * 0.15),
      this.cssW / 2,
      this.cssH / 2,
      Math.max(this.cssW, this.cssH) * 0.8,
    );
    vig.addColorStop(0, "rgba(60, 4, 12, 0)");
    vig.addColorStop(1, `rgba(60, 4, 12, ${0.75 * ease})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, this.cssW, this.cssH);
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
    if (s.thrusting > 0 || dashing) {
      const flicker = 0.8 + 0.2 * Math.sin(opts.uiTime * 40);
      const flameLen = (dashing ? 1.1 : 0.55) * flicker * Math.max(s.thrusting, dashing ? 1 : 0);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const fg = ctx.createLinearGradient(-0.35, 0, -0.35 - flameLen, 0);
      fg.addColorStop(0, dashing ? "#ffe9b0" : "#ffb347");
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

    // afterburner arrival grace: flickering ember aura that fades with the window
    if (world.powers.afterburnerGrace > 0 && world.powers.afterburnerDash <= 0) {
      const fade = clamp01(
        world.powers.afterburnerGrace / POWERS.afterburner.arrivalInvulnTime,
      );
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = fade * (0.4 + 0.25 * Math.sin(opts.uiTime * 24));
      const gg = ctx.createRadialGradient(x, y, 0.15, x, y, 0.75);
      gg.addColorStop(0, "rgba(255,217,160,0)");
      gg.addColorStop(0.75, "rgba(255,102,51,0.4)");
      gg.addColorStop(1, PALETTE.afterburner);
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(x, y, 0.75, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = PALETTE.afterburner;
      ctx.lineWidth = 0.04;
      ctx.stroke();
      ctx.restore();
    }

    // shield bubble: steady (it persists until it absorbs a hit)
    if (world.powers.shieldActive) {
      const alpha = 0.3 + 0.08 * Math.sin(opts.uiTime * 2.5);
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

    // starshell: golden ram-kill shell with rotating star points
    if (world.powers.starshellTimer > 0) {
      const remaining = world.powers.starshellTimer;
      let alpha = 0.5;
      if (remaining <= POWERS.starshell.flickerLastSeconds) {
        alpha = lerp(0.25, 0.75, pingPong(opts.uiTime * 5));
      }
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = alpha;
      const shellR = 0.8;
      const gg = ctx.createRadialGradient(x, y, 0.25, x, y, shellR);
      gg.addColorStop(0, "rgba(255,210,77,0)");
      gg.addColorStop(0.75, "rgba(255,210,77,0.4)");
      gg.addColorStop(1, PALETTE.starshell);
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(x, y, shellR, 0, Math.PI * 2);
      ctx.fill();
      // spiked rim so it reads as "touching this kills THEM"
      ctx.strokeStyle = PALETTE.starshell;
      ctx.lineWidth = 0.06;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = opts.uiTime * 1.8 + (Math.PI / 4) * i;
        ctx.moveTo(x + Math.cos(a) * shellR * 0.92, y + Math.sin(a) * shellR * 0.92);
        ctx.lineTo(x + Math.cos(a) * shellR * 1.18, y + Math.sin(a) * shellR * 1.18);
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, shellR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // autocannon: silvery turret ring with a barrel tracking the last target
    if (world.powers.autocannonTimer > 0) {
      const aim = world.powers.autocannonAngle;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = PALETTE.autocannon;
      ctx.lineWidth = 0.05;
      ctx.beginPath();
      ctx.arc(x, y, 0.42, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 0.09;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(aim) * 0.42, y + Math.sin(aim) * 0.42);
      ctx.lineTo(x + Math.cos(aim) * 0.72, y + Math.sin(aim) * 0.72);
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
      case "starshell":
        // five-pointed star
        for (let i = 0; i < 5; i++) {
          const outer = -Math.PI / 2 + (Math.PI * 2 * i) / 5;
          const inner = -Math.PI / 2 + (Math.PI * 2 * (i + 0.5)) / 5;
          const px = Math.cos(outer) * size;
          const py = Math.sin(outer) * size;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
          ctx.lineTo(Math.cos(inner) * size * 0.45, Math.sin(inner) * size * 0.45);
        }
        ctx.closePath();
        ctx.fill();
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
      case "arc":
        ctx.moveTo(-size * 0.15, size);
        ctx.lineTo(size * 0.35, -size * 0.05);
        ctx.lineTo(-size * 0.05, -size * 0.05);
        ctx.lineTo(size * 0.2, -size);
        ctx.lineTo(-size * 0.35, size * 0.05);
        ctx.lineTo(size * 0.05, size * 0.05);
        ctx.closePath();
        ctx.fill();
        break;
      case "autocannon":
        // crosshair: ring + four ticks + center dot
        ctx.arc(0, 0, size * 0.55, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const a = (Math.PI / 2) * i;
          ctx.moveTo(Math.cos(a) * size * 0.55, Math.sin(a) * size * 0.55);
          ctx.lineTo(Math.cos(a) * size, Math.sin(a) * size);
        }
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, size * 0.14, 0, Math.PI * 2);
        ctx.fill();
        break;
      case "meteors":
        // falling comet: filled head with trailing speed lines
        ctx.arc(-size * 0.3, -size * 0.35, size * 0.42, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-size * 0.05, -size * 0.05);
        ctx.lineTo(size * 0.75, size * 0.75);
        ctx.moveTo(-size * 0.45, size * 0.15);
        ctx.lineTo(size * 0.15, size * 0.85);
        ctx.moveTo(-size * 0.05, -size * 0.6);
        ctx.lineTo(size * 0.65, size * 0.15);
        ctx.stroke();
        break;
      case "vortex": {
        // inward spiral (2 turns)
        const turns = 2;
        const steps = 40;
        ctx.moveTo(size, 0);
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const a = t * Math.PI * 2 * turns;
          const r = size * (1 - t * 0.9);
          ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, size * 0.12, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
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

      // Naval-mine silhouette in hostile red — nothing gold, so it can't be
      // mistaken for a power pickup (pickups are colored rings with glyphs).
      // Jagged triangular spikes, alternating long/short
      ctx.fillStyle = armed ? "#c41e3a" : "#6a2430";
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (Math.PI / 5) * i;
        const len = i % 2 === 0 ? 1.65 : 1.35;
        const half = 0.16;
        ctx.moveTo(Math.cos(a - half) * r * 0.85, Math.sin(a - half) * r * 0.85);
        ctx.lineTo(Math.cos(a) * r * len, Math.sin(a) * r * len);
        ctx.lineTo(Math.cos(a + half) * r * 0.85, Math.sin(a + half) * r * 0.85);
        ctx.closePath();
      }
      ctx.fill();

      // dark steel body with a blood-red rim
      const bg = ctx.createRadialGradient(-r * 0.25, r * 0.25, r * 0.1, 0, 0, r);
      bg.addColorStop(0, "#3a2230");
      bg.addColorStop(1, "#160d16");
      ctx.fillStyle = bg;
      ctx.strokeStyle = armed ? "#e6394f" : "#7a3040";
      ctx.lineWidth = 0.07;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // rivet band across the equator (reads mechanical, not collectible)
      ctx.fillStyle = armed ? "#ff8896" : "#8a4a55";
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i + Math.PI / 6;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62, r * 0.09, 0, Math.PI * 2);
        ctx.fill();
      }

      // blinking eye: dull ember while arming, harsh red strobe when live
      const blink = armed
        ? Math.sin(time * 6 + m.seed) > 0.2
          ? 1
          : 0.35
        : 0.3 + 0.2 * Math.sin(time * 12);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = alpha * blink;
      const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.55);
      cg.addColorStop(0, armed ? "#ff3344" : "#aa4433");
      cg.addColorStop(1, "rgba(255,40,60,0)");
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
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

  /** Singularities: a dark core, a swirling rim, and a faint pull-radius ring. */
  private drawVortices(world: World, time: number): void {
    if (world.powers.vortices.length === 0) return;
    const { ctx } = this;
    const cfg = POWERS.vortex;
    const color = PALETTE.vortex;

    for (const v of world.powers.vortices) {
      const progress = 1 - v.timer / cfg.pullDuration; // 0 -> 1 toward collapse
      const coreR = 0.5 + progress * 0.5;

      ctx.save();

      // faint pull-radius ring so players read the danger zone
      ctx.globalAlpha = 0.12 + 0.05 * Math.sin(time * 5);
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.05;
      ctx.setLineDash([0.35, 0.3]);
      ctx.beginPath();
      ctx.arc(v.x, v.y, cfg.pullRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // dark core swallowing the light
      ctx.globalAlpha = 0.8;
      const core = ctx.createRadialGradient(v.x, v.y, 0, v.x, v.y, coreR);
      core.addColorStop(0, "rgba(6,4,18,0.95)");
      core.addColorStop(0.7, "rgba(30,20,70,0.7)");
      core.addColorStop(1, "rgba(136,119,255,0)");
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(v.x, v.y, coreR, 0, Math.PI * 2);
      ctx.fill();

      // rotating spiral arms, tightening as the collapse nears
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.55 + progress * 0.3;
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.07;
      ctx.lineCap = "round";
      const arms = 3;
      for (let arm = 0; arm < arms; arm++) {
        const base = time * 3 + (Math.PI * 2 * arm) / arms;
        ctx.beginPath();
        const steps = 16;
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const r = coreR * 0.4 + (2.2 - progress * 0.8) * t;
          const a = base + t * 2.6;
          const px = v.x + Math.cos(a) * r;
          const py = v.y + Math.sin(a) * r;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  /** Autocannon tracers: short bright streaks along their flight path. */
  private drawBullets(world: World, alpha: number): void {
    if (world.powers.bullets.length === 0) return;
    const { ctx } = this;
    const color = PALETTE.autocannon;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    for (const b of world.powers.bullets) {
      const x = lerp(b.prevX, b.x, alpha);
      const y = lerp(b.prevY, b.y, alpha);
      const tailX = x - b.dirX * 0.5;
      const tailY = y - b.dirY * 0.5;

      const tg = ctx.createLinearGradient(x, y, tailX, tailY);
      tg.addColorStop(0, color);
      tg.addColorStop(1, "rgba(232,232,248,0)");
      ctx.strokeStyle = tg;
      ctx.lineWidth = 0.09;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(tailX, tailY);
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(x, y, 0.07, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
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

  /** Subtle arena walls — glow brighter near the ship so the boundary reads. */
  private drawArenaBoundary(world: World): void {
    const { ctx } = this;
    const hw = world.viewW / 2;
    const hh = world.viewH / 2;
    const ship = world.ship;
    const baseAlpha = 0.12;
    const maxAlpha = 0.5;
    const glowDist = 4;

    ctx.save();
    ctx.lineWidth = 0.08;
    ctx.lineCap = "round";
    ctx.globalCompositeOperation = "lighter";

    const drawEdge = (x1: number, y1: number, x2: number, y2: number): void => {
      const steps = 18;
      for (let i = 0; i < steps; i++) {
        const t0 = i / steps;
        const t1 = (i + 1) / steps;
        const mx0 = lerp(x1, x2, t0);
        const my0 = lerp(y1, y2, t0);
        const mx1 = lerp(x1, x2, t1);
        const my1 = lerp(y1, y2, t1);
        const midX = (mx0 + mx1) / 2;
        const midY = (my0 + my1) / 2;
        const dist = Math.hypot(midX - ship.x, midY - ship.y);
        const glow = clamp01(1 - dist / glowDist);
        const alpha = baseAlpha + glow * (maxAlpha - baseAlpha);
        ctx.strokeStyle = `rgba(255, 215, 0, ${alpha})`;
        ctx.beginPath();
        ctx.moveTo(mx0, my0);
        ctx.lineTo(mx1, my1);
        ctx.stroke();
      }
    };

    drawEdge(-hw, hh, hw, hh);
    drawEdge(-hw, -hh, hw, -hh);
    drawEdge(-hw, -hh, -hw, hh);
    drawEdge(hw, -hh, hw, hh);
    ctx.restore();
  }

  /** Jagged chain-lightning bolts between arc jump points. */
  private drawArcBolts(world: World): void {
    const { ctx } = this;
    const lifetime = POWERS.arc.boltLifetime;
    for (const bolt of world.powers.arcBolts) {
      const t = clamp01(bolt.elapsed / lifetime);
      const alpha = (1 - t) * 0.95;
      const dx = bolt.toX - bolt.fromX;
      const dy = bolt.toY - bolt.fromY;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const segments = 7;

      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = alpha;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = PALETTE.arc;
      ctx.lineWidth = 0.14 * (1 - t) + 0.04;
      ctx.beginPath();
      ctx.moveTo(bolt.fromX, bolt.fromY);
      for (let i = 1; i <= segments; i++) {
        const frac = i / segments;
        const px = bolt.fromX + dx * frac;
        const py = bolt.fromY + dy * frac;
        const jag = i === segments ? 0 : Math.sin(bolt.seed + i * 2.7) * 0.28;
        ctx.lineTo(px + nx * jag, py + ny * jag);
      }
      ctx.stroke();

      ctx.strokeStyle = PALETTE.white;
      ctx.lineWidth = 0.05;
      ctx.globalAlpha = alpha * 0.75;
      ctx.stroke();
      ctx.restore();
    }
  }

  // --- screen-space HUD ---

  private drawHud(world: World, opts: RenderOpts): void {
    const { ctx } = this;
    const padTop = 18 + this.safe.top;
    const pad = 18 + this.safe.left;

    ctx.textBaseline = "top";

    // score (top-left)
    ctx.textAlign = "left";
    ctx.fillStyle = PALETTE.gold;
    ctx.font = "bold 26px Georgia, serif";
    ctx.fillText(Math.floor(world.score).toLocaleString(), pad, padTop);

    // multiplier (gold-hot as it climbs toward the cap)
    const m = world.multiplier;
    const heat = clamp01((m - 1) / (SCORING.multiplierMax - 1));
    ctx.font = "bold 17px Georgia, serif";
    ctx.fillStyle = heat > 0.55 ? PALETTE.gold : m > 1.01 ? PALETTE.redBright : PALETTE.bronze;
    ctx.fillText(`x${m.toFixed(1)}`, pad, padTop + 32);

    // active kill chain
    if (world.chainCount >= 3 && world.chainTimer > 0) {
      ctx.fillStyle = PALETTE.goldPale;
      ctx.font = "bold 13px Georgia, serif";
      ctx.fillText(`CHAIN ×${world.chainCount}`, pad + 64, padTop + 35);
    }

    // best (under the score, clear of the pause button top-right)
    ctx.fillStyle = PALETTE.bronze;
    ctx.font = "13px Georgia, serif";
    ctx.fillText(`BEST ${Math.floor(opts.bestScore).toLocaleString()}`, pad, padTop + 58);

    // time (top-center)
    const mins = Math.floor(world.time / 60);
    const secs = Math.floor(world.time % 60);
    ctx.textAlign = "center";
    ctx.fillStyle = PALETTE.goldPale;
    ctx.font = "20px Georgia, serif";
    ctx.fillText(`${mins}:${secs.toString().padStart(2, "0")}`, this.cssW / 2, padTop);

    // daily runs wear their colors the whole flight
    if (opts.daily) {
      ctx.fillStyle = PALETTE.gold;
      ctx.font = "bold 11px Georgia, serif";
      ctx.fillText("☀ D A I L Y   P A T R O L", this.cssW / 2, padTop + 26);
    }

    // active power timers (bottom-left)
    const powers: Array<[string, number, number, string]> = [];
    const p = world.powers;
    if (p.shieldActive) powers.push(["SHIELD", 1, 1, POWER_COLORS.shield]);
    if (p.starshellTimer > 0)
      powers.push(["STARSHELL: RAM!", p.starshellTimer, POWERS.starshell.duration, POWER_COLORS.starshell]);
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
    if (p.autocannonTimer > 0)
      powers.push([
        "AUTOCANNON",
        p.autocannonTimer,
        POWERS.autocannon.duration,
        POWER_COLORS.autocannon,
      ]);
    if (p.meteorTimer > 0)
      powers.push(["METEORS", p.meteorTimer, POWERS.meteors.duration, POWER_COLORS.meteors]);

    let py = this.cssH - pad - this.safe.bottom - powers.length * 24;
    ctx.textAlign = "left";
    ctx.font = "12px Georgia, serif";
    for (const [name, remaining, total, color] of powers) {
      const frac = clamp01(remaining / total);
      ctx.fillStyle = color;
      ctx.fillText(name, pad, py);
      ctx.globalAlpha = 0.3;
      ctx.fillRect(pad + 122, py + 3, 80, 7);
      ctx.globalAlpha = 1;
      ctx.fillRect(pad + 122, py + 3, 80 * frac, 7);
      py += 24;
    }

  }

  private drawTouchOverlay(touch: TouchStickView): void {
    const { ctx } = this;
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
}
