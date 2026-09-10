/** Visible-only, single-flight polling. Never stores responses or credentials. */
export function createRefreshLoop<T>(options: {
  load: (signal: AbortSignal) => Promise<T>;
  onValue: (value: T) => void;
  onSettled: () => void;
  onWake?: () => void;
  intervalMs?: number;
  timeoutMs?: number;
  maxBackoffMs?: number;
  environment?: {
    document: EventTarget;
    window: EventTarget;
    visible: () => boolean;
    online: () => boolean;
  };
}) {
  const env = options.environment ?? {
    document, window,
    visible: () => document.visibilityState !== "hidden",
    online: () => navigator.onLine !== false,
  };
  const interval = options.intervalMs ?? 60_000;
  const timeout = options.timeoutMs ?? 8_000;
  const maxBackoff = options.maxBackoffMs ?? 300_000;
  let active = false;
  let generation = 0;
  let failures = 0;
  let nextAllowed = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  let pending: Promise<void> | undefined;
  const ready = () => active && env.visible() && env.online();
  function schedule() {
    clearTimeout(timer);
    if (ready()) timer = setTimeout(() => void refresh(), Math.max(0, nextAllowed - Date.now()));
  }
  function refresh(): Promise<void> {
    options.onWake?.();
    if (!ready()) return Promise.resolve();
    if (pending) return pending;
    if (Date.now() < nextAllowed) { schedule(); return Promise.resolve(); }
    clearTimeout(timer);
    const run = ++generation;
    const abort = new AbortController();
    controller = abort;
    const timed = new Promise<never>((_, reject) => {
      deadline = setTimeout(() => {
        abort.abort();
        reject(new Error("Refresh deadline exceeded"));
      }, timeout);
    });
    pending = Promise.race([Promise.resolve().then(() => options.load(abort.signal)), timed])
      .then(value => {
        if (!active || generation !== run) return;
        options.onValue(value);
        failures = 0;
        nextAllowed = Date.now() + interval;
      })
      .catch(() => {
        if (!active || generation !== run) return;
        failures = Math.min(failures + 1, 10);
        nextAllowed = Date.now() + Math.min(interval * 2 ** (failures - 1), maxBackoff);
      })
      .finally(() => {
        if (generation !== run) return;
        clearTimeout(deadline);
        controller = undefined;
        pending = undefined;
        if (active) { options.onSettled(); schedule(); }
      });
    return pending;
  }
  // Expiry must be re-evaluated even offline after background timers were frozen.
  const wake = () => { if (!ready()) clearTimeout(timer); void refresh(); };
  function start() {
    if (active) return;
    active = true;
    env.document.addEventListener("visibilitychange", wake);
    env.window.addEventListener("focus", wake);
    env.window.addEventListener("online", wake);
    env.window.addEventListener("offline", wake);
    void refresh();
  }
  function stop() {
    active = false;
    generation++;
    clearTimeout(timer);
    clearTimeout(deadline);
    controller?.abort();
    controller = undefined;
    pending = undefined;
    env.document.removeEventListener("visibilitychange", wake);
    for (const name of ["focus", "online", "offline"]) env.window.removeEventListener(name, wake);
  }
  return { start, stop, refresh };
}
