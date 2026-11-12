// Pure helpers over one day of server/mutator-schedule.json (no I/O, no DB), so
// scripts/test-schedule-export.ts can pin them against the real export.
//
// A day is an array of rows `{ name, subline }`. The first row is the LEGACY pick
// (what older bundles and the switch-off state fly). On an overlay day (see
// "overlay selection" in src/mutators.ts) the first row also carries flat string
// fields `overlayId` / `overlayName` / `overlaySubline` for the entry that takes
// the day while `mutators.overlay` is on. Strings only: the shipped iOS app decodes
// this file as [String: [[String: String]]].

/**
 * Names for validation ceilings: the UNION of everything any client could fly that
 * day (legacy rows plus the overlay entry), so a run from an older bundle is never
 * judged against the wrong mutator. Null when the day is unknown (pool worst case).
 * Overlay days are never Sundays, so this stays within grazeLimits' two-name path.
 */
export function unionMutatorNames(day) {
  if (!Array.isArray(day) || day.length === 0) return null;
  const names = day.map((m) => m.name);
  const overlayName = day[0]?.overlayName;
  if (typeof overlayName === "string" && !names.includes(overlayName)) names.push(overlayName);
  return names;
}

/**
 * What the day flies for clients that follow the switch: the overlay entry's
 * name and subline when `overlayOn(id)` says the `mutators.overlay` switch is on for
 * this date and entry, else the schedule's legacy rows untouched.
 */
export function publishedRows(rows, overlayOn) {
  const id = rows[0]?.overlayId;
  if (typeof id === "string" && overlayOn(id)) {
    return [{ name: rows[0].overlayName, subline: rows[0].overlaySubline }];
  }
  return rows;
}
