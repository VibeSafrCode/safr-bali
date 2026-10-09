"""Bounded ephemeral preferences; never a user/referral database."""
from collections import OrderedDict
import time


class Preferences:
    def __init__(self, max_entries=2000, ttl=3600, clock=time.monotonic):
        self.max_entries, self.ttl, self.clock = max_entries, ttl, clock
        self.rows = OrderedDict()

    def _row(self, key):
        now = self.clock()
        row = self.rows.get(key)
        if row and now - row["updated"] > self.ttl:
            self.rows.pop(key)
            row = None
        if row:
            self.rows.move_to_end(key)
        return row, now

    def locale(self, key, fallback):
        row, _ = self._row(key)
        return row["locale"] if row else fallback

    def set_locale(self, key, locale):
        row, now = self._row(key)
        self.rows[key] = {"locale": locale, "updated": now, "sent": row["sent"] if row else -1000.0,
                          "ack": row["ack"] if row else -1000.0}
        self.rows.move_to_end(key)
        while len(self.rows) > self.max_entries:
            self.rows.popitem(last=False)

    def allow(self, key, fallback):
        row, now = self._row(key)
        if row and now - row["sent"] < 0.5:
            return False
        if not row:
            self.set_locale(key, fallback)
            row = self.rows[key]
        row["sent"] = row["updated"] = now
        return True

    def allow_ack(self, key, fallback):
        # A separate bounded ACK budget lets quick human taps receive feedback
        # while expensive message edits remain limited to twice per second.
        row, now = self._row(key)
        if row and now - row["ack"] < 0.2:
            return False
        if not row:
            self.set_locale(key, fallback)
            row = self.rows[key]
        row["ack"] = row["updated"] = now
        return True
