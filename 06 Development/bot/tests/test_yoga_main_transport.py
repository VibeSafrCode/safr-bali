"""Offline only: synthetic env, private temp locks, fake Telegram/bridge."""
import ast
import asyncio
from contextlib import contextmanager
import logging
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, Mock, patch

from app import yoga_main_transport as runner


BOT = "123456:synthetic_bot_credential_1234567890"
KEY = "synthetic_backend_credential_1234567890"


def snapshot(directory, **changes):
    return dict(BOT_TOKEN=BOT, BACKEND_API_URL="http://127.0.0.1:8000",
        BACKEND_SERVICE_TOKEN=KEY, ADMIN_CHAT_ID="1", SUPPORT_CHAT_IDS="4",
        MANAGER_CHAT_IDS="2", VISA_ADMIN_CHAT_IDS="3", SPB_MANAGER_CHAT_IDS="",
        THAILAND_MANAGER_CHAT_IDS="", YOGA_CHANNEL_ENABLED="true",
        YOGA_TRANSPORT_OWNER_MODE="standalone-main-disabled",
        YOGA_TRANSPORT_STATE_DIR=str(directory)) | changes


class ConfigAndOwnershipTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.directory.chmod(0o700)

    def test_explicit_snapshot_and_secret_repr(self):
        config = runner.validate_config(snapshot(self.directory))
        self.assertEqual(config.settings_env["YOGA_CHANNEL_ENABLED"], "true")
        self.assertEqual(config.settings_env["ONBOARDING_REGISTRATION_HISTORY_VERIFIED"], "false")
        self.assertEqual(config.settings_env["MINI_APP_URL"], "")
        self.assertNotIn(BOT, repr(config)); self.assertNotIn(KEY, repr(config))

    def test_every_required_field_is_explicit_even_empty_lists(self):
        for key in runner.REQUIRED_FIELDS:
            env = snapshot(self.directory); del env[key]
            with self.subTest(key=key), self.assertRaises(runner.ConfigurationError):
                runner.validate_config(env)

    def test_owner_mode_and_enable_must_be_explicit(self):
        for change in [dict(YOGA_CHANNEL_ENABLED="false"), dict(YOGA_CHANNEL_ENABLED="True"),
                       dict(YOGA_TRANSPORT_OWNER_MODE="main-enabled")]:
            with self.subTest(change=change), self.assertRaises(runner.ConfigurationError):
                runner.validate_config(snapshot(self.directory, **change))

    def test_bad_credentials_never_appear_in_error(self):
        for change in [dict(BOT_TOKEN="bad_sensitive_value"), dict(BACKEND_SERVICE_TOKEN="secret short"),
                       dict(BACKEND_SERVICE_TOKEN=KEY+"\n")]:
            with self.subTest(key=next(iter(change))):
                with self.assertRaises(runner.ConfigurationError) as error:
                    runner.validate_config(snapshot(self.directory, **change))
                self.assertNotIn(next(iter(change.values())), str(error.exception))

    def test_only_explicit_loopback_http_origin(self):
        for url in ["https://public.invalid:8000", "http://localhost:8000", "http://127.0.0.1",
                    "http://127.0.0.1:8000/path", "http://user:secret@127.0.0.1:8000",
                    "http://127.0.0.1:8000?query", "http://127.0.0.1:8000#fragment",
                    "http://127.0.0.1:99999", "http://127.0.0.1:8000 "]:
            with self.subTest(url=url), self.assertRaises(runner.ConfigurationError):
                runner.validate_config(snapshot(self.directory, BACKEND_API_URL=url))
        runner.validate_config(snapshot(self.directory, BACKEND_API_URL="http://[::1]:8080/"))

    def test_positive_bounded_existing_recipients_only(self):
        for value in ["0", "-1", "abc", "true", "2,", "9223372036854775808", ",".join(["2"]*101)]:
            with self.subTest(value=value), self.assertRaises(runner.ConfigurationError):
                runner.validate_config(snapshot(self.directory, MANAGER_CHAT_IDS=value))
        config = runner.validate_config(snapshot(self.directory, MANAGER_CHAT_IDS="2, 2,3", SUPPORT_CHAT_IDS="1,4"))
        self.assertEqual(config.settings_env["MANAGER_CHAT_IDS"], "2,3")
        # Preserve existing overlaps: backend/bridge own role rejection.
        self.assertEqual(config.settings_env["SUPPORT_CHAT_IDS"], "1,4")

    def test_admin_is_exactly_one_positive_id(self):
        for value in ["", "0", "1,2"]:
            with self.subTest(value=value), self.assertRaises(runner.ConfigurationError):
                runner.validate_config(snapshot(self.directory, ADMIN_CHAT_ID=value))

    def test_unrelated_settings_are_not_enabled(self):
        for change in [dict(ONBOARDING_REGISTRATION_HISTORY_VERIFIED="true"), dict(MINI_APP_URL="https://other.invalid")]:
            with self.assertRaises(runner.ConfigurationError):
                runner.validate_config(snapshot(self.directory, **change))

    def test_private_state_directory_required(self):
        for value in ["relative", str(self.directory/"missing")]:
            with self.assertRaises(runner.ConfigurationError):
                runner.validate_config(snapshot(self.directory, YOGA_TRANSPORT_STATE_DIR=value))
        self.directory.chmod(0o755)
        with self.assertRaises(runner.ConfigurationError): runner.validate_config(snapshot(self.directory))
        self.directory.chmod(0o700)
        with patch.object(runner.os, "getuid", return_value=os.getuid()+1):
            with self.assertRaises(runner.ConfigurationError): runner.validate_config(snapshot(self.directory))

    def test_directory_and_dotenv_symlinks_fail_closed(self):
        link = self.directory/"link"; link.symlink_to(self.directory, target_is_directory=True)
        with self.assertRaises(runner.ConfigurationError):
            runner.validate_config(snapshot(link))
        dotenv = self.directory/".env"; dotenv.symlink_to(self.directory/"absent")
        with self.assertRaises(runner.ConfigurationError): runner.validate_config(snapshot(self.directory))

    def test_regular_dotenv_is_not_read(self):
        dotenv = self.directory/".env"; dotenv.write_text("not_a_real_secret")
        with self.assertRaises(runner.ConfigurationError): runner.validate_config(snapshot(self.directory))

    def test_check_config_does_not_import_runtime_or_create_lock(self):
        loader = Mock(side_effect=AssertionError("runtime must remain unloaded"))
        before = set(sys.modules)
        self.assertEqual(runner.main(["--check-config"], env=snapshot(self.directory), runtime_loader=loader), 0)
        loader.assert_not_called(); self.assertEqual(list(self.directory.iterdir()), [])
        self.assertNotIn("app.main", set(sys.modules)-before)
        self.assertNotIn("app.core.config", set(sys.modules)-before)

    def test_unknown_cli_and_bad_config_do_not_load_runtime(self):
        loader = Mock()
        self.assertEqual(runner.main(["--token", BOT], env={}, runtime_loader=loader), 64)
        with self.assertLogs(runner.logger, level="ERROR") as logs:
            self.assertEqual(runner.main([], env={}, runtime_loader=loader), 2)
        self.assertEqual(logs.output, ["ERROR:app.yoga_main_transport:yoga_transport_configuration_rejected"])
        loader.assert_not_called()

    def test_lock_is_private_unique_retained_and_released(self):
        lock_path = self.directory/"yoga-main-transport.lock"
        with runner.runtime_lock(self.directory):
            inode = lock_path.stat().st_ino
            self.assertEqual(lock_path.stat().st_mode & 0o777, 0o600)
            with self.assertRaises(runner.OwnershipError):
                with runner.runtime_lock(self.directory): pass
        with runner.runtime_lock(self.directory): self.assertEqual(lock_path.stat().st_ino, inode)
        self.assertTrue(lock_path.exists())

    def test_second_process_cannot_own_lock(self):
        code = ("from pathlib import Path; from app.yoga_main_transport import runtime_lock, OwnershipError; "
                "import sys\ntry:\n with runtime_lock(Path(sys.argv[1])): sys.exit(9)\nexcept OwnershipError: sys.exit(3)")
        with runner.runtime_lock(self.directory):
            result = subprocess.run([sys.executable, "-c", code, str(self.directory)], timeout=5,
                env={"PYTHONPATH":str(Path(__file__).resolve().parents[1]), "PYTHONDONTWRITEBYTECODE":"1"},
                capture_output=True)
        self.assertEqual(result.returncode, 3); self.assertEqual(result.stdout, b"")

    def test_symlink_hardlink_and_permission_drift_rejected(self):
        lock = self.directory/"yoga-main-transport.lock"
        target = self.directory/"target"; target.write_text("unchanged"); target.chmod(0o600)
        lock.symlink_to(target)
        with self.assertRaises(runner.OwnershipError):
            with runner.runtime_lock(self.directory): pass
        self.assertEqual(target.read_text(), "unchanged"); lock.unlink()
        os.link(target, lock)
        with self.assertRaises(runner.OwnershipError):
            with runner.runtime_lock(self.directory): pass
        lock.unlink(); target.unlink()
        lock.touch(mode=0o644)
        with self.assertRaises(runner.OwnershipError):
            with runner.runtime_lock(self.directory): pass

    def test_runtime_load_exception_releases_lock_and_logs_no_secret(self):
        loader = Mock(side_effect=RuntimeError(KEY))
        with self.assertLogs(runner.logger, level="ERROR") as logs:
            self.assertEqual(runner.main([], env=snapshot(self.directory), runtime_loader=loader), 1)
        self.assertNotIn(KEY, "\n".join(logs.output))
        with runner.runtime_lock(self.directory): pass

    def test_ownership_rejected_before_runtime_loading(self):
        loader = Mock()
        with runner.runtime_lock(self.directory), self.assertLogs(runner.logger, level="ERROR"):
            self.assertEqual(runner.main([], env=snapshot(self.directory), runtime_loader=loader), 3)
        loader.assert_not_called()

    def test_preloaded_settings_fail_closed_without_import(self):
        config = runner.validate_config(snapshot(self.directory))
        with patch.dict(sys.modules, {"app.core.config":SimpleNamespace()}):
            with self.assertRaisesRegex(runner.ConfigurationError, "settings_already_loaded"):
                runner.load_runtime(config)

    def _load_with_fake_imports(self, changes=None):
        config = runner.validate_config(snapshot(self.directory))
        settings_values = dict(config.settings_env)
        settings_values.update(ADMIN_CHAT_ID=1,YOGA_CHANNEL_ENABLED=True,ONBOARDING_REGISTRATION_HISTORY_VERIFIED=False)
        settings_values.update(changes or {})
        settings = SimpleNamespace(**settings_values)
        bot_factory,bridge = Mock(),AsyncMock()
        imports = []
        stdlib_import = __import__
        def fake_import(name, globals=None, locals=None, fromlist=(), level=0):
            # CPython pathlib may import ntpath while building the dotenv path.
            if name == "ntpath" and (globals or {}).get("__name__") == "pathlib" and level == 0:
                return stdlib_import(name, globals, locals, fromlist, level)
            imports.append(name)
            if name == "app.core.config": return SimpleNamespace(settings=settings)
            if name == "aiogram": return SimpleNamespace(Bot=bot_factory)
            if name == "app.services.yoga_chat_bridge": return SimpleNamespace(run_bridge=bridge)
            raise AssertionError("unexpected_runtime_import")
        before = Path.cwd()
        try:
            with patch.dict(os.environ, {}, clear=True), patch("builtins.__import__", side_effect=fake_import):
                factory,actual_bridge = runner.load_runtime(config)
                self.assertEqual(Path.cwd(),config.state_dir)
                self.assertEqual(os.environ["ONBOARDING_REGISTRATION_HISTORY_VERIFIED"],"false")
                self.assertEqual(os.environ["MINI_APP_URL"],"")
                factory(); bot_factory.assert_called_once_with(token=BOT)
                self.assertIs(actual_bridge,bridge)
        finally:
            os.chdir(before)
        return imports

    def test_lazy_runtime_loader_uses_only_normalized_snapshot_and_bridge(self):
        imports = self._load_with_fake_imports()
        self.assertEqual(imports,["app.core.config","aiogram","app.services.yoga_chat_bridge"])

    def test_existing_settings_mismatch_rejected_before_bot_or_bridge_import(self):
        with self.assertRaisesRegex(runner.ConfigurationError,"settings_snapshot_mismatch"):
            self._load_with_fake_imports(dict(BACKEND_SERVICE_TOKEN="different_synthetic_token"))

    def test_dotenv_created_after_validation_still_rejected(self):
        config = runner.validate_config(snapshot(self.directory))
        (self.directory/".env").write_text("synthetic_only")
        before = Path.cwd()
        try:
            with self.assertRaisesRegex(runner.ConfigurationError,"dotenv_not_allowed"):
                runner.load_runtime(config)
        finally:
            os.chdir(before)

    def test_signal_hooks_only_set_stop_and_are_removed(self):
        loop = SimpleNamespace(add_signal_handler=Mock(), remove_signal_handler=Mock())
        event = SimpleNamespace(set=Mock())
        with patch.object(runner.signal, "signal") as restore:
            with runner.stop_signals(loop, event):
                self.assertEqual(loop.add_signal_handler.call_count, 2)
                for call in loop.add_signal_handler.call_args_list: call.args[1]()
            self.assertEqual(loop.remove_signal_handler.call_count, 2)
            self.assertEqual(restore.call_count, 2)
        self.assertEqual(event.set.call_count, 2)
        self.assertEqual({call.args[0] for call in loop.add_signal_handler.call_args_list}, {signal.SIGTERM,signal.SIGINT})

    def test_source_has_no_main_polling_or_unrelated_worker_imports(self):
        source = Path(runner.__file__).read_text(); tree = ast.parse(source)
        names = [node.module for node in ast.walk(tree) if isinstance(node, ast.ImportFrom)]
        self.assertNotIn("app.main", names)
        runtime_modules = [name for name in names if name and name.startswith("app.")]
        self.assertEqual(runtime_modules, ["app.core.config", "app.services.yoga_chat_bridge"])
        self.assertNotIn("start_polling", source); self.assertNotIn("getUpdates", source)


class WorkerLifecycleTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.close = AsyncMock()
        self.bot = SimpleNamespace(session=SimpleNamespace(close=self.close))
        self.factory = Mock(return_value=self.bot)

    async def test_stop_cancels_only_bridge_and_closes_session_once(self):
        entered, cancelled, stop = asyncio.Event(), asyncio.Event(), asyncio.Event()
        async def bridge(bot):
            self.assertIs(bot, self.bot); entered.set()
            try: await asyncio.Event().wait()
            finally: cancelled.set()
        task = asyncio.create_task(runner.run_worker(self.factory, bridge, stop))
        await entered.wait(); stop.set(); await asyncio.wait_for(task, 2)
        self.assertTrue(cancelled.is_set()); self.factory.assert_called_once(); self.close.assert_awaited_once()

    async def test_bridge_failure_closes_session_and_propagates(self):
        async def bridge(bot): raise RuntimeError("synthetic_failure")
        with self.assertRaisesRegex(RuntimeError,"synthetic_failure"):
            await runner.run_worker(self.factory, bridge, asyncio.Event())
        self.close.assert_awaited_once()

    async def test_silent_early_bridge_return_is_failure(self):
        async def bridge(bot): return None
        with self.assertRaisesRegex(RuntimeError,"stopped_unexpectedly"):
            await runner.run_worker(self.factory, bridge, asyncio.Event())
        self.close.assert_awaited_once()

    async def test_external_cancellation_closes_session(self):
        entered = asyncio.Event()
        async def bridge(bot): entered.set(); await asyncio.Event().wait()
        task = asyncio.create_task(runner.run_worker(self.factory, bridge, asyncio.Event()))
        await entered.wait(); task.cancel()
        with self.assertRaises(asyncio.CancelledError): await task
        self.close.assert_awaited_once()

    async def test_constructor_failure_never_launches_bridge(self):
        bridge = AsyncMock(); factory = Mock(side_effect=RuntimeError("bad_constructor"))
        with self.assertRaisesRegex(RuntimeError,"bad_constructor"):
            await runner.run_worker(factory, bridge, asyncio.Event())
        bridge.assert_not_awaited(); self.close.assert_not_awaited()

    async def test_close_failure_is_not_reported_as_success(self):
        self.close.side_effect = RuntimeError("close_failed")
        entered,stop = asyncio.Event(),asyncio.Event()
        async def bridge(bot): entered.set(); await asyncio.Event().wait()
        task = asyncio.create_task(runner.run_worker(self.factory, bridge, stop))
        await entered.wait(); stop.set()
        with self.assertRaisesRegex(RuntimeError,"close_failed"):
            await task

    async def test_stuck_bridge_logs_constant_and_still_attempts_close(self):
        entered, release, stop = asyncio.Event(), asyncio.Event(), asyncio.Event()
        async def bridge(bot):
            entered.set()
            try: await asyncio.Event().wait()
            except asyncio.CancelledError: await release.wait()
        task = asyncio.create_task(runner.run_worker(self.factory, bridge, stop, shutdown_timeout=0.01))
        await entered.wait(); stop.set()
        with self.assertLogs(runner.logger, level="ERROR") as logs:
            with self.assertRaisesRegex(RuntimeError,"shutdown_timeout"): await task
        self.close.assert_awaited_once(); self.assertIn("yoga_transport_shutdown_timeout",logs.output[0])
        release.set(); await asyncio.sleep(0)

    async def test_signal_serve_with_fakes_never_constructs_dispatcher(self):
        @contextmanager
        def immediate_stop(loop,event): event.set(); yield
        async def bridge(bot): await asyncio.Event().wait()
        with patch.object(runner,"stop_signals",immediate_stop):
            await runner._serve(self.factory,bridge)
        self.factory.assert_not_called(); self.close.assert_not_awaited()

    async def test_already_stopped_never_constructs_bot_or_starts_bridge(self):
        stop,bridge = asyncio.Event(),AsyncMock()
        stop.set()
        await runner.run_worker(self.factory,bridge,stop)
        self.factory.assert_not_called(); bridge.assert_not_awaited(); self.close.assert_not_awaited()


class ExistingBridgeLoopTests(unittest.IsolatedAsyncioTestCase):
    """Execute only existing run_bridge AST with fake bindings, no app imports."""
    def build_loop(self, enabled, request, deliver, sleeper, logger):
        path = Path(__file__).resolve().parents[1]/"app/services/yoga_chat_bridge.py"
        tree = ast.parse(path.read_text())
        node = next(n for n in tree.body if isinstance(n,ast.AsyncFunctionDef) and n.name=="run_bridge")
        namespace = dict(settings=SimpleNamespace(YOGA_CHANNEL_ENABLED=enabled), channel_request=request,
            deliver_one=deliver, logger=logger,
            asyncio=SimpleNamespace(CancelledError=asyncio.CancelledError,sleep=sleeper))
        exec(compile(ast.Module(body=[node], type_ignores=[]),str(path),"exec"), namespace)
        return namespace["run_bridge"]

    async def test_off_never_claims_or_sends(self):
        request, deliver, sleeper = AsyncMock(), AsyncMock(), AsyncMock(side_effect=asyncio.CancelledError)
        loop = self.build_loop(False,request,deliver,sleeper,Mock())
        with self.assertRaises(asyncio.CancelledError): await loop(object())
        request.assert_not_awaited(); deliver.assert_not_awaited()

    async def test_on_claims_only_yoga_endpoint_and_one_item(self):
        bot,item = object(),dict(id=1)
        request,deliver = AsyncMock(return_value=[item]),AsyncMock()
        loop = self.build_loop(True,request,deliver,AsyncMock(side_effect=asyncio.CancelledError),Mock())
        with self.assertRaises(asyncio.CancelledError): await loop(bot)
        request.assert_awaited_once_with("/deliveries/claim", {"limit":1})
        deliver.assert_awaited_once_with(bot,item)

    async def test_claim_cancellation_is_propagated_without_send(self):
        request,deliver,sleeper,logger = AsyncMock(side_effect=asyncio.CancelledError),AsyncMock(),AsyncMock(),Mock()
        with self.assertRaises(asyncio.CancelledError): await self.build_loop(True,request,deliver,sleeper,logger)(object())
        deliver.assert_not_awaited(); sleeper.assert_not_awaited(); logger.warning.assert_not_called()

    async def test_backend_exception_is_sanitized_and_not_sent(self):
        request,deliver,logger = AsyncMock(side_effect=RuntimeError(KEY)),AsyncMock(),Mock()
        loop = self.build_loop(True,request,deliver,AsyncMock(side_effect=asyncio.CancelledError),logger)
        with self.assertRaises(asyncio.CancelledError): await loop(object())
        deliver.assert_not_awaited(); logger.warning.assert_called_once_with("yoga_main_bridge_failed")


if __name__ == "__main__":
    unittest.main()
