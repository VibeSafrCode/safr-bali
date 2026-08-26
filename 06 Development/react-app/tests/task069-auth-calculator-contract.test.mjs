import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const reactRoot = new URL("../", import.meta.url);
const developmentRoot = new URL("../", reactRoot);

async function text(url) {
  return readFile(url, "utf8");
}

test("browser calculator uses the web session and keeps website/account exits", async () => {
  const [main, surface, account, calculator, browser] = await Promise.all([
    text(new URL("src/main.tsx", reactRoot)),
    text(new URL("src/surfaces/WebCalculatorApp.tsx", reactRoot)),
    text(new URL("src/surfaces/AccountApp.tsx", reactRoot)),
    text(new URL("src/components/CurrencyCalculator.tsx", reactRoot)),
    text(new URL("src/runtime/browser.ts", reactRoot)),
  ]);

  assert.match(main, /window\.location\.pathname === "\/calculator\/"/);
  assert.match(surface, /"\/api\/web\/auth\/me"/);
  assert.match(surface, /apiPrefix="\/api\/web"/);
  assert.match(surface, /href="\/account\/"/);
  assert.match(surface, /https:\/\/safrway\.online\/bali\/exchange\/usdt-idr\//);
  assert.match(surface, /locale === "en" \? "\/en\/" : "\/"/);
  assert.match(account, /website: "← На сайт и к услугам"/);
  assert.match(account, /calculator: "Калькулятор"/);
  assert.match(account, /https:\/\/safrway\.online\/bali\/exchange\/usdt-idr\//);
  assert.match(calculator, /apiPrefix\?: "\/mini-app" \| "\/api\/web"/);
  assert.match(calculator, /"X-CSRF-Token"/);
  assert.match(browser, /CALCULATOR_RETURN_PATH_PATTERN/);
});

test("public site restores auth state and keeps appearance controls in one row", async () => {
  const [header, page, layout, authState, css] = await Promise.all([
    text(new URL("astro-site/src/components/SiteHeader.astro", developmentRoot)),
    text(new URL("astro-site/src/components/PublicPage.astro", developmentRoot)),
    text(new URL("astro-site/src/layouts/BaseLayout.astro", developmentRoot)),
    text(new URL("astro-site/src/client/auth-state.js", developmentRoot)),
    text(new URL("astro-site/src/styles/global.css", developmentRoot)),
  ]);

  assert.match(header, /data-public-auth-state="loading"/);
  assert.match(header, /data-public-account-status/);
  assert.match(page, /data-exchange-auth-action/);
  assert.match(page, /https:\/\/app\.safrway\.online\/calculator\//);
  assert.match(layout, /auth-state\.js\?url&no-inline/);
  assert.match(authState, /fetch\("\/api\/web\/auth\/me"/);
  assert.match(authState, /credentials: "include"/);
  assert.match(css, /\.site-appearance-controls \{[\s\S]*?flex-direction: row;/);
});
