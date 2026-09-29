#!/usr/bin/env python3
"""REVIEWED EXECUTION ONLY: production backup and isolated admin/reminder verification.

This script NEVER migrates the production database, changes a service, or drops
a database. It creates a sensitive root-only backup and one isolated restore DB.
Run with the production backend virtualenv Python as root; see the paired runbook.
"""

import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import stat
import subprocess
import sys
import tempfile
import uuid
from datetime import datetime, timezone


SOURCE_REVISION = "f711d3ab216caa8e98df7ec38955392f5b5acc3e"
BASE_REVISION = "a9c28b017d60"
CANDIDATE_REVISION = "c8e3f7a1d502"
MIDDLE_REVISION = "b7d2e6a9c410"
CANDIDATE_SHA256 = "2bf43463e7fdda365337e215a3ad88dfa6fde4edd330e4ddd5a81e48ddf5ce33"
MIDDLE_SHA256 = "f84c699b06ca37ec0e7cc0ba3bb202f0e48dae87508ed2519e373dbf065bc3c0"
REPO = Path("/opt/safr/safr-bali")
BACKUP_PARENT = Path("/var/backups/safr-bali-admin")
RESULT_MARKER = "BALI_ADMIN_RESULT="
ISOLATED_NAME = re.compile(r"^bali_admin_verify_[a-f0-9]{24}$")
RENTAL_COLUMNS = ("notifications_enabled",)
LEDGER_TABLE = "public.service_expiry_deliveries"
LEDGER_SEQUENCE = ("public", "service_expiry_deliveries_id_seq")
CHANGED_CHECKS = {"ck_life_services_kind", "ck_life_services_quantity", "ck_life_services_publish_complete"}


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def connect(params, database, *, readonly=False):
    import psycopg
    connection = psycopg.connect(dbname=database, user=params["pg_user"], host=params["pg_socket"],
                                port=params["pg_port"], connect_timeout=10,
                                options="-c statement_timeout=180000 -c lock_timeout=10000 -c idle_in_transaction_session_timeout=600000 -c search_path=public,pg_catalog -c timezone=UTC -c extra_float_digits=3")
    connection.read_only = readonly
    return connection


def revision(connection):
    values = connection.execute("SELECT version_num FROM public.alembic_version").fetchall()
    require(values in ([(BASE_REVISION,)], [(MIDDLE_REVISION,)], [(CANDIDATE_REVISION,)]), "Unexpected schema revision")
    return values[0][0]


def assert_source(connection):
    require(revision(connection) == BASE_REVISION, "Production schema differs from the reviewed base")
    require(connection.execute("SELECT to_regclass('public.life_services')").fetchone()[0] is not None,
            "Existing life_services table is required")
    require(connection.execute("SELECT to_regclass('public.service_expiry_deliveries')").fetchone()[0] is None, "Reminder schema already exists; stop")
    require(connection.execute("SELECT to_regclass('public.service_expiry_deliveries_id_seq')").fetchone()[0] is None,
            "Reminder sequence already exists at the base revision; stop")
    # These features can execute work outside a restored database. Fail before
    # restoring them; normal SQL functions and application outbox rows are inert.
    checks = (
        "SELECT count(*) FROM pg_subscription",
        "SELECT count(*) FROM pg_foreign_server",
        "SELECT count(*) FROM pg_event_trigger",
        "SELECT count(*) FROM pg_extension WHERE extname NOT IN ('plpgsql','pgcrypto','uuid-ossp')",
    )
    require(all(connection.execute(sql).fetchone()[0] == 0 for sql in checks),
            "Unsupported autonomous database objects require separate review")


def fingerprint(connection, *, upgraded=False):
    """Only counts, per-row SHA-256 aggregates, schema/owner facts leave PostgreSQL."""
    from psycopg import sql
    tables = connection.execute("""
        SELECT n.nspname, c.relname, pg_get_userbyid(c.relowner)
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE c.relkind IN ('r','p') AND n.nspname NOT LIKE 'pg_%'
          AND n.nspname <> 'information_schema'
        ORDER BY n.nspname, c.relname
    """).fetchall()
    result = {}
    for schema, table, owner in tables:
        if (schema, table) == ("public", "alembic_version") or (upgraded and schema == "public" and table == "service_expiry_deliveries"):
            continue
        is_rental = upgraded and schema == "public" and table == "life_services"
        # Exclude ONLY the reviewed consent field, and ONLY after upgrade.
        projection = sql.SQL("to_jsonb(t) - {}::text[]").format(sql.Literal(list(RENTAL_COLUMNS))) if is_rental else sql.SQL("to_jsonb(t)")
        query = sql.SQL("SELECT encode(sha256(convert_to(({})::text, 'UTF8')), 'hex') FROM {}.{} t ORDER BY 1").format(
            projection, sql.Identifier(schema), sql.Identifier(table))
        digest, count = hashlib.sha256(), 0
        with connection.cursor(name=f"life_fp_{uuid.uuid4().hex}") as cursor:
            cursor.execute(query)
            for (row_hash,) in cursor:
                digest.update(row_hash.encode("ascii") + b"\n")
                count += 1
        columns = connection.execute("""
            SELECT column_name, data_type, udt_name, is_nullable, column_default
            FROM information_schema.columns WHERE table_schema=%s AND table_name=%s ORDER BY ordinal_position
        """, (schema, table)).fetchall()
        if is_rental:
            added = [column for column in columns if column[0] in RENTAL_COLUMNS]
            require(len(added) == 1, "Expected exactly one consent column")
            columns = [column for column in columns if column[0] not in RENTAL_COLUMNS]
        result[f"{schema}.{table}"] = {"count": count, "sha256": digest.hexdigest(), "owner": owner,
                                      "columns_sha256": hashlib.sha256(json.dumps(columns).encode()).hexdigest()}
    return result



def sequence_fingerprint(connection, *, include_values=False, upgraded=False):
    """Sequence structure/owner is snapshotted; non-MVCC values use clone baseline."""
    from psycopg import sql
    rows = connection.execute("""
        SELECT n.nspname, c.relname, pg_get_userbyid(c.relowner),
               s.seqtypid::regtype::text, s.seqstart, s.seqincrement,
               s.seqmax, s.seqmin, s.seqcache, s.seqcycle
        FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid
        JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
        ORDER BY n.nspname, c.relname
    """).fetchall()
    result = {}
    for schema, name, owner, *definition in rows:
        if upgraded and (schema, name) == LEDGER_SEQUENCE:
            continue
        dependencies = connection.execute("""
            SELECT tn.nspname, t.relname, a.attname, d.deptype
            FROM pg_depend d JOIN pg_class s ON s.oid=d.objid
            JOIN pg_namespace sn ON sn.oid=s.relnamespace
            JOIN pg_class t ON t.oid=d.refobjid
            JOIN pg_namespace tn ON tn.oid=t.relnamespace
            JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=d.refobjsubid
            WHERE d.classid='pg_class'::regclass AND d.refclassid='pg_class'::regclass
              AND d.deptype IN ('a','i') AND sn.nspname=%s AND s.relname=%s
            ORDER BY tn.nspname,t.relname,a.attname,d.deptype
        """, (schema, name)).fetchall()
        facts = {"owner": owner, "definition": definition, "dependencies": dependencies}
        if include_values:
            facts["state"] = connection.execute(sql.SQL("SELECT last_value,is_called FROM {}.{}").format(
                sql.Identifier(schema), sql.Identifier(name))).fetchone()
        result[f"{schema}.{name}"] = hashlib.sha256(json.dumps(facts, sort_keys=True).encode()).hexdigest()
    return result


def schema_fingerprint(connection):
    """Full original-table column, constraint and index facts, including owners.

    Definitions remain in the root-private manifest. No application rows are read.
    Temporary proof tables are excluded by the same pg_* namespace restriction.
    """
    result = {}
    tables = connection.execute("""
        SELECT c.oid, n.nspname, c.relname, pg_get_userbyid(c.relowner),
               c.relkind, c.relpersistence, c.relrowsecurity, c.relforcerowsecurity
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE c.relkind IN ('r','p') AND n.nspname NOT LIKE 'pg_%'
          AND n.nspname <> 'information_schema' ORDER BY n.nspname,c.relname
    """).fetchall()
    for oid, schema, table, owner, kind, persistence, rls, force_rls in tables:
        columns = connection.execute("""
            SELECT a.attname, format_type(a.atttypid,a.atttypmod), a.attnotnull,
                   pg_get_expr(d.adbin,d.adrelid), a.attidentity, a.attgenerated,
                   CASE WHEN a.attcollation=0 THEN NULL ELSE cn.nspname||'.'||co.collname END
            FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
            LEFT JOIN pg_collation co ON co.oid=a.attcollation LEFT JOIN pg_namespace cn ON cn.oid=co.collnamespace
            WHERE a.attrelid=%s AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum
        """, (oid,)).fetchall()
        constraints = connection.execute("""
            SELECT conname, contype, pg_get_constraintdef(oid,true), convalidated,
                   condeferrable, condeferred, connoinherit, conislocal, coninhcount
            FROM pg_constraint WHERE conrelid=%s ORDER BY conname
        """, (oid,)).fetchall()
        indexes = connection.execute("""
            SELECT c.relname, pg_get_indexdef(i.indexrelid), pg_get_userbyid(c.relowner),
                   i.indisvalid, i.indisready, i.indislive, i.indisreplident,
                   c.reloptions, ts.spcname, am.amname, i.indisunique, i.indisprimary,
                   i.indisexclusion,
                   ARRAY(SELECT pg_get_indexdef(i.indexrelid,k,true) FROM generate_series(1,i.indnkeyatts) k),
                   ARRAY(SELECT pg_get_indexdef(i.indexrelid,k,true) FROM generate_series(i.indnkeyatts+1,i.indnatts) k),
                   pg_get_expr(i.indpred,i.indrelid)
            FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
            JOIN pg_am am ON am.oid=c.relam LEFT JOIN pg_tablespace ts ON ts.oid=c.reltablespace
            WHERE i.indrelid=%s ORDER BY c.relname
        """, (oid,)).fetchall()
        result[f"{schema}.{table}"] = {
            "schema": schema, "table": table,
            "owner": owner, "kind": kind, "persistence": persistence, "rls": rls, "force_rls": force_rls,
            "columns": [list(row) for row in columns],
            "constraints": {row[0]: list(row[1:]) for row in constraints},
            "indexes": {row[0]: list(row[1:]) for row in indexes},
        }
    return result


def normalized_check_definitions(connection, table, definitions, *, schema="public", full_definition=False):
    """Called ONLY on the guarded clone, using SHA-pinned migration conditions."""
    from psycopg import sql
    temporary = "admin_proof_" + uuid.uuid4().hex
    connection.execute(sql.SQL("CREATE TEMP TABLE {} (LIKE {}.{}) ON COMMIT DROP").format(
        sql.Identifier(temporary), sql.Identifier(schema), sql.Identifier(table)))
    for name, condition in definitions.items():
        definition = sql.SQL(condition) if full_definition else sql.SQL("CHECK ({})").format(sql.SQL(condition))
        connection.execute(sql.SQL("ALTER TABLE pg_temp.{} ADD CONSTRAINT {} {}").format(
            sql.Identifier(temporary), sql.Identifier(name), definition))
    return dict(connection.execute("""
        SELECT conname,pg_get_constraintdef(oid,true) FROM pg_constraint
        WHERE conrelid=to_regclass(%s) AND contype='c' ORDER BY conname
    """, ("pg_temp." + temporary,)).fetchall())


def normalized_schema_checks(connection, manifest):
    # pg_dump can reparse an implicit varchar[] -> text[] coercion into
    # equivalent per-element casts. Let PostgreSQL normalize BOTH manifests on
    # clone-only TEMP LIKE tables. Never remove casts or ignore CHECK expressions.
    result = copy.deepcopy(manifest)
    for table in result.values():
        checks = {name: facts[1] for name, facts in table["constraints"].items() if facts[0] == "c"}
        if checks:
            normalized = normalized_check_definitions(connection, table["table"], checks,
                                                       schema=table["schema"], full_definition=True)
            require(set(normalized) == set(checks), "CHECK normalization changed the constraint set")
            for name, definition in normalized.items():
                table["constraints"][name][1] = definition
    return result


def require_index(index, owner, keys, *, unique=False, primary=False):
    # The full definition is kept for unchanged indexes. Expected additions use
    # PostgreSQL's ordered key expressions, avoiding unsafe SQL text replacement.
    require(index is not None, "Expected index is missing")
    require(index[1:7] == [owner, True, True, True, False, None], "New index owner/state/options differ")
    require(index[7:] == [None, "btree", unique, primary, False, keys, [], None],
            "New index definition differs")


def assert_ledger_schema(connection, ledger, runtime_role):
    require(ledger is not None, "Reminder ledger is missing")
    require({key: ledger[key] for key in ("owner", "kind", "persistence", "rls", "force_rls")} ==
            {"owner": runtime_role, "kind": "r", "persistence": "p", "rls": False, "force_rls": False},
            "Reminder ledger owner/table properties differ")
    expected_columns = [
        ("id", "integer", True), ("visa_case_id", "integer", False), ("life_service_id", "integer", False),
        ("recipient_user_id", "integer", True), ("end_date", "date", True), ("offset_days", "integer", True),
        ("policy_version", "integer", True), ("dedupe_key", "character varying(160)", True),
        ("state", "character varying(16)", True), ("payload", "json", True),
        ("due_at", "timestamp with time zone", True), ("lease_token", "character varying(64)", False),
        ("lease_expires_at", "timestamp with time zone", False), ("attempts", "integer", True),
        ("telegram_message_id", "character varying(64)", False), ("error_code", "character varying(80)", False),
        ("delivered_at", "timestamp with time zone", False), ("created_at", "timestamp with time zone", True),
        ("updated_at", "timestamp with time zone", True),
    ]
    expected = [[name, kind, required, "nextval('service_expiry_deliveries_id_seq'::regclass)" if name == "id" else None,
                 "", "", "pg_catalog.default" if kind.startswith("character varying") else None]
                for name, kind, required in expected_columns]
    require(ledger["columns"] == expected, "Reminder ledger columns/defaults differ")
    checks = normalized_check_definitions(connection, "service_expiry_deliveries", {
        "ck_service_expiry_source": "(visa_case_id IS NOT NULL AND life_service_id IS NULL) OR (visa_case_id IS NULL AND life_service_id IS NOT NULL)",
        "ck_service_expiry_state": "state IN ('PENDING','CLAIMED','DELIVERED','FAILED','UNKNOWN','SUPPRESSED')",
        "ck_service_expiry_offset": "offset_days BETWEEN 1 AND 3660",
    })
    checks = normalized_check_definitions(connection, "service_expiry_deliveries", checks, full_definition=True)
    expected_constraints = {
        **{name: ("c", definition) for name, definition in checks.items()},
        "service_expiry_deliveries_pkey": ("p", "PRIMARY KEY (id)"),
        "service_expiry_deliveries_visa_case_id_fkey": ("f", "FOREIGN KEY (visa_case_id) REFERENCES visa_cases(id) ON DELETE RESTRICT"),
        "service_expiry_deliveries_life_service_id_fkey": ("f", "FOREIGN KEY (life_service_id) REFERENCES life_services(id) ON DELETE RESTRICT"),
        "service_expiry_deliveries_recipient_user_id_fkey": ("f", "FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE RESTRICT"),
        "uq_service_expiry_dedupe": ("u", "UNIQUE (dedupe_key)"),
        "uq_service_expiry_visa": ("u", "UNIQUE (visa_case_id, end_date, offset_days, recipient_user_id)"),
        "uq_service_expiry_life": ("u", "UNIQUE (life_service_id, end_date, offset_days, recipient_user_id)"),
    }
    require(set(ledger["constraints"]) == set(expected_constraints), "Reminder ledger constraint set differs")
    for name, expected_constraint in expected_constraints.items():
        facts = ledger["constraints"][name]
        require(facts[:2] == list(expected_constraint) and facts[2:5] == [True, False, False]
                and facts[6:] == [True, 0], "Reminder ledger constraint definition/state differs")
    expected_indexes = {
        "service_expiry_deliveries_pkey": (["id"], True, True),
        "uq_service_expiry_dedupe": (["dedupe_key"], True, False),
        "uq_service_expiry_visa": (["visa_case_id", "end_date", "offset_days", "recipient_user_id"], True, False),
        "uq_service_expiry_life": (["life_service_id", "end_date", "offset_days", "recipient_user_id"], True, False),
        "ix_service_expiry_claim": (["state", "due_at", "id"], False, False),
    }
    require(set(ledger["indexes"]) == set(expected_indexes), "Reminder ledger index set differs")
    for name, (keys, unique, primary) in expected_indexes.items():
        require_index(ledger["indexes"][name], runtime_role, keys, unique=unique, primary=primary)
    sequence = connection.execute("""
        SELECT pg_get_userbyid(c.relowner), s.seqtypid::regtype::text, s.seqstart, s.seqincrement,
               s.seqmax,s.seqmin,s.seqcache,s.seqcycle,
               tn.nspname,t.relname,a.attname,d.deptype
        FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid
        JOIN pg_namespace n ON n.oid=c.relnamespace
        JOIN pg_depend d ON d.classid='pg_class'::regclass AND d.objid=c.oid
          AND d.refclassid='pg_class'::regclass AND d.deptype IN ('a','i')
        JOIN pg_class t ON t.oid=d.refobjid JOIN pg_namespace tn ON tn.oid=t.relnamespace
        JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=d.refobjsubid
        WHERE n.nspname=%s AND c.relname=%s
    """, LEDGER_SEQUENCE).fetchall()
    require(sequence == [(runtime_role, "integer", 1, 1, 2147483647, 1, 1, False,
                           "public", "service_expiry_deliveries", "id", "a")], "Reminder sequence definition/owner/dependency differs")
    require(connection.execute("SELECT last_value,is_called FROM public.service_expiry_deliveries_id_seq").fetchone() == (1, False),
            "Unexpected reminder sequence usage")


def assert_schema_preserved(connection, baseline, current_revision, runtime_role, expected_checks):
    current = normalized_schema_checks(connection, schema_fingerprint(connection))
    if current_revision == BASE_REVISION:
        require(current == baseline, "Original table schema/constraints/indexes differ at base revision")
        return
    require(current_revision in (MIDDLE_REVISION, CANDIDATE_REVISION), "Unknown schema proof revision")
    require(LEDGER_TABLE not in baseline, "Ledger unexpectedly exists in baseline")
    assert_ledger_schema(connection, current.pop(LEDGER_TABLE, None), runtime_role)
    life = current["public.life_services"]
    require(life["columns"][-1] == ["notifications_enabled", "boolean", True, "true", "", "", None],
            "Consent column type/default/nullability/order differs")
    life["columns"].pop()
    for table, name, keys in (
        ("public.life_services", "ix_life_services_expiry", ["publication_status", "end_date", "id"]),
        ("public.visa_cases", "ix_visa_cases_expiry", ["publication_status", "stay_end", "id"]),
    ):
        require(name not in baseline[table]["indexes"], "Expected new index already exists in baseline")
        require_index(current[table]["indexes"].pop(name, None), baseline[table]["owner"], keys)
    if current_revision == CANDIDATE_REVISION:
        require(set(expected_checks) == CHANGED_CHECKS, "Unexpected reviewed CHECK allowlist")
        for name, definition in expected_checks.items():
            expected = copy.deepcopy(baseline["public.life_services"]["constraints"][name])
            expected[1] = definition
            require(life["constraints"].get(name) == expected, "Candidate CHECK definition/state differs")
            life["constraints"][name] = copy.deepcopy(baseline["public.life_services"]["constraints"][name])
    require(current == baseline, "Original table schema/constraints/indexes differ outside exact allowed changes")


def assert_rental_defaults(connection):
    require(connection.execute("SELECT count(*) FROM life_services WHERE notifications_enabled IS NOT TRUE").fetchone()[0] == 0, "Consent default changed")
    require(connection.execute("SELECT count(*) FROM service_expiry_deliveries").fetchone()[0] == 0, "Unexpected delivery rows")
    require(connection.execute("SELECT count(*) FROM business_setting_versions WHERE entity_type='notification' AND entity_key='service_expiry'").fetchone()[0] == 0, "Unexpected reminder activation/history")
    require(connection.execute("SELECT enabled FROM onboarding_state WHERE id=1").fetchone()[0] is False, "Onboarding must remain off")


def emit_worker(result):
    # Snapshot mode reserves stdout for the custom-format database dump.
    print(RESULT_MARKER + json.dumps(result, sort_keys=True), file=sys.stderr, flush=True)


def pg_command(params, binary, *arguments):
    return [binary, "--host", params["pg_socket"], "--port", str(params["pg_port"]),
            "--username", params["pg_user"], *arguments]


def assert_isolated(connection, params):
    expected = params["isolated_db"]
    require(ISOLATED_NAME.fullmatch(expected) is not None and expected != params["production_db"], "Invalid isolated target")
    actual, owner, limit, marker = connection.execute("""
        SELECT current_database(), pg_get_userbyid(datdba), datconnlimit,
               shobj_description(oid, 'pg_database') FROM pg_database WHERE datname=current_database()
    """).fetchone()
    require(actual == expected and owner == params["pg_user"] and limit == 0 and marker == params["marker"],
            "Isolated database identity/owner/connection guard failed")
    require(not connection.execute("SELECT has_database_privilege(%s,%s,'CONNECT')",
                                   (params["runtime_role"], expected)).fetchone()[0], "Runtime role can connect to restored data")


def worker(params):
    """Runs only as the local postgres OS identity via runuser; no app imports."""
    from psycopg import sql
    mode = params["mode"]
    if mode in {"inspect", "snapshot"}:
        with connect(params, params["production_db"], readonly=True) as connection:
            connection.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
            assert_source(connection)
            configured = connection.execute("SELECT current_database(), current_setting('port')::integer").fetchone()
            require(configured == (params["production_db"], params["pg_port"]), "Local database mapping mismatch")
            runtime_role = connection.execute("SELECT tableowner FROM pg_tables WHERE schemaname='public' AND tablename='users'").fetchone()[0]
            role = connection.execute("SELECT rolsuper FROM pg_roles WHERE rolname=%s", (runtime_role,)).fetchone()
            require(role is not None and not role[0], "Runtime table owner must not be a superuser")
            require(connection.execute("SELECT tableowner FROM pg_tables WHERE schemaname='public' AND tablename='life_services'").fetchone() == (runtime_role,),
                    "Existing life_services owner differs from users owner")
            result = {"source_revision": BASE_REVISION, "runtime_role": runtime_role,
                      "database_size_bytes": connection.execute("SELECT pg_database_size(current_database())").fetchone()[0],
                      "data_directory": connection.execute("SHOW data_directory").fetchone()[0]}
            if mode == "snapshot":
                snapshot = connection.execute("SELECT pg_export_snapshot()").fetchone()[0]
                result["tables"] = fingerprint(connection)
                result["schema"] = schema_fingerprint(connection)
                result["sequences"] = sequence_fingerprint(connection)
                # The exported transaction remains open until pg_dump succeeds.
                subprocess.run(pg_command(params, "pg_dump", "--format=custom", "--lock-wait-timeout=10000", "--snapshot", snapshot,
                                           "--dbname", params["production_db"]), stdout=sys.stdout.buffer,
                               stderr=sys.stderr, check=True, timeout=600)
            emit_worker(result)
        return
    if mode == "create-isolated":
        require(ISOLATED_NAME.fullmatch(params["isolated_db"]) is not None, "Invalid new database name")
        require(params["isolated_db"] != params["production_db"], "Refusing production target")
        with connect(params, "postgres") as connection:
            connection.autocommit = True
            require(connection.execute("SELECT 1 FROM pg_database WHERE datname=%s", (params["isolated_db"],)).fetchone() is None,
                    "Generated database already exists; refusing reuse")
            connection.execute(sql.SQL("CREATE DATABASE {} OWNER {} TEMPLATE template0 CONNECTION LIMIT 0").format(
                sql.Identifier(params["isolated_db"]), sql.Identifier(params["pg_user"])))
            connection.execute(sql.SQL("REVOKE ALL ON DATABASE {} FROM PUBLIC").format(sql.Identifier(params["isolated_db"])))
            connection.execute(sql.SQL("REVOKE ALL ON DATABASE {} FROM {}").format(
                sql.Identifier(params["isolated_db"]), sql.Identifier(params["runtime_role"])))
            connection.execute(sql.SQL("COMMENT ON DATABASE {} IS {}").format(
                sql.Identifier(params["isolated_db"]), sql.Literal(params["marker"])))
        emit_worker({"created": True})
        return
    require(mode == "verify-isolated", "Unknown worker mode")
    with connect(params, params["isolated_db"]) as connection:
        assert_isolated(connection, params)
        require(revision(connection) == BASE_REVISION, "Restored schema is not the base")
        require(fingerprint(connection) == params["baseline"], "Restored tables differ from the exported snapshot")
        baseline_schema = normalized_schema_checks(connection, params["baseline_schema"])
        assert_schema_preserved(connection, baseline_schema, BASE_REVISION, params["runtime_role"], {})
        require(sequence_fingerprint(connection) == params["baseline_sequences"], "Restored sequence structures or owners differ")
        # Sequence counters do not obey exported snapshots. Record the state
        # actually restored from this dump; migration must never advance/reset it.
        restored_sequences = sequence_fingerprint(connection, include_values=True)
    namespaces = {}
    for source_key, digest, current, previous in (
        ("middle_source", MIDDLE_SHA256, MIDDLE_REVISION, BASE_REVISION),
        ("candidate_source", CANDIDATE_SHA256, CANDIDATE_REVISION, MIDDLE_REVISION),
    ):
        source = params[source_key]
        require(hashlib.sha256(source.encode()).hexdigest() == digest, "Migration hash mismatch")
        namespace = {"__name__": "reviewed_admin_migration", "__file__": params["candidate_path"]}
        exec(compile(source, "reviewed_admin_migration", "exec"), namespace)
        require(namespace["revision"] == current and namespace["down_revision"] == previous, "Revision chain mismatch")
        namespaces[current] = namespace
    with connect(params, params["isolated_db"]) as connection:
        assert_isolated(connection, params)
        candidate = namespaces[CANDIDATE_REVISION]
        require(set(candidate["PREVIOUS_CHECKS"]) == CHANGED_CHECKS and set(candidate["OTHER_CHECKS"]) == CHANGED_CHECKS,
                "Pinned migration CHECK names differ from the reviewed allowlist")
        previous_checks = normalized_check_definitions(connection, "life_services", candidate["PREVIOUS_CHECKS"])
        for name, definition in previous_checks.items():
            # Reparse once more just like baseline CHECKs to canonicalize explicit
            # array coercions, while preserving every part of the predicate.
            expected = normalized_check_definitions(connection, "life_services", {name: definition}, full_definition=True)[name]
            require(baseline_schema["public.life_services"]["constraints"][name][1] == expected,
                    "Baseline life-service CHECK differs from the reviewed prior definition")
        expected_checks = normalized_check_definitions(connection, "life_services", candidate["OTHER_CHECKS"])
        expected_checks = normalized_check_definitions(connection, "life_services", expected_checks, full_definition=True)
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    import sqlalchemy as sa
    # Creator always connects to the guarded isolated database. No production URL
    # is ever passed into Alembic, and no environment/settings file is imported.
    engine = sa.create_engine("postgresql+psycopg://", creator=lambda: connect(params, params["isolated_db"]))
    steps = []
    for operation, old, new in (("upgrade", BASE_REVISION, MIDDLE_REVISION),
                                ("upgrade", MIDDLE_REVISION, CANDIDATE_REVISION),
                                ("downgrade", CANDIDATE_REVISION, MIDDLE_REVISION),
                                ("downgrade", MIDDLE_REVISION, BASE_REVISION),
                                ("upgrade", BASE_REVISION, MIDDLE_REVISION),
                                ("upgrade", MIDDLE_REVISION, CANDIDATE_REVISION)):
        namespace = namespaces[new if operation == "upgrade" else old]
        with engine.begin() as connection:
            raw = connection.connection.driver_connection
            assert_isolated(raw, params)
            require(revision(raw) == old, "Unexpected isolated revision before migration")
            with Operations.context(MigrationContext.configure(connection)):
                namespace[operation]()
            changed = connection.execute(sa.text("UPDATE public.alembic_version SET version_num=:new WHERE version_num=:old"),
                                         {"old": old, "new": new})
            require(changed.rowcount == 1, "Schema version update was not singular")
        with connect(params, params["isolated_db"]) as check:
            assert_isolated(check, params)
            require(revision(check) == new, "Isolated revision verification failed")
            current = fingerprint(check, upgraded=new != BASE_REVISION)
            require(current == params["baseline"], "Original data/columns/ownership changed")
            require(sequence_fingerprint(check, include_values=True, upgraded=new != BASE_REVISION) == restored_sequences,
                    "Original sequence values, owners or structure changed")
            assert_schema_preserved(check, baseline_schema, new, params["runtime_role"], expected_checks)
            if new != BASE_REVISION:
                assert_rental_defaults(check)
            else:
                assert_source(check)
            steps.append({"operation": operation, "revision": new, "original_tables_equal": True,
                          "original_sequences_equal": True, "existing_life_rows_equal": True,
                          "original_table_schema_preserved": True, "exact_allowed_schema_changes": True})
    engine.dispose()
    emit_worker({"result": "PASS", "restore_equal": True, "steps": steps,
                 "original_tables": len(params["baseline"]), "runtime_cannot_connect_to_clone": True,
                 "existing_life_rows_and_owner_preserved": True,
                 "original_sequence_count": len(restored_sequences), "sequence_values_and_owners_preserved": True})


def safe_run(command, *, stdout, stderr, input_bytes=None, stdin=None, timeout=900):
    """Bound the complete process group, including pg_dump descendants."""
    process = subprocess.Popen(command, stdout=stdout, stderr=stderr, stdin=subprocess.PIPE if input_bytes is not None else stdin,
                               start_new_session=True, env={"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "LANG": "C.UTF-8"})
    try:
        process.communicate(input=input_bytes, timeout=timeout)
    except BaseException as exc:
        os.killpg(process.pid, signal.SIGTERM)
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait()
        if isinstance(exc, subprocess.TimeoutExpired):
            raise RuntimeError("Bounded subprocess timed out; inspect the private run log") from None
        raise
    require(process.returncode == 0, "Subprocess failed; inspect the private run log")


def write_json(path, content):
    with path.open("x") as output:
        json.dump(content, output, sort_keys=True, indent=2)
        output.write("\n")


def write_checksums(backup, filename):
    with (backup / filename).open("x") as sums:
        for path in sorted(backup.iterdir()):
            if path.name == filename or not path.is_file():
                continue
            digest = hashlib.sha256()
            with path.open("rb") as artifact:
                for chunk in iter(lambda: artifact.read(1024 * 1024), b""):
                    digest.update(chunk)
            sums.write(f"{digest.hexdigest()}  {path.name}\n")
            require(path.stat().st_uid == 0 and not (path.stat().st_mode & 0o077), "Backup artifact permission mismatch")


def run_worker(params, backup, stage, *, dump=None):
    source = Path(__file__).read_text()
    log_path = backup / f"{stage}.private.log"
    with log_path.open("xb") as log:
        with (dump.open("xb") if dump is not None else open(os.devnull, "wb")) as output:
            safe_run(["runuser", "-u", "postgres", "--", sys.executable, "-c", source, "--worker"],
                     stdout=output, stderr=log, input_bytes=json.dumps(params).encode())
    results = [line[len(RESULT_MARKER):] for line in log_path.read_text().splitlines() if line.startswith(RESULT_MARKER)]
    require(len(results) == 1, "Worker did not produce one verification result")
    return json.loads(results[0])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--middle", type=Path, required=True, help="Reviewed reminder migration outside the live checkout")
    parser.add_argument("--candidate", type=Path, required=True, help="Exact reviewed migration file, outside the live checkout")
    parser.add_argument("--execute-reviewed-verification", action="store_true", help="Create backups and the isolated restore DB; never migrate production")
    parser.add_argument("--runtime-mapping-confirmed", action="store_true",
                        help="Operator verified effective systemd DATABASE_URL and endpoint/socket cluster identity")
    args = parser.parse_args()
    require(args.execute_reviewed_verification, "Explicit reviewed execution flag required")
    require(args.runtime_mapping_confirmed, "Effective runtime and socket cluster mapping must be independently confirmed")
    require(sys.platform.startswith("linux") and os.geteuid() == 0, "Run on the Linux server as root")
    os.umask(0o077)
    repo = REPO.resolve(strict=True)
    backend, bot = repo / "06 Development/backend", repo / "06 Development/bot"
    require(Path(sys.executable).resolve().is_file(), "Python executable unavailable")
    actual = subprocess.check_output(["git", "-C", str(repo), "rev-parse", "HEAD"], timeout=10, text=True).strip()
    require(actual == SOURCE_REVISION, "Live source changed; rebase and review the release first")
    require(subprocess.run(["git", "-C", str(repo), "diff", "--quiet", "HEAD", "--"], timeout=10).returncode == 0,
            "Tracked runtime changes require review before release")
    require(not subprocess.check_output(["git", "-C", str(repo), "ls-files", "--others", "--exclude-standard"], timeout=10),
            "Untracked runtime files require review before release")
    candidate_path = args.candidate.resolve(strict=True)
    require(not candidate_path.is_relative_to(repo), "Stage the candidate outside the live checkout")
    candidate_bytes = candidate_path.read_bytes()
    require(hashlib.sha256(candidate_bytes).hexdigest() == CANDIDATE_SHA256, "Candidate bytes differ from reviewed migration")
    candidate_source = candidate_bytes.decode("utf-8")
    middle_path = args.middle.resolve(strict=True)
    require(not middle_path.is_relative_to(repo), "Stage middle migration outside live checkout")
    middle_bytes = middle_path.read_bytes()
    require(hashlib.sha256(middle_bytes).hexdigest() == MIDDLE_SHA256, "Middle migration bytes differ")
    middle_source = middle_bytes.decode("utf-8")
    # Parse rather than source the env file: no shell interpolation or app imports.
    from dotenv import dotenv_values
    from sqlalchemy.engine import make_url
    values = dotenv_values(backend / ".env", interpolate=False)
    database_url = make_url(values.get("DATABASE_URL", ""))
    require(database_url.get_backend_name() == "postgresql" and database_url.host in {"127.0.0.1", "localhost", "::1", None},
            "Production database is not a confirmed local PostgreSQL target")
    require(not database_url.query, "Database URL options require explicit mapping review")
    require(bool(database_url.database) and database_url.database != "postgres", "Missing or unsafe production database name")
    # Local peer access avoids passing credentials in argv, environment or logs.
    params = {"pg_socket": "/var/run/postgresql", "pg_port": database_url.port or 5432,
              "pg_user": "postgres", "production_db": database_url.database}
    for relative in ("06 Development/backend/.env", "06 Development/bot/.env", "06 Development/bot/app/data"):
        path = repo / relative
        require(path.exists() and not path.is_symlink(), "Required backup path is missing or is a symlink")
    # Never follow a pre-existing backup-parent symlink or relax its permissions.
    if BACKUP_PARENT.exists():
        info = BACKUP_PARENT.lstat()
        require(stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and not (info.st_mode & 0o077),
                "Backup parent must already be a root-owned private directory")
    else:
        BACKUP_PARENT.mkdir(mode=0o700, parents=False)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup = Path(tempfile.mkdtemp(prefix=f"bali-admin-{timestamp}-", dir=BACKUP_PARENT))
    write_json(backup / "intent.json", {"source_revision": actual, "base_revision": BASE_REVISION,
                                       "candidate_revision": CANDIDATE_REVISION, "candidate_sha256": CANDIDATE_SHA256,
                                       "verification_script_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                                       "created_at": timestamp, "production_migration": False})
    inspection = run_worker({**params, "mode": "inspect"}, backup, "inspect")
    params["runtime_role"] = inspection["runtime_role"]
    require(database_url.username == params["runtime_role"], "Configured DB user differs from users-table owner; review mapping")
    for volume in (BACKUP_PARENT, Path(inspection["data_directory"])):
        filesystem = os.statvfs(volume)
        require(filesystem.f_bavail * filesystem.f_frsize >= max(2 * 1024**3, inspection["database_size_bytes"] * 3),
                "Insufficient free space for backup and isolated restore")
    for archive, paths, exclusions in (
        ("runtime.tar.gz", ["06 Development/backend", "06 Development/bot"],
         ["--exclude=.venv", "--exclude=__pycache__", "--exclude=*.pyc", "--exclude=.env"]),
        ("env.tar.gz", ["06 Development/backend/.env", "06 Development/bot/.env"], []),
    ):
        with (backup / f"{archive}.private.log").open("xb") as log:
            safe_run(["tar", "--create", "--gzip", "--numeric-owner", "--file", str(backup / archive),
                      "--directory", str(repo), *exclusions, *paths], stdout=log, stderr=log)
    baseline = run_worker({**params, "mode": "snapshot"}, backup, "snapshot", dump=backup / "database.dump")
    write_json(backup / "baseline.private.json", baseline)
    # Preserve a verifiable backup even if a later restore or migration gate fails.
    write_checksums(backup, "BACKUP_SHA256SUMS")
    isolated = f"bali_admin_verify_{uuid.uuid4().hex[:24]}"
    params.update(isolated_db=isolated, marker=f"BALI admin verification {isolated}", baseline=baseline["tables"],
                  baseline_sequences=baseline["sequences"], baseline_schema=baseline["schema"],
                  candidate_source=candidate_source, middle_source=middle_source, candidate_path=str(candidate_path))
    write_json(backup / "isolated-target.private.json", {"database": isolated, "marker": params["marker"], "retained_for_review": True})
    run_worker({**params, "mode": "create-isolated"}, backup, "create-isolated")
    with (backup / "restore.private.log").open("xb") as log, (backup / "database.dump").open("rb") as dump:
        safe_run(["runuser", "-u", "postgres", "--", *pg_command(params, "pg_restore", "--exit-on-error", "--single-transaction",
                                                               "--dbname", isolated)], stdout=log, stderr=log, stdin=dump)
    proof = run_worker({**params, "mode": "verify-isolated"}, backup, "verify-isolated")
    # A fresh production read verifies that its Alembic state remains untouched.
    source_after = run_worker({**params, "mode": "inspect"}, backup, "source-after")
    require(source_after["source_revision"] == BASE_REVISION, "Production schema changed during verification")
    proof.update(source_git_revision=actual, migration_sha256=CANDIDATE_SHA256, middle_sha256=MIDDLE_SHA256, production_revision_after=BASE_REVISION,
                 isolated_database_retained=isolated, backup_scope="PostgreSQL, backend/bot runtime and both env files")
    write_json(backup / "proof.private.json", proof)
    write_checksums(backup, "SHA256SUMS")
    print(f"PASS: private backup and isolated restore verification complete; review {backup}/proof.private.json")
    print("Production was not migrated or activated. The isolated database is retained; no cleanup was attempted.")


if __name__ == "__main__":
    try:
        if sys.argv[1:] == ["--worker"]:
            worker(json.load(sys.stdin))
        else:
            main()
    except BaseException as exc:
        # Exceptions/driver details may carry SQL or credentials. Keep stdout
        # sanitized; private worker logs contain only explicitly written results.
        if isinstance(exc, SystemExit):
            raise
        reason = str(exc) if type(exc) is RuntimeError else type(exc).__name__
        print(f"Verification stopped: {reason}; inspect the root-only run directory and runbook.", file=sys.stderr)
        sys.exit(1)
