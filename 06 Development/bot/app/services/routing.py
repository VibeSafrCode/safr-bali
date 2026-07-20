from __future__ import annotations


USER_ROUTE_CONTEXTS: dict[int, dict[str, str]] = {}


def set_route_context(user_id: int, **values: str | None) -> dict[str, str]:
    context = {
        key: value
        for key, value in values.items()
        if value
    }
    USER_ROUTE_CONTEXTS[user_id] = context
    return context


def get_route_context(user_id: int) -> dict[str, str]:
    return dict(USER_ROUTE_CONTEXTS.get(user_id, {}))


def format_route_context(context: dict | None) -> str:
    context = context or {}
    labels = (
        ("country", "🌍 Страна"),
        ("city", "🏙 Город"),
        ("section", "📂 Раздел"),
        ("service", "🧩 Услуга"),
    )
    lines = [f"{label}: {context[key]}" for key, label in labels if context.get(key)]
    return "\n".join(lines) if lines else "🌍 Направление: общий вопрос"
