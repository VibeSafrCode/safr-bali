import { useEffect, useRef, useState } from "react";
import { appApiClient } from "../api/client";
import type { LifeLocale } from "./lifeServices";

type Grant = { credential_id: number; expires_at: string; revoked_at: string | null };
type IssuedGrant = Omit<Grant, "revoked_at"> & { token: string };
type Operation = "list" | "issue" | "revoke";

const copy = {
  ru: {
    title: "Доступ специалиста 17", intro: "Ключ на 30 дней даёт доступ к виллам и байкам только этого клиента.",
    check: "Обновить список", issue: "Выдать ключ", revoke: "Отозвать ключ", confirm: "Подтвердить отзыв",
    cancel: "Отмена", download: "Скачать ключ", busy: "Обновляем доступ…",
    none: "Действующего ключа нет.", active: "Действующий ключ", expires: "Действует до",
    failed: "Не удалось подтвердить результат. Обновите список доступа перед повтором.",
    issued: "Ключ выдан. Файл можно скачать один раз до закрытия карточки.",
    missing: "Ключ выдан, но файл недоступен. Отзовите этот ключ и выдайте новый, если файл не сохранился.",
    downloaded: "Скачивание запущено. Проверьте, что файл сохранён в закрытой папке.",
    revoked: "Ключ отозван.",
  },
  en: {
    title: "Specialist 17 access", intro: "A 30-day key grants access to this client's villas and motorbikes only.",
    check: "Refresh access", issue: "Issue key", revoke: "Revoke key", confirm: "Confirm revocation",
    cancel: "Cancel", download: "Download key", busy: "Updating access…",
    none: "There is no active key.", active: "Active key", expires: "Expires on",
    failed: "We could not confirm the result. Refresh the access list before retrying.",
    issued: "Key issued. The file can be downloaded once before you close this profile.",
    missing: "The key was issued, but the file is unavailable. Revoke it and issue a new key if the file was not saved.",
    downloaded: "Download started. Verify that the file is saved in a private folder.",
    revoked: "Key revoked.",
  },
} as const;

function activeGrant(items: Grant[]) {
  return items.find((row) => !row.revoked_at && new Date(row.expires_at).getTime() > Date.now()) ?? null;
}

// The parent is mounted only on an Owner-authorized CRM profile. Every request
// still goes through the server's existing Owner, Origin and CSRF checks.
export function RentalAgentAccess({ userId, csrfToken, locale }: { userId: number; csrfToken: string; locale: LifeLocale }) {
  const t = copy[locale];
  const path = `/api/web/admin/clients/${userId}/life-services/agent/grants`;
  const [grant, setGrant] = useState<Grant | null | undefined>(undefined);
  const [busy, setBusy] = useState<Operation | null>(null);
  const [feedback, setFeedback] = useState<"failed" | "issued" | "missing" | "downloaded" | "revoked" | null>(null);
  const [confirmedList, setConfirmedList] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [canDownload, setCanDownload] = useState(false);
  const request = useRef<AbortController | null>(null);
  const secret = useRef<IssuedGrant | null>(null);
  const issueRequest = useRef<string | null>(null);
  const revokeRequest = useRef<string | null>(null);
  const downloadedId = useRef<number | null>(null);
  const panel = useRef<HTMLDetailsElement>(null);
  const status = useRef<HTMLDivElement>(null);
  const refreshButton = useRef<HTMLButtonElement>(null);
  const issueButton = useRef<HTMLButtonElement>(null);
  const downloadButton = useRef<HTMLButtonElement>(null);
  const revokeButton = useRef<HTMLButtonElement>(null);
  const confirmationButton = useRef<HTMLButtonElement>(null);

  useEffect(() => () => {
    request.current?.abort();
    secret.current = null;
  }, []);

  function focusAfterRender(target: { current: HTMLElement | null }) {
    requestAnimationFrame(() => {
      if (panel.current?.open &&
          (document.activeElement === document.body || panel.current.contains(document.activeElement))) {
        target.current?.focus();
      }
    });
  }

  async function perform<T>(operation: Operation, url: string, body: unknown, onResult: (result: T) => void) {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(operation);
    setFeedback(null);
    const timer = window.setTimeout(() => {
      controller.abort();
      if (request.current !== controller) return;
      request.current = null;
      setBusy(null);
      setConfirmedList(false);
      setFeedback("failed");
      focusAfterRender(refreshButton);
    }, 15000);
    try {
      const result = await appApiClient().request<T>(url, {
        method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!controller.signal.aborted) onResult(result);
    } catch {
      if (!controller.signal.aborted) {
        setConfirmedList(false);
        setFeedback("failed");
        focusAfterRender(refreshButton);
      }
    } finally {
      window.clearTimeout(timer);
      if (request.current === controller) {
        request.current = null;
        if (!controller.signal.aborted) setBusy(null);
      }
    }
  }

  function refresh() {
    setConfirmRevoke(false);
    void perform<{ items: Grant[] }>("list", path + "/list", undefined, ({ items }) => {
      const current = activeGrant(items);
      setGrant(current);
      setConfirmedList(true);
      if (!current && revokeRequest.current) {
        issueRequest.current = null;
        revokeRequest.current = null;
      }
      if (secret.current?.credential_id !== current?.credential_id) {
        secret.current = null;
        setCanDownload(false);
      }
      if (current && issueRequest.current && !secret.current && downloadedId.current !== current.credential_id) {
        setFeedback("missing");
      }
    });
  }

  function issue() {
    if (grant || !confirmedList || request.current) return;
    issueRequest.current ??= crypto.randomUUID();
    void perform<IssuedGrant>("issue", path, { request_id: issueRequest.current }, (result) => {
      if (!/^ra_[A-Za-z0-9_-]{43}$/.test(result.token)) throw new Error("Invalid credential response");
      const { credential_id, expires_at } = result;
      secret.current = result;
      setCanDownload(true);
      setGrant({ credential_id, expires_at, revoked_at: null });
      setFeedback("issued");
      focusAfterRender(downloadButton);
    });
  }

  function revoke() {
    if (!grant || !confirmRevoke || !confirmedList || request.current) return;
    revokeRequest.current ??= crypto.randomUUID();
    void perform<{ revoked: boolean }>("revoke", `${path}/${grant.credential_id}/revoke`,
      { request_id: revokeRequest.current }, (result) => {
        if (!result.revoked) throw new Error("Revocation not confirmed");
        secret.current = null;
        issueRequest.current = null;
        revokeRequest.current = null;
        setCanDownload(false);
        setConfirmRevoke(false);
        setGrant(null);
        setFeedback("revoked");
        focusAfterRender(issueButton);
      });
  }

  function download() {
    const value = secret.current;
    if (!value || value.credential_id !== grant?.credential_id) return;
    const body = JSON.stringify({
      api_base: `${window.location.origin}/api/web/life-services/agent`,
      credential_id: value.credential_id, expires_at: value.expires_at, token: value.token,
    });
    const url = URL.createObjectURL(new Blob([body + "\n"], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `safr-rental-agent-${value.credential_id}.private.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    downloadedId.current = value.credential_id;
    secret.current = null;
    setCanDownload(false);
    setFeedback("downloaded");
    focusAfterRender(status);
  }

  return <details ref={panel} className="life-notice" onToggle={(event) => {
    if (event.currentTarget.open && !confirmedList && !request.current) refresh();
  }}>
    <summary>{t.title}</summary>
    <p>{t.intro}</p>
    {confirmedList && (grant ? <p>{t.active} #{grant.credential_id} · {t.expires}{" "}
      <time dateTime={grant.expires_at}>{new Date(grant.expires_at).toLocaleDateString(locale)}</time></p> : <p>{t.none}</p>)}
    <div className="life-toolbar-actions life-agent-actions">
      <button ref={refreshButton} className="button secondary" type="button" disabled={busy !== null} onClick={refresh}>{t.check}</button>
      {confirmedList && !grant && <button ref={issueButton} className="button primary" type="button" disabled={busy !== null} onClick={issue}>{t.issue}</button>}
      {canDownload && <button ref={downloadButton} className="button primary" type="button" disabled={busy !== null || !confirmedList} onClick={download}>{t.download}</button>}
      {confirmedList && grant && (confirmRevoke ? <>
        <button ref={confirmationButton} className="button secondary" type="button" disabled={busy !== null} onClick={revoke}>{t.confirm}</button>
        <button className="button secondary" type="button" disabled={busy !== null} onClick={() => {
          setConfirmRevoke(false);
          focusAfterRender(revokeButton);
        }}>{t.cancel}</button>
      </> : <button ref={revokeButton} className="button secondary" type="button" disabled={busy !== null} onClick={() => {
        setConfirmRevoke(true);
        focusAfterRender(confirmationButton);
      }}>{t.revoke}</button>)}
    </div>
    <div ref={status} role="status" tabIndex={-1}>{busy ? t.busy : feedback && feedback !== "failed" ? t[feedback] : ""}</div>
    {feedback === "failed" && <p role="alert">{t.failed}</p>}
  </details>;
}
