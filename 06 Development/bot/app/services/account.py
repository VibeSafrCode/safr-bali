from __future__ import annotations

from app.services.backend_client import get_user_dashboard
from app.services.i18n import text


async def get_points_summary(telegram_id: int, fallback_text: str) -> str:
    dashboard = await get_user_dashboard(telegram_id)
    if not dashboard:
        return fallback_text
    return text(
        "account.points.summary",
        variables={
            "balance": dashboard.get("balance", 0),
            "referralCount": dashboard.get("referral_count", 0),
        },
    )


async def get_orders_summary(telegram_id: int, fallback_text: str) -> str:
    dashboard = await get_user_dashboard(telegram_id)
    if not dashboard:
        return fallback_text
    orders = dashboard.get("orders") or []
    if not orders:
        return text("account.orders.empty")

    lines = [text("account.orders.heading"), ""]
    for order in orders:
        amount = (
            text("account.orders.usdAmount", variables={"amountUsd": order.get("amount_usd")})
            if order.get("amount_usd") is not None
            else ""
        )
        status_id = order.get("status")
        payment_id = order.get("payment_status")
        status = text(f"order.status.{status_id}") if status_id in {"new", "completed", "cancelled"} else status_id
        payment_keys = {
            "pending": "order.payment.pending",
            "paid": "order.payment.paid",
            "cancelled": "order.payment.cancelled",
            "refunded": "order.payment.refunded",
            "refund_required": "order.payment.refundRequired",
        }
        payment = text(payment_keys[payment_id]) if payment_id in payment_keys else payment_id
        lines.append(
            text(
                "account.orders.row",
                variables={
                    "orderId": order.get("id"),
                    "service": order.get("service"),
                    "status": status,
                    "paymentStatus": payment,
                    "amount": amount,
                },
            )
        )
    return "\n\n".join(lines)
