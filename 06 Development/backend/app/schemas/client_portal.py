import re
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator


class RouteContext(BaseModel):
    """Client-supplied attribution only; never authorization or proof of content."""
    country: Optional[str] = Field(default=None, max_length=100)
    city: Optional[str] = Field(default=None, max_length=100)
    section: Optional[str] = Field(default=None, max_length=150)
    service: Optional[str] = Field(default=None, max_length=150)
    content_id: Optional[str] = Field(default=None, min_length=1, max_length=128, strict=True)
    source_revision: Optional[str] = Field(default=None, min_length=71, max_length=71, strict=True)
    locale: Optional[Literal["ru", "en", "zh-Hans", "ko", "fr", "de", "ja", "hi", "es", "ar"]] = None
    path: Optional[str] = Field(default=None, min_length=1, max_length=500, strict=True)

    @field_validator("content_id", "source_revision", "path")
    @classmethod
    def validate_attribution(cls, value, info):
        if value is None:
            return value
        patterns = {
            "content_id": r"[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*",
            "source_revision": r"sha256:[a-f0-9]{64}",
            "path": r"/(?:[a-z0-9]+(?:[-_][a-z0-9]+)*/)*",
        }
        if re.fullmatch(patterns[info.field_name], value) is None:
            raise ValueError("Invalid client attribution field")
        return value


class ChatMessageRequest(BaseModel):
    body: str = Field(min_length=1, max_length=4000)
    route_context: RouteContext = Field(default_factory=RouteContext)
