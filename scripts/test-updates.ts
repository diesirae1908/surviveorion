/**
 * updates.json schema + once-per-id lastSeen gate. DOM-free.
 * Run: npx tsx scripts/test-updates.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  LAST_SEEN_UPDATE_KEY,
  UPDATES_URL,
  hasUnreadUpdate,
  latestUpdate,
  loadLastSeenUpdateId,
  parseUpdates,
  saveLastSeenUpdateId,
  shouldAutoShowUpdate,
} from "../src/updates.ts";

const mem = new Map<string, string>();
const localStorageMock = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => {
    mem.set(k, String(v));
  },
  removeItem: (k: string) => {
    mem.delete(k);
  },
  clear: () => {
    mem.clear();
  },
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() {
    return mem.size;
  },
};
Object.defineProperty(globalThis, "localStorage", { value: localStorageMock, configurable: true });

const ROOT = path.resolve(new URL(".", import.meta.url).pathname, "..");
const file = JSON.parse(fs.readFileSync(path.join(ROOT, "public/updates.json"), "utf8"));
const updates = parseUpdates(file);

assert.equal(UPDATES_URL, "/updates.json");
assert.equal(LAST_SEEN_UPDATE_KEY, "orion.lastSeenUpdateId");
assert.ok(updates.length >= 1, "at least one FIELD UPDATE entry");
assert.equal(updates[0]?.id, "2026-09-27-flight-deck");
assert.equal(updates[0]?.date, "2026-09-27");
assert.equal(updates[0]?.title, "Fairer Skies");
assert.equal(updates[0]?.link, null);
assert.equal(updates[0]?.body.length, 4);
assert.ok(
  updates.some((u) => u.id === "2026-09-13-lobby-refit"),
  "lobby-refit entry stays in the feed",
);
assert.ok(
  updates.some((u) => u.id === "2026-09-13-past-day-fly"),
  "past-day Gold Patrol note is in the file",
);
assert.equal(
  updates.find((u) => u.id === "2026-09-13-past-day-fly")?.title,
  "Old Skies, Reopened",
);
assert.ok(
  !updates.some((u) => u.id === "2026-09-13-lobby-refresh"),
  "micro-copy lobby-refresh is off the feed",
);

assert.deepEqual(parseUpdates(null), []);
assert.deepEqual(parseUpdates({}), []);
assert.deepEqual(parseUpdates({ updates: [{ id: "x" }] }), []);
assert.equal(latestUpdate([]), null);
assert.equal(latestUpdate(updates)?.id, "2026-09-27-flight-deck");

assert.equal(hasUnreadUpdate(null, null), false);
assert.equal(hasUnreadUpdate("2026-09-27-flight-deck", null), true);
assert.equal(hasUnreadUpdate("2026-09-27-flight-deck", "2026-09-27-flight-deck"), false);
assert.equal(hasUnreadUpdate("2026-09-27-flight-deck", "2026-09-13-lobby-refresh"), true);
assert.equal(hasUnreadUpdate("2026-09-27-flight-deck", "2026-09-13-lobby-refit"), true);

assert.equal(shouldAutoShowUpdate("2026-09-27-flight-deck", null, 0), false, "fresh profile never auto-shows");
assert.equal(shouldAutoShowUpdate("2026-09-27-flight-deck", null, 1), true, "returning profile with a new id does");
assert.equal(shouldAutoShowUpdate("2026-09-27-flight-deck", "2026-09-13-lobby-refit", 4), true);
assert.equal(shouldAutoShowUpdate("2026-09-27-flight-deck", "2026-09-27-flight-deck", 4), false);
assert.equal(shouldAutoShowUpdate(null, null, 0), false);

assert.equal(loadLastSeenUpdateId(), null);
saveLastSeenUpdateId("2026-09-27-flight-deck");
assert.equal(loadLastSeenUpdateId(), "2026-09-27-flight-deck");
assert.equal(hasUnreadUpdate(latestUpdate(updates)?.id ?? null, loadLastSeenUpdateId()), false);

const ui = fs.readFileSync(path.join(ROOT, "src/ui.ts"), "utf8");
assert.match(ui, /shouldAutoShowUpdate/);
assert.match(ui, /CLICK TO ENTER/);
assert.match(ui, /Patrol Calendar/);
assert.match(ui, /CALENDAR ›/);
assert.match(ui, /PATROL CALENDAR/);
assert.doesNotMatch(ui, /HISTORY ›/);
assert.doesNotMatch(ui, /PATROL HISTORY/);
assert.doesNotMatch(ui, /addRow\("Patrol History"/);
{
  const strip = ui.slice(ui.indexOf("private weekCellEl"), ui.indexOf("private lobbyDesktopFooter"));
  assert.match(strip, /onPatrolCalendar\(cell\.date\)/);
  assert.doesNotMatch(strip, /onUnlockGoldPatrol/);
  assert.doesNotMatch(strip, /onPlayArchiveDay/);
}
assert.match(ui, /\/medals\/\$\{tier\}\.svg/);
assert.match(ui, /showLobbyMenu/);
assert.match(ui, /lobby-menu-sheet/);
assert.match(ui, /Field updates/);
assert.match(ui, /app-store-badge/);
assert.match(ui, /Download on the App Store/);
assert.equal(ui.includes("Get ORION on iPhone"), true, "patrol-complete CTA copy stays");
assert.match(ui, /Daily reminder on your phone/);
assert.doesNotMatch(ui, /lobby-learn/);
assert.doesNotMatch(ui, /lobbyStackButton\("Feedback"/);
assert.match(ui, /addRow\("Feedback"/);
assert.doesNotMatch(ui, /lobbyIconBtn\("speaker"/);
assert.match(ui, /recordingModeIconBtn/);
assert.match(ui, /info\.creator[\s\S]{0,180}recordingModeIconBtn/);
assert.match(ui, /onToggle\("recordingMode"\)/);
assert.match(ui, /toggleRow\(\[\["recordingMode", "Recording mode"\]\]\)/);
assert.match(ui, /Recording mode on/);

const css = fs.readFileSync(path.join(ROOT, "src/style.css"), "utf8");
assert.match(css, /lobby-menu-sheet/);
assert.match(css, /app-store-badge/);
assert.match(css, /field-update-modal/);
assert.match(css, /\.update-pill\s*\{[^}]*#ff4455/s, "unread pill uses Alarm red");
assert.match(css, /\.lobby-icon-btn\.rec-on/);

const badge = fs.readFileSync(path.join(ROOT, "public/app-store-badge.svg"), "utf8");
assert.match(badge, /Download_on_the_App_Store_Badge/);

console.log("PASS  updates.json schema + lastSeen gate + lobby chrome hooks");
