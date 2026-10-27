"""Schema3 uses only owned synthetic profiles; no production input or network."""
import hashlib
import json
import os
from pathlib import Path
import unittest

from tests import test_installed_preflight as fixture_module


class InstalledProfileBindingTests(unittest.TestCase):
    def setUp(self):
        self.f = fixture_module.InstalledPreflightTests('runTest')
        self.f.setUp()
        self.profile = self.f.base / 'existing-profile.env'
        self.profile.write_bytes(b'PROJECT_NAME=PRIVATE-SYNTHETIC-PROFILE\n')
        self.profile.chmod(0o640)
        os.chown(self.profile, -1, os.getegid())
        self.f.value['schema'] = 3
        self.f.value['groups'] = {
            'files': {name: os.getegid() for name in self.f.value['files']},
            'directories': {name: os.getegid() for name in self.f.value['directories']},
        }
        self.f.value['profile'] = dict(path=str(self.profile), gid=os.getegid(), mode='0640',
            bytes=self.profile.stat().st_size, sha256=hashlib.sha256(self.profile.read_bytes()).hexdigest())
        self.f.save()

    def tearDown(self):
        self.f.tearDown()

    def run_bound(self, **kwargs):
        env = {'SAFR_SETTINGS_ENV_FILE': str(self.profile)}
        env.update(kwargs.pop('env', {}))
        return self.f.run_fixture(env=env, **kwargs)

    def config(self, extra):
        path = self.f.root / 'app/core/config.py'
        path.write_bytes(fixture_module.CONFIG + extra.encode())
        self.f.repin('app/core/config.py')
        self.f.save()

    def test_explicit_profile_and_ordinary_source_import_succeed(self):
        self.config('\nimport os\nfrom pathlib import Path\nassert Path(os.environ["SAFR_SETTINGS_ENV_FILE"]).read_bytes() == '
                    + repr(self.profile.read_bytes()) + '\n')
        result = self.run_bound()
        self.assertEqual((result.returncode, result.stdout, result.stderr), (0, fixture_module.SUCCESS, ''), result.fixture_diagnostic)
        self.assertFalse(list(self.f.base.rglob('*.pyc')))

    def test_missing_empty_or_different_environment_binding_refuses(self):
        self.f.refused(self.f.run_fixture())
        for value in ('', str(self.f.base / 'other.env')):
            with self.subTest(valueIsEmpty=not value):
                self.f.refused(self.run_bound(env={'SAFR_SETTINGS_ENV_FILE': value}))

    def test_legacy_contracts_reject_override_presence(self):
        for schema in (1, 2):
            self.f.value['schema'] = schema
            self.f.value.pop('profile', None)
            if schema == 1:
                self.f.value.pop('groups', None)
            else:
                self.f.value['groups'] = {
                    'files': {name: os.getegid() for name in self.f.value['files']},
                    'directories': {name: os.getegid() for name in self.f.value['directories']}}
            self.f.save()
            for value in ('', str(self.profile)):
                with self.subTest(schema=schema, empty=not value):
                    self.f.refused(self.run_bound(env={'SAFR_SETTINGS_ENV_FILE': value}))

    def test_profile_keys_types_bounds_and_hash_are_strict(self):
        original = dict(self.f.value['profile'])
        changes = ({'extra': True}, {'gid': True}, {'gid': -1}, {'gid': 4294967295},
                   {'bytes': 0}, {'bytes': True}, {'bytes': 262145}, {'sha256': '0' * 64},
                   {'mode': '0644'}, {'path': str(self.profile) + '/../existing-profile.env'})
        for change in changes:
            self.f.value['profile'] = {**original, **change}; self.f.save()
            with self.subTest(fields=list(change)):
                self.f.refused(self.run_bound())

    def test_missing_profile_refuses_before_config_import(self):
        marker = self.f.base / 'config-imported'
        self.config('\nfrom pathlib import Path\nPath(' + repr(str(marker)) + ').write_text("loaded")\n')
        self.profile.unlink()
        self.f.refused(self.run_bound())
        self.assertFalse(marker.exists())

    def test_symlink_hardlink_fifo_and_public_mode_refuse(self):
        raw = self.profile.read_bytes()
        self.profile.chmod(0o644); self.f.refused(self.run_bound()); self.profile.chmod(0o640)
        second = self.f.base / 'hardlink.env'; os.link(self.profile, second)
        self.f.refused(self.run_bound()); second.unlink()
        self.profile.unlink(); self.profile.symlink_to(self.f.base / 'missing.env')
        self.f.refused(self.run_bound()); self.profile.unlink()
        os.mkfifo(self.profile, 0o640); self.f.refused(self.run_bound()); self.profile.unlink()
        self.profile.write_bytes(raw); self.profile.chmod(0o640)

    def test_profile_bytes_drift_during_config_import_refuses(self):
        self.config('\nfrom pathlib import Path\np=Path(' + repr(str(self.profile)) + ')\np.write_bytes(p.read_bytes()+b"# drift\\n")\n')
        self.f.refused(self.run_bound())

    def test_same_bytes_rotated_inode_is_not_a_fresh_baseline(self):
        replacement = self.f.base / 'rotation.env'
        replacement.write_bytes(self.profile.read_bytes()); replacement.chmod(0o640)
        os.chown(replacement, -1, os.getegid())
        self.config('\nimport os\nos.replace(' + repr(str(replacement)) + ',' + repr(str(self.profile)) + ')\n')
        self.f.refused(self.run_bound())

    def test_original_metadata_drift_is_not_a_fresh_baseline(self):
        self.config('\nimport os\nos.utime(' + repr(str(self.profile)) + ',(1,1))\n')
        self.f.refused(self.run_bound())

    def test_environment_binding_drift_during_import_refuses(self):
        self.config('\nimport os\nos.environ["SAFR_SETTINGS_ENV_FILE"]="/wrong/private-profile.env"\n')
        self.f.refused(self.run_bound())

    def test_profile_failures_never_export_path_or_bytes(self):
        self.profile.write_bytes(b'PRIVATE-SYNTHETIC-CREDENTIAL-DO-NOT-ECHO\n')
        result = self.run_bound()
        self.f.refused(result)
        self.assertNotIn('PRIVATE-SYNTHETIC', result.stdout + result.stderr)
        self.assertNotIn(str(self.profile), result.stdout + result.stderr)


if __name__ == '__main__':
    unittest.main()
