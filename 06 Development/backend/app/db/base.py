from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


from app.models.user import User  # noqa: E402,F401
from app.models.service import Service  # noqa: E402,F401
from app.models.order import Order  # noqa: E402,F401
from app.models.partner_mode import PartnerMode  # noqa: E402,F401
from app.models.reward_rule import RewardRule  # noqa: E402,F401
from app.models.referral import Referral  # noqa: E402,F401
from app.models.points_ledger import PointsLedger  # noqa: E402,F401
from app.models.admin_action import AdminAction  # noqa: E402,F401
from app.models.payment import Payment  # noqa: E402,F401
