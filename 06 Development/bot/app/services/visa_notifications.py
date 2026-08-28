from __future__ import annotations

import asyncio
import logging
from datetime import date

from aiogram import Bot
from aiogram.exceptions import TelegramBadRequest, TelegramForbiddenError
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo

from app.handlers.visas import cabinet_url
from app.services.backend_client import claim_visa_notifications, settle_visa_notification

logger = logging.getLogger(__name__)


_STATUS_LABELS = {
    "ru": {
        "NOT_ISSUED": "оформление",
        "ISSUED_NOT_ACTIVATED": "виза выдана, въезд не подтверждён",
        "ACTIVE": "виза активна",
        "EXPIRING": "срок визы подходит к концу",
        "EXTENSION_PROCESSING": "продление оформляется",
        "EXTENDED": "виза продлена",
        "EXPIRED": "срок визы завершён",
        "CANCELLED": "визовый кейс отменён",
        "REFUSED": "зафиксирован отказ",
        "PURCHASED": "услуга оформлена",
        "DOCUMENTS_REQUIRED": "ожидаются документы",
        "DOCUMENTS_RECEIVED": "документы получены",
        "SUBMITTED": "заявка подана",
        "WAITING_PAYMENT": "ожидается оплата",
        "PAID": "оплата подтверждена",
        "PROCESSING": "идёт обработка",
        "ACTION_REQUIRED": "требуется действие",
        "COMPLETED": "работа завершена",
    },
    "en": {
        "NOT_ISSUED": "processing",
        "ISSUED_NOT_ACTIVATED": "visa issued, entry not confirmed",
        "ACTIVE": "visa active",
        "EXPIRING": "visa expiry approaching",
        "EXTENSION_PROCESSING": "extension in progress",
        "EXTENDED": "visa extended",
        "EXPIRED": "visa period ended",
        "CANCELLED": "visa case cancelled",
        "REFUSED": "refusal recorded",
        "PURCHASED": "service purchased",
        "DOCUMENTS_REQUIRED": "documents required",
        "DOCUMENTS_RECEIVED": "documents received",
        "SUBMITTED": "application submitted",
        "WAITING_PAYMENT": "payment required",
        "PAID": "payment confirmed",
        "PROCESSING": "processing",
        "ACTION_REQUIRED": "action required",
        "COMPLETED": "work completed",
    },
}

_CHANGE_LABELS = {
    "ru": {
        "lifecycle_status": "Статус визы",
        "service_status": "Статус оформления",
        "entry_deadline": "Въехать до",
        "stay_end": "Разрешено находиться до",
        "extension_window_start": "Продление возможно с",
        "document_available": "Документ доступен",
    },
    "en": {
        "lifecycle_status": "Visa status",
        "service_status": "Service status",
        "entry_deadline": "Enter by",
        "stay_end": "Stay permitted until",
        "extension_window_start": "Extension available from",
        "document_available": "Document available",
    },
}

_CONTACT_REASONS = {
    "ru": {
        "VISA_EXPIRY": "скоро заканчивается подтверждённый срок визы",
        "EXTENSION": "пора обсудить продление визы",
        "NEW_VISA": "пора обсудить новую визу",
        "OTHER": "есть вопрос по вашей визе",
    },
    "en": {
        "VISA_EXPIRY": "the confirmed visa date is approaching",
        "EXTENSION": "it is time to discuss a visa extension",
        "NEW_VISA": "it is time to discuss a new visa",
        "OTHER": "there is a visa matter to discuss",
    },
}

_CONTACT_REMINDER_LEGACY = "CONTACT_REMINDER"
_CONTACT_REMINDER_CLIENT = "CONTACT_REMINDER_CLIENT"
_CONTACT_REMINDER_STAFF = "CONTACT_REMINDER_STAFF"
_CONTACT_REMINDER_BY_RECIPIENT = {
    "client": _CONTACT_REMINDER_CLIENT,
    "staff": _CONTACT_REMINDER_STAFF,
}


def _locale(item: dict) -> str:
    return item.get("locale") if item.get("locale") in {"ru", "en"} else "ru"


def _payload(item: dict) -> dict:
    return item.get("payload") if isinstance(item.get("payload"), dict) else {}


def _notification_type(item: dict) -> str:
    kind = item.get("notification_type")
    recipient = item.get("recipient_kind")
    normalized_recipient = recipient.strip().lower() if isinstance(recipient, str) else ""
    if kind == _CONTACT_REMINDER_LEGACY:
        return _CONTACT_REMINDER_BY_RECIPIENT.get(normalized_recipient, "CONTACT_REMINDER_AMBIGUOUS")
    if kind in {_CONTACT_REMINDER_CLIENT, _CONTACT_REMINDER_STAFF} and "recipient_kind" in item:
        if _CONTACT_REMINDER_BY_RECIPIENT.get(normalized_recipient) != kind:
            return "CONTACT_REMINDER_AMBIGUOUS"
    return str(kind or "")


def _can_open_staff_case(payload: dict) -> bool:
    return (
        payload.get("can_open_case") is True
        and payload.get("staff_role_code") in {"root_admin", "visa_manager"}
    )


def _safe_text(value: object, *, limit: int = 120) -> str:
    if not isinstance(value, str):
        return ""
    return " ".join(value.split())[:limit]


def _visa_name(payload: dict) -> str:
    for key in ("visa_name", "visa_display_name", "visa_type_name"):
        if value := _safe_text(payload.get(key), limit=100):
            return value
    return ""


def _format_date(value: object) -> str:
    if not isinstance(value, str):
        return ""
    try:
        parsed = date.fromisoformat(value[:10])
    except (TypeError, ValueError):
        return ""
    return parsed.strftime("%d.%m.%Y")


def _status_label(value: object, locale: str) -> str:
    if not isinstance(value, str):
        return ""
    return _STATUS_LABELS[locale].get(value, "")


def _change_lines(payload: dict, locale: str) -> list[str]:
    source = payload.get("changes")
    if not isinstance(source, list):
        source = []
    lines: list[str] = []
    for raw in source[:8]:
        if not isinstance(raw, dict):
            continue
        field = raw.get("field")
        if field not in _CHANGE_LABELS[locale]:
            continue
        label = _CHANGE_LABELS[locale][field]
        if field in {"lifecycle_status", "service_status"}:
            before = _status_label(raw.get("before"), locale)
            after = _status_label(raw.get("after"), locale)
        elif field in {"entry_deadline", "stay_end", "extension_window_start"}:
            before = _format_date(raw.get("before"))
            after = _format_date(raw.get("after"))
        elif field == "document_available":
            title = _safe_text(raw.get("title") or payload.get("document_title"), limit=100)
            if title:
                lines.append(f"• {label}: {title}")
            continue
        else:
            continue
        if before and after and before != after:
            lines.append(f"• {label}: {before} → {after}")
        elif after:
            lines.append(f"• {label}: {after}")
    return lines


def _client_fallback(locale: str) -> str:
    if locale == "en":
        return "If the button does not open, return to the SAFRWAY bot and choose Personal Cabinet → My visas."
    return "Если кнопка не открывается, вернитесь в бот SAFRWAY и выберите «Личный кабинет» → «Мои визы»."


def _render_case_published(payload: dict, locale: str) -> str:
    visa = _visa_name(payload)
    if locale == "en":
        heading = f"🛂 {visa} has appeared in your SAFRWAY cabinet." if visa else "🛂 A visa has appeared in your SAFRWAY cabinet."
        detail = "Open My visas to review the manager-confirmed information."
    else:
        heading = f"🛂 В вашем кабинете появилась виза {visa}." if visa else "🛂 В вашем кабинете SAFRWAY появилась виза."
        detail = "Откройте «Мои визы», чтобы посмотреть подтверждённые менеджером данные."
    return f"{heading}\n\n{detail}\n{_client_fallback(locale)}"


def _render_case_updated(payload: dict, locale: str) -> str:
    visa = _visa_name(payload)
    lines = _change_lines(payload, locale)
    if locale == "en":
        heading = f"🛂 Confirmed information for {visa} has been updated." if visa else "🛂 Confirmed information for your visa has been updated."
        detail = "What changed:\n" + "\n".join(lines) if lines else "Open My visas to review the current confirmed information."
    else:
        heading = f"🛂 Подтверждённая информация по визе {visa} обновлена." if visa else "🛂 Подтверждённая информация по вашей визе обновлена."
        detail = "Что изменилось:\n" + "\n".join(lines) if lines else "Откройте «Мои визы», чтобы посмотреть актуальные подтверждённые данные."
    return f"{heading}\n\n{detail}\n\n{_client_fallback(locale)}"


def _render_status_summary(payload: dict, locale: str) -> str:
    visa = _visa_name(payload)
    status = _status_label(payload.get("lifecycle_status") or payload.get("status"), locale)
    date_kind = payload.get("date_kind")
    confirmed_date = _format_date(payload.get("date_value"))
    lines = []
    if status:
        lines.append(f"{'Status' if locale == 'en' else 'Статус'}: {status}")
    if date_kind in _CHANGE_LABELS[locale] and confirmed_date:
        lines.append(f"{_CHANGE_LABELS[locale][date_kind]}: {confirmed_date}")
    if locale == "en":
        heading = f"🛂 Current SAFRWAY status for {visa}." if visa else "🛂 Current SAFRWAY visa status."
        detail = "\n".join(lines) if lines else "Open My visas to review the manager-confirmed information."
    else:
        heading = f"🛂 Текущий статус SAFRWAY по визе {visa}." if visa else "🛂 Текущий статус визы в SAFRWAY."
        detail = "\n".join(lines) if lines else "Откройте «Мои визы», чтобы посмотреть подтверждённые менеджером данные."
    return f"{heading}\n\n{detail}\n\n{_client_fallback(locale)}"


def _render_client_reminder(payload: dict, locale: str) -> str:
    visa = _visa_name(payload)
    reason_code = payload.get("reason_code")
    reason = _CONTACT_REASONS[locale].get(reason_code, _CONTACT_REASONS[locale]["OTHER"])
    confirmed_date = _format_date(payload.get("date_value"))
    date_line = f"\n{'Confirmed date' if locale == 'en' else 'Подтверждённая дата'}: {confirmed_date}" if confirmed_date else ""
    visa_line = f" ({visa})" if visa else ""
    if locale == "en":
        body = f"⏰ We recommend contacting a SAFRWAY manager{visa_line}: {reason}.{date_line}\n\nYou can message us now, or our team will contact you."
    else:
        body = f"⏰ Рекомендуем связаться с менеджером SAFRWAY{visa_line}: {reason}.{date_line}\n\nВы можете написать нам сейчас, либо наши сотрудники свяжутся с вами."
    return f"{body}\n\n{_client_fallback(locale)}"


def _render_staff_reminder(payload: dict, locale: str) -> str:
    visa = _visa_name(payload)
    client = _safe_text(payload.get("client_display_name"), limit=100)
    reason_code = payload.get("reason_code")
    reason = _CONTACT_REASONS[locale].get(reason_code, _CONTACT_REASONS[locale]["OTHER"])
    confirmed_date = _format_date(payload.get("date_value"))
    if locale == "en":
        lines = ["⏰ Client contact reminder.", f"Reason: {reason}."]
        if client: lines.insert(1, f"Client: {client}.")
        if visa: lines.append(f"Visa: {visa}.")
        if confirmed_date: lines.append(f"Confirmed date: {confirmed_date}.")
        if _can_open_staff_case(payload):
            lines.append("Open only the assigned client and visa case in SAFRWAY Admin.")
        else:
            lines.append("Contact the client using the staff workflow available for your role.")
    else:
        lines = ["⏰ Нужно связаться с клиентом.", f"Причина: {reason}."]
        if client: lines.insert(1, f"Клиент: {client}.")
        if visa: lines.append(f"Виза: {visa}.")
        if confirmed_date: lines.append(f"Подтверждённая дата: {confirmed_date}.")
        if _can_open_staff_case(payload):
            lines.append("Откройте только назначенного клиента и его визовый кейс в админском кабинете SAFRWAY.")
        else:
            lines.append("Свяжитесь с клиентом по рабочему процессу, доступному для вашей роли.")
    return "\n".join(lines)


def _render_ambiguous_reminder(_payload: dict, locale: str) -> str:
    if locale == "en":
        return "⏰ SAFRWAY contact reminder. Use the workflow available for your role."
    return "⏰ Напоминание SAFRWAY о контакте. Используйте рабочий процесс, доступный для вашей роли."


def _render_unknown(_payload: dict, locale: str) -> str:
    if locale == "en":
        return f"🛂 SAFRWAY has a visa-related message for you.\n\nOpen My visas to review verified information.\n\n{_client_fallback(locale)}"
    return f"🛂 В SAFRWAY есть сообщение по вашей визе.\n\nОткройте «Мои визы», чтобы посмотреть подтверждённые данные.\n\n{_client_fallback(locale)}"


_RENDERERS = {
    "CASE_PUBLISHED": _render_case_published,
    "CASE_UPDATED": _render_case_updated,
    "STATUS_SUMMARY_MANUAL": _render_status_summary,
    "CONTACT_REMINDER_CLIENT": _render_client_reminder,
    "CONTACT_REMINDER_STAFF": _render_staff_reminder,
    "CONTACT_REMINDER_AMBIGUOUS": _render_ambiguous_reminder,
}


def notification_text(item: dict) -> str:
    locale = _locale(item)
    renderer = _RENDERERS.get(_notification_type(item), _render_unknown)
    return renderer(_payload(item), locale)


def notification_keyboard(item: dict) -> InlineKeyboardMarkup | None:
    kind = _notification_type(item)
    if kind in {"CONTACT_REMINDER_STAFF", "CONTACT_REMINDER_AMBIGUOUS"}:
        return None
    if "recipient_kind" in item:
        recipient_kind = item.get("recipient_kind")
        if not isinstance(recipient_kind, str) or recipient_kind.lower() != "client":
            return None
    locale = _locale(item)
    if kind == "CONTACT_REMINDER_CLIENT":
        support_url = cabinet_url("support")
        if not support_url:
            return None
        buttons = [InlineKeyboardButton(
            text="Написать менеджеру" if locale == "ru" else "Contact manager",
            web_app=WebAppInfo(url=support_url),
        )]
        reason_code = _payload(item).get("reason_code")
        if reason_code in {"VISA_EXPIRY", "EXTENSION"}:
            visas_url = cabinet_url()
            if visas_url:
                buttons.append(InlineKeyboardButton(
                    text="Продлить визу" if locale == "ru" else "Extend visa",
                    web_app=WebAppInfo(url=visas_url),
                ))
        return InlineKeyboardMarkup(inline_keyboard=[buttons])
    url = cabinet_url()
    if not url:
        return None
    return InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(
            text="Открыть мои визы" if locale == "ru" else "Open My visas",
            web_app=WebAppInfo(url=url),
        )]],
    )


async def deliver_visa_notification(bot: Bot, item: dict) -> None:
    settlement = {
        "lease_token": item["lease_token"],
        "state": "UNKNOWN",
        "error_code": "AMBIGUOUS_SEND",
    }
    try:
        message = await bot.send_message(
            item["telegram_id"],
            notification_text(item),
            reply_markup=notification_keyboard(item),
        )
        settlement = {
            "lease_token": item["lease_token"],
            "state": "DELIVERED",
            "telegram_message_id": str(message.message_id),
        }
    except (TelegramBadRequest, TelegramForbiddenError) as exc:
        settlement = {
            "lease_token": item["lease_token"],
            "state": "FAILED",
            "error_code": type(exc).__name__[:80],
        }
    except Exception:
        logger.exception("Ambiguous visa notification delivery %s", item.get("id"))
    await settle_visa_notification(item["id"], settlement)


async def run_visa_notification_bridge(bot: Bot) -> None:
    while True:
        for item in await claim_visa_notifications():
            await deliver_visa_notification(bot, item)
        await asyncio.sleep(15)
