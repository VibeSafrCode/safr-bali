from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


from app.models.user import User  # noqa: E402,F401
from app.models.service import Service  # noqa: E402,F401
from app.models.order import Order  # noqa: E402,F401
