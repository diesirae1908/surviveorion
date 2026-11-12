import {
  PICKUPS,
  POWERS,
  POWER_MIN_MINUTES,
  POWER_SPAWN_WEIGHTS,
  SHIP,
  SPAWNABLE_POWER_IDS,
  type PowerId,
} from "./config";
import { clamp01, hashString, lerp, rand, randRange, scheduleRand, scheduleRange } from "./math";
import {
  mutatorExtraPowerIds,
  mutatorPickupHoldOne,
  mutatorPickupHoldOneDelay,
  mutatorPickupIntervalScale,
  mutatorPickupMagnetStrength,
  mutatorPickupPairs,
  mutatorPowerWeights,
  takeHoldOneSpawnKey,
  takeTwinPairKey,
} from "./mutators";
import { circlesOverlap } from "./physics";
import { claimByMagnet, partnerOf, vanishPartner } from "./pickupPairs";
import { spendOverdrive } from "./overdrive";
import { activatePower } from "./powers";
import type { Pickup, World } from "./types";

export function initPickups(world: World): void {
  world.pickupTimer = nextInterval(world);
  for (let i = 0; i < PICKUPS.spawnOnStart; i++) spawnPickup(world);
}

/** Support scales with pressure: drops come faster as the escalation climbs. */
function nextInterval(world: World): number {
  const t = clamp01(world.time / 60 / PICKUPS.intervalRampMinutes);
  // dailies have no refill floor, so the baseline schedule runs faster —
  // a flat scale on a single seeded draw keeps the shared script in sync
  const scale = (world.daily ? PICKUPS.dailyIntervalScale : 1) * mutatorPickupIntervalScale();
  const min = lerp(PICKUPS.secondsBetweenRange[0], PICKUPS.secondsBetweenAtPeak[0], t) * scale;
  const max = lerp(PICKUPS.secondsBetweenRange[1], PICKUPS.secondsBetweenAtPeak[1], t) * scale;
  return scheduleRange(min, max);
}

export function updatePickups(world: World, dt: number): void {
  if (world.phase !== "playing") return;

  if (mutatorPickupHoldOne()) {
    // Hold-one days skip the interval spawner. GOLD DASH replaces on collect
    // (delay 0). RAM RAID waits a constant delay, then spawnHoldOnePickup.
    // No nextInterval / scheduleRand / rand here: collect timing is player-dependent.
    if (world.pickups.length === 0) {
      world.pickupTimer -= dt;
      if (world.pickupTimer <= 0) spawnHoldOnePickup(world);
    }
  } else if (!world.sandbox) {
    // refill floor: never leave the arena short on support. Skipped on Daily
    // Patrol (refill timing depends on when the player collects, which
    // would desync the shared seed; the faster baseline covers dailies).
    if (!world.daily && world.pickups.length < PICKUPS.minActive) {
      world.pickupTimer = Math.min(world.pickupTimer, 0.5);
    }
    world.pickupTimer -= dt;
    if (world.pickupTimer <= 0) {
      world.pickupTimer = nextInterval(world);
      spawnPickup(world);
    }
  }

  const ship = world.ship;
  const hw = world.viewW / 2 - PICKUPS.edgeInset;
  const hh = world.viewH / 2 - PICKUPS.edgeInset;

  for (let i = world.pickups.length - 1; i >= 0; i--) {
    const p = world.pickups[i];
    if (p.gone) continue; // its pair was chosen earlier this tick; swept below
    p.age += dt;

    // THE PASSAGE: an untouched pair fades together. A magnetized orb is already
    // chosen and in flight, so it never expires. Time-driven, no draws.
    if (p.pairId !== undefined && !p.magnetized && p.age >= PICKUPS.pair.lifetime) {
      world.pickups.splice(i, 1);
      world.events.push({ type: "pickupExpire", power: p.power, x: p.x, y: p.y });
      continue;
    }

    if (p.magnetized) {
      // claimed by a magnet: forget the drift, home straight to the ship
      const dx = ship.x - p.x;
      const dy = ship.y - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.01) {
        const pull = Math.min(POWERS.magnet.pullSpeed * dt, dist);
        p.x += (dx / dist) * pull;
        p.y += (dy / dist) * pull;
      }
    } else {
      // slow drift, bouncing softly off the arena edges
      p.x += (p.vx ?? 0) * dt;
      p.y += (p.vy ?? 0) * dt;
      if (p.vx !== undefined && ((p.x < -hw && p.vx < 0) || (p.x > hw && p.vx > 0))) {
        p.vx = -p.vx;
      }
      if (p.vy !== undefined && ((p.y < -hh && p.vy < 0) || (p.y > hh && p.vy > 0))) {
        p.vy = -p.vy;
      }
      // MAGNETIC FIELD: a gentle homing pull layered on top of the normal
      // wander, all day. Pure position math (no RNG), so it can't desync
      // Daily Patrol between play styles (see mutators.ts).
      const pull = mutatorPickupMagnetStrength();
      if (pull > 0) {
        const dx = ship.x - p.x;
        const dy = ship.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.01) {
          const step = Math.min(pull * dt, dist);
          p.x += (dx / dist) * step;
          p.y += (dy / dist) * step;
        }
      }
    }

    if (circlesOverlap(ship.x, ship.y, SHIP.radius, p.x, p.y, PICKUPS.radius)) {
      if (p.pairId !== undefined && !p.primary) {
        // both orbs of a pair in reach on the same tick: resolve the pair once,
        // the seeded (primary) orb wins and fires when the loop reaches it
        const mate = partnerOf(world, p);
        if (mate?.primary && circlesOverlap(ship.x, ship.y, SHIP.radius, mate.x, mate.y, PICKUPS.radius)) continue;
      }
      world.pickups.splice(i, 1);
      world.events.push({ type: "pickup", power: p.power, x: p.x, y: p.y });
      // THE PASSAGE: taking one orb vanishes its partner the same tick
      vanishPartner(world, p);
      // OVERDRIVE: a HOT hull spends its charge on this orb (burst + form)
      const form = spendOverdrive(world, p.power);
      activatePower(world, p.power, form);
      if (mutatorPickupHoldOne()) {
        const delay = mutatorPickupHoldOneDelay();
        if (delay <= 0) spawnHoldOnePickup(world);
        else world.pickupTimer = delay;
      }
    }
  }

  // sweep orbs whose partner was taken (flagged by vanishPartner / a magnet claim)
  if (world.pickups.some((q) => q.gone)) {
    let w = 0;
    for (const q of world.pickups) if (!q.gone) world.pickups[w++] = q;
    world.pickups.length = w;
  }
}

/**
 * Spawns inside the visible area (unlike Unity's fixed radius, which could
 * land pickups off-screen), keeping a minimum distance from the ship.
 */
function spawnPickup(world: World): void {
  const hw = world.viewW / 2 - PICKUPS.edgeInset;
  const hh = world.viewH / 2 - PICKUPS.edgeInset;

  // fixed number of draws (ship position must not advance the seeded stream
  // differently per player); take the first candidate far enough away.
  // Daily Patrol: the FIRST candidate wins unconditionally — ship-relative
  // placement would give every pilot different drop spots on the shared run.
  let x = 0;
  let y = 0;
  let found = false;
  for (let attempt = 0; attempt < 12; attempt++) {
    const cx = randRange(-hw, hw);
    const cy = randRange(-hh, hh);
    if (found) continue;
    x = cx;
    y = cy;
    if (world.daily) {
      found = true;
      continue;
    }
    const dist = Math.hypot(cx - world.ship.x, cy - world.ship.y);
    if (dist >= PICKUPS.minDistanceFromShip) found = true;
  }

  // roll before the cap check: how many pickups float uncollected is
  // player-dependent, and a seeded run must consume the same draws (and the
  // same bad-luck demotions) for everyone. At the cap the drop is discarded —
  // except on Daily Patrol, where a discard would make the visible power
  // script depend on how many pickups the pilot left floating. On dailies
  // every scheduled drop lands, so all pilots see the identical board.
  const driftAngle = rand() * Math.PI * 2; // drift heading (fixed draw too)
  const power = rollPowerId(world);
  if (!world.daily && world.pickups.length >= PICKUPS.maxActive) return;
  const pickup: Pickup = { x, y, power, age: 0 };

  // THE PASSAGE: the partner comes from a date-hash roll and a fixed offset, so
  // the draws above are the whole stream cost of a drop, pair or not.
  const pairKey = mutatorPickupPairs() ? takeTwinPairKey() : null;
  const partnerPower = pairKey ? rollPartnerPowerId(world, power, pairKey) : null;
  let partner: Pickup | null = null;
  if (pairKey && partnerPower) {
    // pairs hold still (the drift draw above is consumed, not applied); the
    // partner sits toward the field center, so it is always in bounds
    const toward = x >= 0 ? -1 : 1;
    pickup.pairId = pairKey;
    pickup.primary = true;
    partner = { x: x + toward * PICKUPS.pair.spacing, y, power: partnerPower, age: 0, pairId: pairKey };
  } else {
    pickup.vx = Math.cos(driftAngle) * PICKUPS.driftSpeed;
    pickup.vy = Math.sin(driftAngle) * PICKUPS.driftSpeed;
  }
  world.pickups.push(pickup);
  if (partner) world.pickups.push(partner);
  // fired even if the ship overlaps this spot and collects it the same tick,
  // so anything auditing "what dropped and when" (e.g. sim-test's shared-seed
  // check) sees every scheduled drop, not just the ones that survive a frame.
  world.events.push({ type: "pickupSpawn", power, x, y });
  if (partner) world.events.push({ type: "pickupSpawn", power: partner.power, x: partner.x, y: partner.y });
  // a magnet grabbed on an empty board stays armed and claims the next drop;
  // on a pair it claims the orb nearer the ship and the other vanishes
  if (world.powers.magnetPending > 0) {
    world.powers.magnetPending--;
    const pick =
      partner && Math.hypot(partner.x - world.ship.x, partner.y - world.ship.y) < Math.hypot(x - world.ship.x, y - world.ship.y)
        ? partner
        : pickup;
    claimByMagnet(world, pick);
  }
}

/**
 * THE PASSAGE: the partner's power. Same drop table as the seeded roll (normal
 * spawnable powers only, same weights and bad-luck demotion), minus the
 * primary's power, but the roll value is a date hash keyed by the pair, so it
 * costs no draw on either seeded stream. Null only when nothing else has weight.
 */
function rollPartnerPowerId(world: World, primary: PowerId, key: string): PowerId | null {
  const { pool, weight } = dropTable(world);
  const candidates = pool.filter((id) => id !== primary && SPAWNABLE_POWER_IDS.includes(id));
  let total = 0;
  for (const id of candidates) total += weight(id);
  if (total <= 0) return null;
  let roll = (hashString(key) / 4294967296) * total;
  let picked = candidates[candidates.length - 1];
  for (const id of candidates) {
    roll -= weight(id);
    if (roll <= 0) {
      picked = id;
      break;
    }
  }
  // the partner always spawns, so its demotion is player-independent too
  world.powerSpawnCounts[picked] = (world.powerSpawnCounts[picked] ?? 0) + 1;
  return picked;
}

/** Hold-one replacement: extraPowerIds[0] if set (GOLD DASH Afterburner),
 * else the day's monopower from powerWeights (RAM RAID Starshell). */
function holdOnePowerId(): PowerId {
  const extras = mutatorExtraPowerIds();
  if (extras[0]) return extras[0];
  const weights = mutatorPowerWeights();
  let best: PowerId | null = null;
  let bestW = 0;
  for (const id of Object.keys(weights) as PowerId[]) {
    const w = weights[id] ?? 0;
    if (w > bestW) {
      bestW = w;
      best = id;
    }
  }
  return best ?? "afterburner";
}

/** Hold-one replacement: farthest of 12 date-hash candidates, no seed streams. */
function spawnHoldOnePickup(world: World): void {
  const hw = world.viewW / 2 - PICKUPS.edgeInset;
  const hh = world.viewH / 2 - PICKUPS.edgeInset;
  const key = takeHoldOneSpawnKey();
  let bestX = 0;
  let bestY = 0;
  let bestDist = -1;
  for (let attempt = 0; attempt < 12; attempt++) {
    const hx = hashString(`${key}-x-${attempt}`) / 4294967296;
    const hy = hashString(`${key}-y-${attempt}`) / 4294967296;
    const x = -hw + hx * 2 * hw;
    const y = -hh + hy * 2 * hh;
    const dist = Math.hypot(x - world.ship.x, y - world.ship.y);
    if (dist > bestDist) {
      bestDist = dist;
      bestX = x;
      bestY = y;
    }
  }
  const drift = (hashString(`${key}-drift`) / 4294967296) * Math.PI * 2;
  const power = holdOnePowerId();
  const pickup: Pickup = {
    x: bestX,
    y: bestY,
    power,
    age: 0,
    vx: Math.cos(drift) * PICKUPS.driftSpeed,
    vy: Math.sin(drift) * PICKUPS.driftSpeed,
  };
  world.pickups.push(pickup);
  world.events.push({ type: "pickupSpawn", power, x: bestX, y: bestY });
}

/** Today's drop table: the pool (time gates, mutator extras) and the live weight function. */
function dropTable(world: World): { pool: PowerId[]; weight: (id: PowerId) => number } {
  const minutes = world.time / 60;
  const extra = mutatorExtraPowerIds().filter((id) => !SPAWNABLE_POWER_IDS.includes(id));
  const pool = [...SPAWNABLE_POWER_IDS, ...extra].filter(
    (id) => minutes >= (POWER_MIN_MINUTES[id] ?? 0),
  );
  const overrideWeights = mutatorPowerWeights();
  const weight = (id: PowerId): number =>
    (overrideWeights[id] ?? POWER_SPAWN_WEIGHTS[id]) / (1 + 1.5 * (world.powerSpawnCounts[id] ?? 0));
  return { pool, weight };
}

/**
 * Weighted random pick so not every power appears at the same frequency.
 * Late-game powers (POWER_MIN_MINUTES) only enter the pool once the run is
 * deep enough to warrant them. Bad-luck protection: each time a power spawns
 * its weight is demoted for the rest of the run, so the rarer powers all get
 * their moment instead of shield/shockwave hogging every drop.
 */
function rollPowerId(world: World): PowerId {
  const { pool, weight } = dropTable(world);

  let total = 0;
  for (const id of pool) total += weight(id);

  let roll = scheduleRand() * total;
  let picked = pool[pool.length - 1];
  for (const id of pool) {
    roll -= weight(id);
    if (roll <= 0) {
      picked = id;
      break;
    }
  }
  world.powerSpawnCounts[picked] = (world.powerSpawnCounts[picked] ?? 0) + 1;
  return picked;
}
