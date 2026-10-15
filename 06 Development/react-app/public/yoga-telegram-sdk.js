/* Yoga-only early SDK bootstrap. Main keeps its existing HTML/runtime loader. */
(() => {
  if (window.__yogaTelegramSdk) return;

  let resolve;
  let timer;
  let script;
  let settled = false;
  const state = {
    status: "loading",
    promise: new Promise((complete) => { resolve = complete; }),
  };
  window.__yogaTelegramSdk = state;

  const finish = (status) => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timer);
    script?.removeEventListener("load", loaded);
    script?.removeEventListener("error", failed);
    state.status = status;
    if (script) script.dataset.yogaTelegramSdkState = status;
    const notice = document.getElementById("yoga-bootstrap-status");
    if (notice && status !== "ready") {
      notice.textContent = "Не удалось загрузить Telegram. Откройте Mini App заново. / Telegram could not load. Reopen the Mini App.";
    }
    resolve(status === "ready" ? window.Telegram.WebApp : null);
  };
  const loaded = () => finish(window.Telegram?.WebApp ? "ready" : "error");
  const failed = () => finish("error");

  if (window.Telegram?.WebApp) {
    finish("ready");
    return;
  }

  script = document.querySelector('script[data-safr-telegram-sdk="true"]');
  const existing = Boolean(script);
  script ??= document.createElement("script");
  script.addEventListener("load", loaded);
  script.addEventListener("error", failed);
  timer = window.setTimeout(() => finish("timeout"), 5000);
  // A terminal outcome is retained for the whole launch, including after a
  // late SDK load. Never append a second script or retry an authentication POST.
  if (script.dataset.yogaTelegramSdkState === "error" || script.dataset.yogaTelegramSdkState === "timeout") {
    finish(script.dataset.yogaTelegramSdkState);
  } else if (!existing) {
    script.src = "https://telegram.org/js/telegram-web-app.js?63";
    script.async = true;
    script.dataset.safrTelegramSdk = "true";
    document.head.append(script);
  }
})();
