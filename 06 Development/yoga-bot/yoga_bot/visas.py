"""Yoga navigation over the exact Main renderer, not another visa catalog."""
from pathlib import Path

from safr_content_core import ContentRoots, VisaRenderer
from .menu import Button
from .presentation import visa_display_copy

# Callback keys are presentation adapters; topics are existing Registry IDs.
CARDS = {
    "e33g": ("E33G", "e33g"), "d12": ("D12", "d12"),
    "d1d2": ("D1/D2", "d1_d2"), "c1": ("C1", "c1"),
    "voa": ("VOA", "voa"), "other": ("Другая виза", "visas_bali"),
    "e28a": ("E28A", "investor"),
}
CALLBACKS = frozenset({"visas:bali", "visas:thailand", "visa:ask", "visa:documents"}
                      | {"visa:" + key for key in CARDS})


def renderer():
    # These eight resources are immutable, byte-pinned canonical inputs. They
    # are packaged with the shared renderer, never edited as Yoga content.
    root = Path(__file__).resolve().parents[1] / "content_sources"
    return VisaRenderer(ContentRoots(bot_content_root=root / "bot", shared_content_root=root / "shared"))


def visa_menu(core, menus, locale, projection):
    copy = lambda value: visa_display_copy(value, menus.settings.origin)
    labels = core.labels(locale=locale, pricing_projection=projection, static_copy=copy)
    def choice(key):
        main_key = CARDS[key][0]
        label = core.text("button.visa.other", locale=locale, static_copy=copy) if key == "other" else labels[main_key]
        return Button(label, callback="visa:" + key)
    rows = tuple(tuple(choice(key) for key in row) for row in (
        ("e33g", "d12"), ("d1d2", "c1"), ("voa", "other"), ("e28a",)))
    rows += ((Button(core.text("button.visa.ask", locale=locale, static_copy=copy), callback="visa:ask"),
              Button(core.text("button.visa.missingDocuments", locale=locale, static_copy=copy), callback="visa:documents")),)
    return menus.child(locale, core.text("text.visaIntro", locale=locale, static_copy=copy), rows, back="categories")


def card_reply(core, menus, locale, selected, projection):
    key, topic = CARDS[selected]
    body = core.card(key, locale=locale, pricing_projection=projection,
                     static_copy=lambda value: visa_display_copy(value, menus.settings.origin))
    rows = ((Button("Связаться с менеджером" if locale == "ru" else "Contact manager", callback="topic:" + topic),),)
    service = next((item for item in menus.services if item.content_id == topic), None)
    if service:
        rows = ((rows[0][0], Button("Подробнее на сайте" if locale == "ru" else "Details on website",
                                   url=menus._service_url(service, locale))),)
    reply = menus.child(locale, body, rows, back="visas:bali")
    return core.parts(body), reply


def thailand(core, menus, locale):
    # Main has this destination label, not a separate Thai visa catalog. Keep
    # its exact text and manager path instead of inventing facts or prices.
    path = ("/en" if locale == "en" else "") + "/thailand/visas/"
    return menus.child(locale, core.text("destination.service.thailandVisas", locale=locale,
                       static_copy=lambda value: visa_display_copy(value, menus.settings.origin)),
        ((Button("Связаться с менеджером" if locale == "ru" else "Contact manager", callback="contact"),
          Button("Подробнее на сайте" if locale == "ru" else "Details on website", url=menus.settings.origin + path)),), back="categories")
