"""Synthetic local-only exercise of the release script's DB worker.

Requires an EMPTY bali_rental_fixture_ database on the owned private temporary PG socket.
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


SCRIPT = Path(__file__).with_name("verify-rental-release-backup.py")
ROOT = SCRIPT.parents[1]
BACKEND = ROOT / "06 Development/backend"
spec = importlib.util.spec_from_file_location("rental_backup", SCRIPT)
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


def test_rental_worker_real_snapshot_restore_and_udu(tmp_path):
    raw = os.environ.get("SAFR_RENTAL_BACKUP_FIXTURE_URL")
    if not raw:
        pytest.skip("Set the isolated local SAFR_RENTAL_BACKUP_FIXTURE_URL")
    url = make_url(raw)
    assert url.database.startswith("bali_rental_fixture_")
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
        role = f"bali_rental_owner_{uuid.uuid4().hex[:8]}"
        connection.execute(sql.SQL("CREATE ROLE {} NOLOGIN").format(sql.Identifier(role)))
        connection.execute(sql.SQL("ALTER TABLE public.users OWNER TO {}").format(sql.Identifier(role)))
        connection.execute(sql.SQL("ALTER TABLE public.life_services OWNER TO {}").format(sql.Identifier(role)))
        connection.execute("""INSERT INTO users (telegram_id, ref_code, role, status, created_at, updated_at, phone)
                            VALUES (811000101, 'release-proof-fixture', 'client', 'active', now(), now(), 'Synthetic-private-value')""")
        connection.execute("""
            INSERT INTO life_services
              (user_id,kind,title,start_date,end_date,price_amount,price_currency,price_unit,
               owner_details,internal_note,publication_status,version,created_by_admin_id,updated_by_admin_id,
               create_idempotency_key,create_payload_hash,created_at,updated_at)
            SELECT u.id,v.kind,v.title,v.start_date::date,v.end_date::date,v.amount::numeric,'IDR',v.unit,
                   'Synthetic-private-owner','Synthetic-private-note',v.publication,v.version,u.id,u.id,
                   v.create_key,repeat('a',64),now(),now()
            FROM users u CROSS JOIN (VALUES
              ('housing',NULL,NULL,NULL,NULL,'period','DRAFT',1,'existing-housing'),
              ('bike','Existing bike','2026-01-01','2026-02-01','1234567.89','month','PUBLISHED',3,'existing-bike'),
              ('insurance','Existing policy',NULL,'2026-03-01','987654.32','policy','HIDDEN',2,'existing-insurance')
            ) v(kind,title,start_date,end_date,amount,unit,publication,version,create_key)
        """)
    params["runtime_role"] = role

    def worker(mode, *, dump=False, **override):
        log = tmp_path / f"{mode}-{uuid.uuid4().hex}.log"
        output = tmp_path / "database.dump" if dump else tmp_path / f"{mode}-{uuid.uuid4().hex}.output"
        with output.open("wb") as stream, log.open("wb") as errors:
            result = subprocess.run([sys.executable, str(SCRIPT), "--worker"],
                                    input=json.dumps({**params, "mode": mode, **override}).encode(),
                                    stdout=stream, stderr=errors, timeout=120)
        lines = log.read_text()
        assert not any(private in lines for private in ("Synthetic-private-value", "Synthetic-private-owner", "Synthetic-private-note"))
        return result.returncode, [json.loads(line[len(release.RESULT_MARKER):]) for line in lines.splitlines()
                                  if line.startswith(release.RESULT_MARKER)]

    code, results = worker("snapshot", dump=True)
    assert code == 0 and results[0]["tables"]["public.users"]["count"] == 1
    assert results[0]["tables"]["public.life_services"]["count"] == 3
    params.update(baseline=results[0]["tables"], baseline_sequences=results[0]["sequences"],
                  isolated_db=f"bali_rentals_verify_{uuid.uuid4().hex[:24]}")
    params["marker"] = f"BALI-LIFE rentals verification {params['isolated_db']}"
    params["candidate_source"] = (BACKEND / "alembic/versions/f2c8a4d6e901_extend_life_service_rentals.py").read_text()
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
    assert results[0]["existing_life_rows_and_owner_preserved"]
    assert results[0]["sequence_values_and_owners_preserved"]
    assert results[0]["original_tables"] >= 40
    assert results[0]["original_sequence_count"] >= 30
    assert all(step["existing_life_rows_equal"] and step["original_sequences_equal"] for step in results[0]["steps"])
    with release.connect(params, params["production_db"], readonly=True) as connection:
        release.assert_source(connection)
        assert release.fingerprint(connection) == params["baseline"]
        assert release.sequence_fingerprint(connection) == params["baseline_sequences"]
    with release.connect(params, params["isolated_db"]) as connection:
        release.assert_isolated(connection, params)
        assert release.revision(connection) == release.CANDIDATE_REVISION
        assert release.fingerprint(connection, upgraded=True) == params["baseline"]


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
