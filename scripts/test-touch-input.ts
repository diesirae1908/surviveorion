// Touch drag lifecycle regression check, tsx style (matches sim-test.ts /
// test-nickname.ts: manual assertions, no test framework).
//
// Reproduces the reported bug: on some Safari-compatible mobile browsers a
// touch drag can be silently dropped by the browser (backgrounding, an OS
// gesture stealing recognition, an embedded webview quirk) WITHOUT ever
// firing touchend/touchcancel to the page. Before the fix, Input kept
// feeding the stick's last-known (frozen) drag vector into sample() forever,
// so the ship kept flying in a straight line / drifting with no way to
// correct course — "drag stopped but flight didn't", reported as feeling
// like Asteroids-style runaway inertia.
//
// This harness stubs a minimal window/document/canvas (plain event-listener
// registries, no real DOM) so Input's touch state machine can be driven with
// synthetic touch events and inspected via sample()/getTouchView(), with no
// browser required.
//
//   npx tsx scripts/test-touch-input.ts

let failures = 0;

function check(label: string, cond: boolean): void {
  if (!cond) {
    failures++;
    console.error(`FAIL ${label}`);
  }
}

class FakeEventTarget {
  private listeners = new Map<string, Array<(e: any) => void>>();
  addEventListener(type: string, fn: (e: any) => void): void {
    const arr = this.listeners.get(type) ?? [];
    arr.push(fn);
    this.listeners.set(type, arr);
  }
  removeEventListener(type: string, fn: (e: any) => void): void {
    const arr = this.listeners.get(type);
    if (!arr) return;
    const i = arr.indexOf(fn);
    if (i >= 0) arr.splice(i, 1);
  }
  dispatch(type: string, evt: any): void {
    for (const fn of this.listeners.get(type) ?? []) fn(evt);
  }
}

class FakeDocument extends FakeEventTarget {
  hidden = false;
}

// Minimal globals Input's constructor touches. isTypingTarget() (used only
// on keydown, not exercised here) references HTMLElement/etc. as TYPES only,
// which erase at runtime under tsx, so no further DOM shimming is needed.
const fakeWindow = new FakeEventTarget();
const fakeDocument = new FakeDocument();
(globalThis as any).window = fakeWindow;
(globalThis as any).document = fakeDocument;

const { Input } = await import("../src/input");

function touch(id: number, x: number, y: number) {
  return { identifier: id, clientX: x, clientY: y };
}

function touchEvent(touches: ReturnType<typeof touch>[], changedTouches: ReturnType<typeof touch>[]) {
  return { touches, changedTouches, preventDefault(): void {} };
}

function freshInput() {
  const canvas = new FakeEventTarget();
  const input = new Input(canvas as unknown as HTMLCanvasElement);
  return { input, canvas };
}

// --- Sanity: a normal drag steers, and a normal lift (touchend) stops it. ---
{
  const { input, canvas } = freshInput();
  canvas.dispatch("touchstart", touchEvent([touch(1, 100, 100)], [touch(1, 100, 100)]));
  canvas.dispatch("touchmove", touchEvent([touch(1, 160, 100)], [touch(1, 160, 100)]));
  const mid = input.sample();
  check("normal drag: moveVector active", mid.moveVector !== null && mid.moveVector.x > 0.9);
  check("normal drag: stick view active", input.getTouchView().active);

  canvas.dispatch("touchend", touchEvent([], [touch(1, 160, 100)]));
  const after = input.sample();
  check("normal lift: moveVector zeroed", after.moveVector?.x === 0 && after.moveVector?.y === 0);
  check("normal lift: stick view inactive", !input.getTouchView().active);
}

// --- Sanity: touchcancel (e.g. a real OS-recognized gesture) also stops it. ---
{
  const { input, canvas } = freshInput();
  canvas.dispatch("touchstart", touchEvent([touch(1, 100, 100)], [touch(1, 100, 100)]));
  canvas.dispatch("touchmove", touchEvent([touch(1, 160, 100)], [touch(1, 160, 100)]));
  canvas.dispatch("touchcancel", touchEvent([], [touch(1, 160, 100)]));
  const after = input.sample();
  check("touchcancel: moveVector zeroed", after.moveVector?.x === 0 && after.moveVector?.y === 0);
  check("touchcancel: stick view inactive", !input.getTouchView().active);
}

// --- The reported bug: browser drops the touch mid-drag with NO touchend/
// touchcancel at all (self-heal path). A later touch event proves — via the
// browser's own live e.touches list — that our tracked touch is already
// gone, and a fresh finger on the glass should regain control instead of
// being locked out by stale state. ---
{
  const { input, canvas } = freshInput();
  canvas.dispatch("touchstart", touchEvent([touch(1, 100, 100)], [touch(1, 100, 100)]));
  canvas.dispatch("touchmove", touchEvent([touch(1, 160, 100)], [touch(1, 160, 100)]));
  const beforeLoss = input.sample();
  check("pre-loss: moveVector active", beforeLoss.moveVector !== null && beforeLoss.moveVector.x > 0.9);

  // Touch 1 vanishes with no end/cancel event; a new, unrelated finger
  // lands. e.touches for this event only contains the new touch (id 2) —
  // the browser's ground truth that touch 1 is already gone.
  canvas.dispatch("touchstart", touchEvent([touch(2, 300, 300)], [touch(2, 300, 300)]));
  const view = input.getTouchView();
  check("self-heal: new touch regains stick control (not locked out)", view.active);
  check("self-heal: stick re-origins at the new finger", view.originX === 300 && view.originY === 300);
}

// --- The reported bug: browser drops the touch with total silence
// afterward (no further touch events at all) because the app was
// backgrounded (tab switch, incoming call, Control Center swipe). Nothing
// can self-heal without a fresh event, so this relies on blur/
// visibilitychange clearing the stuck state directly. ---
{
  const { input, canvas } = freshInput();
  canvas.dispatch("touchstart", touchEvent([touch(1, 100, 100)], [touch(1, 100, 100)]));
  canvas.dispatch("touchmove", touchEvent([touch(1, 160, 100)], [touch(1, 160, 100)]));
  const beforeBlur = input.sample();
  check("pre-blur: moveVector active", beforeBlur.moveVector !== null && beforeBlur.moveVector.x > 0.9);

  fakeWindow.dispatch("blur", {});
  const afterBlur = input.sample();
  check(
    "blur: moveVector zeroed (no runaway drift while backgrounded)",
    afterBlur.moveVector?.x === 0 && afterBlur.moveVector?.y === 0,
  );
  check("blur: stick view inactive", !input.getTouchView().active);
}

{
  const { input, canvas } = freshInput();
  canvas.dispatch("touchstart", touchEvent([touch(1, 100, 100)], [touch(1, 100, 100)]));
  canvas.dispatch("touchmove", touchEvent([touch(1, 160, 100)], [touch(1, 160, 100)]));
  const beforeHide = input.sample();
  check("pre-hide: moveVector active", beforeHide.moveVector !== null && beforeHide.moveVector.x > 0.9);

  fakeDocument.hidden = true;
  fakeDocument.dispatch("visibilitychange", {});
  const afterHide = input.sample();
  check(
    "visibilitychange (hidden): moveVector zeroed",
    afterHide.moveVector?.x === 0 && afterHide.moveVector?.y === 0,
  );
  check("visibilitychange (hidden): stick view inactive", !input.getTouchView().active);
  fakeDocument.hidden = false;
}

// --- Inertia mode (settings opt-in): the same silent-loss scenario must not
// leave thrust/heading frozen either, or the ship coasts forever with no way
// to counter-steer — the literal "feels like Asteroids" complaint. ---
{
  const { input, canvas } = freshInput();
  input.inertia = true;
  canvas.dispatch("touchstart", touchEvent([touch(1, 100, 100)], [touch(1, 100, 100)]));
  canvas.dispatch("touchmove", touchEvent([touch(1, 160, 100)], [touch(1, 160, 100)]));
  const beforeLoss = input.sample();
  check("inertia pre-loss: thrust active", beforeLoss.thrust > 0.9);

  fakeWindow.dispatch("blur", {});
  const afterLoss = input.sample();
  check("inertia + blur: thrust zeroed, no phantom heading", afterLoss.thrust === 0 && afterLoss.heading === null);
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log("ALL CHECKS PASSED: touch drag lifecycle (normal lift, cancel, silent loss + self-heal, blur, visibilitychange, inertia mode).");
}
