from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.service import Service
from app.models.partner_mode import PartnerMode
from app.models.reward_rule import RewardRule


def get_or_create_service(
    db: Session,
    name: str,
    slug: str,
    category: str,
    description: str,
    can_pay_with_points: bool = False,
) -> Service:
    service = db.query(Service).filter(Service.slug == slug).first()

    if service:
        return service

    service = Service(
        name=name,
        slug=slug,
        category=category,
        description=description,
        is_active=True,
        can_pay_with_points=can_pay_with_points,
    )

    db.add(service)
    db.commit()
    db.refresh(service)

    return service


def get_or_create_partner_mode(
    db: Session,
    name: str,
    slug: str,
    description: str,
) -> PartnerMode:
    mode = db.query(PartnerMode).filter(PartnerMode.slug == slug).first()

    if mode:
        return mode

    mode = PartnerMode(
        name=name,
        slug=slug,
        description=description,
        is_active=True,
    )

    db.add(mode)
    db.commit()
    db.refresh(mode)

    return mode


def get_or_create_reward_rule(
    db: Session,
    service_id: int,
    partner_mode_id: int,
    level_1_points: int,
    level_2_points: int,
    level_3_points: int,
) -> RewardRule:
    rule = (
        db.query(RewardRule)
        .filter(
            RewardRule.service_id == service_id,
            RewardRule.partner_mode_id == partner_mode_id,
            RewardRule.is_active == True,  # noqa: E712
        )
        .first()
    )

    if rule:
        return rule

    rule = RewardRule(
        service_id=service_id,
        partner_mode_id=partner_mode_id,
        level_1_points=level_1_points,
        level_2_points=level_2_points,
        level_3_points=level_3_points,
        is_active=True,
    )

    db.add(rule)
    db.commit()
    db.refresh(rule)

    return rule


def seed() -> None:
    db = SessionLocal()

    try:
        services = {
            "visa": get_or_create_service(
                db,
                name="Оформить визу",
                slug="visa",
                category="visa",
                description="Оформление визы на Бали / в Индонезию.",
            ),
            "visa_extension": get_or_create_service(
                db,
                name="Продлить визу",
                slug="visa-extension",
                category="visa",
                description="Продление действующей визы.",
            ),
            "consultation": get_or_create_service(
                db,
                name="Консультация",
                slug="consultation",
                category="consultation",
                description="Консультация по визам, переезду, жилью или жизни на Бали.",
                can_pay_with_points=True,
            ),
            "housing": get_or_create_service(
                db,
                name="Подбор жилья",
                slug="housing",
                category="housing",
                description="Подбор виллы или жилья под запрос клиента.",
            ),
            "transfer": get_or_create_service(
                db,
                name="Трансфер",
                slug="transfer",
                category="transport",
                description="Встреча в аэропорту и трансфер до жилья.",
            ),
            "bike": get_or_create_service(
                db,
                name="Байк",
                slug="bike",
                category="transport",
                description="Подбор и организация байка к приезду.",
            ),
            "soft_landing": get_or_create_service(
                db,
                name="Soft Landing",
                slug="soft-landing",
                category="relocation",
                description="Комплексное сопровождение первых дней на Бали.",
            ),
        }

        modes = {
            "direct": get_or_create_partner_mode(
                db,
                name="Direct",
                slug="direct",
                description="Максимум за прямую рекомендацию без глубины.",
            ),
            "balanced": get_or_create_partner_mode(
                db,
                name="Balanced",
                slug="balanced",
                description="Баланс между прямой рекомендацией и глубиной сети.",
            ),
            "network": get_or_create_partner_mode(
                db,
                name="Network",
                slug="network",
                description="Режим для QR-точек, кафе, водителей и пассивной сети.",
            ),
        }

        reward_matrix = {
            "visa": {
                "direct": (2500, 0, 0),
                "balanced": (1500, 500, 200),
                "network": (500, 500, 500),
            },
            "visa_extension": {
                "direct": (1000, 0, 0),
                "balanced": (700, 300, 100),
                "network": (300, 300, 300),
            },
            "consultation": {
                "direct": (500, 0, 0),
                "balanced": (300, 100, 50),
                "network": (100, 100, 100),
            },
            "housing": {
                "direct": (5000, 0, 0),
                "balanced": (3000, 1000, 500),
                "network": (1000, 1000, 1000),
            },
            "transfer": {
                "direct": (300, 0, 0),
                "balanced": (200, 100, 50),
                "network": (100, 100, 100),
            },
            "bike": {
                "direct": (500, 0, 0),
                "balanced": (300, 100, 50),
                "network": (100, 100, 100),
            },
            "soft_landing": {
                "direct": (3000, 0, 0),
                "balanced": (2000, 700, 300),
                "network": (700, 700, 700),
            },
        }

        for service_slug, mode_rules in reward_matrix.items():
            for mode_slug, points in mode_rules.items():
                get_or_create_reward_rule(
                    db,
                    service_id=services[service_slug].id,
                    partner_mode_id=modes[mode_slug].id,
                    level_1_points=points[0],
                    level_2_points=points[1],
                    level_3_points=points[2],
                )

        print("Seed completed successfully.")

    finally:
        db.close()


if __name__ == "__main__":
    seed()
