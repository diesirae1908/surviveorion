// Run highlight telemetry: a single memorable moment surfaced on the
// game-over screen. Deterministic game telemetry, not an inferred/guessed
// "skill score" — the closest a drone ever got to the ship during a graze
// without contact, which is already computed for scoring (see gameState.ts
// handleGrazes / SCORING.grazeBand). Pure functions, no DOM/canvas access,
// so this is unit-testable in isolation (scripts/test-highlights.ts).
//
// Reads world.time/position data only; never touches Math.random or the
// seeded schedule streams, so tracking it has zero effect on Daily Patrol
// determinism (scripts/sim-test.ts's determinism check is unaffected).

export interface ClosestCall {
  /** World.time (seconds survived) when this near-miss happened. */
  time: number;
  x: number;
  y: number;
  /**
   * 0 = grazed with zero clearance (a hair from contact), 1 = grazed at the
   * outer edge of the graze band (barely inside it). Smaller is closer/riskier.
   */
  clearance: number;
}

/**
 * Clearance for one graze: how much of the graze band was still open between
 * the ship's hull and the drone when the near-miss registered. 0 = touching,
 * 1 = grazed at the outermost edge of the band (about as safe as a "near
 * miss" gets).
 */
export function grazeClearance(dist: number, contactRadius: number, grazeBand: number): number {
  if (grazeBand <= 0) return 0;
  const clearance = (dist - contactRadius) / grazeBand;
  return Math.min(1, Math.max(0, clearance));
}

/** Keep the closest (smallest-clearance) call seen so far this run. */
export function trackClosestCall(
  current: ClosestCall | null,
  candidate: ClosestCall,
): ClosestCall {
  if (!current || candidate.clearance < current.clearance) return candidate;
  return current;
}

/**
 * Keep the closest grazes of the run, ordered by smallest clearance, capped
 * at `limit` (default 5). Additive to trackClosestCall: the single closest
 * call stays the dedicated game-over highlight; this is the sidecar list.
 */
export function trackTopGrazes(
  current: ClosestCall[],
  candidate: ClosestCall,
  limit = 5,
): ClosestCall[] {
  const next = current.length === 0 ? [candidate] : [...current, candidate];
  next.sort((a, b) => a.clearance - b.clearance);
  if (next.length > limit) next.length = limit;
  return next;
}

export type ClosestCallTier = "hair" | "razor" | "clean";

/** Coarse tiers for the highlight copy: closer calls get punchier language. */
export function closestCallTier(clearance: number): ClosestCallTier {
  if (clearance <= 0.25) return "hair";
  if (clearance <= 0.6) return "razor";
  return "clean";
}

const TIER_LABEL: Record<ClosestCallTier, string> = {
  hair: "Hair's-breadth dodge",
  razor: "Razor-thin dodge",
  clean: "Clean dodge",
};

function fmtCallTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

/** "Razor-thin dodge at 1:24" style highlight line, or null if the run had no grazes. */
export function closestCallLabel(call: ClosestCall | null): string | null {
  if (!call) return null;
  return `${TIER_LABEL[closestCallTier(call.clearance)]} at ${fmtCallTime(call.time)}`;
}
