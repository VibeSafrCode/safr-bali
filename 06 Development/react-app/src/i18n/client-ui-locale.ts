import {
  createClientUiBindings, requireClientUiLocale, serverContactLocale,
  type ClientUiLocale10, type ServerContactLocaleRUEN,
} from "./client-ui-bindings";
import { CLIENT_UI_LOCALE_STORAGE_KEY } from "../runtime/client-auth-lifecycle";
import {browserUiInitialLocale} from './system-ui-locale';

export { CLIENT_UI_LOCALE_STORAGE_KEY } from "../runtime/client-auth-lifecycle";
export const CLIENT_UI_LOCALE_EVENT = "safr:client-ui-locale";
export type ClientUiLocaleSource='automatic'|'route'|'cached'|'server'|'manual';
export type ClientUiLocaleSnapshot = Readonly<{
  locale: ClientUiLocale10;
  source: ClientUiLocaleSource;
  contactLocale: ServerContactLocaleRUEN;
  actor: number | null;
  version: number;
}>;
type Environment = {
  read: () => string | null;
  write: (value: ClientUiLocale10 | null) => void;
  apply: (value: ClientUiLocale10) => void;
  initial: ClientUiLocale10;
  initialSource?:'automatic'|'route';
  reset?:()=>Readonly<{locale:ClientUiLocale10;source:'automatic'|'route'}>;
};

/** Local UI preference only: no principal/PII/pending network intent in storage. */
export function readClientUiPreference(): ClientUiLocale10 | null {
  let value: string | null;
  try { value = localStorage.getItem(CLIENT_UI_LOCALE_STORAGE_KEY); }
  catch { return null; } // Explicitly unavailable storage, not translated RU copy.
  if (value === null) return null;
  try { return requireClientUiLocale(value); }
  catch {
    try { localStorage.removeItem(CLIENT_UI_LOCALE_STORAGE_KEY); } catch { /* unavailable */ }
    // Invalid local preference is not application authority. Discard only this
    // key and let the validated document/server locale initialize the session.
    return null;
  }
}
export function applyClientDocumentLocale(locale: unknown) {
  const binding = createClientUiBindings(locale);
  if(typeof document==='undefined'||typeof window==='undefined')return;
  document.documentElement.lang = binding.locale;
  document.documentElement.dir = binding.dir;
  window.dispatchEvent(new Event(CLIENT_UI_LOCALE_EVENT));
}
export function documentClientUiLocale(): ClientUiLocale10 {
  return requireClientUiLocale(document.documentElement.lang);
}
export function browserClientUiLocaleEnvironment(): Environment {
  const initial=browserUiInitialLocale();
  return {
    initial: initial.locale,
    initialSource: initial.source==='route'?'route':'automatic',
    reset:()=>{const next=browserUiInitialLocale();return{locale:next.locale,source:next.source==='route'?'route':'automatic'};},
    read: () => readClientUiPreference(),
    write: value => {
      try {
        if (value === null) localStorage.removeItem(CLIENT_UI_LOCALE_STORAGE_KEY);
        else localStorage.setItem(CLIENT_UI_LOCALE_STORAGE_KEY, value);
      } catch { /* The in-memory preference remains explicit when storage is unavailable. */ }
    },
    apply: applyClientDocumentLocale,
  };
}

/** Epoch/actor/operation bound optimistic changes; legacy contact API remains RUEN. */
export function createClientUiLocaleSession(environment: Environment) {
  const saved = environment.read();
  const initialSource=environment.initialSource??'automatic';
  let state: ClientUiLocaleSnapshot = Object.freeze({
    locale: initialSource==='route'||saved===null?requireClientUiLocale(environment.initial):requireClientUiLocale(saved),
    source:initialSource==='route'?'route':saved===null?'automatic':'cached',
    contactLocale: "ru", actor: null, version: 0,
  });
  let epoch = 0, operation = 0, disposed = false;
  let persistenceQueue = Promise.resolve();
  let confirmedContact = state.contactLocale;
  let settledUi = {locale: state.locale, source:state.source, operation};
  const cached=(value:Pick<ClientUiLocaleSnapshot,'locale'|'source'>)=>
    ['manual','cached','server'].includes(value.source)?value.locale:null;
  const independent=()=>environment.reset?.()??{locale:environment.initial,source:initialSource};
  const listeners = new Set<(value: ClientUiLocaleSnapshot) => void>();
  const emit = (next: Omit<ClientUiLocaleSnapshot, "version">, preference: ClientUiLocale10 | null) => {
    if (disposed) return;
    state = Object.freeze({...next, version: state.version + 1});
    environment.write(preference);
    environment.apply(state.locale);
    for (const listener of listeners) listener(state);
  };
  const actor = (value: unknown): number | null => {
    if (value === null) return null;
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
      throw new Error("CLIENT_UI_ACTOR_INVALID");
    }
    return value;
  };
  return Object.freeze({
    snapshot: () => state,
    subscribe(listener: (value: ClientUiLocaleSnapshot) => void) {
      listeners.add(listener);
      return () => {listeners.delete(listener);};
    },
    mount() {disposed = false; epoch++; operation++; persistenceQueue = Promise.resolve(); environment.apply(state.locale);},
    bindPrincipal(principal: unknown, contact: unknown) {
      const nextActor = actor(principal), contactLocale = serverContactLocale(contact);
      const changedActor = state.actor !== null && nextActor !== state.actor;
      epoch++; operation++;
      persistenceQueue = Promise.resolve();
      const next=changedActor?independent():{locale:state.locale,source:state.source};
      emit({...next, contactLocale, actor: nextActor}, changedActor?null:cached(state));
      confirmedContact = contactLocale;
      settledUi = {...next, operation};
    },
    adopt(value:unknown){
      const locale=requireClientUiLocale(value);
      if(disposed)return;
      emit({...state,locale,source:'server'},locale);
      settledUi={locale,source:'server',operation};
    },
    async change(nextValue: unknown, persistContact?: (locale: ServerContactLocaleRUEN) => Promise<void>) {
      const next = requireClientUiLocale(nextValue);
      if (disposed) return "stale" as const;
      if (next === state.locale) {
        // Equal-valued manual intent is distinct from automatic/server display.
        emit({...state,source:'manual'},next);
        settledUi={locale:next,source:'manual',operation};
        return "unchanged" as const;
      }
      const boundEpoch = epoch, boundActor = state.actor, boundOperation = ++operation;
      emit({...state, locale: next,source:'manual'}, next);
      const sameContext = () => !disposed && epoch === boundEpoch && state.actor === boundActor;
      const current = () => sameContext() && operation === boundOperation;
      if ((next !== "ru" && next !== "en") || state.actor === null || !persistContact) {
        settledUi = {locale: next, source:'manual', operation: boundOperation};
        return "local" as const;
      }
      // Serialize only this actor/epoch's RUEN contact writes. An obsolete
      // response cannot cancel a write already sent, so the newest write must
      // follow it rather than race it. Context resets detach the old queue.
      const pending = persistenceQueue.then(async () => {
        if (!sameContext()) return false;
        await persistContact(next);
        if (!sameContext()) return false;
        confirmedContact = next;
        if (boundOperation > settledUi.operation) {
          settledUi = {locale: next, source:'manual', operation: boundOperation};
        }
        if (!current()) emit({...state, contactLocale: next}, cached(state));
        return true;
      });
      persistenceQueue = pending.then(() => undefined, () => undefined);
      try {
        if (!await pending || !current()) return "stale" as const;
        emit({...state, contactLocale: next}, next);
        return "persisted" as const;
      } catch {
        if (!current()) return "stale" as const;
        emit({...state, locale: settledUi.locale,source:settledUi.source, contactLocale: confirmedContact},cached(settledUi));
        return "rollback" as const;
      }
    },
    logout() {
      epoch++; operation++;
      persistenceQueue = Promise.resolve(); confirmedContact = "ru";
      const next=independent();
      emit({...next, contactLocale: "ru", actor: null}, null);
      settledUi = {...next, operation};
    },
    dispose() {disposed = true; epoch++; operation++; persistenceQueue = Promise.resolve(); listeners.clear();},
  });
}
