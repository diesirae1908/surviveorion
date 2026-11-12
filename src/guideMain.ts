import {
  MUTATOR_POOL,
  WAVE2_AVAILABLE_FROM,
  getMutatorsForDateStr,
  invalidateOverlayCache,
  legacyMutatorsForDate,
  nextDatesForMutator,
  overlayEntryForDate,
  setOverlayGate,
} from "./mutators";
import { overlayEntryOn, setRemoteFeatures } from "./flags";
import { patrolDateStr } from "./patrolDate";

const today = patrolDateStr();
const root = document.getElementById("app")!;

function flyHref(id: string): string {
  return `/?mutator=${encodeURIComponent(id)}&rehearsal=director`;
}

function dayHref(date: string): string {
  return `/?day=${encodeURIComponent(date)}&rehearsal=director`;
}

const upcoming: string[] = [];
{
  const [y, m, d] = today.split("-").map(Number);
  const start = Date.UTC(y, m - 1, d);
  for (let i = 0; i < 21; i++) {
    const dt = new Date(start + i * 86400000);
    upcoming.push(dt.toISOString().slice(0, 10));
  }
}

function render(): void {
  const schedule = document.createElement("section");
  schedule.innerHTML = `<h2 style="color:#ffd700;letter-spacing:0.1em">NEXT 21 PATROLS</h2>`;
  for (const date of upcoming) {
    const picks = getMutatorsForDateStr(date);
    const legacy = legacyMutatorsForDate(date);
    // An overlay day names the legacy pick it replaces (what older apps and the switch-off state fly).
    const names =
      (picks.map((p) => p.name).join(" + ") || "CLASSIC") +
      (picks !== legacy ? ` (else ${legacy.map((p) => p.name).join(" + ")})` : "");
    const waiting = picks === legacy ? overlayEntryForDate(date) : null;
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
    <p class="meta">${date}${date === today ? " · TODAY" : ""}</p>
    <p class="name">${names}</p>
    ${waiting ? `<p class="meta">overlay ${waiting.name} flies here once the switch is on</p>` : ""}
    <div class="row">
      <a class="btn" href="${dayHref(date)}">FLY THIS DAY</a>
    </div>`;
    schedule.appendChild(card);
  }

  const roster = document.createElement("section");
  roster.innerHTML = `<h2 style="color:#ffd700;letter-spacing:0.1em">ALL MUTATORS</h2>
<p class="sub">Wave 2 mixes in from ${WAVE2_AVAILABLE_FROM} PT. Older days stay on the original 22. Overlay days replace one weekday pick and never move any other day.</p>`;

  for (const m of MUTATOR_POOL) {
    const next = nextDatesForMutator(m.id, today, 3);
    const locked = m.availableFrom > today;
    const overlay = m.overlayOdds !== undefined;
    const card = document.createElement("div");
    card.className = locked ? "card upcoming" : "card";
    card.innerHTML = `
    <p class="name">${m.name}</p>
    <p class="brief">${m.briefing}</p>
    <p class="line">${m.subline}</p>
    <p class="meta">id ${m.id} · from ${m.availableFrom}${locked ? " · NOT IN ROTATION YET" : ""}${overlay ? " · overlay, switch mutators.overlay" : ""} · next ${next.join(", ") || "none in window"}</p>
    <div class="row">
      <a class="btn" href="${flyHref(m.id)}">FLY IT</a>
    </div>`;
    roster.appendChild(card);
  }

  root.replaceChildren(schedule, roster);
}

// Show the pick the live `mutators.overlay` switch gives (off until a row says
// otherwise); a failed fetch keeps the switch-off view.
setOverlayGate((date, id) => overlayEntryOn(date, id));
render();
fetch("/api/config")
  .then((r) => (r.ok ? r.json() : null))
  .then((cfg: { features?: unknown } | null) => {
    if (!cfg) return;
    setRemoteFeatures(cfg.features);
    invalidateOverlayCache();
    render();
  })
  .catch(() => {});
