// Death moment presentation (freeze beat, flight trace). Owned by the result
// workstream; this is the no-op seam. Gated by `ui.result`.

import type { FxContext, GameEvent } from "../types";

/** React to a gameplay event. No-op until the death moment lands. */
export function onEvent(_e: GameEvent, _ctx: FxContext): void {}
