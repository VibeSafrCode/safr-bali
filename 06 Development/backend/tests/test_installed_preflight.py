"""Installed-binder subprocess tests use only explicit temporary source fixtures."""

import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import tempfile
import unittest


BACKEND = Path(__file__).resolve().parents[1]
WRAPPER = BACKEND / "app/scripts/installed_preflight.py"
PRODUCTION_PREFLIGHT = BACKEND / "app/scripts/production_preflight.py"
SUCCESS = "SAFR installed backend preflight: OK\n"
REFUSAL = "Installed backend preflight refused.\n"
FIXTURE_PYTHON = "/usr/bin/python3"
CONFIG = b'''class SyntheticSettings:
    ENVIRONMENT = "production"
    def validate_production_security(self):
        return self
settings = SyntheticSettings()
'''


def interpreter_pin():
    # Hosted setup-python toolcaches may have writable ancestors. They are not
    # valid positive fixtures for the unchanged production interpreter policy.
    # These synthetic settings need only the root-owned system Python stdlib;
    # inspect that exact child rather than pinning pytest's possibly cached one.
    child = subprocess.run([FIXTURE_PYTHON, "-I", "-B", "-c",
        "import json,sys;print(json.dumps({'path':sys.executable,'prefix':sys.prefix}))"],
        env={"PATH": "/usr/bin:/bin", "LANG": "C", "LC_ALL": "C"},
        capture_output=True, text=True, check=True, timeout=8)
    runtime = json.loads(child.stdout)
    path = Path(runtime["path"])
    current, links = path, []
    while True:
        prefix = Path("/")
        for index, part in enumerate(current.parts[1:]):
            prefix /= part
            if prefix.is_symlink():
                target = os.readlink(prefix)
                links.append({"path": str(prefix), "target": target})
                replacement = target if target.startswith("/") else str(prefix.parent / target)
                current = Path(os.path.normpath(os.path.join(replacement, *current.parts[index + 2:])))
                break
        else:
            break
    binary = current.read_bytes()
    return dict(path=str(path), resolved=str(current), prefix=runtime["prefix"],
                sha256=hashlib.sha256(binary).hexdigest(), bytes=len(binary),
                mode="%04o" % stat.S_IMODE(current.stat().st_mode), symlinks=links)


class InstalledPreflightTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="safr-installed-preflight-")
        self.base = Path(self.temporary.name).resolve()
        self.root = self.base / "backend"
        for relative in ("", "app", "app/core", "app/scripts"):
            (self.root / relative).mkdir(exist_ok=True)
            (self.root / relative).chmod(0o750)
        self.wrapper = self.root / "app/scripts/installed_preflight.py"
        self.wrapper.write_bytes(WRAPPER.read_bytes())
        (self.root / "app/scripts/production_preflight.py").write_bytes(PRODUCTION_PREFLIGHT.read_bytes())
        (self.root / "app/core/config.py").write_bytes(CONFIG)
        for relative in ("app/__init__.py", "app/core/__init__.py"):
            (self.root / relative).write_bytes(b"")
        self.contract = self.base / "contract.json"
        self.value = dict(schema=1, backend_root=str(self.root),
                          role=dict(uid=os.geteuid(), gid=os.getegid()),
                          interpreter=interpreter_pin(),
                          directories={p: "0750" for p in ("root", "app", "app/core", "app/scripts")},
                          files={})
        self.python = self.value["interpreter"]["path"]
        self.interpreter_owners = tuple({0, Path(self.value["interpreter"]["resolved"]).stat().st_uid})
        for relative in ("app/__init__.py", "app/core/__init__.py", "app/core/config.py",
                         "app/scripts/production_preflight.py", "app/scripts/installed_preflight.py"):
            file = self.root / relative
            file.chmod(0o640 if relative.endswith("/config.py") else 0o644)
            self.repin(relative)
        self.save()
        # Temporary directories may inherit a different group on macOS. Set
        # only these owned disposable fixtures to our already-effective GID;
        # production ownership/group policy and process credentials are unchanged.
        for path in (self.root, self.root / "app", self.root / "app/core",
                     self.root / "app/scripts", self.contract,
                     *(self.root / relative for relative in self.value["files"])):
            os.chown(path, -1, os.getegid())

    def tearDown(self):
        self.temporary.cleanup()

    def repin(self, relative):
        file = self.root / relative
        raw = file.read_bytes()
        self.value["files"][relative] = dict(sha256=hashlib.sha256(raw).hexdigest(),
            bytes=len(raw), mode="%04o" % stat.S_IMODE(file.stat().st_mode))

    def save(self):
        self.contract.write_text(json.dumps(self.value), encoding="utf-8")
        self.contract.chmod(0o640)

    def run_fixture(self, *, cwd=None, env=None, before="", direct=False, arguments=None, flags=None,
                    allow_privileged_fixture_role=True):
        # The private harness has explicit test pins. No test policy is exposed
        # through production main(), CLI arguments, contract or environment.
        diagnostic = self.base / "fixture-refusal-lines.txt"
        if diagnostic.exists():
            diagnostic.unlink()
        bootstrap = ("import importlib.util,os,sys\n"
            "def no_network(event,args):\n"
            " if event in ('socket.connect','socket.bind','socket.getaddrinfo'): raise RuntimeError('network prohibited')\n"
            "sys.addaudithook(no_network)\n"
            "spec=importlib.util.spec_from_file_location('binder_fixture'," + repr(str(self.wrapper)) + ")\n"
            "binder=importlib.util.module_from_spec(spec);spec.loader.exec_module(binder)\n"
            + before + "\n"
            # Fixture-only diagnostics contain guard line numbers, never an
            # exception message, source path, settings value or production log.
            "refusal_lines=[]\n"
            "def fixture_trace(frame,event,arg):\n"
            " if frame.f_code.co_filename!=binder.__file__: return None\n"
            " if event=='exception' and arg[0] is binder._Refused and frame.f_code.co_name=='_need':\n"
            "  refusal_lines.append(frame.f_back.f_lineno)\n"
            " return fixture_trace\n"
            "sys.settrace(fixture_trace)\n"
            "code=binder._report(" + repr(arguments if arguments is not None else [str(self.contract)])
            + ",binder._Trust(owner_uid=" + repr(os.geteuid()) + ",anchor=" + repr(str(self.base))
            + ",interpreter_owners=" + repr(self.interpreter_owners)
            + ",allow_privileged_fixture_role=" + repr(allow_privileged_fixture_role) + "))\n"
            "sys.settrace(None)\n"
            "if refusal_lines:\n"
            " fd=os.open(" + repr(str(diagnostic)) + ",os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)\n"
            " try: os.write(fd,(','.join(map(str,refusal_lines))).encode('ascii'))\n"
            " finally: os.close(fd)\n"
            "raise SystemExit(code)\n")
        command = [self.python] + (flags if flags is not None else ["-I", "-B"])
        command += [str(self.wrapper)] + (arguments if arguments is not None else [str(self.contract)]) if direct else ["-c", bootstrap]
        values = {"PATH": "/usr/bin:/bin", "LANG": "C", "LC_ALL": "C", "ENVIRONMENT": "production"}
        values.update(env or {})
        result = subprocess.run(command, cwd=cwd or self.root, env=values,
                                capture_output=True, text=True, timeout=8)
        lines = diagnostic.read_text(encoding="ascii") if diagnostic.exists() else "none"
        result.fixture_diagnostic = "Synthetic binder refusal guard lines: " + lines
        return result

    def compile_fixture(self, file, *, prefix=None):
        # The pytest runner and fixture child may be different Python minors.
        # Generate bytecode with the same child that the stale-cache probe uses.
        flags = ["-I", "-B"] + (["-X", "pycache_prefix=" + str(prefix)] if prefix else [])
        result = subprocess.run([self.python] + flags + ["-c",
            "import py_compile,sys;py_compile.compile(sys.argv[1],doraise=True)", str(file)],
            cwd=self.root, env={"PATH": "/usr/bin:/bin", "LANG": "C", "LC_ALL": "C"},
            capture_output=True, text=True, timeout=8)
        self.assertEqual((result.returncode, result.stdout, result.stderr), (0, "", ""))

    def refused(self, result):
        self.assertEqual(result.returncode, 2)
        self.assertEqual(result.stdout, "")
        self.assertEqual(result.stderr, REFUSAL)

    def test_success_executes_only_synthetic_settings_and_actual_unchanged_preflight(self):
        result = self.run_fixture()
        self.assertEqual((result.returncode, result.stdout, result.stderr), (0, SUCCESS, ""),
                         result.fixture_diagnostic)
        self.assertFalse(list(self.base.rglob("*.pyc")))

    def test_production_cli_has_no_fixture_owner_override(self):
        if os.geteuid() == 0:
            self.skipTest("non-root fixture demonstrates the production owner boundary")
        self.refused(self.run_fixture(direct=True))

    def test_effective_isolation_and_no_bytecode_are_required(self):
        self.refused(self.run_fixture(flags=["-B"]))
        # Apple's system Python may disable bytecode by default even without
        # literal -B. Test the effective runtime guard, not that vendor default.
        self.refused(self.run_fixture(before="sys.dont_write_bytecode=False"))

    def test_explicit_production_profile_is_required_before_settings_import(self):
        sentinel = self.base / "settings-imported"
        file = self.root / "app/core/config.py"
        file.write_bytes(("from pathlib import Path\nPath(" + repr(str(sentinel))
                         + ").write_text('imported')\n").encode() + CONFIG)
        self.repin("app/core/config.py")
        self.save()
        self.refused(self.run_fixture(env={"ENVIRONMENT": ""}))
        self.assertFalse(sentinel.exists())

    def test_missing_and_extra_contract_arguments_are_sanitized(self):
        for arguments in ([], [str(self.base / "MISSING-PRIVATE-CONTRACT")], [str(self.contract), "extra"]):
            with self.subTest(arguments=len(arguments)):
                self.refused(self.run_fixture(arguments=arguments))

    def test_wrong_cwd_or_pythonpath_cannot_select_old_checkout(self):
        old = self.base / "old-checkout"
        old.mkdir()
        self.refused(self.run_fixture(cwd=old))
        self.refused(self.run_fixture(env={"PYTHONPATH": str(old)}))
        self.refused(self.run_fixture(env={"PYTHONHOME": str(old)}))

    def test_cached_app_or_config_modules_are_rejected(self):
        for name in ("app", "app.core.config"):
            code = "import types;sys.modules[" + repr(name) + "]=types.ModuleType(" + repr(name) + ")"
            with self.subTest(module=name):
                self.refused(self.run_fixture(before=code))

    def test_candidate_root_wins_over_old_checkout_resolver_path(self):
        old = self.base / "old-checkout"
        (old / "app").mkdir(parents=True)
        sentinel = self.base / "old-checkout-executed"
        (old / "app/__init__.py").write_text(
            "open(" + repr(str(sentinel)) + ", 'w').write('old checkout')\n", encoding="utf-8")
        result = self.run_fixture(before="sys.path.insert(0," + repr(str(old)) + ")")
        self.assertEqual((result.returncode, result.stdout, result.stderr), (0, SUCCESS, ""),
                         result.fixture_diagnostic)
        self.assertFalse(sentinel.exists())

    def test_shadow_package_and_old_config_resolver_origins_are_refused_before_import(self):
        for fullname, relative in (("app", "shadow/app/__init__.py"),
                                   ("app.core.config", "shadow/config.py")):
            with self.subTest(module=fullname):
                file = self.base / relative
                file.parent.mkdir(parents=True, exist_ok=True)
                sentinel = self.base / "shadow-executed"
                file.write_text("open(" + repr(str(sentinel)) + ", 'w').write('shadow')\n", encoding="utf-8")
                before = ("class ShadowFinder:\n"
                          " def find_spec(self,name,path=None,target=None):\n"
                          "  if name==" + repr(fullname) + ": return importlib.util.spec_from_file_location(name,"
                          + repr(str(file)) + ")\n"
                          "sys.meta_path.insert(0,ShadowFinder())\n")
                self.refused(self.run_fixture(before=before))
                self.assertFalse(sentinel.exists())

    def test_matching_timestamp_stale_bytecode_is_refused_before_config_import(self):
        file = self.root / "app/core/config.py"
        original, metadata = file.read_bytes(), file.stat()
        sentinel = self.base / "stale-bytecode-executed"
        stale = ("open(" + repr(str(sentinel)) + ", 'w').write('stale')\n").encode()
        self.assertLessEqual(len(stale), len(original))
        file.write_bytes(stale.ljust(len(original), b" "))
        os.utime(file, ns=(metadata.st_atime_ns, metadata.st_mtime_ns))
        self.compile_fixture(file)
        file.write_bytes(original)
        os.utime(file, ns=(metadata.st_atime_ns, metadata.st_mtime_ns))
        # Demonstrate that -B alone still reads this valid timestamp/size cache.
        probe = subprocess.run([self.python, "-I", "-B", "-c",
            "import sys;sys.path.insert(0," + repr(str(self.root)) + ");import app.core.config"],
            cwd=self.root, env={"PATH": "/usr/bin:/bin"}, capture_output=True, timeout=8)
        self.assertEqual(probe.returncode, 0)
        self.assertTrue(sentinel.exists())
        sentinel.unlink()
        self.refused(self.run_fixture())
        self.assertFalse(sentinel.exists())

    def test_direct_legacy_bytecode_files_are_refused(self):
        for relative in ("app.pyc", "app/core.pyc", "app/core/config.pyc", "app/scripts/production_preflight.pyc"):
            file = self.root / relative
            file.write_bytes(b"synthetic bytecode sentinel")
            with self.subTest(file=relative):
                self.refused(self.run_fixture())
            file.unlink()

    def test_external_prefix_matching_timestamp_bytecode_is_refused_before_import(self):
        file = self.root / "app/core/config.py"
        original, metadata = file.read_bytes(), file.stat()
        sentinel = self.base / "external-cache-executed"
        stale = ("open(" + repr(str(sentinel)) + ", 'w').write('stale')\n").encode()
        self.assertLessEqual(len(stale), len(original))
        file.write_bytes(stale.ljust(len(original), b" "))
        os.utime(file, ns=(metadata.st_atime_ns, metadata.st_mtime_ns))
        prefix = self.base / "external-bytecode"
        self.compile_fixture(file, prefix=prefix)
        file.write_bytes(original)
        os.utime(file, ns=(metadata.st_atime_ns, metadata.st_mtime_ns))
        self.assertFalse((file.parent / "__pycache__").exists())
        flags = ["-I", "-B", "-X", "pycache_prefix=" + str(prefix)]
        probe = subprocess.run([self.python] + flags + ["-c",
            "import sys;sys.path.insert(0," + repr(str(self.root)) + ");import app.core.config"],
            cwd=self.root, env={"PATH": "/usr/bin:/bin"}, capture_output=True, timeout=8)
        self.assertEqual(probe.returncode, 0)
        self.assertTrue(sentinel.exists())
        sentinel.unlink()
        self.refused(self.run_fixture(flags=flags))
        self.assertFalse(sentinel.exists())

    def test_each_source_hash_is_enforced_before_synthetic_config_import(self):
        for relative in ("app/scripts/installed_preflight.py", "app/scripts/production_preflight.py", "app/core/config.py"):
            file = self.root / relative
            raw = file.read_bytes()
            file.write_bytes(raw + b"\n# drift\n")
            with self.subTest(file=relative):
                self.refused(self.run_fixture())
            file.write_bytes(raw)

    def test_wrong_interpreter_path_hash_prefix_and_link_chain_are_refused(self):
        original = dict(self.value["interpreter"])
        changes = [{"path": "/missing/python"}, {"sha256": "0" * 64},
                   {"prefix": "/wrong/prefix"},
                   {"symlinks": [{"path": original["path"], "target": "/wrong/python"}]}]
        for changed in changes:
            self.value["interpreter"] = {**original, **changed}
            self.save()
            with self.subTest(fields=list(changed)):
                self.refused(self.run_fixture())
        self.value["interpreter"] = original
        self.save()
        # A hosted toolcache-style writable ancestor must still be refused.
        # Alter only synthetic metadata seen by this child, never host modes.
        ancestor = str(Path(self.python).parent)
        before = ("from types import SimpleNamespace\n"
                  "fixture_lstat=binder.Path.lstat\n"
                  "def writable_interpreter_ancestor(path):\n"
                  " info=fixture_lstat(path)\n"
                  " if str(path)==" + repr(ancestor) + ":\n"
                  "  return SimpleNamespace(st_uid=info.st_uid,st_mode=info.st_mode|0o002)\n"
                  " return info\n"
                  "binder.Path.lstat=writable_interpreter_ancestor\n")
        self.refused(self.run_fixture(before=before))

    def test_config_and_preflight_actual_module_origins_are_checked(self):
        for relative, code in (("app/core/config.py", CONFIG),
                               ("app/scripts/production_preflight.py", PRODUCTION_PREFLIGHT.read_bytes())):
            file = self.root / relative
            for tamper in (b"\n__file__='/wrong/private-origin'\n", b"\n__spec__.origin='/wrong/private-origin'\n"):
                file.write_bytes(code + tamper)
                self.repin(relative)
                self.save()
                with self.subTest(module=relative, tamper=tamper):
                    self.refused(self.run_fixture())
            file.write_bytes(code)
            self.repin(relative)
            self.save()

    def test_package_path_drift_is_checked_after_config_import(self):
        file = self.root / "app/core/config.py"
        file.write_bytes(CONFIG + b"\nimport sys\nsys.modules['app.core'].__path__=['/wrong/private-package']\n")
        self.repin("app/core/config.py")
        self.save()
        self.refused(self.run_fixture())

    def test_parent_package_binding_drift_is_rejected(self):
        file = self.root / "app/core/config.py"
        file.write_bytes(CONFIG + b"\nimport sys\nsys.modules['app'].core=None\n")
        self.repin("app/core/config.py")
        self.save()
        self.refused(self.run_fixture())

    def test_dangling_namespace_initializer_is_rejected(self):
        (self.root / "app/scripts/__init__.py").symlink_to(self.base / "missing.py")
        self.refused(self.run_fixture())

    def test_source_and_contract_symlinks_are_rejected(self):
        file = self.root / "app/core/config.py"
        target = self.base / "outside.py"
        target.write_bytes(file.read_bytes())
        target.chmod(0o640)
        file.unlink()
        file.symlink_to(target)
        self.refused(self.run_fixture())
        link = self.base / "contract-link.json"
        link.symlink_to(self.contract)
        self.refused(self.run_fixture(arguments=[str(link)]))

    def test_source_hardlink_is_rejected(self):
        file = self.root / "app/core/config.py"
        os.link(file, self.base / "second-name.py")
        self.refused(self.run_fixture())

    def test_source_drift_during_import_is_rejected(self):
        file = self.root / "app/core/config.py"
        file.write_bytes(CONFIG + b"\nfrom pathlib import Path\np=Path(__file__)\np.write_bytes(p.read_bytes()+b'\\n# changed after load\\n')\n")
        self.repin("app/core/config.py")
        self.save()
        self.refused(self.run_fixture())

    def test_path_escape_unknown_keys_and_missing_allowlist_member_are_refused(self):
        original = json.loads(json.dumps(self.value))
        changed_values = []
        x = json.loads(json.dumps(original)); x["backend_root"] += "/../backend"; changed_values.append(x)
        x = json.loads(json.dumps(original)); x["files"]["../outside.py"] = x["files"].pop("app/core/config.py"); changed_values.append(x)
        x = json.loads(json.dumps(original)); x["test_owner_override"] = True; changed_values.append(x)
        for x in changed_values:
            self.value = x
            self.save()
            self.refused(self.run_fixture())

    def test_duplicate_contract_keys_are_rejected(self):
        self.contract.write_text('{"schema":1,' + self.contract.read_text()[1:], encoding="utf-8")
        self.refused(self.run_fixture())

    def test_role_and_writable_modes_are_refused(self):
        self.value["role"]["uid"] += 1
        self.save()
        self.refused(self.run_fixture())
        self.value["role"]["uid"] -= 1
        self.save()
        (self.root / "app/core/config.py").chmod(0o660)
        self.refused(self.run_fixture())

    def test_production_role_policy_refuses_uid_or_gid_zero(self):
        original = dict(self.value["role"])
        for field in ("uid", "gid"):
            self.value["role"] = {**original, field: 0}
            self.save()
            with self.subTest(field=field):
                self.refused(self.run_fixture(allow_privileged_fixture_role=False))

    def test_import_errors_and_delegate_failures_never_echo_secrets_or_paths(self):
        file = self.root / "app/core/config.py"
        for raw in (b"print('PRIVATE-SENTINEL')\nraise RuntimeError('PRIVATE-SENTINEL')\n",
                    CONFIG.replace(b"return self", b"raise RuntimeError('PRIVATE-SENTINEL')")):
            file.write_bytes(raw)
            self.repin("app/core/config.py")
            self.save()
            self.refused(self.run_fixture())

    def test_direct_fd_and_existing_logging_stream_output_is_discarded_on_success_and_refusal(self):
        file = self.root / "app/core/config.py"
        output = b'''import os,sys,logging
os.write(1,b"PRIVATE-FD-STDOUT")
os.write(2,b"PRIVATE-FD-STDERR")
sys.__stdout__.write("PRIVATE-ORIGINAL-STDOUT")
sys.__stderr__.write("PRIVATE-ORIGINAL-STDERR")
logging.warning("PRIVATE-LOGGING-SENTINEL")
'''
        for fail in (False, True):
            file.write_bytes(output + CONFIG + (b"\nraise RuntimeError('PRIVATE-SENTINEL')\n" if fail else b""))
            self.repin("app/core/config.py")
            self.save()
            before = "import logging;logging.basicConfig(stream=sys.stderr,level=logging.WARNING)"
            result = self.run_fixture(before=before)
            if fail:
                self.refused(result)
            else:
                self.assertEqual((result.returncode, result.stdout, result.stderr), (0, SUCCESS, ""),
                                 result.fixture_diagnostic)


if __name__ == "__main__":
    unittest.main()
