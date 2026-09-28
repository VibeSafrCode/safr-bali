import assert from 'node:assert/strict';
import test from 'node:test';
import { lifeProgress } from '../src/components/lifeProgress';
test('fixed services show the remaining fraction and clamp expired periods', () => {
  const p = lifeProgress('2026-09-01','2026-10-01','2026-09-11')!;
  assert.equal(p.total,30); assert.equal(p.remaining,20); assert.equal(p.fraction,2/3);
  assert.equal(lifeProgress('2026-09-01','2026-10-01','2026-10-02')?.fraction,0);
});
test('missing, malformed, future and zero-length terms have no invented percentage', () => {
  for (const [start,end] of [[null,'2026-10-01'],['2026-02-30','2026-10-01'],['2026-09-01',null],['2026-10-01','2026-11-01'],['2026-09-01','2026-09-01']]) assert.equal(lifeProgress(start,end,'2026-09-28'),null);
});
test('monthly rentals use original anniversary, not first day of calendar month', () => {
  const p=lifeProgress('2026-09-20',null,'2026-10-05',true)!;
  assert.equal(p.total,30); assert.equal(p.elapsed,15); assert.equal(p.remaining,15); assert.equal(p.end,'2026-10-20');
  const next=lifeProgress('2026-09-20',null,'2026-10-20',true)!;
  assert.equal(next.elapsed,0); assert.equal(next.total,31); assert.equal(next.end,'2026-11-20');
});
test('month-end anchors do not drift after February; leap years respected', () => {
  assert.equal(lifeProgress('2026-01-31',null,'2026-02-28',true)?.end,'2026-03-31');
  assert.equal(lifeProgress('2028-01-31',null,'2028-02-28',true)?.remaining,1);
  assert.equal(lifeProgress('2028-01-31',null,'2028-02-29',true)?.total,31);
  assert.equal(lifeProgress('2025-12-31',null,'2026-01-02',true)?.end,'2026-01-31');
});
test('known contract end caps the last cycle and never restarts after expiry', () => {
  const p=lifeProgress('2026-09-20','2026-10-10','2026-10-05',true)!;
  assert.equal(p.total,20); assert.equal(p.remaining,5); assert.equal(p.end,'2026-10-10');
  assert.equal(lifeProgress('2026-09-20','2026-10-10','2026-10-11',true)?.repeating,false);
});
