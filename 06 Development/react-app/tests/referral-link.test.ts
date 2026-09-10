import assert from "node:assert/strict";
import test from "node:test";
import { safeReferralLink } from "../src/components/referral-link";

test("QR and copy use exactly the bounded server Telegram invitation", () => {
  const url = "https://t.me/safr_bali_bot?start=SAFE_123-abc";
  assert.equal(safeReferralLink(url), url);
  for (const invalid of [null, "", "javascript:alert(1)", "https://evil.test/a?start=safe", "https://t.me.evil.test/bot?start=safe", "http://t.me/safr_bot?start=safe", "https://user@t.me/safr_bot?start=safe", "https://t.me/safr_bot?start=safe&start=other", "https://t.me/safr_bot?start=safe#secret", "https://t.me/safr_bot?start=" + "A".repeat(65), "https://t.me/safr_bot?start=safe&phone=123"]) {
    assert.equal(safeReferralLink(invalid), null, String(invalid));
  }
});
