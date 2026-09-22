from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class LifeServiceFields(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    kind: Literal["housing", "bike", "insurance"]
    title: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    link_url: str | None = Field(default=None, max_length=2000)
    start_date: date | None = None
    end_date: date | None = None
    price_amount: Decimal | None = Field(default=None, ge=0, max_digits=16, decimal_places=2)
    price_currency: Literal["IDR", "USD", "USDT", "RUB"] = "IDR"
    price_unit: Literal["period", "month", "day", "policy"] = "period"
    public_contact: str | None = Field(default=None, max_length=1000)
    owner_details: str | None = Field(default=None, max_length=5000)
    internal_note: str | None = Field(default=None, max_length=5000)
    publication_status: Literal["DRAFT", "PUBLISHED", "HIDDEN", "ARCHIVED"] = "DRAFT"

    @field_validator("title", "description", "link_url", "public_contact", "owner_details", "internal_note", mode="before")
    @classmethod
    def empty_text_is_absent(cls, value):
        return value.strip() or None if isinstance(value, str) else value

    @field_validator("start_date", "end_date", mode="before")
    @classmethod
    def calendar_dates_only(cls, value):
        if value is None or (isinstance(value, date) and not isinstance(value, datetime)):
            return value
        if not isinstance(value, str) or len(value) != 10:
            raise ValueError("Use a calendar date in YYYY-MM-DD format")
        return value

    @field_validator("price_amount", mode="before")
    @classmethod
    def exact_amount(cls, value):
        if isinstance(value, (float, bool)):
            raise ValueError("Use a decimal string for price_amount")
        return value

    @field_validator("link_url")
    @classmethod
    def safe_url(cls, value):
        if value is None:
            return None
        try:
            url = urlsplit(value)
            url.port
            safe = (url.scheme in {"http", "https"} and bool(url.hostname)
                    and not url.username and not url.password
                    and not any(c.isspace() or ord(c) < 32 or ord(c) == 127 for c in value)
                    and "\\" not in value)
        except ValueError:
            safe = False
        if not safe:
            raise ValueError("Use an absolute http or https URL without credentials")
        return value

    @model_validator(mode="after")
    def valid_dates_and_publication(self):
        if self.start_date and self.end_date and self.start_date > self.end_date:
            raise ValueError("end_date must be on or after start_date")
        if self.publication_status == "PUBLISHED":
            if not self.title:
                raise ValueError("title is required to publish")
            if not self.end_date:
                raise ValueError("end_date is required to publish")
            if self.kind in {"housing", "bike"} and not self.start_date:
                raise ValueError("start_date is required to publish a rental")
        return self


class LifeServiceCreate(LifeServiceFields):
    idempotency_key: str = Field(min_length=8, max_length=128, pattern=r"^[A-Za-z0-9._:-]+$")


class LifeServiceUpdate(LifeServiceFields):
    expected_version: int = Field(ge=1)
