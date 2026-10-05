"""LOCAL SQLite analytics maintenance, never production/configured DATABASE_URL.

Defaults to a read-only preview. A reviewed --as-of/--expected-preview-hash,
active root actor and --apply are required before analytics-only deletion.
No .env, PostgreSQL, client messages, cron creation or analytics activation.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import tempfile


class SafetyError(Exception):
    """Only fixed error codes; never DSNs, paths, identities or exception traces."""


def preview_hash(preview):
    return hashlib.sha256(json.dumps(preview, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def parse_time(value, *, clock=None):
    clock = clock or datetime.now(timezone.utc)
    try:
        chosen = datetime.fromisoformat(value.replace("Z", "+00:00")) if value else clock
    except (ValueError, TypeError):
        raise SafetyError("invalid_as_of") from None
    if chosen.tzinfo is None:
        raise SafetyError("as_of_timezone_required")
    chosen = chosen.astimezone(timezone.utc)
    if chosen > clock:
        raise SafetyError("future_as_of_denied")
    return chosen


@contextmanager
def sql_boundary(db, *, apply):
    """Preview cannot write; apply can delete only expired analytics rows."""
    from sqlalchemy import event
    if db.get_bind().dialect.name != "sqlite":
        raise SafetyError("local_sqlite_only")
    db.bind.echo = False
    connection = db.connection()

    def guard(conn, cursor, statement, parameters, context, executemany):
        clause = getattr(getattr(context, "compiled", None), "statement", None)
        if clause is not None and getattr(clause, "is_select", False):
            return
        table = getattr(getattr(clause, "table", None), "name", None)
        if apply and clause is not None:
            if getattr(clause, "is_delete", False) and table in {
                "analytics_events", "analytics_daily_aggregates", "analytics_consents"
            }:
                return
            if getattr(clause, "is_insert", False) and table == "admin_actions":
                return
        raise SafetyError("analytics_maintenance_write_boundary")

    event.listen(connection, "before_cursor_execute", guard)
    try:
        yield
    finally:
        event.remove(connection, "before_cursor_execute", guard)


def execute(db, args, *, now=None):
    """Inject an isolated Session for tests. Transaction closes by caller."""
    from app.models.user import User
    from app.services import analytics as service
    from app.services.visa_staff import is_root_admin

    if db.new or db.dirty or db.deleted:
        raise SafetyError("clean_session_required")
    clock = now or datetime.now(timezone.utc)
    as_of = parse_time(args.as_of, clock=clock)
    if args.apply and (not args.as_of or not args.actor_user_id or
                      not re.fullmatch(r"[a-f0-9]{64}", args.expected_preview_hash or "")):
        raise SafetyError("apply_requires_actor_reviewed_as_of_and_hash")
    with sql_boundary(db, apply=args.apply):
        preview = service.retention_preview(db, as_of)
        digest = preview_hash(preview)
        if args.expected_preview_hash is not None and args.expected_preview_hash != digest:
            raise SafetyError("retention_preview_changed")
        result = {"mode": "PREVIEW", "as_of": as_of.isoformat(), "preview_hash": digest, **preview}
        if args.apply:
            actor = db.get(User, args.actor_user_id)
            if actor is None or not is_root_admin(actor):
                raise SafetyError("configured_active_root_required")
            service.apply_retention(db, actor, as_of)
            db.commit()
            result["mode"] = "APPLIED_LOCAL"
        else:
            db.rollback()
        return result


class JsonArgumentParser(argparse.ArgumentParser):
    def error(self, message):
        raise SafetyError("invalid_arguments")


def arguments(argv):
    parser = JsonArgumentParser(description=__doc__)
    parser.add_argument("--sqlite-file", required=True)
    parser.add_argument("--as-of")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--actor-user-id", type=int)
    parser.add_argument("--expected-preview-hash")
    return parser.parse_args(argv)


def main(argv=None):
    engine = None
    try:
        args = arguments(argv)
        # URLs, missing files and symlinks are refused. SQLite read/write mode
        # avoids silently creating an empty database during a mistaken command.
        candidate = Path(args.sqlite_file).expanduser()
        if not candidate.is_absolute() or candidate.is_symlink() or not candidate.is_file():
            raise SafetyError("existing_absolute_regular_sqlite_file_required")
        selected = candidate.resolve()
        if selected.suffix not in {".sqlite", ".sqlite3", ".db"}:
            raise SafetyError("sqlite_file_extension_required")
        if os.environ.get("ENVIRONMENT", "local") not in {"local", "test"}:
            raise SafetyError("local_environment_required")
        configured_root = os.environ.get("DEFAULT_ADMIN_TELEGRAM_ID", "0")
        if args.apply and (not configured_root.isdecimal() or int(configured_root) <= 0):
            raise SafetyError("configured_local_root_required")
        from sqlalchemy import create_engine
        from sqlalchemy.engine import URL
        from sqlalchemy.orm import sessionmaker

        backend_root = Path(__file__).resolve().parents[2]
        sys.path.insert(0, str(backend_root))
        # Only process-local synthetic settings. The explicit SQLite file is the
        # sole connection target. Import while cwd is an empty temporary folder
        # so Settings(env_file='.env') cannot read the calling directory's secrets.
        previous_directory = os.getcwd()
        os.environ.update(DATABASE_URL="sqlite+pysqlite:///:memory:", ENVIRONMENT="local",
                          SERVICE_API_TOKEN="offline-analytics-maintenance",
                          ADMIN_API_TOKEN="offline-analytics-maintenance", SQL_ECHO="false")
        with tempfile.TemporaryDirectory(prefix="safr-analytics-settings-") as safe_directory:
            try:
                os.chdir(safe_directory)
                import app.services.analytics  # noqa: F401
            finally:
                os.chdir(previous_directory)
        # A URI uses mode=rw and no network-capable DB driver. SQL parameters and
        # customer rows are never printed by this command.
        engine = create_engine(URL.create("sqlite+pysqlite", database=selected.as_uri(),
            query={"mode": "rw" if args.apply else "ro", "uri": "true"}), echo=False)
        with sessionmaker(bind=engine, autoflush=False)() as db:
            result = execute(db, args)
        print(json.dumps(result, sort_keys=True))
        return 0
    except SafetyError as exc:
        print(json.dumps({"mode": "ABORTED", "code": str(exc)}, sort_keys=True))
        return 2
    except Exception:
        print(json.dumps({"mode": "ABORTED", "code": "local_analytics_maintenance_failed"}, sort_keys=True))
        return 2
    finally:
        if engine is not None:
            engine.dispose()


if __name__ == "__main__":
    raise SystemExit(main())
