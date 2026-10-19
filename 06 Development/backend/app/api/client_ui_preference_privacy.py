"""Private client portal responses and bounded UI-preference request bodies."""

import asyncio

from starlette.datastructures import Headers, MutableHeaders
from starlette.responses import JSONResponse


class ClientUIPreferencePrivacyMiddleware:
    WRITE_PATHS = {"/api/web/preferences/ui-locale", "/mini-app/preferences/ui-locale"}
    PATHS = WRITE_PATHS | {"/api/web/auth/me"}
    PRIVATE_ROOTS = ("/api/web", "/mini-app")
    MAX_BODY = 1024

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        path = scope.get("path", "").rstrip("/")
        private_path = any(path == root or path.startswith(root + "/") for root in self.PRIVATE_ROOTS)
        if scope["type"] != "http" or not private_path:
            return await self.app(scope, receive, send)
        started = False
        replace_validation_body = False

        async def private_send(message):
            nonlocal started, replace_validation_body
            if message["type"] == "http.response.start":
                started = True
                headers = MutableHeaders(scope=message)
                headers["Cache-Control"] = "private, no-store"
                headers["X-Robots-Tag"] = "noindex, nofollow"
                vary = [x.strip() for x in headers.get("Vary", "").split(",") if x.strip()]
                if "cookie" not in {x.lower() for x in vary}:
                    vary.append("Cookie")
                headers["Vary"] = ", ".join(vary)
                if message["status"] == 422 and path in self.PATHS:
                    # Pydantic's normal errors echo prohibited input and IDs.
                    replace_validation_body = True
                    headers["Content-Length"] = str(len(b'{"detail":"Invalid preference request"}'))
                await send(message)
                if replace_validation_body:
                    await send({"type": "http.response.body", "body": b'{"detail":"Invalid preference request"}'})
            elif not replace_validation_body:
                await send(message)

        async def reject(code, detail):
            await JSONResponse({"detail": detail}, status_code=code)(scope, receive, private_send)

        try:
            if (path in self.WRITE_PATHS
                    and scope["method"] == "PATCH"):
                headers = Headers(scope=scope)
                if headers.get("content-type", "").split(";", 1)[0].strip().lower() != "application/json":
                    return await reject(415, "JSON required")
                body = bytearray()
                try:
                    async with asyncio.timeout(2):
                        while True:
                            message = await receive()
                            if message["type"] == "http.disconnect":
                                return
                            body.extend(message.get("body", b""))
                            if len(body) > self.MAX_BODY:
                                return await reject(413, "Preference request too large")
                            if not message.get("more_body", False):
                                break
                except TimeoutError:
                    return await reject(408, "Preference request timed out")

                async def buffered_receive():
                    return {"type": "http.request", "body": bytes(body), "more_body": False}

                await self.app(scope, buffered_receive, private_send)
            else:
                await self.app(scope, receive, private_send)
        except Exception:
            if started:
                raise
            # Never log request payload, actor IDs, credentials or driver errors.
            await reject(500, "Internal server error")
