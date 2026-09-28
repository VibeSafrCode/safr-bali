import { useEffect, useState } from "react";
import { apiErrorMessage, appApiClient } from "../api/client";

type Copy = { welcome_text: string; followup_text: string };
type Preview = { parts: string[]; followup_text: string; valid: boolean; error?: string | null };
type Scenario = {
  enabled: boolean; revision: number; activation_cutoff: string | null;
  published_version: number | null; draft: Copy; preview: Preview;
  versions: (Copy & { version: number; created_at: string; restored_from_version?: number | null })[];
};
const BASE = "/api/web/admin/onboarding";

export function AdminOnboarding({ csrfToken, locale }: { csrfToken: string; locale: "ru" | "en" }) {
  const [data, setData] = useState<Scenario | null>(null);
  const [copy, setCopy] = useState<Copy>({ welcome_text: "", followup_text: "" });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const ru = locale === "ru";
  const dirty = !!data && (copy.welcome_text !== data.draft.welcome_text || copy.followup_text !== data.draft.followup_text);

  function apply(next: Scenario) {
    setData(next); setCopy(next.draft); setPreview(next.preview);
  }
  useEffect(() => {
    let active = true;
    void appApiClient().request<Scenario>(BASE).then((next) => {
      if (active) apply(next);
    }).catch((caught) => { if (active) setError(apiErrorMessage(caught)); });
    return () => { active = false; };
  }, []);

  async function action(path: string, body: Record<string, unknown>, method = "POST") {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await appApiClient().request<Scenario>(`${BASE}/${path}`, {
        method, headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ expected_revision: data?.revision, ...body }),
      });
      apply(result);
      setNotice(ru ? "Изменение сохранено." : "Change saved.");
    } catch (caught) { setError(apiErrorMessage(caught)); }
    finally { setBusy(false); }
  }
  async function showPreview() {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      setPreview(await appApiClient().request<Preview>(`${BASE}/preview`, {
        method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify(copy),
      }));
    } catch (caught) { setError(apiErrorMessage(caught)); }
    finally { setBusy(false); }
  }
  function edit(field: keyof Copy, value: string) {
    setCopy((previous) => ({ ...previous, [field]: value }));
    setPreview(null); setNotice("");
  }

  return <section className="admin-panel" aria-busy={busy}>
    <h2>{ru ? "Сообщения бота — знакомство с SAFRWAY" : "Bot messages — welcome to SAFRWAY"}</h2>
    <p>{ru ? "Только новым пользователям: приветствие через 15 минут после регистрации, вопрос через час после последней части. Старым пользователям не отправляется." : "New users only: welcome 15 minutes after registration, follow-up one hour after its final part. Existing users are excluded."}</p>
    {error && <p className="admin-alert" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {!data ? <p>{error ? (ru ? "Настройки недоступны. Текст не изменён." : "Settings unavailable. Content is unchanged.") : (ru ? "Загрузка…" : "Loading…")}</p> : <>
      <p>{ru ? "Сценарий:" : "Scenario:"} {data.enabled ? (ru ? "включён" : "enabled") : (ru ? "выключен" : "disabled")}</p>
      <fieldset disabled={busy} style={{ border: 0, padding: 0, minWidth: 0 }}>
        <label>{ru ? "Приветствие" : "Welcome"}<textarea rows={18} value={copy.welcome_text} onChange={(event) => edit("welcome_text", event.target.value)} /></label>
        <label>{ru ? "Вопрос через час" : "Follow-up question"}<textarea rows={3} value={copy.followup_text} onChange={(event) => edit("followup_text", event.target.value)} /></label>
        <div className="crm-save-actions">
          <button type="button" onClick={() => void showPreview()}>{ru ? "Предпросмотр" : "Preview"}</button>
          <button type="button" disabled={!dirty} onClick={() => void action("draft", copy, "PUT")}>{ru ? "Сохранить черновик" : "Save draft"}</button>
          <button type="button" disabled={!dirty} onClick={() => { setCopy(data.draft); setPreview(data.preview); setNotice(""); }}>{ru ? "Сбросить изменения" : "Reset changes"}</button>
        </div>
        {dirty && <p>{ru ? "Для публикации сначала сохраните черновик." : "Save your draft before publishing."}</p>}
        {preview && <section aria-label={ru ? "Предпросмотр сообщений" : "Message preview"}>
          {preview.error && <p role="alert">{preview.error}</p>}
          {preview.parts.map((part, index) => <article key={index}><h3>{ru ? `Сообщение ${index + 1}` : `Message ${index + 1}`}</h3><p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{part}</p></article>)}
          <h3>{ru ? "Через час" : "One hour later"}</h3>
          <p style={{ whiteSpace: "pre-wrap" }}>{preview.followup_text}</p>
          <p>«да» · «написать менеджеру»</p>
        </section>}
        <div className="crm-save-actions">
          <button type="button" disabled={dirty || !preview?.valid} onClick={() => void action("publish", {})}>{ru ? "Опубликовать текст" : "Publish content"}</button>
          <button type="button" disabled={dirty || (!data.enabled && data.published_version === null)} onClick={() => void action("toggle", { enabled: !data.enabled })}>{data.enabled ? (ru ? "Выключить сценарий" : "Disable scenario") : (ru ? "Включить только для новых регистраций" : "Enable for new registrations only")}</button>
        </div>
        <details><summary>{ru ? "История текстов" : "Content history"}</summary>
          {data.versions.map((version) => <article key={version.version}>
            <p>v{version.version} · {version.created_at}</p>
            <details><summary>{ru ? "Показать текст" : "Show content"}</summary><p style={{ whiteSpace: "pre-wrap" }}>{version.welcome_text}</p><p>{version.followup_text}</p></details>
            <button type="button" disabled={dirty || version.version === data.published_version} onClick={() => void action("restore", { version: version.version })}>{ru ? "Восстановить новой версией" : "Restore as a new version"}</button>
          </article>)}
        </details>
      </fieldset>
    </>}
  </section>;
}
