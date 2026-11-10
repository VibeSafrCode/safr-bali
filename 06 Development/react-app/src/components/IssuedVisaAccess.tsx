import { useEffect, useRef, useState, type FormEvent } from "react";
import { appApiClient } from "../api/client";

type Grant = { credential_id: number; expires_at: string };
type IssuedGrant = Grant & { token: string };

const messages = {
  ru: {
    title: "Импорт D1 специалистом 17",
    help: "Сверьте выданную визу с этим делом. Ключ действует 24 часа и позволяет загрузить только выбранный PDF.",
    pdf: "Выданная виза (PDF)", number: "Номер выданной визы", issued: "Дата выдачи",
    deadline: "Последний день для въезда по документу", check: "Проверить доступ",
    issue: "Подтвердить PDF и выдать ключ", download: "Скачать ключ", revoke: "Отозвать ключ",
    confirmRevoke: "Подтвердить отзыв", cancel: "Отмена", none: "Действующего ключа нет.",
    active: "Ключ действует до", issuedKey: "Ключ готов. Сохраните файл в закрытой папке.",
    downloaded: "Скачивание запущено.", revoked: "Ключ отозван.",
    invalid: "Выберите действительный PDF допустимого размера.",
    failed: "Результат не подтверждён. Проверьте доступ перед повтором.",
    lost: "Если файл с ключом не сохранился, отзовите ключ и оформите новый.",
    unavailable: "Выдача ключа недоступна для текущего состояния дела или хранилища.",
  },
  en: {
    title: "D1 import by Specialist 17",
    help: "Verify the issued visa against this case. The key lasts 24 hours and accepts only the selected PDF.",
    pdf: "Issued visa (PDF)", number: "Issued visa number", issued: "Issue date",
    deadline: "Last entry date shown on the document", check: "Check access",
    issue: "Approve PDF and issue key", download: "Download key", revoke: "Revoke key",
    confirmRevoke: "Confirm revocation", cancel: "Cancel", none: "There is no active key.",
    active: "Key expires", issuedKey: "The key is ready. Save the file in a private folder.",
    downloaded: "Download started.", revoked: "The key was revoked.",
    invalid: "Choose a valid PDF within the size limit.",
    failed: "The result could not be confirmed. Check access before retrying.",
    lost: "If the key file was lost, revoke the key and issue a new one.",
    unavailable: "Issuing is unavailable for the current case or storage state.",
  },
} as const;

const ownerPath = "/api/web/admin/visa-agents";

export function IssuedVisaAccess({ caseId, userId, version, csrfToken, canIssue, maxBytes, locale }: {
  caseId: number; userId: number; version: number; csrfToken: string;
  canIssue: boolean; maxBytes: number; locale: "ru" | "en";
}) {
  const t = messages[locale];
  const [grant, setGrant] = useState<Grant | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [canDownload, setCanDownload] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [feedback, setFeedback] = useState<keyof typeof t | null>(null);
  const request = useRef<AbortController | null>(null);
  const secret = useRef<string | null>(null);
  const status = useRef<HTMLParagraphElement>(null);

  useEffect(() => () => {
    request.current?.abort();
    request.current = null;
    secret.current = null;
  }, []);

  async function perform(action: (signal: AbortSignal) => Promise<void>) {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    const timer = window.setTimeout(() => controller.abort(), 15000);
    setBusy(true);
    setFeedback(null);
    try {
      await action(controller.signal);
    } catch {
      if (request.current === controller) {
        secret.current = null;
        setGrant(undefined);
        setCanDownload(false);
        setConfirmRevoke(false);
        setFeedback("failed");
      }
    } finally {
      window.clearTimeout(timer);
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  }

  function post<T>(path: string, signal: AbortSignal, payload?: object) {
    return appApiClient().request<T>(ownerPath + path, {
      method: "POST", signal, headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
  }

  function refresh() {
    void perform(async (signal) => {
      const current = await post<Grant | null>(`/issued-document-access/${caseId}/status`, signal);
      if (!signal.aborted) setGrant(current);
    });
  }

  function issue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canIssue || grant !== null) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const file = fields.get("pdf");
    if (!(file instanceof File) || file.size < 5 || file.size > maxBytes) {
      setFeedback("invalid");
      return;
    }
    void perform(async (signal) => {
      const bytes = await file.arrayBuffer();
      if (signal.aborted) return;
      if (new TextDecoder().decode(bytes.slice(0, 4)) !== "%PDF") {
        setFeedback("invalid");
        return;
      }
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      if (signal.aborted) return;
      const pdfSha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
      const issued = await post<IssuedGrant>("/issued-document-access", signal, {
        request_id: crypto.randomUUID(), case_id: caseId, client_user_id: userId, expected_version: version,
        issued_on: fields.get("issued"), entry_deadline: fields.get("deadline"),
        visa_number: String(fields.get("number")).trim(), pdf_sha256: pdfSha256,
      });
      if (signal.aborted) return;
      secret.current = issued.token;
      setGrant({ credential_id: issued.credential_id, expires_at: issued.expires_at });
      setCanDownload(true);
      setFeedback("issuedKey");
      form.reset();
    });
  }

  function download() {
    if (!grant || !secret.current) return;
    const caseUrl = new URL(`/api/visa-agent/cases/${caseId}`, appApiClient().origin).href;
    const file = new Blob([JSON.stringify({
      token: secret.current, case_id: caseId, expires_at: grant.expires_at, request_id: crypto.randomUUID(),
      read_url: caseUrl, import_url: `${caseUrl}/issued-document`,
    }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = "safrway-d1-import-key.json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    secret.current = null;
    setCanDownload(false);
    setFeedback("downloaded");
    status.current?.focus();
  }

  function revoke() {
    if (!grant) return;
    void perform(async (signal) => {
      await post(`/${grant.credential_id}/revoke`, signal, { reason: "Owner revoked D1 import access" });
      if (signal.aborted) return;
      secret.current = null;
      setGrant(null);
      setCanDownload(false);
      setConfirmRevoke(false);
      setFeedback("revoked");
      status.current?.focus();
    });
  }

  return <details className="crm-advanced">
    <summary>{t.title}</summary>
    <div className="crm-advanced-body">
      <p>{t.help}</p>
      <div className="crm-save-actions">
        <button type="button" className="button secondary" disabled={busy || canDownload} onClick={refresh}>{t.check}</button>
        {grant && canDownload && <button type="button" className="button primary" onClick={download}>{t.download}</button>}
        {grant && !confirmRevoke && <button type="button" disabled={busy} onClick={() => setConfirmRevoke(true)}>{t.revoke}</button>}
        {grant && confirmRevoke && <>
          <button type="button" disabled={busy} onClick={revoke}>{t.confirmRevoke}</button>
          <button type="button" disabled={busy} onClick={() => setConfirmRevoke(false)}>{t.cancel}</button>
        </>}
      </div>
      {grant && <p>{t.active} <time dateTime={grant.expires_at}>{new Date(grant.expires_at).toLocaleString(locale)}</time>.</p>}
      {grant && !canDownload && <p>{t.lost}</p>}
      {grant === null && <p>{t.none}</p>}
      <p ref={status} role="status" tabIndex={-1}>{feedback ? t[feedback] : ""}</p>
      {grant === null && (canIssue ? <form className="crm-editor-grid" onSubmit={issue}>
        <label>{t.pdf}<input name="pdf" type="file" accept="application/pdf,.pdf" required disabled={busy} /></label>
        <label>{t.number}<input name="number" autoComplete="off" minLength={3} maxLength={64} required disabled={busy} /></label>
        <label>{t.issued}<input name="issued" type="date" required disabled={busy} /></label>
        <label>{t.deadline}<input name="deadline" type="date" required disabled={busy} /></label>
        <button type="submit" className="button primary" disabled={busy}>{t.issue}</button>
      </form> : <p>{t.unavailable}</p>)}
    </div>
  </details>;
}
