"""Thin verified-message adapter, not another registration/referral database."""
from .api_client import BackendContractError
from .config import EXPECTED_USERNAME
from .menu import Button


async def register_actor(client, actor, chat, start_payload=None):
    if (actor is None or actor.is_bot or chat.type != "private" or chat.id != actor.id):
        raise BackendContractError("invalid_account_actor")
    return await client.register(actor=actor.id, chat=chat.id,
        username=actor.username, first_name=actor.first_name, last_name=actor.last_name,
        language=actor.language_code, start_payload=start_payload)


async def register_private_message(client, message, start_payload=None):
    return await register_actor(client, message.from_user, message.chat, start_payload)


async def own_account(client, actor, chat, locale, menus, view="account"):
    # Callback message author is the bot: identity comes from query.from_user.
    await register_actor(client, actor, chat)
    result = await client.account(actor=actor.id, chat=chat.id)
    link = "https://t.me/" + EXPECTED_USERNAME + "?start=" + result.referral_payload if result.referral_payload else None
    ru = locale == "ru"
    label = "Ваша реферальная ссылка" if ru else "Your referral link"
    link_text = link or ("Реферальная ссылка временно недоступна." if ru else "Your referral link is temporarily unavailable.")
    counts = (f"Приглашено лично: {result.level_1_count}. Всего: {result.total_count}." if ru else
              f"Direct referrals: {result.level_1_count}. Total: {result.total_count}.")
    if view in {"referrals", "network"}:
        body = label + "\n" + link_text + "\n\n" + counts
        rows = ((Button(label, url=link),),) if link else ()
    elif view == "points":
        body = ("Баланс SAFRWAY Points: " if ru else "SAFRWAY Points balance: ") + str(result.balance)
        rows = ()
    elif view == "orders":
        body = "Последние покупки (до 30):" if ru else "Recent purchases (up to 30):"
        if not result.orders:
            body += "\nПокупок пока нет." if ru else "\nNo purchases yet."
        for order in result.orders:
            body += f"\n#{order.id} · {order.service} · {order.status} · {order.payment_status}"
        if len(body) > 3500:
            body = body[:3400] + ("\nПолный список — в Mini App." if ru else "\nOpen Mini App for the complete list.")
        rows = ()
    else:
        body = (("Мой личный кабинет\nБаланс SAFRWAY Points: " if ru else "My account\nSAFRWAY Points balance: ")
                + str(result.balance) + "\n" + counts + "\n\n" + label + "\n" + link_text)
        rows = ((Button("Points", callback="account:points"), Button("Реферальная ссылка" if ru else "Referral link", callback="account:referrals")),
                (Button("Моя сеть" if ru else "My network", callback="account:network"), Button("Мои покупки" if ru else "My purchases", callback="account:orders")))
    if menus.settings.mini_app_url:
        rows += ((Button("Открыть Mini App" if ru else "Open Mini App", web_app_url=menus.settings.mini_app_url),),)
    return menus.child(locale, body, rows, back="home" if view == "account" else "account")
