"""Required UI10 CI lane on one newly owned Unix-socket-only PostgreSQL.

This module imports only the standard library until a separate, sanitized
probe/test child is launched. It never adopts DATABASE_URL, PG*, .env, an
existing cluster, or the general CI service database. Do not invoke before the
runner has been independently reviewed. Pure tests do not start PostgreSQL.
"""

import argparse
import ast
import hashlib
import json
import os
from pathlib import Path
import pwd
import shlex
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import time
from urllib.parse import quote
import xml.etree.ElementTree as ET


PREFIX = "safr-client-ui10-pg-20261014."
PORT = 55439
EXPECTED_TEST_COUNT = 33
BACKEND = Path(__file__).resolve().parents[1]
TEST_FILES = (
    BACKEND / "tests/test_client_ui_preference.py",
    BACKEND / "tests/test_mini_client_ui_preference.py",
)
DEADLINES = {"initdb": 30, "start": 15, "probe": 8, "pytest": 180,
             "status": 5, "stop": 15, "child_exit": 2}


class RunnerError(RuntimeError):
    pass


def validate_owned_layout(socket):
    """Portable temp root; retain private owner/mode/canonical-path guards."""
    socket = Path(socket)
    root = socket.parent
    try:
        valid = (
            socket.is_absolute() and socket.name == "socket"
            and root.parent == Path(tempfile.gettempdir()).resolve(strict=True)
            and root.name.startswith(PREFIX) and len(root.name) > len(PREFIX)
            and socket.resolve(strict=True) == socket
            and root.resolve(strict=True) == root
        )
        for directory in (root, socket):
            info = directory.lstat()
            valid = valid and stat.S_ISDIR(info.st_mode) and info.st_uid == os.getuid()
            valid = valid and info.st_mode & 0o077 == 0
        if not valid:
            raise RunnerError("Only owned private local test socket is allowed")
    except (OSError, ValueError):
        raise RunnerError("Only owned private local test socket is allowed") from None
    return root


def expected_cases():
    cases = set()
    for file in TEST_FILES:
        tree = ast.parse(file.read_text(encoding="utf-8"))
        for node in tree.body:
            if isinstance(node, ast.ClassDef):
                for method in node.body:
                    if isinstance(method, (ast.FunctionDef, ast.AsyncFunctionDef)) and method.name.startswith("test_"):
                        cases.add((file.stem + "." + node.name, method.name))
    if len(cases) != EXPECTED_TEST_COUNT:
        raise RunnerError("UI10 source test inventory changed; review the exact 33-test lane")
    return cases


def verify_junit(data, expected):
    try:
        root = ET.fromstring(data)
    except ET.ParseError:
        raise RunnerError("UI10 JUnit is missing or malformed") from None
    cases = list(root.iter("testcase"))
    actual = []
    for case in cases:
        if any(case.find(tag) is not None for tag in ("skipped", "failure", "error")):
            raise RunnerError("All 33 UI10 tests must PASS, not SKIP/error/failure")
        classname = case.get("classname", "")
        if classname.startswith("tests."):
            classname = classname[len("tests."):]
        actual.append((classname, case.get("name", "")))
    if len(actual) != EXPECTED_TEST_COUNT or len(set(actual)) != len(actual) or set(actual) != expected:
        raise RunnerError("UI10 JUnit must contain exactly the 33 source tests, once each")


def output_path(value):
    path = Path(value)
    if not path.is_absolute():
        raise RunnerError("Proof output must be an explicit absolute new file")
    try:
        parent = path.parent.resolve(strict=True)
    except OSError:
        raise RunnerError("Proof output parent must already exist") from None
    result = parent / path.name
    if not parent.is_dir() or result.exists() or result.is_symlink():
        raise RunnerError("Proof outputs must be new files; never overwrite existing evidence")
    return result


def write_exclusive(path, data):
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
    with os.fdopen(os.open(path, flags, 0o600), "wb") as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())


def child_environment(root, binaries, database_url):
    """Construct from scratch: no inherited production config or PG services."""
    return {
        "PATH": str(binaries) + os.pathsep + os.defpath,
        "LC_ALL": "C", "PYTHONPATH": str(BACKEND), "PYTHONDONTWRITEBYTECODE": "1",
        "PYTHONNOUSERSITE": "1", "PYTEST_DISABLE_PLUGIN_AUTOLOAD": "1",
        "TMPDIR": str(root.parent),
        "ENVIRONMENT": "test", "DEBUG": "false", "SQL_ECHO": "false",
        "DATABASE_URL": database_url, "SAFR_TEST_POSTGRES_URL": database_url,
        "PGPASSFILE": str(root / "empty.pgpass"),
        "PGSERVICEFILE": str(root / "empty.pgservice"),
        "PGSYSCONFDIR": str(root / "pg-sysconf"),
        "SAFR_UI10_EXPECTED_DATA_DIRECTORY": str(root / "data"),
        "SAFR_UI10_EXPECTED_SOCKET_DIRECTORY": str(root / "socket"),
        "SERVICE_API_TOKEN": "ui10-synthetic-service-" + "s" * 32,
        "ADMIN_API_TOKEN": "ui10-synthetic-admin-" + "a" * 32,
        "TELEGRAM_BOT_TOKEN": "123456789:" + "b" * 35,
        "TELEGRAM_BOT_USERNAME": "ui10_synthetic_bot", "DEFAULT_ADMIN_TELEGRAM_ID": "1",
        "WEBSITE_URL": "https://ui10-site.invalid", "APPLICATION_URL": "https://ui10-app.invalid",
        "MINI_APP_ORIGINS": "https://mini-fixture.invalid",
        "MINI_APP_COOKIE_SECURE": "true", "WEB_COOKIE_SECURE": "true",
        "YOGA_CHANNEL_ENABLED": "false", "BOT_MESSAGING_ENABLED": "false",
    }


SERVER_PROBE = r'''
import os
from pathlib import Path
import pwd
from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool
engine = create_engine(os.environ["DATABASE_URL"], poolclass=NullPool, connect_args={
    "connect_timeout": 2, "passfile": os.environ["PGPASSFILE"],
    "options": "-c statement_timeout=2000 -c lock_timeout=1000"})
try:
    with engine.connect() as connection:
        row = connection.execute(text("SELECT current_setting('listen_addresses'), current_user, "
            "current_database(), inet_server_addr(), current_setting('data_directory'), "
            "current_setting('port'), current_setting('unix_socket_directories')")).one()
        expected_data = Path(os.environ["SAFR_UI10_EXPECTED_DATA_DIRECTORY"])
        expected_socket = Path(os.environ["SAFR_UI10_EXPECTED_SOCKET_DIRECTORY"])
        if (row[0] != "" or row[1] != pwd.getpwuid(os.getuid()).pw_name
                or row[2] != "postgres" or row[3] is not None or row[5] != "55439"
                or Path(row[4]).resolve(strict=True) != expected_data
                or Path(row[6]).resolve(strict=True) != expected_socket):
            raise RuntimeError("UI10 owned PostgreSQL server identity mismatch")
finally:
    engine.dispose()
'''


def command(label, arguments, *, env, cwd, timeout, allowed=(0,), test_group=False, visible=False):
    process = subprocess.Popen(arguments, cwd=cwd, env=env, start_new_session=test_group,
        stdout=None if visible else subprocess.DEVNULL, stderr=None if visible else subprocess.DEVNULL)
    try:
        code = process.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        # Only the process/group created by THIS call. PostgreSQL itself is
        # stopped by pg_ctl against our exact owned data dir in the outer finally.
        if test_group:
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
        else:
            process.terminate()
        try:
            process.wait(timeout=DEADLINES["child_exit"])
        except subprocess.TimeoutExpired:
            if test_group:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
            else:
                process.kill()
            process.wait(timeout=DEADLINES["child_exit"])
        raise RunnerError(label + " exceeded its hard deadline") from None
    if code not in allowed:
        raise RunnerError(label + " failed with exit " + str(code))
    return code


def pid_alive(pid):
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


def pytest_arguments(root):
    # A caller's empty CWD must not make JUnit classnames depend on arbitrary
    # enclosing snapshot directory names. Keep the exact33 oracle strict.
    return [sys.executable, "-m", "pytest", "-q", "-o", "addopts=",
        "--rootdir=" + str(BACKEND), *(str(file) for file in TEST_FILES),
        "--junitxml=" + str(root / "proof.xml")]


def stop_owned(root, binaries, postgres_env, start_attempted):
    validate_owned_layout(root / "socket")
    cluster = root / "data"
    pidfile = cluster / "postmaster.pid"
    socketfile = root / "socket" / (".s.PGSQL." + str(PORT))
    if not start_attempted:
        if pidfile.exists() or socketfile.exists():
            raise RunnerError("Unexpected server before the owned start attempt; preserve evidence")
        return
    if not cluster.is_dir() or cluster.is_symlink() or cluster.resolve(strict=True) != cluster:
        raise RunnerError("Owned data directory identity changed; preserve evidence")
    pid = None
    if pidfile.exists():
        try:
            pid = int(pidfile.read_text(encoding="utf-8").splitlines()[0])
            if pid <= 1:
                raise ValueError
        except (OSError, ValueError, IndexError):
            raise RunnerError("Owned postmaster PID evidence is invalid; preserve data") from None
    arguments = [str(binaries / "pg_ctl"), "-D", str(cluster)]
    status = command("status", [*arguments, "status"], env=postgres_env, cwd=root,
        timeout=DEADLINES["status"], allowed=(0, 3))
    if status == 0 or pidfile.exists():
        command("stop", [*arguments, "-w", "-t", "10", "-m", "fast", "stop"],
            env=postgres_env, cwd=root, timeout=DEADLINES["stop"])
    command("stopped status", [*arguments, "status"], env=postgres_env, cwd=root,
        timeout=DEADLINES["status"], allowed=(3,))
    if pidfile.exists() or socketfile.exists() or (pid is not None and pid_alive(pid)):
        raise RunnerError("Owned PostgreSQL stop is unconfirmed; retain all data/evidence")


def run_owned(binaries, expected):
    result = {"schema_version": 1, "gate": "UI10_OWNED_POSTGRES", "status": "FAILED",
        "expected_test_count": EXPECTED_TEST_COUNT, "identity_verified": False,
        "tests_passed": False, "cluster_start_attempted": False, "cluster_stop_verified": False,
        "directory_cleanup_verified": False, "deadlines_seconds": dict(DEADLINES), "errors": []}
    began = time.monotonic()
    root = None
    proof = None
    try:
        if os.getuid() == 0:
            raise RunnerError("Owned PostgreSQL must run as the current non-root user")
        binaries = Path(binaries).resolve(strict=True)
        for executable in ("initdb", "pg_ctl"):
            if not (binaries / executable).is_file() or not os.access(binaries / executable, os.X_OK):
                raise RunnerError("Explicit local PostgreSQL binaries are required")
        root = Path(tempfile.mkdtemp(prefix=PREFIX)).resolve(strict=True)
        (root / "socket").mkdir(mode=0o700)
        validate_owned_layout(root / "socket")
        for name in ("working", "pg-sysconf"):
            (root / name).mkdir(mode=0o700)
        for name in ("empty.pgpass", "empty.pgservice"):
            write_exclusive(root / name, b"")
        postgres_env = {"PATH": str(binaries), "LC_ALL": "C"}
        cluster = root / "data"
        user = pwd.getpwuid(os.getuid()).pw_name
        url = ("postgresql+psycopg://" + quote(user, safe="") + "@/postgres?host="
               + quote(str(root / "socket"), safe="") + "&port=" + str(PORT))
        env = child_environment(root, binaries, url)
        command("initdb", [str(binaries / "initdb"), "-D", str(cluster), "--auth-local=peer", "--auth-host=reject", "-U", user,
            "--no-locale", "--encoding=UTF8"], env=postgres_env, cwd=root, timeout=DEADLINES["initdb"])
        result["cluster_start_attempted"] = True
        options = "-c listen_addresses='' -p " + str(PORT) + " -k " + shlex.quote(str(root / "socket"))
        command("start", [str(binaries / "pg_ctl"), "-D", str(cluster), "-w", "-t", "10",
            "-l", str(root / "postgres.log"), "-o", options, "start"],
            env=postgres_env, cwd=root, timeout=DEADLINES["start"])
        command("server identity probe", [sys.executable, "-c", SERVER_PROBE],
            env=env, cwd=root / "working", timeout=DEADLINES["probe"], test_group=True)
        result["identity_verified"] = True
        command("UI10 pytest", pytest_arguments(root),
            env=env, cwd=root / "working", timeout=DEADLINES["pytest"], test_group=True, visible=True)
        proof = (root / "proof.xml").read_bytes()
        verify_junit(proof, expected)
        result["tests_passed"] = True
        result["junit_sha256"] = hashlib.sha256(proof).hexdigest()
    except Exception as error:
        result["errors"].append(str(error) if isinstance(error, RunnerError) else type(error).__name__)
    finally:
        if root is not None:
            # Preserve a failing child's JUnit too; never turn it into PASS.
            report = root / "proof.xml"
            if proof is None and report.is_file() and not report.is_symlink():
                try:
                    proof = report.read_bytes()
                    result["junit_sha256"] = hashlib.sha256(proof).hexdigest()
                except OSError:
                    result["errors"].append("Owned JUnit could not be preserved")
            try:
                stop_owned(root, binaries, {"PATH": str(binaries), "LC_ALL": "C"}, result["cluster_start_attempted"])
                result["cluster_stop_verified"] = True
                # Never remove data when stop/identity verification is uncertain.
                shutil.rmtree(root)
                result["directory_cleanup_verified"] = not root.exists()
            except Exception as error:
                result["errors"].append(str(error) if isinstance(error, RunnerError) else type(error).__name__)
                result["retained_private_evidence_directory"] = str(root)
        result["elapsed_seconds"] = round(time.monotonic() - began, 3)
    if (result["tests_passed"] and result["identity_verified"] and result["cluster_stop_verified"]
            and result["directory_cleanup_verified"] and not result["errors"]):
        result["status"] = "PASS"
    return result, proof


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--postgres-bin", default=os.environ.get("BALI_TEST_POSTGRES_BIN"))
    parser.add_argument("--junitxml", required=True)
    parser.add_argument("--receipt", required=True)
    args = parser.parse_args(argv)
    try:
        if not args.postgres_bin:
            raise RunnerError("Explicit BALI_TEST_POSTGRES_BIN or --postgres-bin is required")
        junit = output_path(args.junitxml)
        receipt = output_path(args.receipt)
        if junit == receipt:
            raise RunnerError("JUnit and receipt must be different new files")
        expected = expected_cases()
    except (RunnerError, OSError) as error:
        parser.error(str(error))
    result, proof = run_owned(args.postgres_bin, expected)
    try:
        if proof is not None:
            write_exclusive(junit, proof)
        write_exclusive(receipt, (json.dumps(result, sort_keys=True, indent=2) + "\n").encode())
    except OSError:
        result["status"] = "FAILED"
        result["errors"].append("Exclusive proof output failed; existing evidence was not overwritten")
    print(json.dumps(result, sort_keys=True))
    return 0 if result["status"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
