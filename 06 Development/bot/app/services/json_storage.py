from __future__ import annotations

import copy
import json
import logging
import os
import tempfile
from pathlib import Path
from typing import Any


logger = logging.getLogger(__name__)


def load_json(path: Path, default: Any) -> Any:
    """Load JSON without sharing a mutable default between callers."""
    try:
        with path.open("r", encoding="utf-8") as file:
            return json.load(file)
    except FileNotFoundError:
        return copy.deepcopy(default)
    except (json.JSONDecodeError, OSError, UnicodeDecodeError):
        logger.exception("Could not read JSON storage %s", path)
        return copy.deepcopy(default)


def save_json(path: Path, data: Any) -> None:
    """Atomically replace a JSON file and keep runtime data owner-only."""
    path.parent.mkdir(parents=True, exist_ok=True)
    file_descriptor, temporary_name = tempfile.mkstemp(
        dir=path.parent,
        prefix=f".{path.name}.",
        suffix=".tmp",
    )
    temporary_path = Path(temporary_name)

    try:
        with os.fdopen(file_descriptor, "w", encoding="utf-8") as file:
            json.dump(data, file, ensure_ascii=False, indent=2)
            file.flush()
            os.fsync(file.fileno())

        os.chmod(temporary_path, 0o600)
        os.replace(temporary_path, path)
    except Exception:
        temporary_path.unlink(missing_ok=True)
        raise
