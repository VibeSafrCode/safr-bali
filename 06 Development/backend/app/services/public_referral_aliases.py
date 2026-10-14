"""One stable random alias per canonical user; no User/referral/Points rewrites.

The random alphabet/length are the Main bot contract. The common r_ namespace
cannot collide with Main's independently allocated legacy bare eight characters.
"""
import re
import secrets
import sqlite3

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.models.public_referral_alias import PublicReferralAlias
from app.models.user import User

CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
CODE_LENGTH = 8
PATTERN = re.compile(r"r_[2-9A-HJ-NP-Z]{8}")


class AliasUnavailable(RuntimeError):
    pass


class AliasActorUnavailable(RuntimeError):
    pass


def normalized_code(value):
    if not isinstance(value, str) or value[:2].lower() != "r_":
        return None
    normalized = "r_" + value[2:].upper()
    return normalized if PATTERN.fullmatch(normalized) else None


def storage_ready(db):
    try:
        db.execute(select(PublicReferralAlias.code).limit(0))
    except SQLAlchemyError:
        raise AliasUnavailable("referral_alias_storage_unavailable") from None


def referral_arguments(db, value, *, require_storage=False):
    """Verified ingress only; known alias namespace NEVER falls back to ref_code."""
    alias_namespace = isinstance(value, str) and value[:2].lower() == "r_"
    if require_storage or alias_namespace:
        storage_ready(db)
    if not value or value.startswith("svc_"):
        return {}
    if alias_namespace:
        code = normalized_code(value)
        if code is None:
            return {}
        try:
            actor = db.execute(select(User.telegram_id).join(
                PublicReferralAlias, PublicReferralAlias.user_id == User.id
            ).where(PublicReferralAlias.code == code)).scalar_one_or_none()
        except SQLAlchemyError:
            raise AliasUnavailable("referral_alias_resolution_unavailable") from None
        return {"invited_by_telegram_id": actor} if actor is not None else {}
    if value.startswith("ref_") and value[4:].isdigit():
        actor = int(value[4:])
        return {"invited_by_telegram_id": actor} if 0 < actor < 2**63 else {}
    # Canonical legacy codes can be mixed-case; preserve their exact lookup.
    return {"invited_by_ref_code": value}


def _unique_conflict(error):
    origin = error.orig
    code = getattr(origin, "sqlstate", None) or getattr(origin, "pgcode", None)
    constraint = getattr(getattr(origin, "diag", None), "constraint_name", None)
    if code == "23505":
        return constraint in {"referral_public_aliases_pkey", "uq_referral_public_aliases_user_id"}
    return isinstance(origin, sqlite3.IntegrityError) and str(origin) in {
        "UNIQUE constraint failed: referral_public_aliases.code",
        "UNIQUE constraint failed: referral_public_aliases.user_id",
    }


def own_alias(db, user_id):
    """Call only for a server-verified own actor, in a dedicated transaction."""
    try:
        actor = db.execute(select(User.id).where(User.id == user_id, User.status == "active")).scalar_one_or_none()
        if actor is None:
            raise AliasActorUnavailable("referral_actor_unavailable")
        existing = db.execute(select(PublicReferralAlias.code).where(PublicReferralAlias.user_id == user_id)).scalar_one_or_none()
        if existing:
            if normalized_code(existing) != existing:
                raise AliasUnavailable("referral_alias_integrity_error")
            return existing
        for _ in range(8):
            candidate = "r_" + "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))
            try:
                with db.begin_nested():
                    db.add(PublicReferralAlias(code=candidate, user_id=user_id))
                    db.flush()
                return candidate
            except IntegrityError as error:
                if not _unique_conflict(error):
                    raise
                winner = db.execute(select(PublicReferralAlias.code).where(PublicReferralAlias.user_id == user_id)).scalar_one_or_none()
                if winner:
                    if normalized_code(winner) != winner:
                        raise AliasUnavailable("referral_alias_integrity_error")
                    return winner
        raise AliasUnavailable("referral_alias_allocation_busy")
    except SQLAlchemyError:
        raise AliasUnavailable("referral_alias_storage_unavailable") from None
