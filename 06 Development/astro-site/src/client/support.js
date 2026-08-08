const launcher = document.querySelector("[data-support-launcher]");
const countryForPath = (pathname) =>
  pathname === "/thailand" || pathname.startsWith("/thailand/")
    ? "Таиланд"
    : null;

if (launcher instanceof HTMLElement) {
  const openButtons = document.querySelectorAll("[data-support-open]");
  const closeButton = launcher.querySelector("[data-support-close]");
  const panel = launcher.querySelector("[data-support-panel]");
  const form = launcher.querySelector("[data-support-form]");
  const submit = launcher.querySelector("[data-support-submit]");
  const status = launcher.querySelector("[data-support-status]");

  const setOpen = (isOpen) => {
    if (!(panel instanceof HTMLElement)) return;
    panel.hidden = !isOpen;
    openButtons.forEach((button) => {
      if (button instanceof HTMLElement) {
        button.setAttribute("aria-expanded", String(isOpen));
      }
    });
    if (isOpen) {
      panel.querySelector("input[name=name]")?.focus();
    }
  };

  openButtons.forEach((button) => {
    button.addEventListener("click", () => setOpen(true));
  });
  closeButton?.addEventListener("click", () => setOpen(false));

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (
      !(form instanceof HTMLFormElement) ||
      !(submit instanceof HTMLButtonElement) ||
      !(status instanceof HTMLElement)
    ) {
      return;
    }

    const values = new FormData(form);
    submit.disabled = true;
    status.textContent = "Отправляем…";

    try {
      const country = countryForPath(window.location.pathname);
      const response = await fetch("/api/web/chat/guest", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(values.get("name") ?? ""),
          contact: String(values.get("contact") ?? ""),
          body: String(values.get("body") ?? ""),
          website: String(values.get("website") ?? ""),
          route_context: {
            ...(country ? { country } : {}),
            section: document.title.slice(0, 150),
            service: window.location.pathname.slice(0, 150),
          },
        }),
      });
      if (!response.ok) throw new Error(`support:${response.status}`);
      form.reset();
      status.textContent =
        "Сообщение отправлено. Менеджер ответит по указанному контакту.";
    } catch {
      status.textContent =
        "Не удалось отправить сообщение. Попробуйте ещё раз или откройте Telegram.";
    } finally {
      submit.disabled = false;
    }
  });
}
