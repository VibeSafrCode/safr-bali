"""Root-admin, read-only projections of an existing client's account.

The authenticated actor remains the administrator. The target is only a read
parameter; no session/cookie, permission, or user identity is switched.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from starlette.datastructures import MutableHeaders
from starlette.responses import JSONResponse

from app.api.life_services import _client_services
from app.api.visa_lifecycle import _detail_for_user, _list_for_user
from app.api.web_admin import require_web_admin
from app.api.web_portal import dashboard_for_user
from app.core.security import rate_limit
from app.db.session import SessionLocal
from app.models.user import User
from app.services.client_portal import load_client_chat


logger = logging.getLogger(__name__)
router = APIRouter(
    prefix="/api/web/admin/clients/{user_id}/account-preview",
    tags=["web-admin", "client-account-preview"],
    dependencies=[Depends(rate_limit)],
)


class ClientPreviewNoStoreMiddleware:
    """Cover routing/auth/validation failures too, including 405 and 500."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        parts = scope.get("path", "").split("/")
        if (scope["type"] != "http" or len(parts) < 7
                or parts[1:5] != ["api", "web", "admin", "clients"]
                or parts[6] != "account-preview"):
            return await self.app(scope, receive, send)

        started = False

        async def private_send(message):
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
                headers = MutableHeaders(scope=message)
                headers["Cache-Control"] = "private, no-store"
                headers["X-Robots-Tag"] = "noindex, nofollow"
                headers["Vary"] = ", ".join(filter(None, [headers.get("Vary"), "Cookie"]))
            await send(message)

        try:
            await self.app(scope, receive, private_send)
        except Exception:
            if started:
                raise
            logger.exception("Client account preview failed")
            await JSONResponse({"detail": "Internal server error"}, status_code=500)(
                scope, receive, private_send,
            )


def preview_target(
    user_id: int,
    request: Request,
    actor: User = Depends(require_web_admin),
) -> User:
    # require_web_admin revalidates role, active status, and configured root ID
    # against the authenticated session's server-side User on every request.
    with SessionLocal() as db:
        target = db.query(User).filter(User.id == user_id, User.status == "active").first()
        if target is None:
            raise HTTPException(status_code=404, detail="Client not found")
        db.expunge(target)
    # Existing AdminAction records business mutations, not read access. Keep
    # reads free of business writes; attribute access in the server log instead.
    logger.info(
        "Client account preview read actor_user_id=%s target_user_id=%s resource=%s",
        actor.id, target.id, request.scope["route"].name,
    )
    return target


def _metadata_only_documents(card: dict) -> dict:
    # Client document URLs authenticate their session owner. They cannot be used
    # under an administrator's session. Expose visible metadata, no download URL.
    for document in card.get("documents", []):
        document["access_url"] = None
    return card


@router.get("/account")
def preview_account(target: User = Depends(preview_target)):
    with SessionLocal() as db:
        return dashboard_for_user(db, target)


@router.get("/life-services")
def preview_life_services(target: User = Depends(preview_target)):
    return _client_services(target)


@router.get("/visa-cases")
def preview_visa_cases(target: User = Depends(preview_target)):
    result = _list_for_user(target)
    for card in result["items"]:
        _metadata_only_documents(card)
    return result


@router.get("/visa-cases/{case_id}")
def preview_visa_case(case_id: int, target: User = Depends(preview_target)):
    return _metadata_only_documents(_detail_for_user(case_id, target))


@router.get("/chat")
def preview_chat(target: User = Depends(preview_target)):
    with SessionLocal() as db:
        return load_client_chat(db, target.id)
