"""Explicit immutable source roots, not an editable content or price catalog.

The mechanically extracted renderer retains its original process-local caches.
Consequently one process may bind only one exact source revision/root pair.
Deploy sources as immutable files; every public API call rechecks their pins.
"""
from __future__ import annotations

import hashlib
import json
import stat
from dataclasses import dataclass
from pathlib import Path
from threading import RLock


class SourceIntegrityError(RuntimeError):
    """Source paths or exact approved input bytes do not match this package."""


@dataclass(frozen=True)
class ContentRoots:
    bot_content_root: Path
    shared_content_root: Path


@dataclass(frozen=True)
class InputProof:
    root: str
    path: str
    bytes: int
    sha256: str


_MANIFEST = Path(__file__).with_name("source-manifest.json")
_MANIFEST_SHA256 = "b9a8d5e53b7c5957565fe57ba070514f5c7724f960f5ad2fa84d9b7d372daa85"
_lock = RLock()
_roots: ContentRoots | None = None


def _root(value: Path) -> Path:
    path = Path(value)
    if not path.is_absolute():
        raise SourceIntegrityError("Content roots must be explicit absolute directories")
    try:
        if path.is_symlink() or not path.is_dir():
            raise SourceIntegrityError("Content root is not a regular directory")
        return path.resolve(strict=True)
    except OSError as error:
        raise SourceIntegrityError("Content root is unavailable") from error


def _normalized(roots: ContentRoots) -> ContentRoots:
    if not isinstance(roots, ContentRoots):
        raise TypeError("ContentRoots is required")
    return ContentRoots(_root(roots.bot_content_root), _root(roots.shared_content_root))


def _manifest() -> list[dict]:
    raw = _MANIFEST.read_bytes()
    if hashlib.sha256(raw).hexdigest() != _MANIFEST_SHA256:
        raise SourceIntegrityError("Content input pin manifest drift")
    payload = json.loads(raw)
    if payload.get("schemaVersion") != 1 or len(payload.get("inputs", [])) != 8:
        raise SourceIntegrityError("Unsupported content input pin manifest")
    return payload["inputs"]


def verify_inputs(roots: ContentRoots) -> tuple[InputProof, ...]:
    """Read only the eight approved source inputs; reject symlinks and drift."""
    roots = _normalized(roots)
    by_root = {"bot": roots.bot_content_root, "shared": roots.shared_content_root}
    proofs = []
    for entry in _manifest():
        relative = Path(entry["path"])
        if relative.is_absolute() or any(part in {".", ".."} for part in relative.parts):
            raise SourceIntegrityError("Invalid content input path")
        root = by_root[entry["root"]]
        path = root
        try:
            for index, part in enumerate(relative.parts):
                path = path / part
                mode = path.lstat().st_mode
                if stat.S_ISLNK(mode):
                    raise SourceIntegrityError("Content input symlinks are forbidden")
                if index < len(relative.parts) - 1 and not stat.S_ISDIR(mode):
                    raise SourceIntegrityError("Content input parent is not a directory")
            if not stat.S_ISREG(mode):
                raise SourceIntegrityError("Content input is not a regular file")
            if not path.resolve(strict=True).is_relative_to(root):
                raise SourceIntegrityError("Content input escaped its configured root")
            raw = path.read_bytes()
        except OSError as error:
            raise SourceIntegrityError("Approved content input is unavailable") from error
        digest = hashlib.sha256(raw).hexdigest()
        if len(raw) != entry["bytes"] or digest != entry["sha256"]:
            raise SourceIntegrityError("Approved content input bytes drift: " + entry["path"])
        proofs.append(InputProof(entry["root"], entry["path"], len(raw), digest))
    return tuple(proofs)


def _bind_roots(roots: ContentRoots) -> ContentRoots:
    global _roots
    roots = _normalized(roots)
    with _lock:
        if _roots is not None and _roots != roots:
            raise SourceIntegrityError("This process already bound a different immutable content root")
        verify_inputs(roots)
        _roots = roots
        return roots


def bound_roots() -> ContentRoots:
    with _lock:
        if _roots is None:
            raise SourceIntegrityError("Initialize VisaRenderer with explicit content roots first")
        return _roots
