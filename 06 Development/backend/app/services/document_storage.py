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
from threading import BoundedSemaphore

from anyio import fail_after
from fastapi import HTTPException, Request
from sqlalchemy.exc import DBAPIError, IntegrityError

from app.core.config import settings
from app.models.visa_lifecycle import VisaDocument
from app.services.visa_lifecycle import PIIConfigurationError, PIIEnvelopeCipher


ALLOWED_DOCUMENT_TYPES = {
    "application/pdf": b"%PDF", "image/png": b"\x89PNG\r\n\x1a\n", "image/jpeg": b"\xff\xd8\xff",
}
STAGED_DOCUMENTS = "staged_protected_documents"
DOCUMENT_BODY_TIMEOUT_SECONDS = 30
_document_upload_slots = BoundedSemaphore(4)


@contextmanager
def document_upload_slot():
    if not _document_upload_slots.acquire(blocking=False):
        raise HTTPException(status_code=503, detail="Protected upload is busy; retry the same request")
    try:
        yield
    finally:
        _document_upload_slots.release()


async def read_document_bytes(request: Request, mime: str) -> bytes:
    body = bytearray()
    try:
        with fail_after(DOCUMENT_BODY_TIMEOUT_SECONDS):
            async for chunk in request.stream():
                if len(chunk) > settings.VISA_DOCUMENT_MAX_BYTES - len(body):
                    raise HTTPException(status_code=413, detail="Document is too large")
                body.extend(chunk)
    except TimeoutError:
        raise HTTPException(status_code=408, detail="Document upload timed out") from None
    if not body.startswith(ALLOWED_DOCUMENT_TYPES[mime]):
        raise HTTPException(status_code=415, detail="Document content does not match its type")
    return bytes(body)


@dataclass(frozen=True)
class PreparedDocument:
    user_id: int
    upload_key: str
    checksum: str
    size: int
    ciphertext: bytes


def prepare_protected_document(body: bytes, *, user_id: int, upload_key: str, checksum: str) -> PreparedDocument:
    """Scan in private storage, then encrypt for the exact immutable upload context."""
    root = Path(settings.VISA_DOCUMENT_STORAGE_ROOT).resolve()
    with tempfile.NamedTemporaryFile(dir=root, prefix=".quarantine-") as temporary:
        temporary.write(body)
        temporary.flush()
        try:
            result = subprocess.run([*shlex.split(settings.VISA_DOCUMENT_SCANNER_COMMAND), temporary.name],
                                    stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                    stderr=subprocess.DEVNULL, timeout=60)
        except (OSError, subprocess.TimeoutExpired):
            raise HTTPException(status_code=503, detail="Document security scanning is unavailable") from None
        if result.returncode != 0:
            raise HTTPException(status_code=422, detail="Document did not pass security scanning")
    ciphertext = PIIEnvelopeCipher.from_settings().encrypt_bytes(
        body, context=f"visa-document:{user_id}:{upload_key}",
    )
    return PreparedDocument(user_id, upload_key, checksum, len(body), ciphertext)


@contextmanager
def protected_upload(db, case, prepared: PreparedDocument, *, admin_id: int,
                     mime: str, display_name: str, document_type: str, visibility: str):
    """Stage the scanned ciphertext and register it in the caller's short transaction."""
    if case.user_id != prepared.user_id:
        raise HTTPException(status_code=409, detail="Visa case changed")
    root = Path(settings.VISA_DOCUMENT_STORAGE_ROOT).resolve()
    final_path = None
    try:
        storage_key = f"{uuid.uuid4().hex}.enc"
        descriptor = os.open(root / storage_key, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        final_path = root / storage_key
        with os.fdopen(descriptor, "wb") as target:
            target.write(prepared.ciphertext)
            target.flush()
            os.fsync(target.fileno())
        document = VisaDocument(user_id=case.user_id, visa_case_id=case.id, document_type=document_type,
                                display_name=display_name, storage_key=storage_key, upload_idempotency_key=prepared.upload_key,
                                checksum_sha256=prepared.checksum, mime_type=mime, size_bytes=prepared.size, visibility=visibility,
                                uploaded_by_admin_id=admin_id)
        db.add(document)
        db.flush()
        yield document
        db.info.setdefault(STAGED_DOCUMENTS, []).append(final_path)
    except BaseException:
        if final_path is not None:
            final_path.unlink(missing_ok=True)
        raise


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
