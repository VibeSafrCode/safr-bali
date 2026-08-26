from __future__ import annotations

import os
import re
import shlex
import stat
from dataclasses import asdict, dataclass
from pathlib import Path

from app.core.config import settings
from app.services.visa_lifecycle import PIIConfigurationError, PIIEnvelopeCipher


@dataclass(frozen=True)
class DocumentStorageReadiness:
    storage_configured: bool
    storage_private: bool
    encryption_configured: bool
    key_versioned: bool
    key_custody_confirmed: bool
    scanner_configured: bool
    retention_configured: bool
    backup_restore_verified: bool
    ready: bool

    def public_payload(self) -> dict[str, bool | int]:
        payload = asdict(self)
        payload["max_bytes"] = settings.VISA_DOCUMENT_MAX_BYTES
        return payload


def assess_document_storage() -> DocumentStorageReadiness:
    root_value = settings.VISA_DOCUMENT_STORAGE_ROOT.strip()
    root = Path(root_value) if root_value else None
    storage_configured = bool(root and root.is_absolute() and root.exists() and root.is_dir() and not root.is_symlink())
    storage_private = False
    if storage_configured and root is not None:
        storage_private = stat.S_IMODE(root.stat().st_mode) & 0o077 == 0

    encryption_configured = False
    key_versioned = False
    try:
        cipher = PIIEnvelopeCipher.from_settings()
        encryption_configured = bool(cipher.keys)
        key_versioned = bool(cipher.active_version and cipher.active_version in cipher.keys)
    except PIIConfigurationError:
        pass

    scanner_configured = False
    try:
        scanner = shlex.split(settings.VISA_DOCUMENT_SCANNER_COMMAND)
        executable = Path(scanner[0]) if scanner else None
        scanner_configured = bool(
            executable and executable.is_absolute() and executable.is_file() and os.access(executable, os.X_OK)
        )
    except ValueError:
        pass

    retention_configured = settings.VISA_DOCUMENT_RETENTION_POLICY == "archive_only"
    backup_restore_verified = bool(
        re.fullmatch(r"[0-9a-f]{64}", settings.VISA_DOCUMENT_BACKUP_RESTORE_PROOF_SHA256.strip().lower())
    )
    readiness = DocumentStorageReadiness(
        storage_configured=storage_configured,
        storage_private=storage_private,
        encryption_configured=encryption_configured,
        key_versioned=key_versioned,
        key_custody_confirmed=settings.VISA_DOCUMENT_KEY_CUSTODY_CONFIRMED,
        scanner_configured=scanner_configured,
        retention_configured=retention_configured,
        backup_restore_verified=backup_restore_verified,
        ready=False,
    )
    return DocumentStorageReadiness(
        **{**asdict(readiness), "ready": all(value for key, value in asdict(readiness).items() if key != "ready")}
    )
