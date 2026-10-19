"""Compare-and-set only the verified actor's interface preference.

The dedicated unpooled connection bounds this operation's connect/lock/statement
waits. It does not change the existing authentication/session connection policy.
An unavailable/ambiguous commit is not a confirmed rollback; callers reconcile
through authenticated auth/me and never silently rebase an old intent.
"""

from functools import lru_cache

from sqlalchemy import create_engine, select, text, update
from sqlalchemy.orm import Session
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.models.user import User
from app.schemas.client_ui_preference import (
    ClientUIPreference, ClientUIPreferenceWrite, MAX_UI_REVISION,
)


class UIActorUnavailable(Exception):
    pass


class UIPreferenceConflict(Exception):
    def __init__(self, current: dict):
        self.current = current


def preference_projection(user: User) -> dict:
    return ClientUIPreference(
        ui_locale=user.client_ui_locale,
        revision=user.client_ui_locale_revision,
    ).model_dump()


@lru_cache(maxsize=1)
def preference_engine():
    # No inherited pool checkout wait; driver connect/SQL budgets are explicit.
    # These are not a total auth/DNS/socket/commit wall-clock guarantee.
    # This feature is PostgreSQL-only; SQLite is not concurrency evidence.
    engine = create_engine(
        settings.DATABASE_URL, poolclass=NullPool,
        connect_args={
            "connect_timeout": 2,
            "options": "-c statement_timeout=3000 -c lock_timeout=1000",
        },
    )
    if engine.dialect.name != "postgresql":
        engine.dispose()
        raise RuntimeError("UI preference persistence requires PostgreSQL")
    return engine


def compare_and_set(db: Session, actor_id: int, intent: ClientUIPreferenceWrite) -> dict:
    """Commit before acknowledgement; equal-value writes still fence old work."""
    if db.get_bind().dialect.name != "postgresql":
        raise RuntimeError("UI preference persistence requires PostgreSQL")
    db.execute(text("SET LOCAL lock_timeout = '1s'"))
    db.execute(text("SET LOCAL statement_timeout = '3s'"))
    row = db.execute(
        update(User).where(
            User.id == actor_id, User.status == "active",
            User.client_ui_locale_revision == intent.expected_revision,
            User.client_ui_locale_revision < MAX_UI_REVISION,
        ).values(
            client_ui_locale=intent.ui_locale,
            client_ui_locale_revision=User.client_ui_locale_revision + 1,
            # Preserve unrelated profile/business timestamps too.
            updated_at=User.updated_at,
        ).returning(User.client_ui_locale, User.client_ui_locale_revision)
        .execution_options(synchronize_session=False)
    ).one_or_none()
    if row is None:
        current = db.execute(select(
            User.client_ui_locale, User.client_ui_locale_revision,
        ).where(User.id == actor_id, User.status == "active")).one_or_none()
        db.rollback()
        if current is None:
            raise UIActorUnavailable()
        raise UIPreferenceConflict({"ui_locale": current[0], "revision": current[1]})
    result = {"ui_locale": row[0], "revision": row[1]}
    db.commit()
    return result


def save_preference(actor_id: int, intent: ClientUIPreferenceWrite) -> dict:
    with Session(preference_engine()) as db:
        return compare_and_set(db, actor_id, intent)
