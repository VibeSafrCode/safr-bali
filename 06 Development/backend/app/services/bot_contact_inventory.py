"""Pure shared Main inventory projection; no ORM, settings, startup or IO.

Callers supply bounded canonical rows and a Main-only contact map. Historical
registration is never promoted into proof of a private Telegram interaction.
"""
import hashlib
import json


def main_legacy_snapshot(users, contacts):
    binding = [[user.id, user.locale, user.bot_status,
        contacts[user.id].id if user.id in contacts else None,
        contacts[user.id].status if user.id in contacts else None] for user in users]
    digest = hashlib.sha256(json.dumps(binding, separators=(",", ":")).encode()).hexdigest()
    return {"candidate_count": len(users), "new_unknown_contacts": sum(user.id not in contacts for user in users),
        "snapshot_sha256": digest, "source": "legacy_main_registration", "private_reachability": "NOT_CONFIRMED"}
