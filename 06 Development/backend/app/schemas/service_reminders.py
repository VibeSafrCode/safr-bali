from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


DayOffset = Annotated[int, Field(strict=True, ge=1, le=3660)]


class ReminderPolicy(BaseModel):
    model_config = ConfigDict(extra="forbid")

    enabled: bool = Field(default=False, strict=True)
    long_term_threshold_days: int = Field(default=100, strict=True, ge=1, le=3660)
    long_offsets: list[DayOffset] = Field(default_factory=lambda: [40, 30, 15, 7, 3, 2, 1], min_length=1, max_length=12)
    short_offsets: list[DayOffset] = Field(default_factory=lambda: [15, 7, 3, 2, 1], min_length=1, max_length=12)
    timezone: Literal["Asia/Makassar"] = "Asia/Makassar"
    monthly_basis: Literal["explicit_end_only"] = "explicit_end_only"

    @field_validator("long_offsets", "short_offsets")
    @classmethod
    def unique_descending(cls, value):
        if len(value) != len(set(value)):
            raise ValueError("Reminder offsets must be unique")
        return sorted(value, reverse=True)


class PolicyPreview(BaseModel):
    model_config = ConfigDict(extra="forbid")
    policy: ReminderPolicy


class PolicyChange(PolicyPreview):
    expected_version: int = Field(strict=True, ge=0)
    reason: str = Field(min_length=3, max_length=1000)

    @field_validator("reason")
    @classmethod
    def meaningful_reason(cls, value):
        value = " ".join(value.split())
        if len(value) < 3:
            raise ValueError("A meaningful reason is required")
        return value


class PolicyRestore(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_version: int = Field(strict=True, ge=0)
    restore_version: int = Field(strict=True, ge=1)
    reason: str = Field(min_length=3, max_length=1000)
    _reason = field_validator("reason")(PolicyChange.meaningful_reason.__func__)


class ReminderSettlement(BaseModel):
    model_config = ConfigDict(extra="forbid")
    lease_token: str = Field(min_length=16, max_length=64)
    state: Literal["DELIVERED", "FAILED", "UNKNOWN"]
    telegram_message_id: str | None = Field(default=None, max_length=64)
    error_code: str | None = Field(default=None, max_length=80)
