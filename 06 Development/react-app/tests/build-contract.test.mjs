import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const dist = new URL("../dist/", import.meta.url);

async function filesRecursively(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const value = new URL(entry.name, directory);
    if (entry.isDirectory()) {
      result.push(...(await filesRecursively(new URL(`${entry.name}/`, directory))));
    } else {
      result.push(value);
    }
  }
  return result;
}

test("React application contract builds exactly two HTML entries", async () => {
  const files = await filesRecursively(dist);
  const html = files
    .filter((file) => file.pathname.endsWith(".html"))
    .map((file) => file.pathname.slice(dist.pathname.length))
    .sort();
  assert.deepEqual(html, ["account/index.html", "index.html"]);
});

test("both application entries are noindex and have local assets", async () => {
  for (const path of ["index.html", "account/index.html"]) {
    const html = await readFile(new URL(path, dist), "utf8");
    assert.match(html, /name="robots" content="noindex, nofollow"/);
    assert.match(html, /\/assets\/main-[^"]+\.js/);
    assert.doesNotMatch(html, /localhost|:8081|access_token|session_token/i);
  }
});

test("Telegram SDK loads before the Mini App React entry", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  const sdkPosition = html.indexOf("telegram-web-app.js");
  const reactPosition = html.indexOf("/src/main.tsx");
  assert.ok(sdkPosition >= 0);
  assert.ok(reactPosition > sdkPosition);
  assert.match(html, /data-safr-telegram-sdk="true"/);
});

test("production bundle contains no secrets or local infrastructure addresses", async () => {
  const files = await filesRecursively(dist);
  const text = (
    await Promise.all(
      files
        .filter((file) => /\.(?:html|css|js|json)$/.test(file.pathname))
        .map((file) => readFile(file, "utf8")),
    )
  ).join("\n");
  assert.doesNotMatch(text, /localhost|127\.0\.0\.1|:8081/);
  assert.doesNotMatch(text, /TELEGRAM_BOT_TOKEN|CLIENT_SECRET|SERVICE_API_TOKEN/);
  assert.doesNotMatch(text, /initDataUnsafe/);
});

test("scrolling remains enabled and manager button is not a floating overlay", async () => {
  const css = await readFile(new URL("src/styles.css", root), "utf8");
  const body = css.match(/body\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  assert.match(body, /overflow-y:\s*auto/);
  assert.doesNotMatch(body, /overflow-y:\s*hidden/);
  assert.doesNotMatch(css, /\.manager-fab/);
});

test("client source never reads Telegram's unsafe parsed identity payload", async () => {
  const sourceFiles = await filesRecursively(new URL("../src/", import.meta.url));
  const source = (
    await Promise.all(
      sourceFiles
        .filter((file) => /\.(?:ts|tsx)$/.test(file.pathname))
        .map((file) => readFile(file, "utf8")),
    )
  ).join("\n");
  assert.doesNotMatch(source, /\.\s*initDataUnsafe/);
  assert.doesNotMatch(source, /invited_by_user_id|balance_after\s*=|points\s*[+-]=/);
});

test("Mini App UI keeps implementation notes out and ships the exchange interaction contract", async () => {
  const [miniApp, calculator, wheel, css] = await Promise.all([
    readFile(new URL("src/surfaces/MiniApp.tsx", root), "utf8"),
    readFile(new URL("src/components/CurrencyCalculator.tsx", root), "utf8"),
    readFile(new URL("src/components/ExchangeAssetWheel.tsx", root), "utf8"),
    readFile(new URL("src/styles.css", root), "utf8"),
  ]);
  const publicComponents = `${miniApp}\n${calculator}`;
  assert.doesNotMatch(
    publicComponents,
    /Никакие команды|Расчёт выполняется внутри Mini App|Оставить заявку менеджеру/,
  );
  assert.match(calculator, /"Idempotency-Key"/);
  assert.match(calculator, /window\.setTimeout\([\s\S]*?, 300\)/);
  assert.match(calculator, /AbortController/);
  assert.match(wheel, /role="listbox"/);
  assert.match(css, /scroll-snap-type:\s*y mandatory/);
});
