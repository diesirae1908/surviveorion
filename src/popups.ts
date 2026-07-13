// Floating world-space text: "+120" on kills, power names on pickup.

interface Popup {
  x: number;
  y: number;
  text: string;
  color: string;
  age: number;
  lifetime: number;
  size: number; // world units of text height
}

export class Popups {
  private items: Popup[] = [];

  spawn(x: number, y: number, text: string, color: string, size = 0.45, lifetime = 0.9): void {
    this.items.push({ x, y, text, color, age: 0, lifetime, size });
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
      const rise = t * 0.8;

      ctx.save();
      ctx.translate(p.x, p.y + rise);
      // world transform is y-flipped; draw text at ~32px then scale to world units
      const s = p.size / 32;
      ctx.scale(s, -s);
      ctx.globalAlpha = alpha;
      ctx.font = "bold 32px Georgia, serif";
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
