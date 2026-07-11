// Badge display metadata. Award logic lives server-side in server/badges.mjs
// — keep the IDs in sync. Order here is the display order (easy → legendary).

export type BadgeTier = "easy" | "medium" | "rare" | "grind";

export interface BadgeInfo {
  id: string;
  name: string;
  icon: string;
  tier: BadgeTier;
  /** Shown for earned badges, and as the "how to get it" hint when locked. */
  desc: string;
}

export const BADGES: BadgeInfo[] = [
  // --- easy ---
  { id: "first_flight", name: "First Flight", icon: "🚀", tier: "easy", desc: "Complete your first run." },
  { id: "space_dust", name: "Space Dust", icon: "💫", tier: "easy", desc: "Perish within 10 seconds. It happens to the best of us." },
  { id: "blooded", name: "Blooded", icon: "🩸", tier: "easy", desc: "Destroy 50 drones in a single run." },
  { id: "staying_alive", name: "Staying Alive", icon: "🕺", tier: "easy", desc: "Survive for 2 minutes." },
  { id: "debriefed", name: "Debriefed", icon: "📡", tier: "easy", desc: "Send feedback to mission control while signed in." },

  // --- medium ---
  { id: "centurion", name: "Centurion", icon: "🛡️", tier: "medium", desc: "Destroy 250 drones in a single run." },
  { id: "five_alive", name: "Five Alive", icon: "⏱️", tier: "medium", desc: "Survive for 5 minutes." },
  { id: "millionaire", name: "Millionaire", icon: "💰", tier: "medium", desc: "Score 1,000,000 points in one run." },
  { id: "chain_reaction", name: "Chain Reaction", icon: "⚡", tier: "medium", desc: "Max out the multiplier at x10." },
  { id: "pacifist", name: "Pacifist", icon: "🕊️", tier: "medium", desc: "Survive 90 seconds without destroying a single drone." },

  // --- rare ---
  { id: "swarm_reaper", name: "Swarm Reaper", icon: "☠️", tier: "rare", desc: "Destroy 1,000 drones in a single run." },
  { id: "decade", name: "The Decade", icon: "🌌", tier: "rare", desc: "Survive for 10 minutes." },
  { id: "ten_million", name: "Ten Million Club", icon: "👑", tier: "rare", desc: "Score 10,000,000 points in one run." },
  { id: "galaxys_finest", name: "Galaxy's Finest", icon: "🏆", tier: "rare", desc: "Hold the #1 spot on the World Arena." },

  // --- career grinds ---
  { id: "veteran", name: "Veteran", icon: "🎖️", tier: "grind", desc: "Complete 100 runs." },
  { id: "harvester", name: "Harvester", icon: "🌾", tier: "grind", desc: "Destroy 10,000 drones across your career." },
  { id: "ironclad", name: "Ironclad", icon: "⚓", tier: "grind", desc: "Survive a full hour of total flight time." },
];

export const TIER_LABEL: Record<BadgeTier, string> = {
  easy: "Cadet",
  medium: "Officer",
  rare: "Legend",
  grind: "Career",
};

const byId = new Map(BADGES.map((b) => [b.id, b]));

export const badgeInfo = (id: string): BadgeInfo | undefined => byId.get(id);
