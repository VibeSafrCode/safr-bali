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
  assert.match(html, /SAFR Club/);
  assert.doesNotMatch(html, /\?start=/);
  assert.doesNotMatch(html, /Открыть в Telegram|Написать в Telegram/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
  assert.match(html, /Написать менеджеру/);
});

test("website renders separate destination, service and item pages", async () => {
  const index = await (await render("/directions")).text();
  assert.match(index, /Выберите направление/);
  assert.match(index, /\/directions\/bali/);

  const destination = await (await render("/directions/bali")).text();
  assert.match(destination, /Сделать визу/);
  assert.match(destination, /Найти жильё/);

  const service = await (await render("/directions/bali/visas")).text();
  assert.match(service, /ITAS E33G/);
  assert.match(service, /eVOA/);

  const item = await (await render("/directions/bali/visas/e33g")).text();
  assert.match(item, /удалённых работников/);
  assert.match(item, /Написать менеджеру/);
});

test("server-renders the Telegram Mini App shell", async () => {
  const response = await render("/mini-app");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /Личный кабинет/);
  assert.match(html, /SAFR Points/);
  assert.match(html, /Все направления/);
  assert.match(html, /Куда отправимся/);
  assert.match(html, />Услуги</);
  assert.match(html, />Заявки</);
  assert.match(html, />Профиль</);
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
  assert.match(source, /onClick=\{\(\) => openTab\("services"\)\}/);
  assert.doesNotMatch(source, /href="#(?:top|directions|orders|profile)"/);
  assert.doesNotMatch(source, /scrollIntoView\(\{ behavior: "smooth"/);
  assert.doesNotMatch(source, /function openDirection/);
  assert.match(source, /function openManager/);
  assert.doesNotMatch(source, /safr_bali_bot\?start=/);
  assert.equal((source.match(/https:\/\/t\.me\/safr_bali_bot/g) ?? []).length, 1);
  assert.doesNotMatch(source, /<a[^>]+href="https:\/\/t\.me\/safr_bali_bot"/);
  assert.doesNotMatch(source, /Открыть кабинет в Telegram/);
});

test("website destination cards stay on the website", async () => {
  const source = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /href=\{`\/directions\/\$\{destination\.id\}`\}/);
  assert.doesNotMatch(source, /<details/);
  assert.doesNotMatch(source, /href="#/);
  assert.doesNotMatch(source, /Открыть в Telegram|Написать в Telegram/);
});

test("website manager widget is the only path to Telegram", async () => {
  const source = await readFile(
    new URL("../components/ManagerChatWidget.tsx", import.meta.url),
    "utf8",
  );
  assert.equal((source.match(/https:\/\/t\.me\/safr_bali_bot/g) ?? []).length, 1);
  assert.match(source, /\/api\/web\/chat\/messages/);
  assert.match(source, /\/api\/web\/chat\/guest/);
  assert.doesNotMatch(source, /\?start=/);
});

test("production nginx prevents stale catalog HTML", async () => {
  const source = await readFile(
    new URL("../../deploy/nginx/safr-web.conf", import.meta.url),
    "utf8",
  );

  assert.equal(
    (source.match(/Cache-Control "no-store, no-cache, must-revalidate"/g) ?? [])
      .length,
    2,
  );
});
