import {requireClientUiLocale, type ClientUiLocale10} from "./client-ui-bindings";

export type ClientUiPreference = Readonly<{ui_locale: ClientUiLocale10 | null; revision: number}>;
export type ClientUiPreferenceWrite = Readonly<{ui_locale: ClientUiLocale10; expected_revision: number}>;
export type ClientUiSyncStatus = "local" | "idle" | "saving" | "saved" | "conflict" | "unknown" | "unavailable" | "rejected";
export type ClientUiPreferenceSnapshot = Readonly<{
  actor: number | null; projection: ClientUiPreference | null;
  enabled: boolean; status: ClientUiSyncStatus; version: number;
}>;
export class ClientUiPreferenceConflict extends Error {
  constructor(readonly current: unknown) {super("CLIENT_UI_PREFERENCE_CONFLICT");}
}
export class ClientUiPreferenceRejected extends Error {
  constructor(readonly authentication = false) {super("CLIENT_UI_PREFERENCE_REJECTED");}
}
const MAX_REVISION = 2147483647;
export function requireClientUiPreference(value: unknown): ClientUiPreference {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).sort().join(",") !== "revision,ui_locale") throw new Error("CLIENT_UI_PREFERENCE_INVALID");
  const row = value as Record<string, unknown>;
  if (typeof row.revision !== "number" || !Number.isInteger(row.revision) || row.revision < 0 || row.revision > MAX_REVISION)
    throw new Error("CLIENT_UI_REVISION_INVALID");
  return Object.freeze({ui_locale: row.ui_locale === null ? null : requireClientUiLocale(row.ui_locale), revision: row.revision});
}
type Transport = {
  write: (actor: number, value: ClientUiPreferenceWrite, signal: AbortSignal) => Promise<unknown>;
  read: (actor: number, signal: AbortSignal) => Promise<{actor: unknown; preference: unknown}>;
};
type Options = {
  transport: Transport;
  applyLocal: (value: ClientUiLocale10) => void;
  budgetMs?: number;
  schedule?: (callback: () => void, ms: number) => () => void;
};

/** Dedicated UI10 CAS only. No contact-locale writes, credentials or browser storage.
 * A timeout/abort does NOT cancel a server commit. Unknown/conflict breaks the old
 * queue; only a fresh user choice/retry may read and issue a new fenced write. */
export function createClientUiPreferenceAdapter({transport, applyLocal, budgetMs = 8000,
  schedule = (callback, ms) => {const id = setTimeout(callback, ms); return () => clearTimeout(id);},
}: Options) {
  if (!Number.isFinite(budgetMs) || budgetMs < 1 || budgetMs > 30000) throw new Error("CLIENT_UI_BUDGET_INVALID");
  let state: ClientUiPreferenceSnapshot = Object.freeze({actor: null, projection: null, enabled: false, status: "local", version: 0});
  let epoch = 0, operation = 0, chain = 0, disposed = false;
  let queue = Promise.resolve();
  const listeners = new Set<(value: ClientUiPreferenceSnapshot) => void>();
  const controllers = new Set<AbortController>();
  const emit = (status: ClientUiSyncStatus = state.status) => {
    if (disposed) return;
    state = Object.freeze({...state, status, version: state.version + 1});
    for (const listener of listeners) listener(state);
  };
  const invalidate = () => {
    epoch++; operation++; chain++; queue = Promise.resolve();
    for (const controller of controllers) controller.abort();
  };
  async function bounded<T>(action: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController(); controllers.add(controller);
    let rejectAbort!: (reason: Error) => void;
    const interrupted = new Promise<never>((_, reject) => {rejectAbort = reject;});
    const abort = () => rejectAbort(new Error("CLIENT_UI_PREFERENCE_UNKNOWN"));
    controller.signal.addEventListener("abort", abort, {once: true});
    const cancelTimer = schedule(() => controller.abort(), budgetMs);
    try {return await Promise.race([Promise.resolve().then(() => action(controller.signal)), interrupted]);}
    finally {cancelTimer(); controller.signal.removeEventListener("abort", abort); controllers.delete(controller);}
  }
  const adopt = (value: unknown) => {
    const next = requireClientUiPreference(value), previous = state.projection;
    if (previous && (next.revision < previous.revision ||
        (next.revision === previous.revision && next.ui_locale !== previous.ui_locale))) throw new Error("CLIENT_UI_PROJECTION_REGRESSION");
    state = Object.freeze({...state, projection: next});
    return next;
  };
  function bind(principal: unknown, preference: unknown, unsetFallback?: unknown,{apply=true}={}) {
    if (principal !== null && (typeof principal !== "number" || !Number.isSafeInteger(principal) || principal <= 0))
      throw new Error("CLIENT_UI_ACTOR_INVALID");
    invalidate();
    let projection: ClientUiPreference | null = null;
    if (principal !== null && preference !== undefined) {
      try {projection = requireClientUiPreference(preference);} catch { /* malformed is not a saved preference */ }
    }
    const enabled = principal !== null && projection !== null;
    state = Object.freeze({...state, actor: principal as number | null, projection, enabled});
    emit(enabled ? "idle" : principal !== null && preference !== undefined ? "unavailable" : "local");
    if (!disposed && enabled && apply) {
      if (projection!.ui_locale !== null) applyLocal(projection!.ui_locale);
      else if (unsetFallback !== undefined) applyLocal(requireClientUiLocale(unsetFallback));
    }
  }
  async function choose(value: unknown, {freshRead = false} = {}) {
    const locale = requireClientUiLocale(value);
    if (disposed) return "stale" as const;
    applyLocal(locale);
    if (!state.enabled || state.actor === null || state.projection === null) {emit("local"); return "local" as const;}
    const actor = state.actor, boundEpoch = epoch, boundChain = chain, boundOperation = ++operation;
    const refreshFirst = freshRead || ["conflict", "unknown"].includes(state.status);
    const sameContext = () => !disposed && epoch === boundEpoch && state.actor === actor;
    const current = () => sameContext() && operation === boundOperation;
    const readProjection = async () => {
      const result = await bounded(signal => transport.read(actor, signal));
      if (!sameContext()) return null;
      if (result.actor !== actor || result.preference === undefined) {
        chain++;
        state = Object.freeze({...state, enabled: false});
        if (current()) emit("unavailable");
        return null;
      }
      return adopt(result.preference);
    };
    emit("saving");
    const pending = queue.then(async () => {
      if (!sameContext()) return "stale" as const;
      if (!state.enabled || state.projection === null) {if (current()) emit("unavailable"); return "unknown" as const;}
      if (chain !== boundChain) {if (current()) emit("conflict"); return "conflict" as const;}
      if (refreshFirst) {
        try {if (!await readProjection()) return sameContext() ? "unknown" as const : "stale" as const;}
        catch {if (sameContext()) chain++; if (current()) emit("unknown"); return sameContext() ? "unknown" as const : "stale" as const;}
        if (!sameContext()) return "stale" as const;
      }
      if (!state.enabled || state.projection === null) {if (current()) emit("unavailable"); return "unknown" as const;}
      const expected = state.projection!.revision;
      if (expected === MAX_REVISION) {if (current()) emit("unavailable"); return "rejected" as const;}
      try {
        const response = await bounded(signal => transport.write(actor, {ui_locale: locale, expected_revision: expected}, signal));
        if (!sameContext()) return "stale" as const;
        const ack = requireClientUiPreference(response);
        if (ack.revision !== expected + 1 || ack.ui_locale !== locale) throw new Error("CLIENT_UI_ACK_INVALID");
        adopt(ack);
        if (!current()) {emit(); return "stale" as const;}
        emit("saved"); return "saved" as const;
      } catch (error) {
        if (!sameContext()) return "stale" as const;
        chain++; // Never silently rebase already queued intents after a failed fence.
        if (error instanceof ClientUiPreferenceConflict) {
          try {adopt(error.current); if (current()) emit("conflict"); return "conflict" as const;}
          catch { /* Invalid conflict data is unknown, not new authority. */ }
        }
        if (error instanceof ClientUiPreferenceRejected) {
          if (error.authentication) state = Object.freeze({...state, enabled: false});
          if (current()) emit(error.authentication ? "unavailable" : "rejected");
          return "rejected" as const;
        }
        if (current()) emit("unknown");
        try {
          const observed = await readProjection();
          if (!sameContext()) return "stale" as const;
          // A higher revision fences the old uncertain write. Equality alone
          // never proves that a possibly still-running write has settled.
          if (observed && current() && observed.revision > expected) {
            if (observed.ui_locale === locale) {emit("saved"); return "saved" as const;}
            emit("conflict"); return "conflict" as const;
          }
        } catch {
          if (sameContext()) chain++;
          // A failed reconciliation also invalidates work queued after the
          // original write became unknown. It must not use an old authority read.
        }
        if (current() && state.enabled) emit("unknown");
        return "unknown" as const;
      }
    });
    queue = pending.then(() => undefined, () => undefined);
    return pending;
  }
  return Object.freeze({
    snapshot: () => state,
    subscribe(listener: (value: ClientUiPreferenceSnapshot) => void) {listeners.add(listener); return () => {listeners.delete(listener);};},
    mount() {disposed = false; bind(null, undefined);},
    bindPrincipal: bind,
    choose,
    // This is called only by a NEW explicit user gesture, never by a failure handler.
    retry: (value: unknown) => choose(value, {freshRead: true}),
    logout() {bind(null, undefined);},
    dispose() {invalidate(); disposed = true; listeners.clear();},
  });
}
