// Pilot Ladder, client side (owner: WS-O2). One JSON constant shared with the
// server (server/orders-catalog.json: `ladder`, `trails`). Pure: no DOM, no
// clock, no network, so it is tested in node (scripts/test-orders-ui.ts).
//
// Naming: "tier" in this file always means the LADDER tier (0 = Ensign ...
// 5 = Sovereign). An order's difficulty (easy/medium/hard) is called
// `difficulty` everywhere on the client so the two never collide.
//
// The ladder is cosmetic only: tiers unlock trails and nothing else (no stat,
// no score, no board order). Merit is awarded server side from validated runs.

import catalog from "../server/orders-catalog.json";

export interface LadderTierDef {
  tier: number;
  name: string;
  merit: number;
}

export interface TrailDef {
  id: string;
  label: string;
  /** Ladder tier that unlocks it. */
  tier: number;
}

export const LADDER = catalog.ladder as LadderTierDef[];
export const TRAILS = catalog.trails as TrailDef[];
export const DEFAULT_TRAIL_ID = "hull";

/**
 * Every player-facing string of the orders UI and the ladder, in one table so
 * Lucas approves the copy batch in one place (plan v3.1 section 11, decision 1).
 * Order lines themselves stay in `ORDER_COPY` (src/orders.ts). Mission Control
 * voice (brand/VOICE.md), no em dashes. DRAFT until approved.
 */
export const ORDERS_UI_COPY = {
  panelTitle: "TODAY'S ORDERS",
  panelFooter: "Same orders for every pilot today",
  signedOut: "Sign in to earn Merit",
  meritTag: "+{n} MERIT",
  progress: "{done} OF {total} DONE",
  resultComplete: "ORDER COMPLETE",
  resultTierUp: "PROMOTED TO {name}",
  ladderKicker: "PILOT LADDER",
  ladderBar: "{merit} / {next} TO {name}",
  ladderTop: "{merit} MERIT · TOP OF THE LADDER",
  ladderCreed: "EARNED BY FLYING, NOT BUYING",
  trailsTitle: "TRAILS",
  trailEquipped: "EQUIPPED",
  trailLocked: "Unlocks at {name}",
  trailFailed: "Could not equip that trail. Try again.",
} as const;

export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
}

/** Clamp any number to a real ladder tier index. */
export function clampTier(tier: number): number {
  if (!Number.isFinite(tier)) return 0;
  return Math.max(0, Math.min(LADDER.length - 1, Math.floor(tier)));
}

export function tierName(tier: number): string {
  return LADDER[clampTier(tier)].name;
}

/** Highest tier whose Merit threshold is met. Mirrors server/orders.mjs `tierForMerit`. */
export function tierForMerit(merit: number): number {
  let tier = 0;
  for (const l of LADDER) if (merit >= l.merit) tier = l.tier;
  return tier;
}

/** Trail ids unlocked at a ladder tier. Mirrors server/orders.mjs `unlockedTrails`. */
export function unlockedTrails(tier: number): string[] {
  return TRAILS.filter((t) => t.tier <= tier).map((t) => t.id);
}

export interface LadderModel {
  tier: number;
  name: string;
  merit: number;
  next: { tier: number; name: string; merit: number } | null;
  /** Merit still needed for the next tier (0 at the top). */
  toNext: number;
  /** 0..1 through the current tier toward the next (1 at the top). */
  progress: number;
  /** "12 / 30 TO TRIBUNE", or the top-of-ladder line. */
  barText: string;
}

/** Pure ladder view from a Merit total (tier is derived, never trusted from the caller). */
export function ladderModel(merit: number): LadderModel {
  const m = Number.isFinite(merit) && merit > 0 ? Math.floor(merit) : 0;
  const tier = tierForMerit(m);
  const here = LADDER[tier];
  const nextDef = LADDER[tier + 1] ?? null;
  if (!nextDef) {
    return {
      tier,
      name: here.name,
      merit: m,
      next: null,
      toNext: 0,
      progress: 1,
      barText: fill(ORDERS_UI_COPY.ladderTop, { merit: m }),
    };
  }
  const span = nextDef.merit - here.merit;
  return {
    tier,
    name: here.name,
    merit: m,
    next: { tier: nextDef.tier, name: nextDef.name, merit: nextDef.merit },
    toNext: nextDef.merit - m,
    progress: Math.max(0, Math.min(1, (m - here.merit) / span)),
    barText: fill(ORDERS_UI_COPY.ladderBar, { merit: m, next: nextDef.merit, name: nextDef.name.toUpperCase() }),
  };
}

export interface TrailPickItem {
  id: string;
  label: string;
  locked: boolean;
  equipped: boolean;
  /** Tier name that unlocks it. */
  unlockName: string;
  /** Tooltip / aria text. */
  hint: string;
}

/** Trail picker rows. `equipped` null or the default id both mean Hull Gold. */
export function trailPickerModel(tier: number, equipped: string | null): TrailPickItem[] {
  const t = clampTier(tier);
  const open = new Set(unlockedTrails(t));
  const current = equipped && open.has(equipped) ? equipped : DEFAULT_TRAIL_ID;
  return TRAILS.map((d) => {
    const locked = !open.has(d.id);
    return {
      id: d.id,
      label: d.label,
      locked,
      equipped: !locked && d.id === current,
      unlockName: tierName(d.tier),
      hint: locked ? fill(ORDERS_UI_COPY.trailLocked, { name: tierName(d.tier) }) : d.label,
    };
  });
}

// --- insignia and board chip (markup strings: no DOM needed to build or test) ---

/** Metal per ladder tier. Token colors only, never red (red is the swarm). */
export const TIER_METAL = ["#7a7a8c", "#aa8844", "#c0c0cc", "#ffd700", "#ffee88", "#fff7e0"] as const;

export function tierMetal(tier: number): string {
  return TIER_METAL[clampTier(tier)];
}

/** Insignia: hex shield, one chevron per tier (tier 0 is the bare shield with a dot). */
export function insigniaMarkup(tier: number): string {
  const t = clampTier(tier);
  const metal = tierMetal(t);
  let chev = "";
  for (let i = 0; i < t; i++) {
    const y = 18 - i * 11;
    chev += `<path d="M-20,${y + 9} L0,${y} L20,${y + 9}" fill="none" stroke="${metal}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  const core = t === 0 ? `<circle cx="0" cy="0" r="6" fill="${metal}"/>` : "";
  return (
    `<svg viewBox="-50 -56 100 112" class="lad-insignia-svg" aria-hidden="true" focusable="false">` +
    `<path d="M0,-52 L45,-26 L45,26 L0,52 L-45,26 L-45,-26 Z" fill="#0c0c14" stroke="${metal}" stroke-width="4"/>` +
    core +
    chev +
    `</svg>`
  );
}

/**
 * Small tier chevrons for a board row. Empty string when the row has no ladder
 * data or the pilot is still an Ensign, so a row without it renders exactly as today.
 */
export function ladderChipHtml(tier: number | null | undefined): string {
  if (typeof tier !== "number" || !Number.isFinite(tier)) return "";
  const t = clampTier(tier);
  if (t < 1) return "";
  const metal = tierMetal(t);
  const w = 3 + t * 5;
  let paths = "";
  for (let i = 0; i < t; i++) {
    paths += `<path d="M${i * 5 + 0.8},7 L${i * 5 + 3.4},3 L${i * 5 + 6},7" fill="none" stroke="${metal}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  const name = tierName(t);
  return (
    `<i class="lad-chip" data-tier="${t}" title="${name}" role="img" aria-label="${name}">` +
    `<svg viewBox="0 0 ${w} 10" width="${w}" height="10" aria-hidden="true" focusable="false">${paths}</svg></i>`
  );
}
