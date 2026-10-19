import { ApiError } from "../api/client";
import type { Chat, RouteContext } from "../api/types";
import { parseSupportChat } from "./support-chat";

export type SupportApiPrefix = "/mini-app" | "/api/web";
export type SupportDraft = {
  name: string;
  contactMethod: string;
  contact: string;
  body: string;
};
type Intent = {
  draft: SupportDraft;
  serializedBody: string;
  conflict: boolean;
  error?: { kind: ApiError["kind"]; status?: number };
};
type Transport<T> = (serializedBody: string, signal: AbortSignal) => Promise<T>;
type AttemptResult<T> = { status: "accepted"; value: T } | { status: "busy" | "ignored" };

const uuid4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function sameDraft(left: SupportDraft, right: SupportDraft) {
  return left.name === right.name && left.contactMethod === right.contactMethod &&
    left.contact === right.contact && left.body === right.body;
}

function secureUuid4() {
  if (!globalThis.crypto?.randomUUID) {
    throw new ApiError("Secure retry identity unavailable", { kind: "configuration" });
  }
  return globalThis.crypto.randomUUID();
}

// One exact unresolved intent in memory only. Never serialize draft/contact/key to
// storage, URLs, telemetry or logs. An abort is an unknown outcome, not a new send.
export class SupportIntentSession {
  private intent?: Intent;
  private attempt?: AbortController;
  private disposed = false;

  constructor(private readonly createUuid: () => string, private readonly expectedActor: number) {}

  draft() { return this.intent ? { ...this.intent.draft } : undefined; }
  blocked() { return this.intent?.conflict ?? false; }
  error() {
    return this.intent?.error ? new ApiError("Support intent unresolved", this.intent.error) : undefined;
  }

  pause() {
    const attempt = this.attempt;
    this.attempt = undefined;
    attempt?.abort();
  }

  edit() {
    this.pause();
    this.intent = undefined;
  }

  dispose() { this.edit(); this.disposed = true; }

  async submit<T>(draft: SupportDraft, context: RouteContext, transport: Transport<T>): Promise<AttemptResult<T>> {
    if (this.disposed) return { status: "ignored" };
    if (this.attempt) return { status: "busy" };
    if (!this.intent || !sameDraft(this.intent.draft, draft)) {
      const key = this.createUuid();
      if (!uuid4.test(key)) {
        throw new ApiError("Invalid secure retry identity", { kind: "configuration" });
      }
      this.intent = {
        draft: { ...draft }, conflict: false,
        serializedBody: JSON.stringify({
          body: `${draft.name.trim()} · ${draft.contactMethod}: ${draft.contactMethod === "phone" ? "+" : ""}${draft.contact}\n\n${draft.body.trim()}`,
          route_context: context, idempotency_key: key, expected_actor_telegram_id: this.expectedActor,
        }),
      };
    }
    if (this.intent.conflict) throw new ApiError("Support intent conflict", this.intent.error ?? { kind: "http", status: 409 });
    const intent = this.intent;
    const attempt = new AbortController();
    this.attempt = attempt;
    try {
      const value = await transport(intent.serializedBody, attempt.signal);
      if (this.disposed || this.attempt !== attempt || attempt.signal.aborted) return { status: "ignored" };
      this.intent = undefined;
      return { status: "accepted", value };
    } catch (caught) {
      if (this.disposed || this.attempt !== attempt || attempt.signal.aborted) return { status: "ignored" };
      // A 409 must never be solved by silently minting a new key. Only a user's
      // explicit edit starts a different logical intent; every other retry is exact.
      if (caught instanceof ApiError) {
        intent.conflict = caught.status === 409;
        intent.error = { kind: caught.kind, status: caught.status };
      } else {
        intent.error = { kind: "network" };
      }
      throw caught;
    } finally {
      if (this.attempt === attempt) this.attempt = undefined;
    }
  }
}

export function createSupportIntentMemory(createUuid: () => string = secureUuid4) {
  let scope: string | undefined;
  let session: SupportIntentSession | undefined;
  function clear() { session?.dispose(); session = undefined; scope = undefined; }
  return {
    clear,
    bind(apiPrefix: SupportApiPrefix, userId: number | undefined) {
      if (!Number.isSafeInteger(userId) || !userId || userId < 1) { clear(); return null; }
      const next = `${apiPrefix}:${userId}`;
      if (scope !== next) {
        clear();
        scope = next;
        session = new SupportIntentSession(createUuid, userId);
      }
      return session!;
    },
  };
}

export const supportIntentMemory = createSupportIntentMemory();

type Request = (path: string, options?: RequestInit) => Promise<unknown>;

async function boundedSupportRequest<T>(signal:AbortSignal,work:(child:AbortSignal)=>Promise<T>):Promise<T>{
  const child=new AbortController();
  let rejectStopped!:(reason:Error)=>void;
  const stopped=new Promise<never>((_resolve,reject)=>{rejectStopped=reject;});
  const stop=(reason:Error)=>{child.abort();rejectStopped(reason);};
  const aborted=()=>stop(new DOMException('Support send disposed','AbortError'));
  const timer=globalThis.setTimeout(()=>stop(new ApiError('Support outcome unresolved',{kind:'network'})),15000);
  signal.addEventListener('abort',aborted,{once:true});if(signal.aborted)aborted();
  try{return await Promise.race([Promise.resolve().then(()=>{
    if(child.signal.aborted)throw new DOMException('Support send disposed','AbortError');
    return work(child.signal);
  }),stopped]);}finally{globalThis.clearTimeout(timer);signal.removeEventListener('abort',aborted);}
}

export async function sendSupportIntentRequest(
  apiPrefix: SupportApiPrefix, userId: number, serializedBody: string,
  signal: AbortSignal, request: Request, csrfToken?: string,
): Promise<Chat> {
  return boundedSupportRequest(signal,async child=>{
  // Recheck the authenticated actor, rather than trusting a username or a stale
  // Dashboard after another tab changed the cookie. Only an expected-actor
  // assertion is sent; it cannot replace the server's authenticated principal.
  const identity = await request(apiPrefix === "/api/web" ? "/api/web/auth/me" : "/mini-app/me", { signal:child });
  const actor = identity as { telegram_id?: unknown; authenticated?: unknown } | null;
  if (!actor || typeof actor !== "object" || actor.telegram_id !== userId ||
      (apiPrefix === "/api/web" && actor.authenticated !== true)) {
    throw new ApiError("Support actor changed", { kind: "authentication", status: 401 });
  }
  if (child.aborted) throw new DOMException("Support send aborted", "AbortError");
  const result = await request(`${apiPrefix}/chat/messages`, {
    method: "POST", signal:child,
    headers: { "Content-Type": "application/json", ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}) },
    body: serializedBody,
  });
  if (child.aborted) throw new DOMException("Support response aborted", "AbortError");
  return parseSupportChat(result);
  });
}
