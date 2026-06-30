from fastapi import APIRouter

from app.db.session import SessionLocal
from app.models.service import Service

router = APIRouter(prefix="/services", tags=["services"])


@router.get("")
def get_services():
    db = SessionLocal()

    try:
        services = (
            db.query(Service)
            .filter(Service.is_active == True)  # noqa: E712
            .order_by(Service.id)
            .all()
        )

        return [
            {
                "id": service.id,
                "name": service.name,
                "slug": service.slug,
                "category": service.category,
                "description": service.description,
                "can_pay_with_points": service.can_pay_with_points,
            }
            for service in services
        ]

    finally:
        db.close()
