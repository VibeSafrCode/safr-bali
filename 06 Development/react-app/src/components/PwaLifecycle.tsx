import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

export function PwaLifecycle({ locale }: { locale: "ru" | "en" }) {
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [versionUpdate, setVersionUpdate] = useState(false);
  const [error, setError] = useState(false);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const reloadAfterActivation = useRef(false);

  useEffect(() => {
    setHost(document.querySelector<HTMLElement>(".account-header-tools, .admin-top-tools"));
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
    let registration: ServiceWorkerRegistration | undefined;
    const install = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPrompt); };
    const online = () => setOffline(false);
    const offlineEvent = () => setOffline(true);
    window.addEventListener("beforeinstallprompt", install);
    window.addEventListener("online", online);
    window.addEventListener("offline", offlineEvent);
    const controllerChange = () => {
      if (!reloadAfterActivation.current) return;
      reloadAfterActivation.current = false;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", controllerChange);
    const checkVersion = async () => {
      try {
        const response = await fetch(`/build-version.json?v=${Date.now()}`, { cache: "no-store", credentials: "omit" });
        if (!response.ok) throw new Error("version check failed");
        const payload = await response.json() as { build_id?: string };
        setVersionUpdate(Boolean(payload.build_id && payload.build_id !== __SAFRWAY_BUILD_ID__));
      } catch { if (navigator.onLine) setError(true); }
    };
    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((result) => {
      registration = result;
      if (result.waiting) setWaiting(result.waiting);
      result.addEventListener("updatefound", () => {
        const worker = result.installing;
        worker?.addEventListener("statechange", () => { if (worker.state === "installed" && navigator.serviceWorker.controller) setWaiting(worker); });
      });
      void result.update().catch(() => setError(true));
    }).catch(() => setError(true));
    void checkVersion();
    return () => {
      window.removeEventListener("beforeinstallprompt", install);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offlineEvent);
      navigator.serviceWorker.removeEventListener("controllerchange", controllerChange);
      void registration;
    };
  }, []);

  if (!offline && !installPrompt && !waiting && !versionUpdate && !error) return null;
  const notice = <aside className="pwa-lifecycle" aria-live="polite">
    {offline && <span>{locale === "ru" ? "Нет сети — данные доступны только после подключения." : "Offline — data is available after reconnecting."}</span>}
    {error && !offline && <span role="alert">{locale === "ru" ? "Не удалось проверить приложение. Повторите при стабильной сети." : "Could not check the app. Retry on a stable connection."}</span>}
    {installPrompt && <button type="button" onClick={() => { void installPrompt.prompt(); void installPrompt.userChoice.finally(() => setInstallPrompt(null)); }}>{locale === "ru" ? "Установить приложение" : "Install app"}</button>}
    {waiting && <button type="button" onClick={() => { reloadAfterActivation.current = true; waiting.postMessage({ type: "SKIP_WAITING" }); }}>{locale === "ru" ? "Обновить приложение" : "Update app"}</button>}
    {versionUpdate && !waiting && <button type="button" onClick={() => window.location.reload()}>{locale === "ru" ? "Загрузить новую версию" : "Load new version"}</button>}
  </aside>;
  return host ? createPortal(notice, host) : notice;
}
