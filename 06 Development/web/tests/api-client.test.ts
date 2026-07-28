import assert from "node:assert/strict";
import test from "node:test";

import {
  ApiClientError,
  apiErrorMessage,
  createApiClient,
} from "../lib/api-client";

const silentLogger = { error() {} };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

test("returns a valid JSON response from the configured API origin", async () => {
  let requestedUrl = "";
  const client = createApiClient({
    baseUrl: "https://api.safrway.online",
    logger: silentLogger,
    fetchImplementation: async (input) => {
      requestedUrl = String(input);
      return jsonResponse({ status: "ok" });
    },
  });

  assert.deepEqual(await client.request("/mini-app/me"), { status: "ok" });
  assert.equal(requestedUrl, "https://api.safrway.online/mini-app/me");
});

test("reports a 401 JSON response as an authentication error", async () => {
  const client = createApiClient({
    baseUrl: "https://api.safrway.online",
    logger: silentLogger,
    fetchImplementation: async () => jsonResponse({ detail: "expired" }, 401),
  });

  await assert.rejects(client.request("/mini-app/me"), (error) => {
    assert.ok(error instanceof ApiClientError);
    assert.equal(error.kind, "authentication");
    assert.equal(error.status, 401);
    assert.match(apiErrorMessage(error), /Сессия Telegram истекла/);
    return true;
  });
});

test("reports a 500 JSON response without exposing internal details", async () => {
  const client = createApiClient({
    baseUrl: "https://api.safrway.online",
    logger: silentLogger,
    fetchImplementation: async () =>
      jsonResponse({ detail: "database stack trace" }, 500),
  });

  await assert.rejects(client.request("/mini-app/me"), (error) => {
    assert.ok(error instanceof ApiClientError);
    assert.equal(error.kind, "http");
    assert.equal(error.status, 500);
    assert.doesNotMatch(apiErrorMessage(error), /database|stack/i);
    return true;
  });
});

test("rejects HTML even when it has a 200 status", async () => {
  const client = createApiClient({
    baseUrl: "https://api.safrway.online",
    logger: silentLogger,
    fetchImplementation: async () =>
      new Response("<!doctype html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
  });

  await assert.rejects(client.request("/mini-app/me"), (error) => {
    assert.ok(error instanceof ApiClientError);
    assert.equal(error.kind, "invalid_response");
    return true;
  });
});

test("converts a network failure into a safe API error", async () => {
  const client = createApiClient({
    baseUrl: "https://api.safrway.online",
    logger: silentLogger,
    fetchImplementation: async () => {
      throw new TypeError("network disconnected");
    },
  });

  await assert.rejects(client.request("/mini-app/me"), (error) => {
    assert.ok(error instanceof ApiClientError);
    assert.equal(error.kind, "network");
    assert.doesNotMatch(apiErrorMessage(error), /disconnected/);
    return true;
  });
});

test("rejects a malformed or absent API base URL", () => {
  assert.throws(
    () => createApiClient({ baseUrl: undefined }),
    /API base URL is not configured/,
  );
  assert.throws(
    () => createApiClient({ baseUrl: "not a URL" }),
    /API base URL is invalid/,
  );
});
