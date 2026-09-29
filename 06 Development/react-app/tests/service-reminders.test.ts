import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_REMINDER_POLICY, parseReminderDraft, reminderDate, reminderDraft } from "../src/components/serviceReminders";
import { emptyLifeDraft, lifeDraftFromRecord, lifeWriteFields, type AdminLifeService } from "../src/components/lifeServices";

test("Founder schedules default to disabled delivery and normalize without enabling", () => {
  assert.deepEqual(parseReminderDraft(reminderDraft(DEFAULT_REMINDER_POLICY), "ru"), DEFAULT_REMINDER_POLICY);
  const parsed = parseReminderDraft({ ...reminderDraft(DEFAULT_REMINDER_POLICY), long: "1, 40, 7, 40; 15 30 3 2" }, "ru");
  assert.deepEqual(parsed.long_offsets, [40, 30, 15, 7, 3, 2, 1]);
  assert.equal(parsed.enabled, false);
});
test("invalid/unsafe intervals and invalid threshold are rejected with a useful message", () => {
  const draft = reminderDraft(DEFAULT_REMINDER_POLICY);
  for (const value of ["", "0", "-1", "1.5", "NaN", "1e3", "3661", "1, text", Array.from({ length: 13 }, (_, i) => i + 1).join(",")]) {
    assert.throws(() => parseReminderDraft({ ...draft, short: value }, "ru"), /Короткие услуги/);
  }
  for (const threshold of ["", "0", "-1", "1.5", "3661"]) assert.throws(() => parseReminderDraft({ ...draft, threshold }, "en"), /threshold/);
});
test("preview dates are exact calendar days across months/leap days", () => {
  assert.equal(reminderDate("2028-03-01", 1), "2028-02-29");
  assert.equal(reminderDate("2026-03-01", 1), "2026-02-28");
  assert.equal(reminderDate("2026-02-30", 1), null);
  assert.equal(reminderDate("invalid", 7), null);
});
test("life edits preserve opt-out without posting readonly availability fields", () => {
  const record = { ...emptyLifeDraft(), id: 1, user_id: 5, version: 3, publication_status: "PUBLISHED", created_at: "", updated_at: "", notifications_enabled: false, notifications_available: false, notification_unavailable_reason: "disabled" } as AdminLifeService;
  const payload = lifeWriteFields(lifeDraftFromRecord(record), "PUBLISHED");
  assert.equal(payload.notifications_enabled, false);
  assert.equal("notifications_available" in payload, false);
  assert.equal("notification_unavailable_reason" in payload, false);
});
