"""Exact source-group contracts; only owned temporary synthetic Settings import."""

import copy
import importlib.util
import os
from pathlib import Path
import unittest


BACKEND = Path(__file__).resolve().parents[1]


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# Load modules, not an exported TestCase alias: unittest must not rediscover the
# original suite here. Neither module imports production Settings at module load.
fixture = _load("installed_group_fixture", BACKEND / "tests/test_installed_preflight.py")
binder = _load("installed_group_binder", fixture.WRAPPER)


class InstalledPreflightGroupTests(unittest.TestCase):
    setUp = fixture.InstalledPreflightTests.setUp
    tearDown = fixture.InstalledPreflightTests.tearDown
    repin = fixture.InstalledPreflightTests.repin
    save = fixture.InstalledPreflightTests.save
    run_fixture = fixture.InstalledPreflightTests.run_fixture
    refused = fixture.InstalledPreflightTests.refused

    def schema2(self):
        self.value["schema"] = 2
        self.value["groups"] = {
            "files": {name: (self.root / name).stat().st_gid for name in binder._FILES},
            "directories": {name: (self.root if name == "root" else self.root / name).stat().st_gid
                            for name in binder._DIRS},
        }
        self.save()

    def success(self):
        result = self.run_fixture()
        self.assertEqual((result.returncode, result.stdout, result.stderr),
                         (0, fixture.SUCCESS, ""), result.fixture_diagnostic)

    def test_schema1_ordinary_import_unchanged(self):
        self.success()

    def test_schema2_actual_fixture_metadata_import(self):
        self.schema2()
        self.success()
        self.assertFalse(list(self.base.rglob("*.pyc")))

    def test_schema2_real_heterogeneous_groups_in_owned_fixture(self):
        groups = sorted(set(os.getgroups()) - {os.getegid()})
        if not groups:
            self.skipTest("No existing secondary GID; heterogeneous metadata import not exercised")
        # Owned synthetic files only. Neither effective credentials nor ACLs change.
        os.chown(self.root / binder._CONFIG, -1, groups[0])
        os.chown(self.root / "app/core", -1, groups[0])
        self.schema2()
        self.assertNotEqual(self.value["groups"]["files"][binder._CONFIG], self.value["role"]["gid"])
        self.success()
        # The same actual mixed metadata remains unacceptable to legacy schema 1.
        self.value["schema"] = 1
        del self.value["groups"]
        self.save()
        self.refused(self.run_fixture())

    def test_schema1_does_not_accept_schema2_fields(self):
        self.schema2()
        self.value["schema"] = 1
        self.save()
        self.refused(self.run_fixture())

    def test_schema2_missing_and_unknown_top_level_fields(self):
        self.schema2()
        original = copy.deepcopy(self.value)
        for variant in ("missing", "unknown"):
            self.value = copy.deepcopy(original)
            if variant == "missing":
                del self.value["groups"]
            else:
                self.value["ignore_group"] = True
            self.save()
            self.refused(self.run_fixture())

    def test_group_mapping_validates_exact_shape_and_gid_domain(self):
        self.schema2()
        original = copy.deepcopy(self.value)
        bad = [True, False, -1, 4294967295, 4294967296, "988", None, 1.5]
        for section, key in (("files", binder._CONFIG), ("directories", "root")):
            for value in bad:
                changed = copy.deepcopy(original)
                changed["groups"][section][key] = value
                with self.subTest(section=section, invalid=repr(value)):
                    with self.assertRaises(binder._Refused):
                        binder._group_pins(changed, changed["role"])
            for shape in ("missing", "unknown", "null"):
                changed = copy.deepcopy(original)
                if shape == "missing":
                    del changed["groups"][section][key]
                elif shape == "unknown":
                    changed["groups"][section]["../unexpected"] = 0
                else:
                    changed["groups"][section] = None
                with self.assertRaises(binder._Refused):
                    binder._group_pins(changed, changed["role"])
        for groups in (None, {}, {"files": {}, "directories": {}, "wildcard": 0}):
            changed = copy.deepcopy(original)
            changed["groups"] = groups
            with self.assertRaises(binder._Refused):
                binder._group_pins(changed, changed["role"])

    def test_distinct_gid_mapping_is_exact_not_role_substitution(self):
        self.schema2()
        self.value["groups"]["files"][binder._CONFIG] = 33
        self.value["groups"]["directories"]["root"] = 0
        files, directories = binder._group_pins(self.value, {"gid": 988})
        self.assertEqual(files[binder._CONFIG], 33)
        self.assertEqual(directories["root"], 0)
        self.assertEqual(set(files), binder._FILES)
        # Pure mapping only: this is NOT a heterogeneous-GID filesystem import.
        old_files, old_directories = binder._group_pins({"schema": 1}, {"gid": 988})
        self.assertEqual(set(old_files.values()), {988})
        self.assertEqual(set(old_directories.values()), {988})

    def test_wrong_actual_file_and_directory_gid_refused(self):
        self.schema2()
        original = copy.deepcopy(self.value)
        for section, key in (("files", binder._CONFIG), ("directories", "app/core")):
            self.value = copy.deepcopy(original)
            self.value["groups"][section][key] += 1
            self.save()
            self.refused(self.run_fixture())

    def test_effective_role_gid_not_replaced_by_file_gid(self):
        self.schema2()
        self.value["role"]["gid"] += 1
        self.save()
        self.refused(self.run_fixture())

    def test_repeated_source_state_uses_exact_group_pin(self):
        self.schema2()
        pins = self.value["files"]
        sources = {name: (self.root / name).read_bytes() for name in pins}
        groups = dict(self.value["groups"]["files"])
        trust = binder._Trust(owner_uid=os.geteuid(), anchor=str(self.base))
        binder._source_state(self.root, pins, sources, groups,
                             self.value["directories"], self.value["groups"]["directories"], trust)
        groups[binder._CONFIG] += 1
        with self.assertRaises(binder._Refused):
            binder._source_state(self.root, pins, sources, groups,
                             self.value["directories"], self.value["groups"]["directories"], trust)

    def test_schema2_hash_and_mode_guards_remain(self):
        self.schema2()
        path = self.root / binder._CONFIG
        body = path.read_bytes()
        path.write_bytes(body + b"\n# changed\n")
        self.refused(self.run_fixture())
        path.write_bytes(body)
        path.chmod(0o660)
        self.refused(self.run_fixture())

    def test_schema2_symlink_and_hardlink_guards_remain(self):
        self.schema2()
        path = self.root / binder._CONFIG
        alias = self.base / "second-name"
        os.link(path, alias)
        self.refused(self.run_fixture())
        alias.unlink()
        outside = self.base / "outside.py"
        outside.write_bytes(path.read_bytes())
        outside.chmod(0o640)
        path.unlink()
        path.symlink_to(outside)
        self.refused(self.run_fixture())

    def test_schema2_cache_and_module_origin_guards_remain(self):
        self.schema2()
        cache = self.root / "app/core/__pycache__"
        cache.mkdir()
        self.refused(self.run_fixture())
        cache.rmdir()
        path = self.root / binder._CONFIG
        path.write_bytes(fixture.CONFIG + b"\n__file__='/wrong/synthetic-origin'\n")
        self.repin(binder._CONFIG)
        self.save()
        self.refused(self.run_fixture())


    def prepare_directory_drift(self, schema, code=fixture.CONFIG):
        directory = self.root / "app/core"
        os.chown(directory, -1, os.getegid())
        directory.chmod(0o755)
        self.value["directories"]["app/core"] = "0755"
        self.value["schema"] = schema
        if schema == 2:
            self.schema2()
        else:
            self.value.pop("groups", None)
        (self.root / binder._CONFIG).write_bytes(code)
        self.repin(binder._CONFIG)
        self.save()
        return directory

    def directory_drift(self, phase, kind):
        if kind == "gid":
            groups = sorted(set(os.getgroups()) - {os.getegid()})
            if not groups:
                self.skipTest("No existing secondary GID; GID drift not exercised")
            target_gid = groups[0]
            mutation = "os.chown(Path(__file__).parent, -1, " + str(target_gid) + ")"
        else:
            target_gid = os.getegid()
            mutation = "Path(__file__).parent.chmod(0o750)"
        for schema in (1, 2):
            if phase == "import":
                code = fixture.CONFIG + ("\nimport os\nfrom pathlib import Path\n" + mutation + "\n").encode()
            else:
                code = fixture.CONFIG.replace(
                    b"        return self\n",
                    ("        import os\n        from pathlib import Path\n        "
                     + mutation + "\n        return self\n").encode())
            with self.subTest(phase=phase, schema=schema, kind=kind):
                directory = self.prepare_directory_drift(schema, code)
                self.assertEqual(directory.stat().st_gid, os.getegid())
                self.assertEqual(directory.stat().st_mode & 0o777, 0o755)
                self.refused(self.run_fixture())
                # Mutation must actually have run, not an earlier unrelated refusal.
                info = directory.stat()
                self.assertEqual(info.st_gid, target_gid)
                self.assertEqual(info.st_mode & 0o777, 0o755 if kind == "gid" else 0o750)
                self.assertFalse(list(self.base.rglob("*.pyc")))

    def test_directory_gid_drift_during_import_refused(self):
        self.directory_drift("import", "gid")

    def test_directory_gid_drift_during_delegate_refused(self):
        self.directory_drift("delegate", "gid")

    def test_directory_mode_drift_during_import_refused(self):
        self.directory_drift("import", "mode")

    def test_directory_mode_drift_during_delegate_refused(self):
        self.directory_drift("delegate", "mode")

    def test_directory_checker_requires_exact_four_names(self):
        self.prepare_directory_drift(2)
        trust = binder._Trust(owner_uid=os.geteuid(), anchor=str(self.base))
        groups = self.value["groups"]["directories"]
        binder._directory_state(self.root, self.value["directories"], groups, trust)
        for target in ("directories", "groups"):
            for shape in ("missing", "extra"):
                directories = copy.deepcopy(self.value["directories"])
                values = copy.deepcopy(groups)
                changed = directories if target == "directories" else values
                if shape == "missing":
                    del changed["app/core"]
                else:
                    changed["../unapproved"] = "0755" if target == "directories" else os.getegid()
                with self.subTest(target=target, shape=shape):
                    with self.assertRaises(binder._Refused):
                        binder._directory_state(self.root, directories, values, trust)


if __name__ == "__main__":
    unittest.main()
