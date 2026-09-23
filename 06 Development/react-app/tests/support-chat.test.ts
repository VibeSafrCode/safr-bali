import assert from "node:assert/strict";
import test from "node:test";
import { ApiError } from "../src/api/client";
import { parseSupportChat } from "../src/components/support-chat";

test("empty chat is valid and keeps the support form available", () => {
  const chat = { id: null, status: "empty", messages: [] };
  assert.equal(parseSupportChat(chat), chat);
});

test("valid client and manager messages survive parsing unchanged", () => {
  const chat = { id: 1, status: "open", messages: [
    { id: 1, author_type: "client", body: "Вопрос", created_at: "2026-09-23T08:00:00Z" },
    { id: 2, author_type: "staff", body: "Ответ", created_at: "2026-09-23T08:01:00Z" },
  ] };
  assert.equal(parseSupportChat(chat), chat);
});

test("generic list fallback and malformed chat payloads enter the existing error path", () => {
  for (const value of [null, {items:[],total:0}, {id:1}, {id:1,status:"open",messages:null}, {id:1,status:"open",messages:[null]}, {id:1,status:"open",messages:[{id:2,author_type:"staff",body:{text:"bad"},created_at:"today"}]}]) {
    assert.throws(() => parseSupportChat(value), (error: unknown) => error instanceof ApiError && error.kind === "invalid_response");
  }
});
