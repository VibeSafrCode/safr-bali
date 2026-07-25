from __future__ import annotations

from app.services.backend_client import get_user_dashboard


async def get_points_summary(telegram_id: int, fallback_text: str) -> str:
    dashboard = await get_user_dashboard(telegram_id)
    if not dashboard:
        return fallback_text
    return (
        "🎁 Мой баланс SAFR Points\n\n"
        f"Баланс: {dashboard.get('balance', 0)} SAFR Points\n"
        f"Приглашено напрямую: {dashboard.get('referral_count', 0)}\n\n"
        "Начисления появляются после подтверждения целевого действия или покупки."
    )


async def get_orders_summary(telegram_id: int, fallback_text: str) -> str:
    dashboard = await get_user_dashboard(telegram_id)
    if not dashboard:
        return fallback_text
    orders = dashboard.get("orders") or []
    if not orders:
        return (
            "📦 Мои купленные услуги\n\n"
            "Подтверждённых заказов пока нет."
        )

    lines = ["📦 Мои купленные услуги", ""]
    for order in orders:
        amount = (
            f" / ${order.get('amount_usd')}"
            if order.get("amount_usd") is not None
            else ""
        )
        lines.append(
            f"№{order.get('id')} — {order.get('service')}\n"
            f"Статус: {order.get('status')} / оплата: {order.get('payment_status')}{amount}"
        )
    return "\n\n".join(lines)
