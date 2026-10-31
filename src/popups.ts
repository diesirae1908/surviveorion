// Floating world-space text: "+120" on kills, power names on pickup.

interface Popup {
  x: number;
  y: number;
  text: string;
  color: string;
  age: number;
  lifetime: number;
  size: number; // world units of text height
  /** Rising style: ease-out rise (world units) with a pop-in scale. 0 = classic float. */
  rise: number;
  /** Keep the whole text inside the visible field (form names). Absent = classic. */
  fit?: PopupFit;
}

/** Visible field half extents (world units) plus the offset to flip below the ship. */
export interface PopupFit {
  hw: number;
  hh: number;
  /** Ship y; when the popup is too near the top it moves to shipY - offset. */
  shipY: number;
  offset: number;
}

/** Padding between a fitted popup and the field edge, world units. */
export const FIT_PAD = 0.25;
/** Clear band under the top edge (HUD row, pause button), world units. */
export const FIT_TOP_BAND = 1.0;

/**
 * Pure placement for a fitted popup: x clamped so the full measured text
 * (textW, world units) stays inside the field with FIT_PAD; y flipped below
 * the ship when the text would run into the top band (allowing `rise` of
 * float), then kept above the bottom edge.
 */
export function fitPopup(
  x: number,
  y: number,
  textW: number,
  textH: number,
  fit: PopupFit,
  rise = 0,
): { x: number; y: number } {
  const lim = Math.max(0, fit.hw - FIT_PAD - textW / 2);
  const nx = Math.max(-lim, Math.min(lim, x));
  let ny = y;
  if (ny + rise + textH / 2 > fit.hh - FIT_TOP_BAND) ny = fit.shipY - fit.offset;
  const floor = -fit.hh + FIT_PAD + textH / 2;
  if (ny < floor) ny = floor;
  return { x: nx, y: ny };
}

export class Popups {
  private items: Popup[] = [];

  spawn(x: number, y: number, text: string, color: string, size = 0.45, lifetime = 0.9): void {
    this.items.push({ x, y, text, color, age: 0, lifetime, size, rise: 0 });
  }

  /** Form-name pop: placed so the whole text stays inside the visible field. */
  spawnFitted(x: number, y: number, text: string, color: string, size: number, lifetime: number, fit: PopupFit): void {
    this.items.push({ x, y, text, color, age: 0, lifetime, size, rise: 0, fit });
  }

  /** Short rising pop (ui.hud kill pops): scales in, floats up with ease-out, fades. */
  spawnRising(x: number, y: number, text: string, color: string, size: number, lifetime: number, rise: number): void {
    this.items.push({ x, y, text, color, age: 0, lifetime, size, rise });
  }

  update(dt: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      p.age += dt;
      if (p.age >= p.lifetime) this.items.splice(i, 1);
    }
  }

  clear(): void {
    this.items.length = 0;
  }

  /** Draw inside the world transform (y-up); text is re-flipped locally. */
  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.items) {
      const t = p.age / p.lifetime;
      const alpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      const rise = p.rise > 0 ? p.rise * (1 - (1 - t) * (1 - t)) : t * 0.8;
      const pop = p.rise > 0 ? 0.7 + 0.3 * Math.min(1, t / 0.2) : 1;

      // world transform is y-flipped; draw text at ~32px then scale to world units
      const s = (p.size * pop) / 32;
      let px = p.x;
      let py = p.y;
      if (p.fit) {
        // measure with the real font at full size, so the pop-in never overshoots the clamp
        ctx.font = "700 32px Rajdhani, sans-serif";
        const full = p.size / 32;
        const at = fitPopup(p.x, p.y, ctx.measureText(p.text).width * full, p.size, p.fit, 0.8);
        px = at.x;
        py = at.y;
      }
      ctx.save();
      ctx.translate(px, py + rise);
      ctx.scale(s, -s);
      ctx.globalAlpha = alpha;
      ctx.font = "700 32px Rajdhani, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, 0, 0);
      ctx.restore();
    }
  }
}
