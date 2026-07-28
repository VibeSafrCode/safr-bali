import assert from "node:assert/strict";
import test from "node:test";

import {
  validatePublicEnvironment,
  validatePublicUrl,
} from "../lib/public-env.mjs";

test("accepts the SAFRWAY production origins", () => {
  assert.deepEqual(
    validatePublicEnvironment({
      NODE_ENV: "production",
      NEXT_PUBLIC_SITE_URL: "https://safrway.online",
      NEXT_PUBLIC_API_BASE_URL: "https://api.safrway.online",
    }),
    {
      siteUrl: "https://safrway.online",
      apiBaseUrl: "https://api.safrway.online",
    },
  );
});

test("rejects an absent production API origin", () => {
  assert.throws(
    () =>
      validatePublicEnvironment({
        NODE_ENV: "production",
        NEXT_PUBLIC_SITE_URL: "https://safrway.online",
      }),
    /NEXT_PUBLIC_API_BASE_URL is required/,
  );
});

test("rejects local, internal-port and wrong-host production origins", () => {
  assert.throws(
    () =>
      validatePublicUrl(
        "NEXT_PUBLIC_API_BASE_URL",
        "http://localhost:8000",
        { production: true },
      ),
    /HTTPS in production/,
  );
  assert.throws(
    () =>
      validatePublicUrl(
        "NEXT_PUBLIC_API_BASE_URL",
        "https://api.safrway.online:8081",
        { production: true },
      ),
    /internal port/,
  );
  assert.throws(
    () =>
      validatePublicEnvironment({
        NODE_ENV: "production",
        NEXT_PUBLIC_SITE_URL: "https://safrway.online",
        NEXT_PUBLIC_API_BASE_URL: "https://example.com",
      }),
    /api\.safrway\.online/,
  );
});

test("rejects credentials and non-origin URL components", () => {
  assert.throws(
    () =>
      validatePublicUrl(
        "NEXT_PUBLIC_API_BASE_URL",
        "https://user:secret@api.safrway.online",
      ),
    /credentials/,
  );
  assert.throws(
    () =>
      validatePublicUrl(
        "NEXT_PUBLIC_API_BASE_URL",
        "https://api.safrway.online/v1",
      ),
    /only an origin/,
  );
});
