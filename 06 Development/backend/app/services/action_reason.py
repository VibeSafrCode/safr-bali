from __future__ import annotations


MIN_ACTION_REASON_LENGTH = 3
MAX_ACTION_REASON_LENGTH = 2000


class ActionReasonInvalid(ValueError):
    pass


def normalize_action_reason(value: str, *, max_length: int = MAX_ACTION_REASON_LENGTH) -> str:
    normalized = " ".join(value.split()) if isinstance(value, str) else ""
    if len(normalized) < MIN_ACTION_REASON_LENGTH:
        raise ActionReasonInvalid("Reason must contain at least 3 meaningful characters")
    if len(normalized) > max_length:
        raise ActionReasonInvalid(f"Reason must contain at most {max_length} characters")
    return normalized
