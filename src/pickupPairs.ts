// THE PASSAGE (mutator `pickupPairs`): the small shared rules for a pair of
// orbs, kept out of pickups.ts and powers.ts so neither imports the other.
// Everything here is post-draw and player-side: no rand()/scheduleRand().

import type { Pickup, World } from "./types";

/** The live other orb of a pair, or undefined (ordinary orb, or already gone). */
export function partnerOf(world: World, p: Pickup): Pickup | undefined {
  if (p.pairId === undefined) return undefined;
  return world.pickups.find((q) => q !== p && q.pairId === p.pairId && !q.gone);
}

/**
 * The pair was chosen: the other orb vanishes this tick. It is flagged here and
 * swept at the end of updatePickups (callers may be mid-loop over the array).
 * Emits `pickupVanish`, never `pickup`, so nothing that counts pickups counts it.
 */
export function vanishPartner(world: World, p: Pickup): void {
  const q = partnerOf(world, p);
  if (!q) return;
  q.gone = true;
  world.events.push({ type: "pickupVanish", power: q.power, x: q.x, y: q.y });
}

/** A magnet claims an orb. On a pair, claiming is choosing: the partner vanishes now. */
export function claimByMagnet(world: World, p: Pickup): void {
  p.magnetized = true;
  vanishPartner(world, p);
}
