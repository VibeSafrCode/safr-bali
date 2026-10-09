"""Frozen /api/yoga-channel contract. No global SAFRWAY service credential."""
import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
import re

import httpx
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from typing import Literal


class BackendUnavailable(RuntimeError):
    pass


class BackendRejected(RuntimeError):
    pass


class BackendContractError(RuntimeError):
    pass


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, frozen=True)


class IntakeReceipt(StrictModel):
    conversation_id: int = Field(gt=0, lt=2**63)
    message_id: int = Field(gt=0)
    idempotent_replay: bool


class Delivery(StrictModel):
    id: int = Field(gt=0)
    lease_token: str = Field(min_length=20, max_length=100, pattern=r"^[A-Za-z0-9_-]+$", repr=False)
    lease_expires_at: str = Field(min_length=19, max_length=40)
    recipient_id: int = Field(gt=0, lt=2**63, repr=False)
    recipient_role: Literal["observer", "client"]
    conversation_id: int = Field(gt=0, lt=2**63)
    message_id: int = Field(gt=0)
    body: str = Field(min_length=1, max_length=4000, repr=False)
    # Backward-compatible addition from the primary integration adapter.
    author_type: Literal["client", "staff"] | None = None
    brand: Literal["Yoga Ganster"]
    topic: str = Field(min_length=1, max_length=80, pattern=r"^[a-z][a-z0-9_-]*$")
    topic_label: str = Field(min_length=1, max_length=1000)
    marker: str = Field(min_length=1, max_length=1100)
    observer_read_only: bool
    allow_client_reply: Literal[False]

    def expires(self):
        try:
            value = datetime.fromisoformat(self.lease_expires_at.replace("Z", "+00:00"))
            return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)
        except ValueError:
            raise BackendContractError("invalid_delivery_expiry") from None


class Settlement(StrictModel):
    id: int = Field(gt=0)
    status: Literal["DELIVERED", "RETRY", "UNKNOWN", "FAILED"]
    idempotent_replay: bool


def parse_model(model, value):
    try:
        return model.model_validate(value)
    except ValidationError:
        raise BackendContractError("invalid_channel_response") from None


@dataclass(frozen=True)
class Inbound:
    update_id: int
    sender_telegram_id: int
    chat_id: int
    body: str
    topic: str = "general"
    conversation_id: int | None = None

    def payload(self):
        if (type(self.update_id) is not int or not 0 <= self.update_id < 2**63
                or type(self.sender_telegram_id) is not int or not 0 < self.sender_telegram_id < 2**63
                or type(self.chat_id) is not int or self.chat_id != self.sender_telegram_id
                or not isinstance(self.body, str) or not self.body.strip() or len(self.body) > 4000
                or not isinstance(self.topic, str) or not re.fullmatch(r"[a-z][a-z0-9_-]{0,79}", self.topic)
                or self.conversation_id is not None and (type(self.conversation_id) is not int or self.conversation_id <= 0)):
            raise BackendContractError("invalid_inbound_request")
        return self.__dict__.copy()


class ChannelClient:
    def __init__(self, settings, transport=None, sleeper=asyncio.sleep):
        self.sleeper = sleeper
        self.client = httpx.AsyncClient(base_url=settings.backend_origin + "/api/yoga-channel/",
            headers={"X-Service-Token": settings.service_api_token},
            timeout=httpx.Timeout(5, connect=2), limits=httpx.Limits(max_connections=3, max_keepalive_connections=3),
            trust_env=False, follow_redirects=False, transport=transport)

    async def close(self):
        await self.client.aclose()

    async def _post(self, path, payload, retry=False):
        for attempt in range(3 if retry else 1):
            try:
                response = await self.client.post(path, json=payload)
            except httpx.TransportError:
                if retry and attempt < 2:
                    await self.sleeper(0.2 * (attempt + 1))
                    continue
                raise BackendUnavailable("channel_transport_unavailable") from None
            if response.status_code in {429, 500, 502, 503, 504}:
                if retry and attempt < 2:
                    # No caller identity/body/raw error or URL is logged.
                    await self.sleeper(0.2 * (attempt + 1))
                    continue
                raise BackendUnavailable("channel_temporarily_unavailable")
            if not 200 <= response.status_code < 300:
                raise BackendRejected("channel_request_rejected")
            if len(response.content) > 100_000:
                raise BackendContractError("channel_response_too_large")
            try:
                return response.json()
            except ValueError:
                raise BackendContractError("invalid_channel_json") from None
        raise BackendUnavailable("channel_temporarily_unavailable")

    async def inbound(self, request):
        # Exact payload/update ID is retained for every retry, even after a
        # response was lost following successful canonical commit.
        return parse_model(IntakeReceipt, await self._post("inbound", request.payload(), retry=True))

    async def claim(self):
        # One leased send at a time: the API currently leases for 60 seconds.
        value = await self._post("deliveries/claim", {"limit": 1})
        if not isinstance(value, list) or len(value) > 1:
            raise BackendContractError("invalid_claim_batch")
        result = [parse_model(Delivery, row) for row in value]
        for row in result:
            row.expires()
            if row.observer_read_only != (row.recipient_role == "observer") or row.marker != row.brand + " · " + row.topic_label:
                raise BackendContractError("invalid_delivery_scope")
        return result

    async def settle(self, delivery, outcome, error_code=None, telegram_message_id=None):
        payload = {"lease_token": delivery.lease_token, "outcome": outcome,
                   "error_code": error_code, "telegram_message_id": telegram_message_id}
        result = parse_model(Settlement, await self._post("deliveries/" + str(delivery.id) + "/settle", payload, retry=True))
        allowed = {"DELIVERED": {"DELIVERED", "UNKNOWN"}, "RETRY": {"RETRY", "UNKNOWN", "FAILED"},
                   "UNKNOWN": {"UNKNOWN"}, "FAILED": {"FAILED", "UNKNOWN"}}
        if result.id != delivery.id or result.status not in allowed.get(outcome, set()):
            raise BackendContractError("settlement_receipt_mismatch")
        return result
