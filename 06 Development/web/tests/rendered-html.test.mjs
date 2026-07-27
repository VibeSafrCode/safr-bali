import assert from "node:assert/strict";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the SAFR marketing site", async () => {
  const response = await render("/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>SAFR — путешествия и жизнь без лишнего хаоса<\/title>/i);
  assert.match(html, /Путешествия и жизнь/);
  assert.match(html, /Бали/);
  assert.match(html, /Таиланд/);
  assert.match(html, /Россия/);
  assert.match(html, /Непал/);
  assert.match(html, /SAFR Club/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("server-renders the Telegram Mini App shell", async () => {
  const response = await render("/mini-app");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /Личный кабинет/);
  assert.match(html, /SAFR Points/);
  assert.match(html, /Моя сеть/);
  assert.match(html, /Мои заявки/);
});
