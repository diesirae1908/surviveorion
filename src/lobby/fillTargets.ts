// The DOM hooks the lobby's async fillers write into after the lobby paints:
// main.ts fillDailyHint / fillDailyBoard / fillLobbyWeek and ui.ts
// paintUpdatePill / setLobbyWeekServer, plus the rehearsal picker and preview
// badge. A new lobby layout (v3) must keep every one of these present, or those
// fillers silently paint nothing. scripts/test-flags.ts asserts each token
// still exists in ui.ts or main.ts; Playwright QA asserts them in the live DOM.
//
// Each entry is a CSS selector: `#id` or `.class`.

export const LOBBY_FILL_TARGETS: string[] = [
  "#daily-hint",
  "#daily-lobby-board-wrap",
  "#daily-lobby-board",
  "#daily-board-search",
  "#lobby-board-list",
  ".lobby-patrols-card",
  ".update-pill",
  ".creator-day-select",
  ".preview-badge",
];
