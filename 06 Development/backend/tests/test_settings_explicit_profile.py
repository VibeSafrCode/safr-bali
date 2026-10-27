"""Actual Settings loader with only disposable synthetic files and closed env."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

CONFIG = Path(__file__).resolve().parents[1] / 'app/core/config.py'


class ExplicitSettingsProfileTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='safr-settings-profile-')
        self.base = Path(self.temp.name).resolve()
        self.cwd = self.base / 'candidate'; self.cwd.mkdir()
        (self.cwd / '.env').write_text('PROJECT_NAME=CWD-FALLBACK\n', encoding='utf8')
        self.profile = self.base / 'selected profile.env'
        self.profile.write_text('PROJECT_NAME=SELECTED-PROFILE\n', encoding='utf8')

    def tearDown(self):
        self.temp.cleanup()

    def run_config(self, override=None, *, supplied=True, extra=None):
        env = {'PATH': '/usr/bin:/bin', 'LANG': 'C', 'LC_ALL': 'C',
               'DATABASE_URL': 'sqlite://', 'SERVICE_API_TOKEN': 'synthetic-service',
               'ADMIN_API_TOKEN': 'synthetic-admin'}
        if supplied:
            env['SAFR_SETTINGS_ENV_FILE'] = str(self.profile) if override is None else override
        env.update(extra or {})
        code = ('import json,runpy,sys\n'
                'def no_network(event,args):\n'
                ' if event in ("socket.connect","socket.bind","socket.getaddrinfo"): raise RuntimeError("network prohibited")\n'
                'sys.addaudithook(no_network)\n'
                'try:\n'
                ' ns=runpy.run_path(' + repr(str(CONFIG)) + ')\n'
                ' print(json.dumps({"project":ns["settings"].PROJECT_NAME,"profile":ns["settings"].ENVIRONMENT}))\n'
                'except BaseException:\n'
                ' sys.stderr.write("SETTINGS_REFUSED\\n");raise SystemExit(2)\n')
        return subprocess.run([sys.executable, '-I', '-B', '-c', code], cwd=self.cwd,
                              env=env, capture_output=True, text=True, timeout=8)

    def refused(self, result):
        self.assertEqual((result.returncode, result.stdout, result.stderr), (2, '', 'SETTINGS_REFUSED\n'))

    def test_actual_settings_selects_absolute_file_not_cwd_dotenv(self):
        result = self.run_config()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout), {'project': 'SELECTED-PROFILE', 'profile': 'local'})

    def test_no_opt_in_retains_existing_cwd_policy(self):
        result = self.run_config(supplied=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)['project'], 'CWD-FALLBACK')

    def test_environment_precedence_is_not_silently_changed(self):
        result = self.run_config(extra={'PROJECT_NAME': 'EXPLICIT-ENVIRONMENT'})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)['project'], 'EXPLICIT-ENVIRONMENT')

    def test_missing_explicit_file_does_not_fall_back(self):
        self.refused(self.run_config(str(self.base / 'MISSING-PRIVATE-PROFILE.env')))

    def test_empty_relative_control_and_noncanonical_paths_refuse(self):
        for path in ('', '.env', str(self.profile) + '/..', '//private/profile.env', '/private/SECRET\n.env'):
            with self.subTest(empty=not path):
                self.refused(self.run_config(path))

    def test_link_fifo_directory_and_empty_file_refuse(self):
        link = self.base / 'profile-link.env'; link.symlink_to(self.profile)
        self.refused(self.run_config(str(link)))
        fifo = self.base / 'profile-fifo.env'; os.mkfifo(fifo)
        self.refused(self.run_config(str(fifo)))
        self.refused(self.run_config(str(self.base)))
        empty = self.base / 'empty.env'; empty.touch()
        self.refused(self.run_config(str(empty)))

    def test_oversize_file_and_hardlink_refuse(self):
        large = self.base / 'large.env'; large.write_bytes(b'x' * 262145)
        self.refused(self.run_config(str(large)))
        other = self.base / 'hardlink.env'; os.link(self.profile, other)
        self.refused(self.run_config())

    def test_production_security_validation_still_runs(self):
        self.refused(self.run_config(extra={'ENVIRONMENT': 'production'}))


if __name__ == '__main__':
    unittest.main()
