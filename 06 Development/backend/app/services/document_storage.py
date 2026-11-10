from __future__ import annotations

import os
import re
import shlex
import stat
import subprocess
import tempfile
import uuid
from contextlib import contextmanager
from dataclasses import asdict, dataclass
from pathlib import Path

from fastapi import HTTPException, Request
from sqlalchemy.exc import DBAPIError, IntegrityError

from app.core.config import settings
from app.models.visa_lifecycle import VisaDocument
from app.services.visa_lifecycle import PIIConfigurationError, PIIEnvelopeCipher


ALLOWED_DOCUMENT_TYPES = {
    "application/pdf": b"%PDF", "image/png": b"\x89PNG\r\n\x1a\n", "image/jpeg": b"\xff\xd8\xff",
}
STAGED_DOCUMENTS = "staged_protected_documents"


async def read_document_bytes(request: Request, mime: str) -> bytes:
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > settings.VISA_DOCUMENT_MAX_BYTES:
            raise HTTPException(status_code=413, detail="Document is too large")
    if not body.startswith(ALLOWED_DOCUMENT_TYPES[mime]):
        raise HTTPException(status_code=415, detail="Document content does not match its type")
    return bytes(body)


@contextmanager
def protected_upload(db, case, body: bytes, *, admin_id: int, upload_key: str, checksum: str,
                     mime: str, display_name: str, document_type: str, visibility: str):
    """Stage a scanned encrypted document and remove it if preparation fails."""
    root = Path(settings.VISA_DOCUMENT_STORAGE_ROOT).resolve()
    cipher = PIIEnvelopeCipher.from_settings()
    quarantine = None
    final_path = None
    try:
        with tempfile.NamedTemporaryFile(dir=root, prefix=".quarantine-", delete=False) as temporary:
            quarantine = Path(temporary.name)
            temporary.write(body)
        try:
            result = subprocess.run([*shlex.split(settings.VISA_DOCUMENT_SCANNER_COMMAND), str(quarantine)],
                                    stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                    stderr=subprocess.DEVNULL, timeout=60)
        except subprocess.TimeoutExpired:
            raise HTTPException(status_code=503, detail="Document security scanning is unavailable") from None
        if result.returncode != 0:
            raise HTTPException(status_code=422, detail="Document did not pass security scanning")
        quarantine.unlink()
        quarantine = None
        storage_key = f"{uuid.uuid4().hex}.enc"
        encrypted = cipher.encrypt_bytes(body, context=f"visa-document:{case.user_id}:{upload_key}")
        descriptor = os.open(root / storage_key, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        final_path = root / storage_key
        with os.fdopen(descriptor, "wb") as target:
            target.write(encrypted)
            target.flush()
            os.fsync(target.fileno())
        document = VisaDocument(user_id=case.user_id, visa_case_id=case.id, document_type=document_type,
                                display_name=display_name, storage_key=storage_key, upload_idempotency_key=upload_key,
                                checksum_sha256=checksum, mime_type=mime, size_bytes=len(body), visibility=visibility,
                                uploaded_by_admin_id=admin_id)
        db.add(document)
        db.flush()
        yield document
        db.info.setdefault(STAGED_DOCUMENTS, []).append(final_path)
    except BaseException:
        if final_path is not None:
            final_path.unlink(missing_ok=True)
        raise
    finally:
        if quarantine is not None:
            quarantine.unlink(missing_ok=True)


def commit_protected_upload(db):
    staged = db.info.pop(STAGED_DOCUMENTS, ())
    try:
        db.commit()
    except DBAPIError as error:
        sqlstate = getattr(error.orig, "sqlstate", None)
        # A lost connection may have lost only the commit acknowledgement.
        if staged and not error.connection_invalidated and (
            isinstance(error, IntegrityError) or sqlstate in {"40001", "40P01"}
        ):
            db.rollback()
            for path in staged:
                path.unlink(missing_ok=True)
        raise


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
