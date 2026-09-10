"""Opt-in readiness outage/recovery against an owned ephemeral PostgreSQL cluster.

Set BALI_TEST_POSTGRES_BIN to a directory containing initdb and pg_ctl.
No existing cluster, DATABASE_URL, application tables or credentials are used.
"""
import asyncio
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import unittest
from unittest.mock import patch

import httpx
from sqlalchemy import create_engine
from sqlalchemy.pool import NullPool

from app.db import session
from app.main import app


@unittest.skipUnless(os.environ.get("BALI_TEST_POSTGRES_BIN"), "Requires opt-in local PostgreSQL binaries")
class PostgreSQLReadinessTests(unittest.IsolatedAsyncioTestCase):
    async def test_owned_cluster_outage_and_recovery(self):
        binaries = Path(os.environ["BALI_TEST_POSTGRES_BIN"])
        postgres_env = {**os.environ, "LC_ALL": "C"}
        with tempfile.TemporaryDirectory(prefix="bali-readiness-") as directory:
            cluster = Path(directory) / "data"
            with socket.socket() as listener:
                listener.bind(("127.0.0.1", 0))
                port = listener.getsockname()[1]
            def control(*args):
                try:
                    subprocess.run([str(binaries / "pg_ctl"), "-D", str(cluster), "-w", "-t", "10", *args],
                                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=15, env=postgres_env)
                except subprocess.CalledProcessError as error:
                    log = Path(directory) / "postgres.log"
                    # This cluster contains no application data or production credentials.
                    detail = log.read_text()[-3000:] if log.exists() else error.stderr.decode()
                    raise RuntimeError("Synthetic PostgreSQL control failed: " + detail) from None
            subprocess.run([str(binaries / "initdb"), "-D", str(cluster), "-A", "trust", "-U", "readiness_test", "--no-locale", "--encoding=UTF8"],
                           check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=30, env=postgres_env)
            options = f"-h 127.0.0.1 -p {port} -k {directory}"
            control("-l", str(Path(directory) / "postgres.log"), "-o", options, "start")
            probe_engine = create_engine(
                f"postgresql+psycopg://readiness_test@127.0.0.1:{port}/postgres",
                poolclass=NullPool, connect_args={"connect_timeout": 2, "options": "-c statement_timeout=2000"},
            )
            try:
                with patch.object(session, "_readiness_engine", probe_engine), patch.object(session, "_probe_future", None):
                    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
                        self.assertEqual((await client.get("/db/health")).status_code, 200)
                        await asyncio.to_thread(control, "-m", "fast", "stop")
                        started = time.monotonic()
                        self.assertEqual((await client.get("/db/health")).status_code, 503)
                        self.assertLess(time.monotonic() - started, 3)
                        self.assertEqual((await client.get("/health")).status_code, 200)
                        await asyncio.to_thread(control, "-l", str(Path(directory) / "postgres.log"), "-o", options, "start")
                        self.assertEqual((await client.get("/db/health")).status_code, 200)
            finally:
                probe_engine.dispose()
                if (cluster / "postmaster.pid").exists():
                    control("-m", "fast", "stop")
