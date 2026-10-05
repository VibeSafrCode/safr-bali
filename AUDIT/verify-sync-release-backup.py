#!/usr/bin/env python3
"""Reviewed SYNC release proof: private backup, retained isolated restore, c8/a7 U-D-U.

No production migration, service change, analytics activation, database drop,
network access, or app/settings imports. Root prepares a reviewed source manifest
offline first. Execution requires that exact manifest hash and candidate Git SHA.
Only the SHA-pinned a7 migration executes, and only on a new guarded local clone.
Historical 29-file migration graph is checked, not replayed against live data.
Run with the backend virtualenv Python. See --help; never capture private logs
or database dumps into a public AUDIT packet.
"""

import argparse
import ast
import copy
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import signal
import stat
import subprocess
import sys
import tempfile
import time
import uuid
from datetime import datetime, timezone


LIVE_SHA = "61fb53569721711600ba513d1f56e42a90d07eb7"
BASE = "c8e3f7a1d502"
HEAD = "a7e4c9d2f105"
LIVE_ROOT = Path("/opt/safr/safr-bali")
BACKUP_PARENT = Path("/var/backups/safr-bali-sync")
BACKEND = "06 Development/backend"
BOT = "06 Development/bot"
MARKER = "SAFR_SYNC_PROOF="
CLONE_NAME = re.compile(r"^bali_sync_verify_[a-f0-9]{24}$")
SHA = re.compile(r"^[a-f0-9]{40}$")
DIGEST = re.compile(r"^[a-f0-9]{64}$")
ANALYTICS = {"analytics_policy", "analytics_consents", "analytics_events",
             "analytics_daily_aggregates", "analytics_access_grants"}
PRICE_TABLES = {"orders", "visa_cases", "commercial_price_snapshots", "price_catalog_versions",
                "price_catalog_items", "catalog_publications", "catalog_publication_pointer", "fx_market_snapshots"}
PINS = {
    "19acc675c3f5": "7367edb561bb7188c3ef60e54af6dbcfeafdf931b519f8f64af1b8b2b1d2e58f",
    "4d2f7a9b8c10": "39580bc97293fff48bf78850eeb0fee08dcb602e038ac502f5bd095d3a11568e",
    "5554c63c35ae": "017a4ad674899a7c4d2b0558652026daee1e96cb0084e3a4e06c06b23503a30b",
    "5f847cca5dcf": "b4aa2bc6e4ff426e6d5bc26fe08298c7f79d8c3eb5827cfedd0762c31a3593ac",
    "68199cc0dc40": "5ae0bb033e3e435b4ca4624bb16993d6777c7f0e540543b69d8d0a250e3d6d28",
    "7f6a1c2d3e40": "94953c6611ef5e81cf193e446d68493e275f16c92c1ee25f31df7472396a25db",
    "8c72a94d31f0": "d697e4ff5e92779f24e0ba075d623408803186abc81125c6c07fab142a3c8159",
    "a3c8e1f4b726": "79dd6118c76cb44401c9b421a751eb801c228a5973c0350997c7d6f1553852bd",
    "a7e4c9d2f105": "1a45a7315b97cd57bb5879d022834d5fe02627641034979f9556ab5f5cfde10d",
    "a91b0c2d3e41": "7bf6f3d1e443659ae9138f978aaa2ae321e228645f15858b615e649cd7891a14",
    "a9c28b017d60": "1a2d0de25dd42b6c849556d556fc376d4770f9657f352bb0ea0649ee2a6d420e",
    "b3f28c7a91d0": "f1f4cd8fc62ce08d03bb7964bccfc9a657f31d6520e9ceffbfbfe44a24a6e211",
    "b4d9f2a6c813": "ad290d17a8af284b77e51883285a9b495defb73ce5016560536ecb9bce35f50b",
    "b7d2e6a9c410": "f84c699b06ca37ec0e7cc0ba3bb202f0e48dae87508ed2519e373dbf065bc3c0",
    "b8d2e4f6a710": "9bc94b8341ba4c35cfe2f49c121f945cf769747a40e65dc4e5e0d36c86d19231",
    "c3e91a7f2b44": "fd507486671cc8d166743794be085c0b8d858f5f557182ffd6f96c92e1042f53",
    "c4f7a9d2e610": "16e8bf615de9a4b1855f7eef24739c19e9911780dcdb47bb8b18f4adfc92a4b0",
    "c5e1a7b3d902": "0e2cc9fa761a39782ff48189dfacd58a90b3980ee4f91d2b0676c287c59d4d07",
    "c6a4e8b2d915": "9b7e713a542bc88545f9ae2cecfc294e5502f0b347c7af744226729d2003ff50",
    "c8e3f7a1d502": "2bf43463e7fdda365337e215a3ad88dfa6fde4edd330e4ddd5a81e48ddf5ce33",
    "d5e8b0c3f721": "919c1f0002ee9192c9528c71c32166599f9ac8ccf7240d8b4c50eb23f502738d",
    "d6f4a8b2c910": "74db730f95057bef7bfe4b83bb37f5e64264cf3744ffc3bde60ee845b1540cc0",
    "d7a2f9c4e816": "4b869e0aeaaca9bafb8d0680a053a9743ffb95a7e47dbfaec7a3828ca0063b69",
    "e303b9667566": "3bc681c834bfd08efb8df053f6461c210215dd620b2c85f433caf5bf67c5b42f",
    "e8a1c4d7f920": "831349110c71be945124012bbdf5d2a2f804e3ad75f0174d510005458f556ca7",
    "e9b3d7a5c201": "92efcd9a382a35c0722525ebc581869b76d0edd326b02f7e3a7a79e3806f4c51",
    "f2b6d9a4c731": "ef02690761ea149daa6735318dddc14c32c41352c816ad1ee638f3d671b7f4a9",
    "f2c8a4d6e901": "a7d1415740f19872a984145a2fac46aa75c0ace8e00a901bf9660a3964455ec8",
    "f7a1c2d3e465": "8707f97e5bff2cfaf67882b201fade5c69c6c7991c3441b28854baaf1ad2867d",
}


class ProofError(Exception):
    """Only fixed reviewable error codes may reach public output."""


def require(condition, code):
    if not condition:
        raise ProofError(code)


def sha256(value):
    return hashlib.sha256(value).hexdigest()


def json_hash(value):
    return sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode())


def regular(path, *, private=False):
    # Reject symlinked parents as well as symlinked files, without changing modes.
    require(not any(p.is_symlink() for p in (path, *path.parents)), "SYMLINK_PATH")
    info = path.stat()
    require(stat.S_ISREG(info.st_mode), "REGULAR_FILE_REQUIRED")
    if private:
        require(info.st_uid == os.geteuid() and not info.st_mode & 0o077, "PRIVATE_FILE_REQUIRED")
    return info


def safe_relative(name):
    path = PurePosixPath(name)
    require(not path.is_absolute() and ".." not in path.parts and path.as_posix() == name,
            "UNSAFE_SOURCE_PATH")
    require(name.startswith(BACKEND + "/") or name.startswith(BOT + "/"), "SOURCE_OUTSIDE_RUNTIME")
    require((path.name != ".env" and not path.name.startswith(".env.")) or path.name == ".env.example",
            "TRACKED_SECRET_CONFIG_REFUSED")
    return path


def git(root, *arguments):
    # Never allow replace objects, hooks, fsmonitor, diff helpers, inherited tokens
    # or global/system config to participate in immutable source verification.
    environment = {"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8", "GIT_CONFIG_NOSYSTEM": "1",
                   "GIT_CONFIG_GLOBAL": "/dev/null", "GIT_NO_REPLACE_OBJECTS": "1",
                   "GIT_TERMINAL_PROMPT": "0"}
    return subprocess.check_output(["git", "--no-replace-objects", "-c", "core.fsmonitor=false",
                                   "-C", str(root), *arguments], timeout=20, stderr=subprocess.DEVNULL,
                                   env=environment)


def graph_from_sources(sources):
    """AST literal parsing only: none of the historical migration code runs."""
    graph = {}
    for name, source in sources.items():
        values = {}
        for node in ast.parse(source).body:
            names = node.targets if isinstance(node, ast.Assign) else [node.target] if isinstance(node, ast.AnnAssign) else []
            for target in names:
                if isinstance(target, ast.Name) and target.id in {"revision", "down_revision", "depends_on", "branch_labels"}:
                    require(target.id not in values, "DUPLICATE_REVISION_ASSIGNMENT")
                    values[target.id] = ast.literal_eval(node.value)
        rev, previous = values.get("revision"), values.get("down_revision")
        require(rev in PINS and rev not in graph and sha256(source.encode()) == PINS[rev], "MIGRATION_BYTES_NOT_REVIEWED")
        require(name.startswith(rev + "_") and name.endswith(".py"), "MIGRATION_FILENAME_MISMATCH")
        require(previous is None or isinstance(previous, str), "MIGRATION_BRANCH_REFUSED")
        require(values.get("depends_on") is None and values.get("branch_labels") is None, "MIGRATION_DEPENDENCIES_REFUSED")
        graph[rev] = previous
    require(set(graph) == set(PINS), "FULL_MIGRATION_SET_REQUIRED")
    visited, current = [], HEAD
    while current is not None:
        require(current in graph and current not in visited, "MIGRATION_GRAPH_INVALID")
        visited.append(current)
        current = graph[current]
    require(set(visited) == set(graph) and graph[HEAD] == BASE, "MIGRATION_GRAPH_NOT_SINGLE_CHAIN")
    return list(reversed(visited))


def source_manifest(root, candidate_sha):
    require(SHA.fullmatch(candidate_sha) is not None, "EXACT_CANDIDATE_SHA_REQUIRED")
    require(git(root, "rev-parse", "--show-toplevel").decode().strip() == str(root), "CANDIDATE_ROOT_MISMATCH")
    require(git(root, "rev-parse", "HEAD").decode().strip() == candidate_sha, "CANDIDATE_COMMIT_MISMATCH")
    tracked = git(root, "ls-tree", "-r", "--name-only", "-z", candidate_sha, "--", BACKEND, BOT).decode().split("\0")
    hashes, migrations = {}, {}
    for name in filter(None, tracked):
        relative = safe_relative(name)
        path = root / name
        info = regular(path)
        require(info.st_size <= 8 * 1024**2, "UNBOUNDED_SOURCE_FILE")
        actual = path.read_bytes()
        committed = git(root, "show", candidate_sha + ":" + name)
        require(actual == committed, "CANDIDATE_TRACKED_BYTES_CHANGED")
        hashes[name] = sha256(actual)
        if relative.parent.as_posix() == BACKEND + "/alembic/versions" and path.suffix == ".py":
            migrations[path.name] = actual.decode("utf-8")
    # Refuse extra untracked migrations. Other ignored runtime files never run.
    versions = root / BACKEND / "alembic/versions"
    require({p.name for p in versions.glob("*.py")} == set(migrations), "UNTRACKED_MIGRATION_REFUSED")
    chain = graph_from_sources(migrations)
    require(bool(hashes), "EMPTY_RUNTIME_SOURCE")
    return {"format": 1, "candidate_sha": candidate_sha, "live_sha": LIVE_SHA,
            "schema_base": BASE, "schema_head": HEAD, "source_sha256": hashes,
            "migration_chain": chain, "migration_sha256": dict(PINS)}, migrations


def validate_manifest(value, actual, expected_sha):
    require(DIGEST.fullmatch(expected_sha) is not None, "REVIEW_MANIFEST_HASH_REQUIRED")
    require(value == actual, "REVIEW_MANIFEST_SOURCE_MISMATCH")


def connect(params, database, *, readonly=False):
    import psycopg
    connection = psycopg.connect(dbname=database, user="postgres", host="/var/run/postgresql",
                                port=params["pg_port"], connect_timeout=10,
                                options="-c statement_timeout=180000 -c lock_timeout=10000 "
                                "-c idle_in_transaction_session_timeout=600000 -c search_path=public,pg_catalog "
                                "-c timezone=UTC -c extra_float_digits=3")
    connection.read_only = readonly
    return connection


def revision(connection):
    values = connection.execute("SELECT version_num FROM public.alembic_version").fetchall()
    require(len(values) == 1 and values[0][0] in {BASE, HEAD}, "UNREVIEWED_DATABASE_REVISION")
    return values[0][0]


def assert_source(connection, params):
    require(connection.execute("SELECT current_database(), current_setting('port')::integer").fetchone() ==
            (params["production_db"], params["pg_port"]), "PRODUCTION_MAPPING_MISMATCH")
    require(revision(connection) == BASE, "PRODUCTION_BASE_CHANGED")
    for table in ANALYTICS:
        require(connection.execute("SELECT to_regclass(%s)", ("public." + table,)).fetchone()[0] is None,
                "ANALYTICS_ALREADY_PRESENT")
    for query in ("SELECT count(*) FROM pg_subscription", "SELECT count(*) FROM pg_foreign_server",
                  "SELECT count(*) FROM pg_event_trigger",
                  "SELECT count(*) FROM pg_extension WHERE extname NOT IN ('plpgsql','pgcrypto','uuid-ossp')",
                  # Restoring CHECK/default/index expressions or serializing user
                  # types must not execute unreviewed application functions.
                  "SELECT count(*) FROM pg_depend d JOIN pg_proc p ON p.oid=d.refobjid JOIN pg_namespace n ON n.oid=p.pronamespace WHERE d.refclassid='pg_proc'::regclass AND d.classid IN ('pg_constraint'::regclass,'pg_class'::regclass,'pg_attrdef'::regclass) AND n.nspname<>'pg_catalog'",
                  "SELECT count(*) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace cn ON cn.oid=c.relnamespace JOIN pg_type t ON t.oid=a.atttypid JOIN pg_namespace tn ON tn.oid=t.typnamespace WHERE c.relkind IN ('r','p') AND cn.nspname NOT LIKE 'pg_%' AND cn.nspname<>'information_schema' AND a.attnum>0 AND NOT a.attisdropped AND tn.nspname<>'pg_catalog'"):
        require(connection.execute(query).fetchone()[0] == 0, "AUTONOMOUS_DATABASE_OBJECT_REFUSED")


def fingerprint(connection, *, exclude_analytics=False):
    """Application rows never leave PostgreSQL: only counts and SHA aggregates."""
    from psycopg import sql
    tables = connection.execute("""SELECT n.nspname,c.relname,pg_get_userbyid(c.relowner)
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE c.relkind IN ('r','p') AND n.nspname NOT LIKE 'pg_%'
        AND n.nspname <> 'information_schema' ORDER BY n.nspname,c.relname""").fetchall()
    result = {}
    for schema, table, owner in tables:
        if (schema, table) == ("public", "alembic_version") or (exclude_analytics and schema == "public" and table in ANALYTICS):
            continue
        query = sql.SQL("SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') "
                        "FROM {}.{} t ORDER BY 1").format(sql.Identifier(schema), sql.Identifier(table))
        digest, count = hashlib.sha256(), 0
        with connection.cursor(name="sync_fp_" + uuid.uuid4().hex) as cursor:
            cursor.execute(query)
            for (row_hash,) in cursor:
                digest.update(row_hash.encode("ascii") + b"\n")
                count += 1
        result[schema + "." + table] = {"count": count, "sha256": digest.hexdigest(), "owner": owner}
    require({"public." + t for t in PRICE_TABLES}.issubset(result), "ORDER_PRICE_TABLES_REQUIRED")
    return result


def schema_fingerprint(connection):
    """Full table properties/columns/defaults/CHECK/FK/index facts; no row values."""
    result = {}
    tables = connection.execute("""SELECT c.oid,n.nspname,c.relname,pg_get_userbyid(c.relowner),
        c.relkind,c.relpersistence,c.relrowsecurity,c.relforcerowsecurity
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE c.relkind IN ('r','p') AND n.nspname NOT LIKE 'pg_%'
        AND n.nspname <> 'information_schema' ORDER BY n.nspname,c.relname""").fetchall()
    for oid, schema, name, owner, kind, persistence, rls, force_rls in tables:
        columns = connection.execute("""SELECT a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,
            pg_get_expr(d.adbin,d.adrelid),a.attidentity,a.attgenerated,
            CASE WHEN a.attcollation=0 THEN NULL ELSE cn.nspname||'.'||co.collname END
            FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
            LEFT JOIN pg_collation co ON co.oid=a.attcollation LEFT JOIN pg_namespace cn ON cn.oid=co.collnamespace
            WHERE a.attrelid=%s AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum""", (oid,)).fetchall()
        constraints = connection.execute("""SELECT conname,contype,pg_get_constraintdef(oid,true),convalidated,
            condeferrable,condeferred,connoinherit,conislocal,coninhcount
            FROM pg_constraint WHERE conrelid=%s ORDER BY conname""", (oid,)).fetchall()
        indexes = connection.execute("""SELECT c.relname,pg_get_indexdef(i.indexrelid),pg_get_userbyid(c.relowner),
            i.indisvalid,i.indisready,i.indislive,i.indisreplident,c.reloptions,ts.spcname,am.amname,
            i.indisunique,i.indisprimary,i.indisexclusion,
            ARRAY(SELECT pg_get_indexdef(i.indexrelid,k,true) FROM generate_series(1,i.indnkeyatts) k),
            ARRAY(SELECT pg_get_indexdef(i.indexrelid,k,true) FROM generate_series(i.indnkeyatts+1,i.indnatts) k),
            pg_get_expr(i.indpred,i.indrelid)
            FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_am am ON am.oid=c.relam
            LEFT JOIN pg_tablespace ts ON ts.oid=c.reltablespace WHERE i.indrelid=%s ORDER BY c.relname""", (oid,)).fetchall()
        result[schema + "." + name] = {"schema": schema, "table": name, "owner": owner, "kind": kind,
            "persistence": persistence, "rls": rls, "force_rls": force_rls,
            "columns": [list(row) for row in columns],
            "constraints": {row[0]: list(row[1:]) for row in constraints},
            "indexes": {row[0]: list(row[1:]) for row in indexes}}
    return result


def normalize_checks(connection, manifest):
    # pg_dump may make implicit array casts explicit. PostgreSQL reparses BOTH
    # definitions on clone-only TEMP LIKE tables: no regex stripping of casts.
    from psycopg import sql
    result = copy.deepcopy(manifest)
    for table in result.values():
        checks = {name: facts[1] for name, facts in table["constraints"].items() if facts[0] == "c"}
        if not checks:
            continue
        temporary = "sync_schema_" + uuid.uuid4().hex
        connection.execute(sql.SQL("CREATE TEMP TABLE {} (LIKE {}.{}) ON COMMIT DROP").format(
            sql.Identifier(temporary), sql.Identifier(table["schema"]), sql.Identifier(table["table"])))
        for name, definition in checks.items():
            connection.execute(sql.SQL("ALTER TABLE pg_temp.{} ADD CONSTRAINT {} {}").format(
                sql.Identifier(temporary), sql.Identifier(name), sql.SQL(definition)))
        normalized = dict(connection.execute("""SELECT conname,pg_get_constraintdef(oid,true)
            FROM pg_constraint WHERE conrelid=to_regclass(%s) AND contype='c' ORDER BY conname""",
            ("pg_temp." + temporary,)).fetchall())
        require(set(normalized) == set(checks), "CHECK_SET_NORMALIZATION_CHANGED")
        for name, definition in normalized.items():
            table["constraints"][name][1] = definition
    return result


def sequences(connection, *, include_values=False, exclude_analytics=False):
    from psycopg import sql
    rows = connection.execute("""SELECT n.nspname,c.relname,pg_get_userbyid(c.relowner),s.seqtypid::regtype::text,
        s.seqstart,s.seqincrement,s.seqmax,s.seqmin,s.seqcache,s.seqcycle
        FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' ORDER BY n.nspname,c.relname""").fetchall()
    result = {}
    for schema, name, owner, *definition in rows:
        if exclude_analytics and schema == "public" and name in {t + "_id_seq" for t in ANALYTICS}:
            continue
        dependencies = connection.execute("""SELECT tn.nspname,t.relname,a.attname,d.deptype
            FROM pg_depend d JOIN pg_class s ON s.oid=d.objid JOIN pg_namespace sn ON sn.oid=s.relnamespace
            JOIN pg_class t ON t.oid=d.refobjid JOIN pg_namespace tn ON tn.oid=t.relnamespace
            JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=d.refobjsubid
            WHERE d.classid='pg_class'::regclass AND d.refclassid='pg_class'::regclass AND d.deptype IN ('a','i')
            AND sn.nspname=%s AND s.relname=%s ORDER BY tn.nspname,t.relname,a.attname,d.deptype""", (schema, name)).fetchall()
        facts = {"owner": owner, "definition": definition, "dependencies": dependencies}
        if include_values:
            facts["state"] = connection.execute(sql.SQL("SELECT last_value,is_called FROM {}.{}").format(
                sql.Identifier(schema), sql.Identifier(name))).fetchone()
        result[schema + "." + name] = json_hash(facts)
    return result


def price_invariants(connection):
    # Report counts only. No price formula, rounding, FX or historical order edits.
    queries = {
        "order_snapshot_mismatch": "SELECT count(*) FROM orders o LEFT JOIN commercial_price_snapshots s ON s.id=o.commercial_price_snapshot_id WHERE (o.pricing_mode='CANONICAL' AND s.id IS NULL) OR (o.pricing_mode='LEGACY' AND o.commercial_price_snapshot_id IS NOT NULL)",
        "visa_snapshot_orphan": "SELECT count(*) FROM visa_cases v LEFT JOIN commercial_price_snapshots s ON s.id=v.commercial_price_snapshot_id WHERE v.commercial_price_snapshot_id IS NOT NULL AND s.id IS NULL",
        "published_pointer_orphan": "SELECT count(*) FROM catalog_publication_pointer p LEFT JOIN catalog_publications q ON q.id=p.publication_id WHERE q.id IS NULL",
        "publication_version_orphan": "SELECT count(*) FROM catalog_publications p LEFT JOIN price_catalog_versions c ON c.id=p.catalog_version_id LEFT JOIN fx_market_snapshots f ON f.id=p.fx_snapshot_id WHERE c.id IS NULL OR f.id IS NULL",
        "immutable_snapshot_version_mismatch": "SELECT count(*) FROM commercial_price_snapshots s JOIN catalog_publications p ON p.id=s.publication_id WHERE s.catalog_version_id<>p.catalog_version_id OR s.fx_snapshot_id<>p.fx_snapshot_id",
    }
    counts = {name: connection.execute(query).fetchone()[0] for name, query in queries.items()}
    require(all(value == 0 for value in counts.values()), "PREEXISTING_ORDER_PRICE_INVARIANT_BLOCKER")
    return counts


def assert_isolated(connection, params):
    name = params["isolated_db"]
    require(CLONE_NAME.fullmatch(name) is not None and name != params["production_db"], "INVALID_CLONE_TARGET")
    facts = connection.execute("""SELECT current_database(),pg_get_userbyid(datdba),datconnlimit,
        shobj_description(oid,'pg_database') FROM pg_database WHERE datname=current_database()""").fetchone()
    require(facts == (name, "postgres", 0, params["clone_marker"]), "CLONE_IDENTITY_GUARD_FAILED")
    require(not connection.execute("SELECT has_database_privilege(%s,%s,'CONNECT')",
                                   (params["runtime_role"], name)).fetchone()[0], "RUNTIME_CAN_CONNECT_TO_CLONE")


def analytics_pristine(connection, runtime_role):
    from psycopg import sql
    schema = schema_fingerprint(connection)
    for table in ANALYTICS:
        facts = schema.get("public." + table)
        require(facts is not None and facts["owner"] == runtime_role and facts["kind"] == "r"
                and not facts["rls"] and not facts["force_rls"], "ANALYTICS_SCHEMA_OWNER_MISMATCH")
        count = connection.execute(sql.SQL("SELECT count(*) FROM public.{}").format(sql.Identifier(table))).fetchone()[0]
        require(count == (1 if table == "analytics_policy" else 0), "ANALYTICS_HISTORY_NOT_PRISTINE")
    policy = connection.execute("""SELECT id,revision,enabled,privacy_notice_version,allowed_content_ids,
        allowed_service_ids,allowed_campaign_codes FROM public.analytics_policy""").fetchall()
    require(policy == [(1, 0, False, None, [], [], [])], "ANALYTICS_ACTIVATED_OR_POLICY_CHANGED")
    expected = {"public." + t + "_id_seq" for t in ANALYTICS}
    current = set(sequences(connection))
    require(expected.issubset(current), "ANALYTICS_SEQUENCE_MISSING")
    for table in ANALYTICS:
        name = table + "_id_seq"
        owner = connection.execute("SELECT pg_get_userbyid(c.relowner) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=%s", (name,)).fetchone()
        require(owner == (runtime_role,), "ANALYTICS_SEQUENCE_OWNER_MISMATCH")
        require(connection.execute(sql.SQL("SELECT last_value,is_called FROM public.{}").format(sql.Identifier(name))).fetchone() == (1, False),
                "ANALYTICS_SEQUENCE_ALREADY_USED")
    return {key: value for key, value in schema.items() if key.removeprefix("public.") in ANALYTICS}


def pg_command(params, binary, *arguments):
    return [binary, "--host", "/var/run/postgresql", "--port", str(params["pg_port"]),
            "--username", "postgres", "--no-password", *arguments]


def emit(value):
    print(MARKER + json.dumps(value, sort_keys=True), file=sys.stderr, flush=True)


def worker(params):
    """Peer-only local postgres subprocess. Database names never come from argv."""
    import pwd
    require(sys.platform.startswith("linux") and os.geteuid() == pwd.getpwnam("postgres").pw_uid,
            "LOCAL_POSTGRES_OS_IDENTITY_REQUIRED")
    require(re.fullmatch(r"[A-Za-z0-9_]{1,63}", params["production_db"]) is not None
            and params["production_db"] not in {"postgres", "template0", "template1"}, "WORKER_PRODUCTION_NAME_INVALID")
    require(type(params["pg_port"]) is int and 1 <= params["pg_port"] <= 65535, "WORKER_PORT_INVALID")
    from psycopg import sql
    mode = params["mode"]
    if mode in {"inspect", "snapshot"}:
        with connect(params, params["production_db"], readonly=True) as connection:
            connection.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
            assert_source(connection, params)
            role = connection.execute("SELECT tableowner FROM pg_tables WHERE schemaname='public' AND tablename='users'").fetchone()[0]
            require(connection.execute("SELECT rolsuper FROM pg_roles WHERE rolname=%s", (role,)).fetchone() == (False,),
                    "RUNTIME_SUPERUSER_REFUSED")
            result = {"source_revision": BASE, "runtime_role": role,
                      "database_size_bytes": connection.execute("SELECT pg_database_size(current_database())").fetchone()[0],
                      "data_directory": connection.execute("SHOW data_directory").fetchone()[0]}
            if mode == "snapshot":
                snapshot = connection.execute("SELECT pg_export_snapshot()").fetchone()[0]
                result.update(tables=fingerprint(connection), schema=schema_fingerprint(connection),
                              sequences=sequences(connection), price_invariants=price_invariants(connection))
                subprocess.run(pg_command(params, "pg_dump", "--format=custom", "--lock-wait-timeout=10000",
                                          "--snapshot", snapshot, "--dbname", params["production_db"]),
                               stdout=sys.stdout.buffer, stderr=sys.stderr, check=True, timeout=600)
            emit(result)
        return
    if mode == "create-isolated":
        name = params["isolated_db"]
        require(CLONE_NAME.fullmatch(name) is not None and name != params["production_db"], "INVALID_NEW_CLONE_NAME")
        with connect(params, "postgres") as connection:
            connection.autocommit = True
            require(connection.execute("SELECT 1 FROM pg_database WHERE datname=%s", (name,)).fetchone() is None,
                    "CLONE_ALREADY_EXISTS_REFUSED")
            connection.execute(sql.SQL("CREATE DATABASE {} OWNER postgres TEMPLATE template0 CONNECTION LIMIT 0").format(sql.Identifier(name)))
            connection.execute(sql.SQL("REVOKE ALL ON DATABASE {} FROM PUBLIC").format(sql.Identifier(name)))
            connection.execute(sql.SQL("REVOKE ALL ON DATABASE {} FROM {}").format(sql.Identifier(name), sql.Identifier(params["runtime_role"])))
            connection.execute(sql.SQL("COMMENT ON DATABASE {} IS {}").format(sql.Identifier(name), sql.Literal(params["clone_marker"])))
        emit({"created": True})
        return
    require(mode == "verify-isolated", "UNKNOWN_WORKER_MODE")
    baseline = params["baseline"]
    with connect(params, params["isolated_db"]) as connection:
        assert_isolated(connection, params)
        require(revision(connection) == BASE, "RESTORED_REVISION_MISMATCH")
        require(fingerprint(connection) == baseline["tables"], "RESTORE_TABLE_COUNTS_HASH_MISMATCH")
        normalized_base = normalize_checks(connection, baseline["schema"])
        require(normalize_checks(connection, schema_fingerprint(connection)) == normalized_base, "RESTORE_SCHEMA_MISMATCH")
        require(sequences(connection) == baseline["sequences"], "RESTORE_SEQUENCE_STRUCTURE_MISMATCH")
        require(price_invariants(connection) == baseline["price_invariants"], "RESTORE_PRICE_INVARIANT_MISMATCH")
        # Counters are not MVCC: use the state actually restored by pg_dump.
        restored_sequences = sequences(connection, include_values=True)
    source = params["migration_source"]
    require(sha256(source.encode()) == PINS[HEAD], "EXECUTED_MIGRATION_HASH_MISMATCH")
    namespace = {"__name__": "reviewed_sync_migration", "__file__": "sha_pinned_a7_migration.py"}
    exec(compile(source, "sha_pinned_a7_migration.py", "exec"), namespace)
    require(namespace["revision"] == HEAD and namespace["down_revision"] == BASE, "EXECUTED_CHAIN_MISMATCH")
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    import sqlalchemy as sa
    engine = sa.create_engine("postgresql+psycopg://", creator=lambda: connect(params, params["isolated_db"]))
    steps, analytics_schema, refused = [], None, []
    try:
        for operation, old, new in (("upgrade", BASE, HEAD), ("downgrade", HEAD, BASE), ("upgrade", BASE, HEAD)):
            with engine.begin() as connection:
                raw = connection.connection.driver_connection
                assert_isolated(raw, params)
                require(revision(raw) == old, "CLONE_STEP_REVISION_MISMATCH")
                if operation == "downgrade":
                    analytics_pristine(raw, params["runtime_role"])
                    # Both policy editing and retained consent history must refuse
                    # schema reversal. Savepoints + explicit id avoid sequence use.
                    for mutation, expected in (
                        ("UPDATE analytics_policy SET revision=1 WHERE id=1", "Analytics policy history exists; retain additive schema for rollback"),
                        ("INSERT INTO analytics_consents (id,token_hash,session_key,policy_revision,granted_at,expires_at) VALUES (777,'" + "a" * 64 + "','" + "b" * 32 + "',0,now(),now()+interval '1 day')", "Analytics history exists; retain additive schema for rollback"),
                    ):
                        savepoint = connection.begin_nested()
                        try:
                            connection.execute(sa.text(mutation))
                            try:
                                with Operations.context(MigrationContext.configure(connection)):
                                    namespace["downgrade"]()
                            except RuntimeError as error:
                                require(str(error) == expected, "DOWNGRADE_GUARD_UNEXPECTED_ERROR")
                            else:
                                raise ProofError("USED_ANALYTICS_DOWNGRADE_NOT_REFUSED")
                        finally:
                            savepoint.rollback()
                        analytics_pristine(raw, params["runtime_role"])
                        require(revision(raw) == HEAD, "GUARD_TEST_CHANGED_REVISION")
                        refused.append(True)
                with Operations.context(MigrationContext.configure(connection)):
                    namespace[operation]()
                changed = connection.execute(sa.text("UPDATE public.alembic_version SET version_num=:new WHERE version_num=:old"),
                                             {"old": old, "new": new})
                require(changed.rowcount == 1, "NON_SINGULAR_VERSION_UPDATE")
            with connect(params, params["isolated_db"]) as check:
                assert_isolated(check, params)
                require(revision(check) == new, "CLONE_POST_STEP_REVISION_MISMATCH")
                upgraded = new == HEAD
                require(fingerprint(check, exclude_analytics=upgraded) == baseline["tables"], "ORIGINAL_DATA_CHANGED")
                require(sequences(check, include_values=True, exclude_analytics=upgraded) == restored_sequences,
                        "ORIGINAL_SEQUENCE_STATE_CHANGED")
                current_schema = normalize_checks(check, schema_fingerprint(check))
                added = {key: current_schema.pop(key) for key in list(current_schema)
                         if key.removeprefix("public.") in ANALYTICS} if upgraded else {}
                require(current_schema == normalized_base, "ORIGINAL_SCHEMA_CHANGED")
                require(price_invariants(check) == baseline["price_invariants"], "ORIGINAL_ORDER_PRICE_INVARIANT_CHANGED")
                if upgraded:
                    analytics_pristine(check, params["runtime_role"])
                    if analytics_schema is None:
                        analytics_schema = added
                    require(added == analytics_schema, "REPEATED_UPGRADE_SCHEMA_CHANGED")
                else:
                    require(all(check.execute("SELECT to_regclass(%s)", ("public." + t,)).fetchone()[0] is None
                                for t in ANALYTICS), "DOWNGRADE_DID_NOT_RESTORE_BASE")
                steps.append({"operation": operation, "revision": new, "original_table_data_equal": True,
                              "original_measured_table_schema_equal": True, "original_sequences_equal": True,
                              "order_price_invariants_equal": True})
    finally:
        engine.dispose()
    emit({"result": "PASS", "restore_measured_tables_equal": True, "steps": steps,
          "original_tables": len(baseline["tables"]), "original_sequence_count": len(restored_sequences),
          "original_schema_sha256": json_hash(normalized_base), "original_data_sha256": json_hash(baseline["tables"]),
          "order_price_invariant_counts": baseline["price_invariants"], "analytics_disabled_pristine": True,
          "policy_and_consent_history_downgrade_refused": refused == [True, True],
          "runtime_cannot_connect_to_clone": True,
          "proof_scope": "Ordinary/partitioned table rows, table owners/columns/constraints/indexes/RLS flags; sequence structure/owner/restored counters; order-price reference invariants",
          "not_verified": ["Table/sequence/function ACL equality", "RLS policy definition equality",
                           "Function/view/trigger body equality", "Historical migration bootstrap",
                           "Production row equality after the exported snapshot"]})


def group_exists(group):
    try:
        os.killpg(group, 0)
        return True
    except ProcessLookupError:
        return False


def terminate_group(process, *, grace=5, kill_grace=5):
    """Reaping the leader never substitutes for checking its process group.

    Descendants can survive leader exit, ignore TERM, or race with a signal.
    Check group liveness independently; KILL all remaining members after grace.
    A zombie awaiting its OS parent may keep the group visible, so return an
    unconfirmed status after the bounded KILL wait rather than block forever.
    """
    def send(sig):
        try:
            os.killpg(process.pid, sig)
        except ProcessLookupError:
            pass

    def wait_group(seconds):
        until = time.monotonic() + seconds
        while True:
            process.poll()  # Reap our own leader, independently of descendants.
            if not group_exists(process.pid):
                return True
            remaining = until - time.monotonic()
            if remaining <= 0:
                return False
            time.sleep(min(0.05, remaining))

    send(signal.SIGTERM)
    if wait_group(grace):
        return True
    send(signal.SIGKILL)
    return wait_group(kill_grace)


def safe_run(command, *, stdout, stderr, input_bytes=None, stdin=None, timeout=900):
    # No inherited passwords/tokens/PG* settings; bound descendants too.
    process = subprocess.Popen(command, stdout=stdout, stderr=stderr,
        stdin=subprocess.PIPE if input_bytes is not None else stdin, start_new_session=True,
        env={"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "LANG": "C.UTF-8"})
    try:
        process.communicate(input=input_bytes, timeout=timeout)
    except BaseException as error:
        try:
            stopped = terminate_group(process)
        except BaseException:
            stopped = False
        if not stopped:
            print("PROCESS_GROUP_CLEANUP_UNCONFIRMED", file=sys.stderr, flush=True)
        if isinstance(error, subprocess.TimeoutExpired):
            raise ProofError("BOUNDED_PROCESS_TIMEOUT") from None
        raise
    require(process.returncode == 0, "PROCESS_FAILED_PRIVATE_LOG_RETAINED")


def write_json(path, value):
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w") as output:
        json.dump(value, output, sort_keys=True, indent=2)
        output.write("\n")


def checksums(directory, filename):
    lines = []
    for path in sorted(directory.iterdir()):
        if path.name == filename:
            continue
        regular(path, private=True)
        digest = hashlib.sha256()
        with path.open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024**2), b""):
                digest.update(chunk)
        lines.append(digest.hexdigest() + "  " + path.name)
    descriptor = os.open(directory / filename, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w") as output:
        output.write("\n".join(lines) + "\n")


def run_worker(params, backup, stage, *, dump=None):
    log_path = backup / (stage + ".private.log")
    with log_path.open("xb") as log:
        with (dump.open("xb") if dump is not None else open(os.devnull, "wb")) as output:
            safe_run(["runuser", "-u", "postgres", "--", sys.executable, "-c", Path(__file__).read_text(), "--worker"],
                     stdout=output, stderr=log, input_bytes=json.dumps(params).encode())
    results = [line[len(MARKER):] for line in log_path.read_text().splitlines() if line.startswith(MARKER)]
    require(len(results) == 1, "WORKER_RESULT_COUNT_MISMATCH")
    return json.loads(results[0])


def private_parent(path):
    require(not any(p.is_symlink() for p in (path, *path.parents)), "PRIVATE_DIRECTORY_SYMLINK")
    if not path.exists():
        path.mkdir(mode=0o700, parents=False)
    info = path.stat()
    require(stat.S_ISDIR(info.st_mode) and info.st_uid == os.geteuid() and not info.st_mode & 0o077,
            "PRIVATE_DIRECTORY_REQUIRED")


def deadline(_signum, _frame):
    raise ProofError("TOTAL_EXECUTION_DEADLINE")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidate-root", type=Path, required=True, help="Immutable candidate Git checkout outside the live checkout")
    parser.add_argument("--candidate-sha", required=True, help="Exact independently reviewed 40-character Git commit")
    parser.add_argument("--write-review-manifest", type=Path, help="OFFLINE preparation only: new 0600 manifest; does not connect to any database")
    parser.add_argument("--review-manifest", type=Path, help="Root-private independently reviewed source manifest")
    parser.add_argument("--review-manifest-sha256", help="Pinned manifest byte checksum from independent review")
    parser.add_argument("--execute-reviewed-verification", action="store_true")
    parser.add_argument("--runtime-mapping-confirmed", action="store_true", help="Operator confirmed effective systemd DB mapping and local peer cluster")
    args = parser.parse_args()
    candidate = args.candidate_root.absolute()
    require(not candidate.is_symlink(), "CANDIDATE_SYMLINK_REFUSED")
    candidate = candidate.resolve(strict=True)
    manifest, sources = source_manifest(candidate, args.candidate_sha)
    if args.write_review_manifest is not None:
        require(not args.execute_reviewed_verification and args.review_manifest is None, "PREPARE_EXECUTION_FLAGS_CONFLICT")
        private_parent(args.write_review_manifest.absolute().parent)
        write_json(args.write_review_manifest.absolute(), manifest)
        print("REVIEW_MANIFEST_SHA256=" + sha256(args.write_review_manifest.read_bytes()))
        print("Offline source manifest only. No database, network, migration or service operation performed.")
        return
    require(args.execute_reviewed_verification and args.runtime_mapping_confirmed, "EXPLICIT_REVIEWED_EXECUTION_REQUIRED")
    require(sys.platform.startswith("linux") and os.geteuid() == 0, "LINUX_ROOT_REQUIRED")
    require(args.review_manifest is not None and args.review_manifest_sha256 is not None, "REVIEW_MANIFEST_REQUIRED")
    regular(args.review_manifest.absolute(), private=True)
    data = args.review_manifest.read_bytes()
    require(sha256(data) == args.review_manifest_sha256, "REVIEW_MANIFEST_CHECKSUM_MISMATCH")
    validate_manifest(json.loads(data), manifest, args.review_manifest_sha256)
    repo = LIVE_ROOT.resolve(strict=True)
    require(not candidate.is_relative_to(repo) and not repo.is_relative_to(candidate), "CANDIDATE_OVERLAPS_LIVE_ROOT")
    require(git(repo, "rev-parse", "HEAD").decode().strip() == LIVE_SHA, "LIVE_SOURCE_SHA_CHANGED")
    require(not git(repo, "status", "--porcelain", "--untracked-files=normal"), "LIVE_SOURCE_DIRTY_REQUIRES_REVIEW")
    config = repo / BACKEND / ".env"
    for path in (config, repo / BOT / ".env"):
        info = regular(path)
        require(info.st_uid == 0 and not info.st_mode & 0o027, "PRODUCTION_CONFIG_PERMISSIONS_UNSAFE")
    # Parse config only, never source it/import settings or disclose URL/password.
    from dotenv import dotenv_values
    from sqlalchemy.engine import make_url
    url = make_url(dotenv_values(config, interpolate=False).get("DATABASE_URL", ""))
    require(url.get_backend_name() == "postgresql" and url.host in {None, "127.0.0.1", "localhost", "::1"}
            and not url.query, "LOCAL_POSTGRES_MAPPING_REQUIRED")
    require(bool(url.database) and url.database not in {"postgres", "template0", "template1"}
            and re.fullmatch(r"[A-Za-z0-9_]{1,63}", url.database) is not None, "UNSAFE_PRODUCTION_DATABASE_NAME")
    require(url.port is None or 1 <= url.port <= 65535, "POSTGRES_PORT_INVALID")
    params = {"production_db": url.database, "pg_port": url.port or 5432}
    private_parent(BACKUP_PARENT)
    previous_umask = os.umask(0o077)
    previous_alarm_handler = signal.signal(signal.SIGALRM, deadline)
    signal.alarm(3600)
    backup = None
    try:
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        backup = Path(tempfile.mkdtemp(prefix="sync-" + timestamp + "-", dir=BACKUP_PARENT))
        write_json(backup / "intent.json", {"live_sha": LIVE_SHA, "candidate_sha": args.candidate_sha,
            "base": BASE, "head": HEAD, "review_manifest_sha256": args.review_manifest_sha256,
            "worker_sha256": sha256(Path(__file__).read_bytes()), "production_migration": False})
        inspection = run_worker({**params, "mode": "inspect"}, backup, "inspect")
        params["runtime_role"] = inspection["runtime_role"]
        require(url.username == params["runtime_role"], "RUNTIME_OWNER_MAPPING_MISMATCH")
        for volume in (BACKUP_PARENT, Path(inspection["data_directory"])):
            space = os.statvfs(volume)
            require(space.f_bavail * space.f_frsize >= max(2 * 1024**3, inspection["database_size_bytes"] * 3),
                    "INSUFFICIENT_BACKUP_OR_CLONE_SPACE")
        # Existing app data and secrets are backed up privately; no tar restore.
        for archive, paths, excludes in (
            ("runtime.tar.gz", [BACKEND, BOT], ["--exclude=.venv", "--exclude=__pycache__", "--exclude=*.pyc", "--exclude=.env"]),
            ("env.tar.gz", [BACKEND + "/.env", BOT + "/.env"], []),
        ):
            with (backup / (archive + ".private.log")).open("xb") as log:
                safe_run(["tar", "--create", "--gzip", "--numeric-owner", "--file", str(backup / archive),
                          "--directory", str(repo), *excludes, *paths], stdout=log, stderr=log)
        baseline = run_worker({**params, "mode": "snapshot"}, backup, "snapshot", dump=backup / "database.dump")
        write_json(backup / "baseline.private.json", baseline)
        checksums(backup, "BACKUP_SHA256SUMS")
        isolated = "bali_sync_verify_" + uuid.uuid4().hex[:24]
        params.update(isolated_db=isolated, clone_marker="SAFR SYNC isolated proof " + isolated,
                      baseline=baseline, migration_source=next(s for n, s in sources.items() if n.startswith(HEAD + "_")))
        write_json(backup / "clone-target.private.json", {"database": isolated, "marker": params["clone_marker"], "retained": True})
        run_worker({**params, "mode": "create-isolated"}, backup, "create-isolated")
        with (backup / "restore.private.log").open("xb") as log, (backup / "database.dump").open("rb") as dump:
            safe_run(["runuser", "-u", "postgres", "--", *pg_command(params, "pg_restore", "--exit-on-error",
                     "--single-transaction", "--dbname", isolated)], stdout=log, stderr=log, stdin=dump)
        proof = run_worker({**params, "mode": "verify-isolated"}, backup, "verify-isolated")
        after = run_worker({**params, "mode": "inspect"}, backup, "source-after")
        require(after["source_revision"] == BASE and after["runtime_role"] == params["runtime_role"], "PRODUCTION_SCHEMA_OR_OWNER_CHANGED")
        require(git(repo, "rev-parse", "HEAD").decode().strip() == LIVE_SHA, "PRODUCTION_SOURCE_CHANGED_DURING_PROOF")
        require(source_manifest(candidate, args.candidate_sha)[0] == manifest, "CANDIDATE_CHANGED_DURING_PROOF")
        proof.update(live_sha=LIVE_SHA, candidate_sha=args.candidate_sha,
            full_migration_graph_verified=len(PINS), pending_chain=[BASE, HEAD], production_revision_after=BASE,
            migration_sha256=PINS[HEAD], review_manifest_sha256=args.review_manifest_sha256,
            backup_retained=True, isolated_database_retained=True, production_migrated=False)
        write_json(backup / "proof.private.json", proof)
        checksums(backup, "SHA256SUMS")
        print("PASS: backup/restore and isolated c8/a7 U-D-U; original table row hashes and measured table-schema/order-price invariants preserved.")
        print("Scope excludes ACL/RLS-policy/function/view/trigger-body equality; see private proof limitations.")
        print("Analytics remains disabled. Production unchanged. Private backup and clone retained for operator review.")
        print("PRIVATE_RUN_DIRECTORY=" + str(backup))
    except BaseException:
        if backup is not None:
            # Retain and checksum even partial failed proof; never remove anything.
            try:
                checksums(backup, "FAILED_SHA256SUMS")
            except BaseException:
                pass
        raise
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, previous_alarm_handler)
        os.umask(previous_umask)


if __name__ == "__main__":
    try:
        if sys.argv[1:] == ["--worker"]:
            worker(json.load(sys.stdin))
        else:
            main()
    except SystemExit:
        raise
    except BaseException as error:
        # No arbitrary exception text/traceback/SQL/config can reach stdout/stderr.
        code = str(error) if type(error) is ProofError else "INTERNAL_ERROR_" + type(error).__name__
        print("Verification stopped: " + code + "; private artifacts retained; no cleanup attempted.", file=sys.stderr)
        sys.exit(1)
