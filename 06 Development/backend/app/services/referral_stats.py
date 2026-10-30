"""Canonical read-only direct-referral count shared by client surfaces."""

from sqlalchemy.orm import Session
from sqlalchemy import String, cast, literal, select, text
from fastapi import HTTPException

from app.models.referral import Referral
from app.models.user import User


def direct_referral_count(db: Session, user_id: int) -> int:
    """Count all assigned first-line relationships, regardless of entry source.

    Source attribution describes how a relationship was created; it does not
    change its owner. Do not repair/reparent users or alter historical rewards
    while projecting this count.
    """
    return (
        db.query(Referral)
        .filter(Referral.parent_user_id == user_id, Referral.level == 1)
        .count()
    )


def own_partner_network(db: Session, actor: User, partner_telegram_id: int, *, limit: int = 50, offset: int = 0) -> dict:
    """Bounded, contact-free canonical branch; no source-based ownership."""
    if not actor or actor.status != "active":
        raise HTTPException(status_code=404, detail="Account unavailable")
    if (type(partner_telegram_id) is not int or partner_telegram_id <= 0
            or db.query(User.id).filter(User.telegram_id == partner_telegram_id).first() is None):
        raise HTTPException(status_code=503, detail="Partner privacy policy unavailable")
    if actor.telegram_id != partner_telegram_id:
        return {"restricted_partner": False}
    if type(limit) is not int or not 1 <= limit <= 100 or type(offset) is not int or not 0 <= offset <= 5000:
        raise HTTPException(status_code=422, detail="Invalid network page")
    if db.get_bind().dialect.name == "postgresql":
        db.execute(text("SET LOCAL statement_timeout = '3s'"))
    edge = Referral.__table__
    path = literal(",") + cast(edge.c.parent_user_id, String) + literal(",") + cast(edge.c.child_user_id, String) + literal(",")
    branch = select(edge.c.child_user_id.label("node"), literal(1).label("depth"),
        edge.c.created_at.label("created_at"), path.label("visited")).where(edge.c.parent_user_id == actor.id).cte(recursive=True)
    child_marker = literal("%,") + cast(edge.c.child_user_id, String) + literal(",%")
    branch = branch.union_all(select(edge.c.child_user_id, branch.c.depth + 1, edge.c.created_at,
        branch.c.visited + cast(edge.c.child_user_id, String) + literal(",")).join(
            branch, edge.c.parent_user_id == branch.c.node).where(branch.c.depth < 32,
                branch.c.visited.not_like(child_marker)))
    rows = db.execute(select(branch.c.depth, branch.c.created_at).order_by(
        branch.c.depth, branch.c.created_at, branch.c.node).offset(offset).limit(limit + 1)).all()
    more = len(rows) > limit
    next_offset = offset + limit if more and offset + limit <= 5000 else None
    visible = rows[:limit]
    return {"restricted_partner": True,
        "direct_count": db.query(Referral).filter(Referral.parent_user_id == actor.id).count(),
        "nodes": [{"label": f"№{offset + index + 1}", "level": row.depth,
                   "created_at": row.created_at.isoformat() if row.created_at else None}
                  for index, row in enumerate(visible)],
        "has_more": more, "page_limited": more and next_offset is None,
        "depth_limited": any(row.depth == 32 for row in rows),
        "offset": offset, "limit": limit, "next_offset": next_offset}
