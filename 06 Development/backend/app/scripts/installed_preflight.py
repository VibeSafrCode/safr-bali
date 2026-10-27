"""Bind a future installed backend preflight to a root-owned source contract.

Invoke the absolute candidate file with its pinned Python ``-I -B`` and one
absolute contract argument. This performs no service, database or network work.
It does not prove dependency closure or the effective systemd sandbox.

Schema 1 has exactly backend_root, role {uid,gid}, interpreter, directories,
files and schema. Files have {sha256,bytes,mode}; the five names below are the
complete allowlist and both package initializers must remain empty. Directories
pin the root, app, app/core and app/scripts modes. The interpreter pins its launch path,
resolved binary, prefix, body/mode/size and every symlink {path,target} in order.
The contract itself is root-owned 0640 with the declared role group.

Schema 2 adds exactly groups {files, directories}: each map has the same exact
path allowlist as its source section, with independently pinned numeric GIDs.
This preserves existing protected source groups without granting access or
changing ACLs. Schema 1 still requires every source/directory GID to equal the
effective role GID. Contract ownership/group and effective role checks do not
change. Group 0 is allowed for source metadata, never as a production role.

Schema 3 additionally binds one existing private profile {path,sha256,bytes,
mode,gid}. SAFR_SETTINGS_ENV_FILE must exactly select that physical file. The
original identity, metadata and bytes are rechecked throughout ordinary imports;
no profile is copied, linked, synthesized or printed. Environment precedence is
unchanged: this is not proof of the service's entire effective environment.
"""

import contextlib
import hashlib
import importlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import sys
from types import ModuleType
from importlib.machinery import SourceFileLoader


_WRAPPER = "app/scripts/installed_preflight.py"
_PREFLIGHT = "app/scripts/production_preflight.py"
_CONFIG = "app/core/config.py"
_FILES = {"app/__init__.py", "app/core/__init__.py", _WRAPPER, _PREFLIGHT, _CONFIG}
_DIRS = {"root", "app", "app/core", "app/scripts"}
_SUCCESS = "SAFR installed backend preflight: OK"
_REFUSAL = "Installed backend preflight refused."
_PROFILE_ENV = "SAFR_SETTINGS_ENV_FILE"


class _Refused(Exception):
    pass


class _Trust:
    """Policy is code, never a contract/environment/CLI test switch.

    Tests inject an explicit fixture owner and anchor into the private harness;
    main() always uses the root-owned production policy.
    """
    def __init__(self, owner_uid=0, anchor="/", interpreter_owners=(0,),
                 allow_privileged_fixture_role=False):
        self.owner_uid = owner_uid
        self.anchor = Path(anchor)
        self.interpreter_owners = frozenset(interpreter_owners)
        self.allow_privileged_fixture_role = allow_privileged_fixture_role


def _need(value):
    if not value:
        raise _Refused()


def _absolute(value):
    _need(isinstance(value, str) and value.startswith("/")
          and not any(ord(c) < 32 for c in value)
          and os.path.normpath(value) == value and "//" not in value)
    return Path(value)


def _strict_object(pairs):
    result = {}
    for key, value in pairs:
        _need(key not in result)
        result[key] = value
    return result


def _reject_constant(value):
    raise _Refused()


def _directories(path, trust):
    anchor = _absolute(str(trust.anchor))
    _need(path == anchor or anchor in path.parents)
    chain = [anchor]
    relative = path.relative_to(anchor)
    for part in relative.parts:
        chain.append(chain[-1] / part)
    for directory in chain:
        info = directory.lstat()
        _need(stat.S_ISDIR(info.st_mode) and info.st_uid == trust.owner_uid
              and not info.st_mode & 0o022)


def _read(path, trust, *, mode, group=None, size=None, cap=262144):
    _directories(path.parent, trust)
    before = path.lstat()
    _need(stat.S_ISREG(before.st_mode) and before.st_nlink == 1
          and before.st_uid == trust.owner_uid
          and stat.S_IMODE(before.st_mode) == mode
          and (group is None or before.st_gid == group)
          and before.st_size <= cap
          and (size is None or before.st_size == size))
    descriptor = os.open(str(path), os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        opened = os.fstat(descriptor)
        _need((opened.st_dev, opened.st_ino) == (before.st_dev, before.st_ino))
        data = bytearray()
        while len(data) <= cap:
            block = os.read(descriptor, min(65536, cap + 1 - len(data)))
            if not block:
                break
            data.extend(block)
        after = os.fstat(descriptor)
        linked = path.lstat()
        _need(len(data) == before.st_size and len(data) <= cap
              and (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns,
                   after.st_ctime_ns, after.st_mode, after.st_uid, after.st_gid)
              == (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns,
                  before.st_ctime_ns, before.st_mode, before.st_uid, before.st_gid)
              and (linked.st_dev, linked.st_ino) == (before.st_dev, before.st_ino)
              and after.st_nlink == 1 and linked.st_nlink == 1)
        return bytes(data), before
    finally:
        os.close(descriptor)


def _pin(value, *, modes):
    _need(isinstance(value, dict) and set(value) == {"sha256", "bytes", "mode"})
    _need(isinstance(value["sha256"], str) and len(value["sha256"]) == 64
          and all(c in "0123456789abcdef" for c in value["sha256"])
          and type(value["bytes"]) is int and 0 <= value["bytes"] <= 262144
          and value["mode"] in modes)
    return int(value["mode"], 8)


def _interpreter(spec, trust):
    _need(isinstance(spec, dict) and set(spec) == {
        "path", "resolved", "prefix", "sha256", "bytes", "mode", "symlinks"})
    launch, resolved = _absolute(spec["path"]), _absolute(spec["resolved"])
    _need(str(launch) == sys.executable and spec["prefix"] == sys.prefix)
    _absolute(spec["prefix"])
    _need(isinstance(spec["sha256"], str) and len(spec["sha256"]) == 64
          and all(c in "0123456789abcdef" for c in spec["sha256"])
          and type(spec["bytes"]) is int and 0 < spec["bytes"] <= 67108864
          and spec["mode"] in {"0755", "0555"}
          and isinstance(spec["symlinks"], list) and len(spec["symlinks"]) <= 8)
    declared = []
    for link in spec["symlinks"]:
        _need(isinstance(link, dict) and set(link) == {"path", "target"})
        _absolute(link["path"])
        _need(isinstance(link["target"], str) and link["target"]
              and not any(ord(c) < 32 for c in link["target"]))
        declared.append(link)
    current, observed = launch, []
    while True:
        prefix = Path("/")
        redirected = False
        for index, part in enumerate(current.parts[1:]):
            prefix /= part
            info = prefix.lstat()
            _need(info.st_uid in trust.interpreter_owners)
            if stat.S_ISLNK(info.st_mode):
                target = os.readlink(prefix)
                observed.append({"path": str(prefix), "target": target})
                _need(len(observed) <= 8 and observed == declared[:len(observed)])
                replacement = target if target.startswith("/") else str(prefix.parent / target)
                remaining = current.parts[index + 2:]
                current = Path(os.path.normpath(os.path.join(replacement, *remaining)))
                redirected = True
                break
            _need(not info.st_mode & 0o022)
            if index < len(current.parts) - 2:
                _need(stat.S_ISDIR(info.st_mode))
        if not redirected:
            break
    _need(current == resolved and observed == declared and resolved.is_file())
    info = resolved.lstat()
    _need(stat.S_IMODE(info.st_mode) == int(spec["mode"], 8)
          and info.st_size == spec["bytes"])
    # Interpreter hard links are normal on some systems; source hard links are not.
    descriptor = os.open(str(resolved), os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        opened = os.fstat(descriptor)
        _need((opened.st_dev, opened.st_ino) == (info.st_dev, info.st_ino))
        digest, length = hashlib.sha256(), 0
        while length <= spec["bytes"]:
            block = os.read(descriptor, min(65536, spec["bytes"] + 1 - length))
            if not block:
                break
            digest.update(block)
            length += len(block)
        after, linked = os.fstat(descriptor), resolved.lstat()
        _need(length == spec["bytes"] and digest.hexdigest() == spec["sha256"]
              and (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns,
                   after.st_ctime_ns, after.st_mode, after.st_uid, after.st_gid)
              == (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns,
                  info.st_ctime_ns, info.st_mode, info.st_uid, info.st_gid)
              and (linked.st_dev, linked.st_ino) == (info.st_dev, info.st_ino))
    finally:
        os.close(descriptor)


_MODULES = {
    "app": ("app/__init__.py", "app"),
    "app.core": ("app/core/__init__.py", "app/core"),
    "app.scripts": (None, "app/scripts"),
    "app.core.config": (_CONFIG, None),
    "app.scripts.production_preflight": (_PREFLIGHT, None),
}


def _spec(root, name, spec, *, imported=False):
    file, package = _MODULES[name]
    origin = str(root / file) if file else None
    _need(spec is not None and spec.name == name and spec.origin == origin)
    if package:
        _need(spec.submodule_search_locations is not None
              and list(spec.submodule_search_locations) == [str(root / package)])
    else:
        _need(spec.submodule_search_locations is None)
    if file:
        _need(type(spec.loader) is SourceFileLoader and spec.loader.name == name
              and spec.loader.path == origin and spec.loader.get_filename(name) == origin)
    elif not imported:
        _need(spec.loader is None)
    else:
        # NamespaceLoader is not a public import on every supported Python.
        _need(type(spec.loader).__name__ in {"NamespaceLoader", "_NamespaceLoader"}
              and type(spec.loader).__module__ in {"_frozen_importlib_external", "importlib._bootstrap_external"})


def _origins(root, names):
    _need({n for n in sys.modules if n == "app" or n.startswith("app.")} == set(names))
    for name in names:
        file, package = _MODULES[name]
        module = sys.modules[name]
        _need(isinstance(module, ModuleType) and module.__name__ == name)
        spec = module.__spec__
        _spec(root, name, spec, imported=True)
        _need(module.__package__ == (name if package else name.rsplit(".", 1)[0]))
        if "." in name:
            parent, child = name.rsplit(".", 1)
            _need(getattr(sys.modules[parent], child, None) is module)
        origin = str(root / file) if file else None
        _need(getattr(module, "__file__", None) == origin and module.__loader__ is spec.loader)
        if package:
            location = [str(root / package)]
            _need(list(module.__path__) == location
                  and list(spec.submodule_search_locations) == location)
        else:
            _need(not hasattr(module, "__path__") and spec.submodule_search_locations is None)


def _group_pins(contract, role):
    # A group is an exact metadata pin, not a grant of permission. Exclude the
    # unsigned gid_t sentinel as well as bool, negatives and oversized values.
    if contract["schema"] == 1:
        return ({name: role["gid"] for name in _FILES},
                {name: role["gid"] for name in _DIRS})
    groups = contract["groups"]
    _need(isinstance(groups, dict) and set(groups) == {"files", "directories"})
    for section, names in (("files", _FILES), ("directories", _DIRS)):
        values = groups[section]
        _need(isinstance(values, dict) and set(values) == names)
        _need(all(type(value) is int and 0 <= value <= 4294967294
                  for value in values.values()))
    return dict(groups["files"]), dict(groups["directories"])


def _profile_identity(info):
    return (info.st_dev, info.st_ino, info.st_mode, info.st_uid, info.st_gid,
            info.st_nlink, info.st_size, info.st_mtime_ns, info.st_ctime_ns)


def _bind_profile(contract, trust):
    if contract["schema"] != 3:
        # Legacy contracts must not silently accept an unbound new override.
        _need(_PROFILE_ENV not in os.environ)
        return None
    spec = contract["profile"]
    _need(isinstance(spec, dict) and set(spec) == {"path", "sha256", "bytes", "mode", "gid"})
    path = _absolute(spec["path"])
    _need(not any(ord(char) == 127 for char in str(path)))
    _pin({key: spec[key] for key in ("sha256", "bytes", "mode")}, modes={"0600", "0640"})
    _need(spec["bytes"] > 0 and type(spec["gid"]) is int and 0 <= spec["gid"] <= 4294967294)
    _need(os.environ.get(_PROFILE_ENV) == str(path))
    raw, info = _read(path, trust, mode=int(spec["mode"], 8), group=spec["gid"], size=spec["bytes"])
    _need(hashlib.sha256(raw).hexdigest() == spec["sha256"])
    return (path, dict(spec), raw, _profile_identity(info))


def _profile_state(profile, trust):
    if profile is None:
        _need(_PROFILE_ENV not in os.environ)
        return
    path, spec, original, identity = profile
    _need(os.environ.get(_PROFILE_ENV) == str(path))
    raw, info = _read(path, trust, mode=int(spec["mode"], 8), group=spec["gid"], size=spec["bytes"])
    _need(raw == original and _profile_identity(info) == identity)


def _directory_state(root, directories, directory_groups, trust):
    _need(isinstance(directories, dict) and set(directories) == _DIRS
          and isinstance(directory_groups, dict) and set(directory_groups) == _DIRS)
    for relative, mode in directories.items():
        _need(mode in {"0755", "0750"})
        group = directory_groups[relative]
        _need(type(group) is int and 0 <= group <= 4294967294)
        directory = root if relative == "root" else root / relative
        _directories(directory, trust)
        info = directory.lstat()
        _need(stat.S_ISDIR(info.st_mode) and info.st_uid == trust.owner_uid
              and not info.st_mode & 0o022 and info.st_gid == group
              and stat.S_IMODE(info.st_mode) == int(mode, 8))


def _source_state(root, pins, sources, file_groups, directories, directory_groups, trust):
    _directory_state(root, directories, directory_groups, trust)
    # -B prevents writes, not reads. Refuse every bytecode cache in the three
    # imported package directories rather than trusting timestamp/size headers.
    for directory in (root / "app", root / "app/core", root / "app/scripts"):
        _need(not os.path.lexists(directory / "__pycache__"))
        _need(not any(entry.name.endswith(".pyc") for entry in directory.iterdir()))
    _need(not os.path.lexists(root / "app.pyc")
          and not os.path.lexists(root / "app/scripts/__init__.py"))
    for relative, pin in pins.items():
        _need(_read(root / relative, trust, mode=int(pin["mode"], 8),
                    group=file_groups[relative], size=pin["bytes"])[0] == sources[relative])


def _import_candidate(name, root, names):
    # Use the ordinary Python resolver/loader, not constructed module origins.
    # A custom or old resolver selecting another checkout is a refusal.
    importlib.invalidate_caches()
    _spec(root, name, importlib.util.find_spec(name))
    module = importlib.import_module(name)
    _need(module is sys.modules.get(name))
    names.append(name)
    _origins(root, names)
    return module


def _run_contract(contract_path, trust):
    _need(sys.flags.isolated == 1 and sys.flags.dont_write_bytecode == 1
          and sys.dont_write_bytecode is True and sys.pycache_prefix is None)
    _need("PYTHONPATH" not in os.environ and "PYTHONHOME" not in os.environ)
    _need(not any(n == "app" or n.startswith("app.") for n in sys.modules))
    contract_path = _absolute(contract_path)
    raw, metadata = _read(contract_path, trust, mode=0o640, cap=32768)
    contract = json.loads(raw.decode("utf-8"), object_pairs_hook=_strict_object,
                          parse_constant=_reject_constant)
    _need(isinstance(contract, dict) and type(contract.get("schema")) is int
          and contract["schema"] in {1, 2, 3})
    keys = {"schema", "backend_root", "role", "interpreter", "directories", "files"}
    if contract["schema"] >= 2:
        keys.add("groups")
    if contract["schema"] == 3:
        keys.add("profile")
    _need(set(contract) == keys)
    root = _absolute(contract["backend_root"])
    role = contract["role"]
    _need(isinstance(role, dict) and set(role) == {"uid", "gid"}
          and type(role["uid"]) is int and role["uid"] >= 0
          and type(role["gid"]) is int and role["gid"] >= 0
          and (trust.allow_privileged_fixture_role or (role["uid"] > 0 and role["gid"] > 0))
          and os.geteuid() == role["uid"] and os.getegid() == role["gid"]
          and metadata.st_gid == role["gid"])
    _need(os.getcwd() == str(root) and str(_absolute(__file__)) == str(root / _WRAPPER))
    file_groups, directory_groups = _group_pins(contract, role)
    profile = _bind_profile(contract, trust)
    directories = contract["directories"]
    _directory_state(root, directories, directory_groups, trust)
    _interpreter(contract["interpreter"], trust)
    pins = contract["files"]
    _need(isinstance(pins, dict) and set(pins) == _FILES)
    sources = {}
    for relative, pin in pins.items():
        mode = _pin(pin, modes={"0640"} if relative == _CONFIG else {"0644"})
        source, _ = _read(root / relative, trust, mode=mode, group=file_groups[relative], size=pin["bytes"])
        _need(hashlib.sha256(source).hexdigest() == pin["sha256"])
        sources[relative] = source
    _need(sources["app/__init__.py"] == b"" and sources["app/core/__init__.py"] == b""
          and not os.path.lexists(root / "app/scripts/__init__.py"))
    # Preserve production_preflight's refusal before any settings import.
    _need(os.environ.get("ENVIRONMENT", "").strip().lower() in {"prod", "production"})
    sys.path.insert(0, str(root))
    names = []
    for name in ("app", "app.core", "app.scripts", "app.scripts.production_preflight", "app.core.config"):
        _profile_state(profile, trust)
        _source_state(root, pins, sources, file_groups, directories, directory_groups, trust)
        _import_candidate(name, root, names)
        _source_state(root, pins, sources, file_groups, directories, directory_groups, trust)
        _profile_state(profile, trust)
    preflight = sys.modules["app.scripts.production_preflight"]
    _need(preflight.main() == 0)
    _origins(root, names)
    _interpreter(contract["interpreter"], trust)
    # Detect source/contract drift across the ordinary imports and delegate.
    _need(_read(contract_path, trust, mode=0o640, group=role["gid"], cap=32768)[0] == raw)
    _source_state(root, pins, sources, file_groups, directories, directory_groups, trust)
    _profile_state(profile, trust)


class _Discard:
    def write(self, value):
        return len(value)

    def flush(self):
        pass


@contextlib.contextmanager
def _silent_output():
    """Discard Python streams and direct FD/native/logging writes while checking.

    This is output containment, not a sandbox for hostile code or children.
    """
    saved = []
    null = None
    try:
        for stream in (sys.stdout, sys.stderr):
            stream.flush()
        null = os.open(os.devnull, os.O_WRONLY | os.O_CLOEXEC)
        for descriptor in (1, 2):
            saved.append((descriptor, os.dup(descriptor)))
        for descriptor, _ in saved:
            os.dup2(null, descriptor)
        with contextlib.redirect_stdout(_Discard()), contextlib.redirect_stderr(_Discard()):
            try:
                yield
            finally:
                for stream in (sys.__stdout__, sys.__stderr__):
                    if stream is not None:
                        try:
                            stream.flush()
                        except Exception:
                            pass
    finally:
        for descriptor, duplicate in saved:
            try:
                os.dup2(duplicate, descriptor)
            finally:
                os.close(duplicate)
        if null is not None:
            os.close(null)


def _report(arguments, trust):
    result = 2
    try:
        _need(len(arguments) == 1)
        with _silent_output():
            _run_contract(arguments[0], trust)
        result = 0
    except BaseException:
        pass
    try:
        os.write(1 if result == 0 else 2, ((_SUCCESS if result == 0 else _REFUSAL) + "\n").encode("ascii"))
    except OSError:
        return 2
    return result


def main():
    return _report(sys.argv[1:], _Trust())


if __name__ == "__main__":
    raise SystemExit(main())
