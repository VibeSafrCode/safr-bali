"""Synthetic local-only exercise of the release script's DB worker.

Requires an EMPTY bali_life_ database on the owned private temporary PG socket.
Never use production data. The fixture and generated restore DB remain for review.
"""

import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import uuid

import psycopg
from psycopg import sql
import pytest
from sqlalchemy.engine import make_url


SCRIPT = Path(__file__).with_name("verify-life-release-backup.py")
ROOT = SCRIPT.parents[1]
BACKEND = ROOT / "06 Development/backend"
spec = importlib.util.spec_from_file_location("life_backup", SCRIPT)
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


def test_release_worker_backup_restore_and_guards(tmp_path):
    raw = os.environ.get("SAFR_LIFE_BACKUP_FIXTURE_URL")
    if not raw:
        pytest.skip("Set the isolated local SAFR_LIFE_BACKUP_FIXTURE_URL")
    url = make_url(raw)
    assert url.database.startswith("bali_life_")
    assert str(url.query.get("host", "")).startswith("/private/tmp/bali-life-postgres.")
    assert url.host is None
    params = {"production_db": url.database, "pg_socket": url.query["host"], "pg_port": int(url.query["port"])}
    with psycopg.connect(url.set(drivername="postgresql").render_as_string(hide_password=False)) as connection:
        assert connection.execute("SELECT count(*) FROM pg_tables WHERE schemaname='public'").fetchone()[0] == 0
        params["pg_user"] = connection.execute("SELECT current_user").fetchone()[0]
    env = {**os.environ, "DATABASE_URL": raw, "SERVICE_API_TOKEN": "fixture-service", "ADMIN_API_TOKEN": "fixture-admin"}
    subprocess.run([sys.executable, "-m", "alembic", "upgrade", release.BASE_REVISION], cwd=BACKEND, env=env,
                   stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True, timeout=60)
    with release.connect(params, params["production_db"]) as connection:
        role = f"bali_life_fixture_owner_{uuid.uuid4().hex[:8]}"
        connection.execute(sql.SQL("CREATE ROLE {} NOLOGIN").format(sql.Identifier(role)))
        connection.execute(sql.SQL("ALTER TABLE public.users OWNER TO {}").format(sql.Identifier(role)))
        connection.execute("""INSERT INTO users (telegram_id, ref_code, role, status, created_at, updated_at, phone)
                            VALUES (811000101, 'release-proof-fixture', 'client', 'active', now(), now(), 'Synthetic-private-value')""")
    params["runtime_role"] = role

    def worker(mode, *, dump=False, **override):
        log = tmp_path / f"{mode}-{uuid.uuid4().hex}.log"
        output = tmp_path / "database.dump" if dump else tmp_path / f"{mode}-{uuid.uuid4().hex}.output"
        with output.open("wb") as stream, log.open("wb") as errors:
            result = subprocess.run([sys.executable, str(SCRIPT), "--worker"],
                                    input=json.dumps({**params, "mode": mode, **override}).encode(),
                                    stdout=stream, stderr=errors, timeout=120)
        lines = log.read_text()
        assert "Synthetic-private-value" not in lines
        return result.returncode, [json.loads(line[len(release.RESULT_MARKER):]) for line in lines.splitlines()
                                  if line.startswith(release.RESULT_MARKER)]

    code, results = worker("snapshot", dump=True)
    assert code == 0 and results[0]["tables"]["public.users"]["count"] == 1
    params.update(baseline=results[0]["tables"], isolated_db=f"bali_life_verify_{uuid.uuid4().hex[:24]}")
    params["marker"] = f"BALI-LIFE-001 verification {params['isolated_db']}"
    params["candidate_source"] = (BACKEND / "alembic/versions/e9b3d7a5c201_add_client_life_services.py").read_text()
    assert worker("create-isolated")[0] == 0
    with (tmp_path / "database.dump").open("rb") as stream:
        subprocess.run(release.pg_command(params, "pg_restore", "--exit-on-error", "--single-transaction", "--dbname", params["isolated_db"]),
                       stdin=stream, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True, timeout=60)
    assert worker("verify-isolated", marker="wrong-clone-marker")[0] == 1
    assert worker("verify-isolated", candidate_source=params["candidate_source"] + "\n")[0] == 1
    with release.connect(params, params["isolated_db"]) as connection:
        assert release.revision(connection) == release.BASE_REVISION
    code, results = worker("verify-isolated")
    assert code == 0 and results[0]["result"] == "PASS"
    assert len(results[0]["steps"]) == 3
    assert results[0]["new_table_and_sequence_owner_match"]
    with release.connect(params, params["production_db"], readonly=True) as connection:
        release.assert_source(connection)
    with release.connect(params, params["isolated_db"]) as connection:
        release.assert_isolated(connection, params)
        assert release.revision(connection) == release.CANDIDATE_REVISION


def test_server_entrypoint_cannot_execute_without_flag():
    result = subprocess.run([sys.executable, str(SCRIPT), "--candidate", "/nonexistent-reviewed-migration"],
                            capture_output=True, text=True, timeout=10)
    assert result.returncode == 1 and "Explicit reviewed execution flag required" in result.stderr


def test_interruption_terminates_the_entire_child_process_group(monkeypatch):
    class InterruptedChild:
        pid = 12345

        def communicate(self, **kwargs):
            raise KeyboardInterrupt()

        def wait(self, **kwargs):
            return 0

    terminated = []
    monkeypatch.setattr(release.subprocess, "Popen", lambda *args, **kwargs: InterruptedChild())
    monkeypatch.setattr(release.os, "killpg", lambda pid, sig: terminated.append((pid, sig)))
    with pytest.raises(KeyboardInterrupt):
        release.safe_run(["synthetic-command"], stdout=None, stderr=None)
    assert terminated == [(12345, release.signal.SIGTERM)]
