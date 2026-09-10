"""Bounded self-account projection. Never expose internal ledger metadata."""
from datetime import timezone

from sqlalchemy.orm import Session

from app.models.points_ledger import PointsLedger


def account_points_history(db: Session, user_id: int) -> dict:
    limit = 30
    rows = (db.query(PointsLedger)
            .filter(PointsLedger.user_id == user_id)
            .order_by(PointsLedger.id.desc()).limit(limit + 1).all())
    return {
        "items": [{
            "id": row.id,
            "operation_type": row.operation_type,
            "amount": row.amount,
            "balance_after": row.balance_after,
            # Ledger timestamps are stored in UTC, historically without tzinfo.
            "created_at": (row.created_at.replace(tzinfo=timezone.utc)
                           if row.created_at.tzinfo is None else row.created_at).isoformat(),
        } for row in rows[:limit]],
        "has_more": len(rows) > limit,
        "limit": limit,
    }
