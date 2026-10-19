"""Shared HTTP outcome mapping; authentication stays surface-specific."""

from collections.abc import Callable

from fastapi import HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.exc import OperationalError

from app.schemas.client_ui_preference import ClientUIPreferenceWrite
from app.services.client_ui_preference import UIActorUnavailable, UIPreferenceConflict


def preference_write_response(
    actor_id: int,
    intent: ClientUIPreferenceWrite,
    persist: Callable[[int, ClientUIPreferenceWrite], dict],
):
    try:
        return persist(actor_id, intent)
    except UIActorUnavailable:
        raise HTTPException(status_code=401, detail="Authentication required") from None
    except UIPreferenceConflict as conflict:
        return JSONResponse(status_code=409, content={
            "detail": "UI preference conflict", "current": conflict.current,
        })
    except OperationalError:
        # A failed commit acknowledgement is not proof that the write rolled back.
        raise HTTPException(status_code=503, detail="UI preference unavailable; reconcile state") from None
