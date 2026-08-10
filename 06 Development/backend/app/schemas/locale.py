from typing import Literal

from pydantic import BaseModel


LocaleCode = Literal["ru", "en"]


class LocaleUpdateRequest(BaseModel):
    locale: LocaleCode
