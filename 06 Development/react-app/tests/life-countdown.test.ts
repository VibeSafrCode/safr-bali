import assert from "node:assert/strict";
import test from "node:test";
import { baliToday, lifeCardDate, lifeCountdown } from "../src/components/lifeServices";

test("countdown rolls over at midnight in Bali, not the device date", () => {
  assert.equal(lifeCountdown("2026-09-23", baliToday(new Date("2026-09-22T15:59:59Z")), "ru")?.value, 1);
  assert.equal(lifeCountdown("2026-09-23", baliToday(new Date("2026-09-22T16:00:00Z")), "ru")?.value, 0);
  assert.equal(lifeCountdown("2028-03-01", "2028-02-28", "en")?.value, 2);
});

test("today is zero; expired dates show elapsed days rather than negative remaining days", () => {
  assert.deepEqual(lifeCountdown("2026-09-23", "2026-09-23", "ru"), { value: 0, expired: false, urgency: "urgent", label: "Осталось", unit: "дней" });
  assert.deepEqual(lifeCountdown("2026-09-22", "2026-09-23", "ru"), { value: 1, expired: true, urgency: null, label: "Срок истёк", unit: "день назад" });
  assert.equal(lifeCountdown("2026-09-21", "2026-09-23", "en")?.unit, "days ago");
});

test("urgency uses strictly less than 7 and 15 days, never negative days", () => {
  for (const [remaining, expected] of [[-1,null],[0,"urgent"],[6,"urgent"],[7,"soon"],[14,"soon"],[15,null],[30,null]] as const) {
    const end = new Date(Date.UTC(2026,8,2+remaining)).toISOString().slice(0,10);
    assert.equal(lifeCountdown(end,"2026-09-02","ru")?.urgency,expected,`${remaining} days`);
  }
});

test("Russian day forms cover singular, few and teen exceptions; English uses day/days", () => {
  for (const [days, unit] of [[1,"день"],[2,"дня"],[5,"дней"],[11,"дней"],[12,"дней"],[14,"дней"],[21,"день"],[22,"дня"],[25,"дней"]] as const) {
    assert.equal(lifeCountdown(`2026-09-${String(days + 1).padStart(2,"0")}`, "2026-09-01", "ru")?.unit, unit);
  }
  assert.equal(lifeCountdown("2026-09-02", "2026-09-01", "en")?.unit, "day");
  assert.equal(lifeCountdown("2026-09-03", "2026-09-01", "en")?.unit, "days");
});

test("missing and malformed dates never create a countdown", () => {
  for (const value of [null,"","2026-02-30","2026-13-01","invalid","2026-9-1"]) assert.equal(lifeCountdown(value, "2026-09-23", "ru"), null);
  assert.equal(lifeCountdown("2026-09-23", "invalid", "ru"), null);
});

test("future services count to their displayed start; active services count to their end", () => {
  const service = { start_date: "2026-09-25", end_date: "2026-10-25" };
  assert.deepEqual(lifeCardDate(service,"2026-09-23"), { group:"future", boundary:"start", date:"2026-09-25" });
  assert.deepEqual(lifeCardDate(service,"2026-09-25"), { group:"current", boundary:"end", date:"2026-10-25" });
  assert.deepEqual(lifeCardDate({...service,end_date:null},"2026-09-23"), { group:"future", boundary:"end", date:null });
  assert.deepEqual(lifeCardDate({...service,end_date:null},"2026-10-01"), { group:"current", boundary:"end", date:null });
});
