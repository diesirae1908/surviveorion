/**
 * UI-only mutator glyphs for the daily lobby. Never imported by gameplay.
 * Looks up by id; unknown ids get a hex frame plus the first letter.
 * Does not import MUTATOR_POOL (keys are a UI catalog, not a spawn table).
 */

const HEX =
  `<polygon points="24,3 43,14 43,34 24,45 5,34 5,14" fill="none" stroke="currentColor" stroke-width="2"/>`;

function svg(inner: string): string {
  return `<svg viewBox="0 0 48 48" aria-hidden="true">${HEX}${inner}</svg>`;
}

function fallbackMark(id: string): string {
  const ch = (id.replace(/[^a-z0-9]/gi, "")[0] ?? "?").toUpperCase();
  return (
    `<text x="24" y="30" text-anchor="middle" fill="currentColor" ` +
    `font-size="16" font-weight="700" font-family="Rajdhani, system-ui, sans-serif">${ch}</text>`
  );
}

/** Known lobby glyphs. Keys use template literals so this file stays a UI map. */
const GLYPHS: Record<string, string> = {
  [`blackout`]: svg(`<circle cx="24" cy="24" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M24 16 v16" stroke="currentColor" stroke-width="2"/>`),
  [`red-alert`]: svg(`<path d="M24 12 L36 36 H12 Z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="24" cy="30" r="1.6" fill="currentColor"/><path d="M24 20 v6" stroke="currentColor" stroke-width="2"/>`),
  [`the-flood`]: svg(`<path d="M10 30 C16 22 20 34 24 26 C28 18 32 34 38 28" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 36 C16 28 22 38 28 32 C32 28 36 38 38 34" fill="none" stroke="currentColor" stroke-width="2"/>`),
  [`great-wall`]: svg(`<path d="M10 32 H38 M14 32 V20 H20 V32 M28 32 V18 H34 V32" fill="none" stroke="currentColor" stroke-width="2"/>`),
  [`year-of-the-serpent`]: svg(`<path d="M14 32 C18 20 30 20 34 16 C30 28 18 28 14 32" fill="none" stroke="currentColor" stroke-width="2"/>`),
  [`menagerie`]: svg(
    `<g fill="currentColor"><circle cx="17" cy="19" r="3"/><rect x="28" y="16" width="6" height="6" transform="rotate(45 31 19)"/><polygon points="17,26 21,33 13,33"/><circle cx="31" cy="30" r="3.4" fill="none" stroke="currentColor" stroke-width="2"/></g>` +
      `<path d="M11 13 V35 M37 13 V35" stroke="currentColor" stroke-width="1.2" opacity=".45"/>`,
  ),
  [`lancer-doctrine`]: svg(`<path d="M16 34 L32 14 M18 16 H32 V30" fill="none" stroke="currentColor" stroke-width="2"/>`),
  [`wheelhouse`]: svg(`<circle cx="24" cy="24" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M24 15 V33 M15 24 H33 M18 18 L30 30 M30 18 L18 30" stroke="currentColor" stroke-width="1.6"/>`),
  [`hunting-party`]: svg(`<path d="M16 32 L24 14 L32 32" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="24" cy="22" r="2" fill="currentColor"/>`),
  [`demolition-day`]: svg(`<circle cx="24" cy="24" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M24 16 V24 L30 28" stroke="currentColor" stroke-width="2"/>`),
  [`titanfall`]: svg(`<path d="M24 12 V36 M16 20 L24 12 L32 20" fill="none" stroke="currentColor" stroke-width="2"/>`),
  [`arsenal`]: svg(`<rect x="16" y="16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 24 H28 M24 20 V28" stroke="currentColor" stroke-width="2"/>`),
  [`overcharge`]: svg(`<path d="M27 11 L16 27 H23 L20 38 L32 21 H25 Z" fill="currentColor"/>`),
  [`cryo-winter`]: svg(`<path d="M24 12 V36 M14 18 L34 30 M34 18 L14 30" fill="none" stroke="currentColor" stroke-width="2"/>`),
  [`iron-barrage`]: svg(`<path d="M14 16 H34 M16 22 H32 M18 28 H30 M20 34 H28" fill="none" stroke="currentColor" stroke-width="2"/>`),
  [`singularity`]: svg(`<circle cx="24" cy="24" r="3" fill="currentColor"/><circle cx="24" cy="24" r="9" fill="none" stroke="currentColor" stroke-width="2"/>`),
  [`starfall`]: svg(`<path d="M24 12 L26 22 L36 24 L26 26 L24 36 L22 26 L12 24 L22 22 Z" fill="currentColor"/>`),
  [`the-pit`]: svg(`<path d="M12 16 H36 L30 34 H18 Z" fill="none" stroke="currentColor" stroke-width="2"/>`),
  [`giants`]: svg(`<circle cx="24" cy="22" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 34 H32" stroke="currentColor" stroke-width="2"/>`),
  [`minefield`]: svg(`<circle cx="18" cy="20" r="3" fill="currentColor"/><circle cx="30" cy="20" r="3" fill="currentColor"/><circle cx="24" cy="30" r="3" fill="currentColor"/>`),
  [`solar-wind`]: svg(`<path d="M12 20 C20 14 28 14 36 20 M12 28 C20 22 28 22 36 28" fill="none" stroke="currentColor" stroke-width="2"/>`),
  [`magnetic-field`]: svg(`<path d="M16 16 C8 24 8 24 16 32 M32 16 C40 24 40 24 32 32" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 24 H28" stroke="currentColor" stroke-width="2"/>`),
  [`ram-raid`]: svg(`<path d="M14 24 H30 L24 18 M30 24 L24 30" fill="none" stroke="currentColor" stroke-width="2"/>`),
  [`gold-dash`]: svg(`<path d="M14 30 L24 14 L34 30" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 30 H28" stroke="currentColor" stroke-width="2"/>`),
  [`the-lighthouse`]: svg(`<path d="M22 34 H26 V22 L24 12 L22 22 Z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 16 H32" stroke="currentColor" stroke-width="2"/>`),
  [`graze-protocol`]: svg(`<path d="M14 30 C20 14 28 14 34 30" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="24" cy="22" r="2" fill="currentColor"/>`),
  [`razor-day`]: svg(`<path d="M16 32 L24 14 L32 32 L24 28 Z" fill="none" stroke="currentColor" stroke-width="2"/>`),
  [`thunder-day`]: svg(`<path d="M26 12 L18 26 H26 L22 36 L32 20 H24 Z" fill="currentColor"/>`),
  [`cloak-day`]: svg(`<circle cx="24" cy="24" r="8" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 3"/>`),
  [`bait-shot`]: svg(`<circle cx="24" cy="24" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="24" cy="24" r="1.6" fill="currentColor"/>`),
  [`ion-day`]: svg(`<circle cx="24" cy="24" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M24 16 V32 M16 24 H32" stroke="currentColor" stroke-width="2"/>`),
  [`howlers-day`]: svg(`<path d="M14 30 C16 18 24 14 34 20 C28 22 26 28 24 34 C22 28 18 26 14 30 Z" fill="none" stroke="currentColor" stroke-width="2"/>`),
};

/** Inline SVG for a mutator id. Unknown ids get hex + first letter. */
export function glyphSvg(mutatorId: string): string {
  const known = GLYPHS[mutatorId];
  if (known) return known;
  return svg(fallbackMark(mutatorId));
}
