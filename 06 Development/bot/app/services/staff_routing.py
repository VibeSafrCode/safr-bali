from __future__ import annotations

from app.core.config import settings


def get_recipients_for_route(
    route_context: dict | None,
    app_settings=settings,
) -> list[int]:
    route_context = route_context or {}

    if (
        route_context.get("country") == "Бали"
        and route_context.get("section") == "Визы"
    ):
        return app_settings.visa_staff_chat_ids

    if route_context.get("city") == "Санкт-Петербург":
        return app_settings.spb_staff_chat_ids

    if route_context.get("country") == "Таиланд":
        return app_settings.thailand_staff_chat_ids

    return app_settings.staff_chat_ids
