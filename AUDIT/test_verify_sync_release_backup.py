"""Critical offline proof-worker contracts only; no DB/network/Git mutation."""
import importlib.util
import json
import os
from pathlib import Path
import signal
import stat
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, patch


SCRIPT = Path(__file__).with_name("verify-sync-release-backup.py")
spec = importlib.util.spec_from_file_location("sync_release_proof", SCRIPT)
proof = importlib.util.module_from_spec(spec)
spec.loader.exec_module(proof)
ROOT = SCRIPT.parents[1]


class OfflineContracts(unittest.TestCase):
    def migration_sources(self):
        return {p.name: p.read_text() for p in (ROOT / proof.BACKEND / "alembic/versions").glob("*.py")}

    def test_full_29_file_chain_is_pinned_and_read_without_execution(self):
        sources = self.migration_sources()
        chain = proof.graph_from_sources(sources)
        self.assertEqual(len(chain), 29)
        self.assertEqual(chain[-2:], [proof.BASE, proof.HEAD])
        self.assertEqual(chain[0], "5554c63c35ae")
        for value in proof.PINS.values():
            self.assertRegex(value, r"^[a-f0-9]{64}$")
        first = next(iter(sources))
        sources[first] += "\nprint('unreviewed')\n"
        with self.assertRaisesRegex(proof.ProofError, "MIGRATION_BYTES_NOT_REVIEWED"):
            proof.graph_from_sources(sources)

    def test_manifest_pins_commit_and_all_actual_runtime_bytes(self):
        with tempfile.TemporaryDirectory() as name:
            root = Path(name).resolve()
            committed = {proof.BACKEND + "/alembic/versions/" + p: s.encode()
                         for p, s in self.migration_sources().items()}
            sentinel = proof.BACKEND + "/app/main.py"
            committed[sentinel] = b"# synthetic inert runtime source\n"
            for path, source in committed.items():
                target = root / path
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(source)
            candidate = "a" * 40

            def fake_git(target, *args):
                self.assertEqual(target, root)
                if args == ("rev-parse", "--show-toplevel"):
                    return str(root).encode() + b"\n"
                if args == ("rev-parse", "HEAD"):
                    return candidate.encode() + b"\n"
                if args[0] == "ls-tree":
                    return "\0".join(committed).encode() + b"\0"
                if args[0] == "show":
                    return committed[args[1].split(":", 1)[1]]
                self.fail("Unexpected Git operation")

            with patch.object(proof, "git", fake_git):
                manifest, _ = proof.source_manifest(root, candidate)
                self.assertEqual(manifest["source_sha256"][sentinel], proof.sha256(committed[sentinel]))
                self.assertEqual(manifest["live_sha"], proof.LIVE_SHA)
                proof.validate_manifest(manifest, manifest, "b" * 64)
                altered = {**manifest, "candidate_sha": "c" * 40}
                with self.assertRaisesRegex(proof.ProofError, "SOURCE_MISMATCH"):
                    proof.validate_manifest(altered, manifest, "b" * 64)
                (root / sentinel).write_text("# changed uncommitted source\n")
                with self.assertRaisesRegex(proof.ProofError, "TRACKED_BYTES_CHANGED"):
                    proof.source_manifest(root, candidate)

    def test_untracked_migration_and_secret_paths_are_refused(self):
        for name in ("../outside.py", "/etc/passwd", proof.BACKEND + "/../escape.py",
                     proof.BACKEND + "/.env", proof.BOT + "/.env.local", "src/app.tsx"):
            with self.subTest(name=name), self.assertRaises(proof.ProofError):
                proof.safe_relative(name)
        self.assertEqual(proof.safe_relative(proof.BACKEND + "/.env.example").name, ".env.example")
        with self.assertRaisesRegex(proof.ProofError, "FULL_MIGRATION_SET_REQUIRED"):
            proof.graph_from_sources({})

    def test_private_outputs_checksums_and_symlink_refusal(self):
        with tempfile.TemporaryDirectory() as name:
            root = Path(name).resolve()
            proof.private_parent(root)
            target = root / "proof.json"
            proof.write_json(target, {"schema_base": proof.BASE, "count": 0})
            self.assertEqual(stat.S_IMODE(target.stat().st_mode), 0o600)
            proof.checksums(root, "SHA256SUMS")
            self.assertIn(proof.sha256(target.read_bytes()), (root / "SHA256SUMS").read_text())
            with self.assertRaises(FileExistsError):
                proof.write_json(target, {"overwrite": True})
            target.chmod(0o644)
            with self.assertRaisesRegex(proof.ProofError, "PRIVATE_FILE_REQUIRED"):
                proof.regular(target, private=True)
            link = root / "alias"
            link.symlink_to(target)
            with self.assertRaisesRegex(proof.ProofError, "SYMLINK_PATH"):
                proof.regular(link)

    def test_pg_argv_never_contains_password_and_restore_not_clean_or_create(self):
        argv = proof.pg_command({"pg_port": 5432}, "pg_restore", "--exit-on-error", "--single-transaction",
                                "--dbname", "bali_sync_verify_" + "a" * 24)
        self.assertIn("--no-password", argv)
        self.assertNotIn("--clean", argv)
        self.assertNotIn("--create", argv)
        self.assertNotIn("--password", argv)
        self.assertIn("/var/run/postgresql", argv)

    def test_process_group_timeout_and_environment_are_bounded(self):
        process = Mock(pid=34567)
        process.communicate.side_effect = subprocess.TimeoutExpired("synthetic", 0.01)
        with patch.object(proof.subprocess, "Popen", return_value=process) as popen, patch.object(proof, "terminate_group", return_value=True) as stop:
            with self.assertRaisesRegex(proof.ProofError, "BOUNDED_PROCESS_TIMEOUT"):
                proof.safe_run(["synthetic"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=0.01)
            self.assertEqual(popen.call_args.kwargs["env"], {"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "LANG": "C.UTF-8"})
            self.assertTrue(popen.call_args.kwargs["start_new_session"])
            stop.assert_called_once_with(process)
        with self.assertRaisesRegex(proof.ProofError, "TOTAL_EXECUTION_DEADLINE"):
            proof.deadline(None, None)

    def test_exited_leader_does_not_hide_descendant_ignoring_sigterm(self):
        # Leader has exited/reaped, but signal-0 proves an ignoring descendant
        # remains in the group. It must receive KILL even though poll returns 0.
        process = Mock(pid=34567)
        process.poll.return_value = 0
        signals = []
        killed = False

        def kill_group(group, sig):
            nonlocal killed
            self.assertEqual(group, process.pid)
            signals.append(sig)
            if sig == signal.SIGKILL:
                killed = True
            elif sig == 0 and killed:
                raise ProcessLookupError()

        with patch.object(proof.os, "killpg", side_effect=kill_group):
            self.assertTrue(proof.terminate_group(process, grace=0, kill_grace=0))
        self.assertEqual(signals, [signal.SIGTERM, 0, signal.SIGKILL, 0])
        self.assertEqual(process.poll.call_count, 2)

    def test_group_signal_races_and_cleanup_failure_preserve_original_error(self):
        process = Mock(pid=34567)
        with patch.object(proof.os, "killpg", side_effect=ProcessLookupError):
            self.assertTrue(proof.terminate_group(process, grace=0, kill_grace=0))
        original = KeyboardInterrupt()
        process.communicate.side_effect = original
        with patch.object(proof.subprocess, "Popen", return_value=process), \
                patch.object(proof, "terminate_group", side_effect=PermissionError), patch.object(os.sys, "stderr"):
            with self.assertRaises(KeyboardInterrupt) as caught:
                proof.safe_run(["synthetic"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            self.assertIs(caught.exception, original)

    def test_clone_identity_and_runtime_connect_denial_are_required(self):
        name = "bali_sync_verify_" + "b" * 24
        params = {"isolated_db": name, "production_db": "synthetic_live", "runtime_role": "synthetic_runtime",
                  "clone_marker": "synthetic_marker"}
        connection = Mock()
        connection.execute.return_value.fetchone.side_effect = [(name, "postgres", 0, "synthetic_marker"), (False,)]
        proof.assert_isolated(connection, params)
        connection.execute.return_value.fetchone.side_effect = [(name, "postgres", 0, "synthetic_marker"), (True,)]
        with self.assertRaisesRegex(proof.ProofError, "RUNTIME_CAN_CONNECT"):
            proof.assert_isolated(connection, params)
        with self.assertRaisesRegex(proof.ProofError, "INVALID_CLONE_TARGET"):
            proof.assert_isolated(connection, {**params, "isolated_db": "synthetic_live"})

    def test_help_is_offline_and_explicit_release_gate_is_required(self):
        result = subprocess.run([os.sys.executable, str(SCRIPT), "--help"], capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 0)
        self.assertIn("--review-manifest-sha256", result.stdout)
        with patch.object(proof, "source_manifest", return_value=({}, {})), patch.object(proof.Path, "resolve", return_value=ROOT), \
                patch.object(os.sys, "argv", [str(SCRIPT), "--candidate-root", str(ROOT), "--candidate-sha", "a" * 40]):
            with self.assertRaisesRegex(proof.ProofError, "EXPLICIT_REVIEWED_EXECUTION_REQUIRED"):
                proof.main()


if __name__ == "__main__":
    unittest.main()
