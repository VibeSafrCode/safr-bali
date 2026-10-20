"""Standard-library-only runner guards; no DB, sockets, subprocesses or installs."""

import io
import os
from pathlib import Path
import signal
import stat
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, patch
import xml.etree.ElementTree as ET

from tests import run_ui10_owned_postgres as runner


class OwnedLayoutTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix=runner.PREFIX)
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name).resolve(strict=True)
        self.socket = self.root / "socket"
        self.socket.mkdir(mode=0o700)

    def test_current_platform_private_temp_layout_is_allowed(self):
        self.assertEqual(runner.validate_owned_layout(self.socket), self.root)

    def test_relative_and_wrong_socket_name_are_denied(self):
        for path in (Path("socket"), self.root / "different"):
            with self.subTest(path=path), self.assertRaises(runner.RunnerError):
                runner.validate_owned_layout(path)

    def test_other_namespace_is_denied_even_when_private(self):
        with tempfile.TemporaryDirectory(prefix="different-test-") as directory:
            socket = Path(directory).resolve() / "socket"
            socket.mkdir(mode=0o700)
            with self.assertRaises(runner.RunnerError):
                runner.validate_owned_layout(socket)

    def test_nonprivate_root_and_socket_are_denied(self):
        for directory in (self.root, self.socket):
            with self.subTest(directory=directory):
                directory.chmod(0o755)
                try:
                    with self.assertRaises(runner.RunnerError):
                        runner.validate_owned_layout(self.socket)
                finally:
                    directory.chmod(0o700)

    def test_socket_symlink_is_denied(self):
        target = self.root / "real-socket"
        self.socket.rename(target)
        self.socket.symlink_to(target, target_is_directory=True)
        with self.assertRaises(runner.RunnerError):
            runner.validate_owned_layout(self.socket)

    def test_root_symlink_is_denied(self):
        alias = self.root.parent / (self.root.name + "-alias")
        alias.symlink_to(self.root, target_is_directory=True)
        self.addCleanup(alias.unlink)
        with self.assertRaises(runner.RunnerError):
            runner.validate_owned_layout(alias / "socket")

    def test_foreign_uid_is_denied(self):
        current = os.getuid()
        with patch.object(runner.os, "getuid", return_value=current + 1):
            with self.assertRaises(runner.RunnerError):
                runner.validate_owned_layout(self.socket)

    def test_unstarted_cleanup_never_invokes_pg_control(self):
        with patch.object(runner, "command") as command:
            runner.stop_owned(self.root, Path("/unused"), {}, False)
        command.assert_not_called()
        self.assertTrue(self.root.is_dir())

    def test_unexpected_pid_before_start_retains_evidence(self):
        cluster = self.root / "data"
        cluster.mkdir(mode=0o700)
        runner.write_exclusive(cluster / "postmaster.pid", b"99999999\n")
        with patch.object(runner, "command") as command:
            with self.assertRaises(runner.RunnerError):
                runner.stop_owned(self.root, Path("/unused"), {}, False)
        command.assert_not_called()
        self.assertTrue((cluster / "postmaster.pid").exists())

    def test_stopped_status_alone_does_not_hide_a_live_captured_pid(self):
        cluster = self.root / "data"
        cluster.mkdir(mode=0o700)
        pidfile = cluster / "postmaster.pid"
        runner.write_exclusive(pidfile, b"99999999\n")

        def control(label, *args, **kwargs):
            if label == "stop":
                pidfile.unlink()
                return 0
            return 0 if label == "status" else 3

        with patch.object(runner, "command", side_effect=control), \
                patch.object(runner, "pid_alive", return_value=True):
            with self.assertRaises(runner.RunnerError):
                runner.stop_owned(self.root, Path("/unused"), {}, True)
        self.assertTrue(cluster.is_dir())


class EnvironmentAndInventoryTests(unittest.TestCase):
    def test_environment_is_synthetic_and_does_not_copy_parent_config(self):
        inherited = {"DATABASE_URL": "DO-NOT-INHERIT", "PGOPTIONS": "DO-NOT-INHERIT",
                     "PGSERVICE": "DO-NOT-INHERIT", "PYTHONPATH": "DO-NOT-INHERIT",
                     "ADMIN_API_TOKEN": "DO-NOT-INHERIT", "UNRELATED_SECRET": "DO-NOT-INHERIT"}
        with patch.dict(os.environ, inherited):
            env = runner.child_environment(Path("/owned/temp"), Path("/explicit/pg"), "synthetic-owned-url")
        self.assertEqual(env["DATABASE_URL"], "synthetic-owned-url")
        self.assertEqual(env["SAFR_TEST_POSTGRES_URL"], env["DATABASE_URL"])
        self.assertEqual(env["PGPASSFILE"], "/owned/temp/empty.pgpass")
        self.assertEqual(env["TMPDIR"], "/owned")
        self.assertEqual(env["PYTHONPATH"], str(runner.BACKEND))
        self.assertNotIn("PGOPTIONS", env)
        self.assertNotIn("PGSERVICE", env)
        self.assertNotIn("UNRELATED_SECRET", env)
        self.assertNotIn("DO-NOT-INHERIT", env.values())
        self.assertTrue(env["WEBSITE_URL"].endswith(".invalid"))
        self.assertTrue(env["APPLICATION_URL"].endswith(".invalid"))

    def test_exact_source_inventory_retains_33_original_tests(self):
        cases = runner.expected_cases()
        self.assertEqual(len(cases), 33)
        self.assertIn(("test_client_ui_preference.PreferencePostgresTests",
                       "test_two_real_connections_same_base_have_exactly_one_winner"), cases)
        self.assertIn(("test_mini_client_ui_preference.MiniPreferencePostgresTests",
                       "test_actual_parallel_http_writes_have_one_winner"), cases)

    def test_missing_source_case_is_not_silently_accepted(self):
        with patch.object(runner.ast, "parse", return_value=ast_empty()):
            with self.assertRaises(runner.RunnerError):
                runner.expected_cases()

    def test_pytest_rootdir_and_exact_source_files_are_explicit(self):
        root = Path("/owned/fixture")
        args = runner.pytest_arguments(root)
        self.assertIn("--rootdir=" + str(runner.BACKEND), args)
        self.assertEqual([arg for arg in args if arg.endswith(".py")],
                         [str(file) for file in runner.TEST_FILES])
        self.assertEqual(args[-1], "--junitxml=/owned/fixture/proof.xml")


def ast_empty():
    import ast
    return ast.parse("")


class JUnitProofTests(unittest.TestCase):
    def setUp(self):
        self.expected = runner.expected_cases()

    def proof(self, cases=None):
        root = ET.Element("testsuites")
        suite = ET.SubElement(root, "testsuite")
        for classname, name in sorted(self.expected if cases is None else cases):
            ET.SubElement(suite, "testcase", classname="tests." + classname, name=name)
        return root

    def test_all_33_matching_cases_pass(self):
        runner.verify_junit(ET.tostring(self.proof()), self.expected)

    def test_skip_failure_or_error_is_never_pass(self):
        for tag in ("skipped", "failure", "error"):
            with self.subTest(tag=tag):
                proof = self.proof()
                ET.SubElement(next(proof.iter("testcase")), tag)
                with self.assertRaises(runner.RunnerError):
                    runner.verify_junit(ET.tostring(proof), self.expected)

    def test_missing_duplicate_and_foreign_cases_are_denied(self):
        cases = sorted(self.expected)
        variants = (cases[:-1], [*cases[:-1], cases[0]],
                    [*cases[:-1], ("test_foreign.Fixture", "test_not_ui10")])
        for variant in variants:
            with self.subTest(variant=variant[-1]), self.assertRaises(runner.RunnerError):
                runner.verify_junit(ET.tostring(self.proof(variant)), self.expected)

    def test_malformed_junit_is_denied(self):
        with self.assertRaises(runner.RunnerError):
            runner.verify_junit(b"not xml", self.expected)


class ProofOutputTests(unittest.TestCase):
    def test_exclusive_private_proof_does_not_overwrite(self):
        with tempfile.TemporaryDirectory(prefix="ui10-runner-output-") as directory:
            target = runner.output_path(str(Path(directory) / "receipt.json"))
            runner.write_exclusive(target, b"original")
            self.assertEqual(stat.S_IMODE(target.stat().st_mode), 0o600)
            with self.assertRaises(FileExistsError):
                runner.write_exclusive(target, b"replacement")
            self.assertEqual(target.read_bytes(), b"original")
            with self.assertRaises(runner.RunnerError):
                runner.output_path(str(target))

    def test_relative_and_existing_symlink_outputs_are_denied(self):
        with self.assertRaises(runner.RunnerError):
            runner.output_path("relative.xml")
        with tempfile.TemporaryDirectory(prefix="ui10-runner-output-") as directory:
            link = Path(directory) / "proof.xml"
            link.symlink_to(Path(directory) / "missing")
            with self.assertRaises(runner.RunnerError):
                runner.output_path(str(link))

    def test_invalid_cli_does_not_call_owned_runner(self):
        with patch.object(runner, "run_owned") as owned, patch("sys.stderr", new_callable=io.StringIO):
            with self.assertRaises(SystemExit) as raised:
                runner.main(["--postgres-bin", "/unused", "--junitxml", "relative.xml", "--receipt", "relative.json"])
        self.assertEqual(raised.exception.code, 2)
        owned.assert_not_called()


class ProcessDeadlineTests(unittest.TestCase):
    def test_failed_command_is_not_pass(self):
        process = Mock()
        process.wait.return_value = 1
        with patch.object(runner.subprocess, "Popen", return_value=process):
            with self.assertRaises(runner.RunnerError):
                runner.command("synthetic", ["/not-executed"], env={}, cwd="/unused", timeout=1)

    def test_timeout_terminates_only_the_owned_test_group(self):
        process = Mock(pid=456789)
        process.wait.side_effect = [subprocess.TimeoutExpired("synthetic", 1), 0]
        with patch.object(runner.subprocess, "Popen", return_value=process) as popen, \
                patch.object(runner.os, "killpg") as killpg:
            with self.assertRaises(runner.RunnerError):
                runner.command("synthetic", ["/not-executed"], env={}, cwd="/unused", timeout=1, test_group=True)
        self.assertTrue(popen.call_args.kwargs["start_new_session"])
        killpg.assert_called_once_with(456789, signal.SIGTERM)
        self.assertEqual(process.wait.call_args.kwargs["timeout"], runner.DEADLINES["child_exit"])

    def test_stubborn_owned_child_has_a_bounded_kill_fallback(self):
        process = Mock(pid=456789)
        process.wait.side_effect = [subprocess.TimeoutExpired("synthetic", 1),
                                    subprocess.TimeoutExpired("synthetic", 2), 0]
        with patch.object(runner.subprocess, "Popen", return_value=process), \
                patch.object(runner.os, "killpg") as killpg:
            with self.assertRaises(runner.RunnerError):
                runner.command("synthetic", ["/not-executed"], env={}, cwd="/unused", timeout=1, test_group=True)
        self.assertEqual([call.args for call in killpg.call_args_list],
                         [(456789, signal.SIGTERM), (456789, signal.SIGKILL)])


if __name__ == "__main__":
    unittest.main()
