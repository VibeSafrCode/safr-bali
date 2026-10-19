"""Closed profile/actual CLI tests with synthetic env and blocked child network."""

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from fastapi import HTTPException
import pydantic_settings

from app.api import web_portal
from app.core.config import Settings


def production_values(**overrides):
    values = dict(ENVIRONMENT='production', DEBUG=False, SQL_ECHO=False,
        DATABASE_URL='sqlite+pysqlite:///:memory:',
        SERVICE_API_TOKEN='synthetic-service-' + 's' * 32,
        ADMIN_API_TOKEN='synthetic-admin-' + 'a' * 32,
        TELEGRAM_BOT_TOKEN='123456789:' + 'b' * 35,
        MINI_APP_COOKIE_SECURE=True, WEB_COOKIE_SECURE=True,
        WEBSITE_URL='https://safrway.online', APPLICATION_URL='https://app.safrway.online',
        MINI_APP_ORIGINS='https://safrway.online,https://app.safrway.online')
    values.update(overrides)
    return values


class RuntimeProfileTests(unittest.TestCase):
    def configure(self, **values):
        with patch.dict(os.environ, {}, clear=True):
            return Settings(_env_file=None, **values)

    def local(self, **overrides):
        values = dict(DATABASE_URL='sqlite://', SERVICE_API_TOKEN='synthetic', ADMIN_API_TOKEN='synthetic-admin')
        values.update(overrides)
        return self.configure(**values)

    def test_local_test_and_existing_isolated_preview_are_explicit_closed_profiles(self):
        self.assertEqual(self.local().ENVIRONMENT, 'local')
        for profile in ('local', 'test', 'preview'):
            with self.subTest(profile=profile):
                self.assertEqual(self.local(ENVIRONMENT=profile).ENVIRONMENT, profile)

    def test_profile_case_whitespace_and_prod_alias_normalize_before_any_consumer(self):
        for supplied in ('production', 'prod', 'PROD', ' PrOdUcTiOn ', 'prod\n'):
            with self.subTest(supplied=supplied):
                self.assertEqual(self.configure(**production_values(ENVIRONMENT=supplied)).ENVIRONMENT, 'production')
        self.assertEqual(self.local(ENVIRONMENT=' TEST ').ENVIRONMENT, 'test')
        self.assertEqual(self.local(ENVIRONMENT=' Preview ').ENVIRONMENT, 'preview')

    def test_typo_empty_unknown_and_non_string_profiles_fail_without_value_echo(self):
        for value in ('', ' ', 'prodution', 'production-SECRET-PROFILE', 'development', 'staging', None, True, 1):
            with self.subTest(kind=type(value).__name__), self.assertRaises(RuntimeError) as raised:
                self.local(ENVIRONMENT=value)
            self.assertEqual(str(raised.exception), 'Unsupported ENVIRONMENT profile')

    def test_every_production_alias_runs_existing_credential_cookie_debug_guards(self):
        for profile in ('prod', 'PRODUCTION', ' production '):
            for changed in ({'DEBUG': True}, {'SQL_ECHO': True}, {'WEB_COOKIE_SECURE': False},
                            {'MINI_APP_COOKIE_SECURE': False}, {'SERVICE_API_TOKEN': 'SENSITIVE-CREDENTIAL'},
                            {'SERVICE_API_TOKEN': 's' * 40, 'ADMIN_API_TOKEN': 's' * 40}):
                with self.subTest(profile=profile, fields=list(changed)), self.assertRaises(RuntimeError) as raised:
                    self.configure(**production_values(ENVIRONMENT=profile, **changed))
                self.assertNotIn('SENSITIVE-CREDENTIAL', str(raised.exception))

    def test_prod_alias_no_longer_bypasses_existing_production_origin_guard(self):
        cfg = self.configure(**production_values(ENVIRONMENT=' prod ', APPLICATION_URL='https://foreign.invalid'))
        with patch.object(web_portal, 'settings', cfg), self.assertRaises(HTTPException) as raised:
            web_portal.auth_redirect_location('/account/')
        self.assertEqual(raised.exception.status_code, 503)

    def run_cli(self, overrides=None, *, remove=(), cwd=None):
        root = str(Path(__file__).resolve().parents[1])
        deps = str(Path(pydantic_settings.__file__).resolve().parent.parent)
        bootstrap = ('import sys;sys.path[:0]=' + repr([deps, root]) + '\n'
            'def no_network(event,args):\n'
            ' if event in ("socket.connect","socket.bind","socket.getaddrinfo"): raise RuntimeError("Network prohibited")\n'
            'sys.addaudithook(no_network)\n'
            'from app.scripts.production_preflight import main\n'
            'raise SystemExit(main())\n')
        values = production_values()
        values.update(overrides or {})
        for key in remove:
            values.pop(key, None)
        env = {'PATH': '/usr/bin:/bin', 'LANG': 'C', 'LC_ALL': 'C', 'TZ': 'UTC', 'PYTHONNOUSERSITE': '1'}
        env.update({key: str(value).lower() if isinstance(value, bool) else str(value)
                    for key, value in values.items()})
        command = [sys.executable, '-I', '-S', '-B', '-X', 'utf8', '-c', bootstrap]
        if cwd is not None:
            return subprocess.run(command, cwd=cwd, env=env, capture_output=True, text=True, timeout=8)
        # Normal CI/developer invocations may start inside a real checkout.
        # Synthetic CLI tests must never ingest its .env or feature switches.
        with tempfile.TemporaryDirectory(prefix='safr-profile-cli-') as folder:
            return subprocess.run(command, cwd=folder, env=env, capture_output=True, text=True, timeout=8)

    def test_default_cli_ignores_a_contaminated_caller_working_directory(self):
        with tempfile.TemporaryDirectory(prefix='safr-profile-contaminated-') as folder:
            (Path(folder) / '.env').write_text(
                'YOGA_CHANNEL_ENABLED=true\nUNEXPECTED_SYNTHETIC_DOTENV=SENSITIVE-FIXTURE\n', encoding='utf8')
            # Demonstrate that this fixture really poisons an explicitly used
            # cwd, then prove the default runner does not select that cwd.
            self.assertEqual(self.run_cli(cwd=folder).returncode, 2)
            with patch.object(Path, 'cwd', return_value=Path(folder)):
                result = self.run_cli()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, 'SAFR backend production preflight: OK\n')
        self.assertNotIn('SENSITIVE-FIXTURE', result.stdout + result.stderr)

    def test_actual_preflight_cli_requires_exported_production_and_accepts_normalized_alias(self):
        for profile in ('production', ' PROD '):
            result = self.run_cli({'ENVIRONMENT': profile})
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout, 'SAFR backend production preflight: OK\n')
            self.assertEqual(result.stderr, '')
        for profile in ('local', 'test', 'preview', 'prodution', ''):
            result = self.run_cli({'ENVIRONMENT': profile})
            self.assertEqual(result.returncode, 2)
            self.assertEqual(result.stdout, '')
            self.assertIn('explicit production profile required', result.stderr)

    def test_missing_launch_env_is_not_rescued_by_dotenv_production(self):
        with tempfile.TemporaryDirectory(prefix='safr-profile-synthetic-') as folder:
            fake = Path(folder) / '.env'
            fake.write_text('ENVIRONMENT=production\nDEBUG=false\n', encoding='utf8')
            result = self.run_cli(remove=('ENVIRONMENT',), cwd=folder)
        self.assertEqual(result.returncode, 2)
        self.assertEqual(result.stdout, '')
        self.assertIn('explicit production profile required', result.stderr)

    def test_cli_unsafe_config_is_sanitized_and_never_opens_network(self):
        for changed in ({'DEBUG': True}, {'WEB_COOKIE_SECURE': False},
                        {'SERVICE_API_TOKEN': 'DO-NOT-ECHO-THIS-SECRET'},
                        {'TELEGRAM_BOT_TOKEN': ''},
                        {'TELEGRAM_OIDC_CLIENT_ID': 'SENSITIVE-CLIENT'}):
            with self.subTest(fields=list(changed)):
                result = self.run_cli(changed)
                self.assertEqual(result.returncode, 2)
                self.assertEqual(result.stdout, '')
                self.assertEqual(result.stderr, 'Production preflight refused: unsafe runtime configuration.\n')
                self.assertNotIn('DO-NOT-ECHO', result.stderr)
                self.assertNotIn('SENSITIVE-CLIENT', result.stderr)
                self.assertNotIn('Traceback', result.stderr)


if __name__ == '__main__':
    unittest.main()
