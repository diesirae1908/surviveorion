/**
 * Third-party crash noise filter. Pure and dependency-free so it's directly
 * unit-testable (see scripts/test-crash-filter.ts) — main.ts's window
 * error/unhandledrejection listeners call this before reportCrash spends a
 * report slot on something that was never Orion's bug to begin with.
 *
 * Scope: only exact, well-documented browser/third-party injection
 * artifacts that can never originate from Orion's own same-origin bundle —
 * NOT a general "no stack trace" or "looks vague" heuristic, which would
 * risk swallowing a genuine minified-build crash. Each entry below is
 * backed by a concrete, well-known cause:
 *
 * - "Script error." (exact match, browser-generated, capital S, trailing
 *   period) is the literal placeholder every browser substitutes for an
 *   uncaught exception thrown by a CROSS-ORIGIN script loaded without a
 *   `crossorigin` attribute + matching CORS headers — a security redaction,
 *   not a description of the bug. Orion's own bundle is always same-origin,
 *   so a genuine Orion crash is structurally incapable of surfacing this
 *   way; every crash-reporting vendor (Sentry, Bugsnag, etc.) ships this
 *   exact string in their default ignore list. Content: some in-app/embedded
 *   browser shells and injected accessibility/reader/ad-blocker scripts run
 *   as cross-origin content scripts and trip this.
 * - "__firefox__" substring: `window.__firefox__` is a namespace Firefox's
 *   own iOS browser (and Firefox Focus) injects into every page it renders
 *   for its reader-mode/content-script bridge. Orion's source has zero
 *   references to this global (grep confirms), so any error mentioning it
 *   originated in Firefox's own injected script, not Orion's code.
 *
 * Observed 2026-08-16 on iPhone/Brave sessions (both errors carry no
 * actionable stack — consistent with the redaction/injection causes above).
 */
const NOISE_PATTERNS: ReadonlyArray<(message: string) => boolean> = [
  (m) => m === "Script error.",
  (m) => m.includes("__firefox__"),
];

export function isThirdPartyCrashNoise(message: string): boolean {
  return NOISE_PATTERNS.some((test) => test(message));
}
