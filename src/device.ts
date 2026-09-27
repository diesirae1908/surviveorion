/**
 * Privacy-safe device id for first-party retention.
 * Random UUID in localStorage. Never derived from IP or account.
 */

const DEVICE_ID_KEY = "orion.deviceId";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let memoryId: string | null = null;

function newId(): string {
  return crypto.randomUUID();
}

/** Stable random id for this browser (or this session if storage is blocked). */
export function loadDeviceId(): string {
  if (memoryId && UUID_RE.test(memoryId)) return memoryId;
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing && UUID_RE.test(existing)) {
      memoryId = existing;
      return existing;
    }
    const id = newId();
    localStorage.setItem(DEVICE_ID_KEY, id);
    memoryId = id;
    return id;
  } catch {
    memoryId = memoryId ?? newId();
    return memoryId;
  }
}
