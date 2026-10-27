/** In-memory request/reply fences only. Server authorization remains mandatory. */
export type AdminVisaSaveIdentity = {
  actorId: number; scope: string; apiOrigin: string; clientId: number; caseId: number; version: number;
};
export type AdminVisaSaveTicket = {
  readonly epoch: number; readonly identity: AdminVisaSaveIdentity; readonly body: string;
};

const positive = (value: number) => Number.isSafeInteger(value) && value > 0;
function sameContext(a: AdminVisaSaveIdentity | null, b: AdminVisaSaveIdentity) {
  return a !== null && a.actorId === b.actorId && a.scope === b.scope
    && a.apiOrigin === b.apiOrigin
    && a.clientId === b.clientId && a.caseId === b.caseId;
}

export function createAdminVisaSaveSession(identity: () => AdminVisaSaveIdentity | null, newKey: () => string) {
  let epoch = 0;
  let active: AdminVisaSaveTicket | null = null;
  let retry: { fingerprint: string; key: string } | null = null;
  return {
    invalidate() { epoch += 1; active = null; retry = null; },
    begin(payload: Record<string, unknown>, rendered: AdminVisaSaveIdentity | null): AdminVisaSaveTicket | null {
      const current = identity();
      if (active || !current || !rendered || !sameContext(current, rendered) || current.version !== rendered.version
          || !current.scope || !current.apiOrigin || ![current.actorId, current.clientId, current.caseId, current.version].every(positive)
          || payload.expected_version !== current.version || "idempotency_key" in payload) return null;
      const captured = Object.freeze({ ...current });
      const fingerprint = JSON.stringify([captured, payload]);
      if (retry?.fingerprint !== fingerprint) retry = { fingerprint, key: newKey() };
      const ticket = Object.freeze({ epoch, identity: captured, body: JSON.stringify({ ...payload, idempotency_key: retry.key }) });
      active = ticket;
      return ticket;
    },
    contextMatches(ticket: AdminVisaSaveTicket) {
      return active === ticket && epoch === ticket.epoch && sameContext(identity(), ticket.identity);
    },
    scopeMatches(ticket: AdminVisaSaveTicket) {
      return epoch === ticket.epoch && sameContext(identity(), ticket.identity);
    },
    isCurrent(ticket: AdminVisaSaveTicket) {
      const current = identity();
      return active === ticket && epoch === ticket.epoch && sameContext(current, ticket.identity)
        && current!.version === ticket.identity.version;
    },
    finish(ticket: AdminVisaSaveTicket) {
      // An old finally must never release the lock of a newer operation.
      if (active === ticket) active = null;
    },
  };
}

export function validAdminVisaSaveResponse(value: unknown, ticket: AdminVisaSaveTicket): value is { id: number; version: number } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return row.id === ticket.identity.caseId && typeof row.version === "number" && positive(row.version)
    && row.version > ticket.identity.version
    && (row.user_id === undefined || row.user_id === ticket.identity.clientId);
}
