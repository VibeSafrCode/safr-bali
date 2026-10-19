"""Closed, actor-free contract for an explicit client interface choice."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictInt


ClientUILocale = Literal["ru", "en", "zh-Hans", "ko", "fr", "de", "ja", "hi", "es", "ar"]
MAX_UI_REVISION = 2147483647


class ClientUIPreferenceWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ui_locale: ClientUILocale
    expected_revision: StrictInt = Field(ge=0, le=MAX_UI_REVISION)


class ClientUIPreference(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ui_locale: ClientUILocale | None
    revision: StrictInt = Field(ge=0, le=MAX_UI_REVISION)
