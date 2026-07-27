import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
  assert.match(html, /Сделать визу/);
  assert.match(html, /ITAS E33G/);
  assert.match(html, /удалённых работников/);
  assert.match(html, /Индивидуальный поиск виллы/);
  assert.match(html, /Санкт-Петербург/);
  assert.match(html, /Организовать ретрит/);
  assert.match(html, /Трекинг на Кайлас/);
  assert.match(html, /SAFR Club/);
  assert.doesNotMatch(html, /\?start=/);
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
  assert.match(html, /Все направления/);
  assert.match(html, /Выберите страну выше/);
  assert.match(html, /https:\/\/telegram\.org\/js\/telegram-web-app\.js/);
});

test("destination selection stays inside the Mini App", async () => {
  const source = await readFile(
    new URL("../app/mini-app/MiniAppDashboard.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /onClick=\{\(\) => selectDestination\(direction\.id\)\}/);
  assert.match(source, /onClick=\{\(\) => selectService\(service\.id\)\}/);
  assert.match(source, /onClick=\{\(\) => selectItem\(item\.id\)\}/);
  assert.doesNotMatch(source, /function openDirection/);
  assert.match(source, /function openManager/);
  assert.doesNotMatch(source, /safr_bali_bot\?start=/);
});

test("website destination cards stay on the website", async () => {
  const source = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /href=\{`#catalog-\$\{destination\.id\}`\}/);
  assert.match(source, /className="catalog-item"/);
  assert.doesNotMatch(
    source,
    /className="destination-link"[\s\S]{0,160}telegramLink\(destination\.id\)/,
  );
});
