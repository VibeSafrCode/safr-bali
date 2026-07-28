import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(testDirectory, "..");
const buildRoots = {
  vinext: path.resolve(webRoot, "artifacts", "build-vinext-export"),
  next: path.resolve(webRoot, "artifacts", "build-next-export"),
};

function outputPath(buildRoot, pathname = "/") {
  if (pathname === "/") return path.resolve(buildRoot, "index.html");
  return path.resolve(
    buildRoot,
    pathname.replace(/^\/|\/$/g, ""),
    "index.html",
  );
}

async function render(variant, pathname = "/") {
  return readFile(outputPath(buildRoots[variant], pathname), "utf8");
}

for (const variant of Object.keys(buildRoots)) {
  test(`${variant} renders the SAFR marketing site`, async () => {
    const html = await render(variant, "/");
    assert.match(html, /<title>SAFR — путешествия и жизнь без лишнего хаоса<\/title>/i);
    assert.match(html, /Путешествия и жизнь/);
    assert.match(html, /Бали/);
    assert.match(html, /Таиланд/);
    assert.match(html, /Россия/);
    assert.match(html, /Непал/);
    assert.match(html, /Каталог SAFR/);
    assert.match(html, /Открыть страницу/);
    assert.doesNotMatch(html, /\?start=/);
    assert.doesNotMatch(html, /Открыть в Telegram|Написать в Telegram/);
    assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
    assert.match(html, /Написать менеджеру/);
  });

  test(`${variant} renders separate destination, service and item pages`, async () => {
    const index = await render(variant, "/directions");
    assert.match(index, /Выберите направление/);
    assert.match(index, /\/directions\/bali/);

    const destination = await render(variant, "/directions/bali");
    assert.match(destination, /Сделать визу/);
    assert.match(destination, /Найти жильё/);

    const service = await render(variant, "/directions/bali/visas");
    assert.match(service, /ITAS E33G/);
    assert.match(service, /eVOA/);

    const item = await render(variant, "/directions/bali/visas/e33g");
    assert.match(item, /удалённых работников/);
    assert.match(item, /Написать менеджеру/);
  });

  test(`${variant} renders the Telegram Mini App shell`, async () => {
    const html = await render(variant, "/mini-app");
    assert.match(html, /Личный кабинет/);
    assert.match(html, /SAFR Points/);
    assert.match(html, /Все направления/);
    assert.match(html, /Куда отправимся/);
    assert.match(html, />Услуги</);
    assert.match(html, />Заявки</);
    assert.match(html, />Профиль</);
    assert.doesNotMatch(
      html,
      /<script[^>]+src=["']https:\/\/telegram\.org\/js\/telegram-web-app\.js/,
    );
  });
}

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

test("website navigation uses static full-page links", async () => {
  const linkSource = await readFile(
    new URL("../components/StaticLink.tsx", import.meta.url),
    "utf8",
  );
  const headerSource = await readFile(
    new URL("../components/SiteHeader.tsx", import.meta.url),
    "utf8",
  );

  assert.match(linkSource, /return `\$\{href\}\/`/);
  assert.match(linkSource, /<a href=\{staticHref\(href\)\}/);
  assert.doesNotMatch(headerSource, /next\/link/);
  assert.match(headerSource, /href="\/directions"/);
  assert.match(headerSource, /href="\/account"/);
  assert.match(headerSource, /href="\/privacy"/);
});

test("website manager widget is the only path to Telegram", async () => {
  const source = await readFile(
    new URL("../components/ManagerChatWidget.tsx", import.meta.url),
    "utf8",
  );
  assert.equal((source.match(/https:\/\/t\.me\/safr_bali_bot/g) ?? []).length, 1);
  assert.match(source, /\/api\/web\/chat\/messages/);
  assert.match(source, /\/api\/web\/chat\/guest/);
  assert.match(source, /location\.hostname[\s\S]*startsWith\("app\."\)/);
  assert.match(source, /if \(isMiniAppSurface\) return null/);
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
