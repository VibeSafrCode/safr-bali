from typing import Optional

from pydantic import BaseModel, Field


class RouteContext(BaseModel):
    country: Optional[str] = Field(default=None, max_length=100)
    city: Optional[str] = Field(default=None, max_length=100)
    section: Optional[str] = Field(default=None, max_length=150)
    service: Optional[str] = Field(default=None, max_length=150)


class ChatMessageRequest(BaseModel):
    body: str = Field(min_length=1, max_length=4000)
    route_context: RouteContext = Field(default_factory=RouteContext)
