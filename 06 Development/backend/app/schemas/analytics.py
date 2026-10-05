"""Typed allowlist: extra keys and full URLs/free text are never accepted."""
from decimal import Decimal
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


EventName = Literal["page_view", "country_select", "service_select", "language_select", "cta_click",
                    "form_start", "form_submit", "channel_click", "funnel_stage", "lead_created",
                    "order_created", "payment_success"]
Locale = Literal["ru", "en", "de", "fr", "es", "ar", "hi", "ja", "ko", "zh-Hans"]


class AnalyticsEventInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    event_key: UUID
    event_name: EventName
    content_id: Optional[str] = Field(default=None, pattern=r"^[a-z0-9][a-zA-Z0-9._-]{0,127}$")
    service_id: Optional[str] = Field(default=None, pattern=r"^[a-z0-9][a-z0-9_-]{0,127}$")
    country: Optional[str] = Field(default=None, pattern=r"^[A-Z]{2}$")
    locale: Optional[Locale] = None
    source: Optional[Literal["direct", "search", "social", "partner", "internal", "other"]] = None
    campaign_code: Optional[str] = Field(default=None, pattern=r"^[a-z][a-z0-9_-]{0,63}$")
    device: Optional[Literal["mobile", "tablet", "desktop", "other"]] = None
    browser: Optional[Literal["safari", "chrome", "firefox", "edge", "telegram", "other"]] = None
    channel: Optional[Literal["telegram", "whatsapp", "bot", "web"]] = None
    funnel_stage: Optional[Literal["view", "interest", "start", "submit", "lead", "order", "success"]] = None
    amount: Optional[Decimal] = Field(default=None, ge=0, le=Decimal("999999999999.99"), max_digits=14, decimal_places=2)
    currency: Optional[Literal["IDR", "USD", "USDT", "RUB", "EUR"]] = None

    @model_validator(mode="after")
    def monetary_event_only(self):
        financial = self.event_name in {"order_created", "payment_success"}
        if (self.amount is None) != (self.currency is None):
            raise ValueError("Amount and currency are a pair")
        if self.amount is not None and not financial:
            raise ValueError("Amounts require a trusted financial event")
        return self


class AnalyticsBatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    events: list[AnalyticsEventInput] = Field(min_length=1, max_length=20)


class AnalyticsConsentInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    granted: bool = Field(strict=True)
    policy_revision: int = Field(ge=1, strict=True)


class AnalyticsPolicyInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_revision: int = Field(ge=0, strict=True)
    enabled: bool = Field(strict=True)
    privacy_notice_version: str = Field(min_length=1, max_length=64, pattern=r"^[a-z0-9][a-z0-9._-]{0,63}$")
    consent_ui_verified: bool = Field(strict=True)
    allowed_content_ids: list[str] = Field(default_factory=list, max_length=5000)
    allowed_service_ids: list[str] = Field(default_factory=list, max_length=1000)
    allowed_campaign_codes: list[str] = Field(default_factory=list, max_length=100)


class AnalyticsGrantInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    user_id: int = Field(gt=0)
    capability: Literal["aggregate", "technical_raw"]
    active: bool = Field(strict=True)
    allowed_service_ids: list[str] = Field(default_factory=list, max_length=1000)
