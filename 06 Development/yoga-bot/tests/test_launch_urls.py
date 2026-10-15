"""Approved preview exception stays exact and never broadens credential URLs."""
import unittest

from yoga_bot.catalog import ServiceLink
from yoga_bot.config import RuntimeConfigError, Settings, YOGA_PREVIEW_SITE_BASE, backend_origin, site_origin
from yoga_bot.menu import COPY, Menus
from tests.test_foundation import DUMMY_TOKEN, SHARED, settings


class ApprovedPreviewBaseTests(unittest.TestCase):
    def test_exact_published_preview_with_optional_single_trailing_slash(self):
        for value in (YOGA_PREVIEW_SITE_BASE, YOGA_PREVIEW_SITE_BASE + "/"):
            with self.subTest(value=value):
                self.assertEqual(site_origin(value), YOGA_PREVIEW_SITE_BASE)

    def test_old_dns_origin_normalization_is_preserved(self):
        for value in ("https://yoga.example.org", "https://YOGA.example.org:443/",
                      "https://yoga.example.org/", "https://YOGA.example.org"):
            with self.subTest(value=value):
                self.assertEqual(site_origin(value), "https://yoga.example.org")

    def test_other_ips_bare_ip_or_dns_basepaths_are_rejected(self):
        invalid = ("https://62.133.61.232/yoga-preview", "https://62.133.61.231",
                   "https://62.133.61.231/", "https://62.133.61.231/other-preview",
                   "https://yoga.example.org/yoga-preview", "https://127.0.0.1/yoga-preview",
                   "https://[::1]/yoga-preview", "https://[::ffff:62.133.61.231]/yoga-preview",
                   "https://1048923615/yoga-preview", "https://062.133.061.231/yoga-preview")
        for value in invalid:
            with self.subTest(value=value):
                with self.assertRaisesRegex(RuntimeConfigError, "^invalid_site_origin$"):
                    site_origin(value)

    def test_preview_rejects_ports_credentials_scheme_and_authority_aliases(self):
        invalid = ("http://62.133.61.231/yoga-preview", "HTTPS://62.133.61.231/yoga-preview",
                   "https://62.133.61.231:443/yoga-preview", "https://62.133.61.231:8443/yoga-preview",
                   "https://user@62.133.61.231/yoga-preview", "https://:password@62.133.61.231/yoga-preview",
                   "https://62.133.61.231./yoga-preview", "https://%36%32.133.61.231/yoga-preview",
                   "https://62.133.61.231@yoga.example.org/yoga-preview")
        for value in invalid:
            with self.subTest(value=value):
                with self.assertRaisesRegex(RuntimeConfigError, "^invalid_site_origin$"):
                    site_origin(value)

    def test_preview_rejects_traversal_encoded_aliases_and_delimiters(self):
        suffixes = ("?", "?lang=ru", "#", "#fragment", "//", "/./", "/../", "/../admin/",
                    "/en/", "/%2e%2e/", "/%2F", ";path=admin", "\\", "/\\admin",
                    "\n", "\r", "\t", "\x00", " ", "\u007f")
        invalid = [YOGA_PREVIEW_SITE_BASE + suffix for suffix in suffixes]
        invalid += [" " + YOGA_PREVIEW_SITE_BASE, "https://62.133.61.231/yoga%2Dpreview",
                    "https://62.133.61.231/%79oga-preview", "https://62.133.61.231/Yoga-preview",
                    "https://62.133.61.231//yoga-preview"]
        for value in invalid:
            with self.subTest(value=value):
                with self.assertRaisesRegex(RuntimeConfigError, "^invalid_site_origin$"):
                    site_origin(value)

    def test_preview_never_becomes_a_backend_credential_destination(self):
        for value in (YOGA_PREVIEW_SITE_BASE, YOGA_PREVIEW_SITE_BASE + "/",
                      "https://62.133.61.231", "https://62.133.61.231:443/"):
            with self.subTest(value=value):
                with self.assertRaisesRegex(RuntimeConfigError, "^invalid_backend_origin$"):
                    backend_origin(value)
        self.assertEqual(backend_origin("https://api.yoga.example.org/"), "https://api.yoga.example.org")
        self.assertEqual(backend_origin("http://127.0.0.1:8000"), "http://127.0.0.1:8000")

    def test_shared_intake_accepts_preview_with_separate_backend_credential(self):
        value = Settings.from_env({
            "YOGA_BOT_TOKEN": DUMMY_TOKEN, "YOGA_MVP_MODE": "shared_intake",
            "YOGA_SITE_ORIGIN": YOGA_PREVIEW_SITE_BASE + "/",
            "YOGA_SHARED_CONTENT_ROOT": str(SHARED),
            "YOGA_BACKEND_API_ORIGIN": "http://127.0.0.1:8000",
            "YOGA_SERVICE_API_TOKEN": "S" * 40,
        })
        self.assertEqual(value.mode, "shared_intake")
        self.assertEqual(value.origin, YOGA_PREVIEW_SITE_BASE)
        self.assertEqual(value.backend_origin, "http://127.0.0.1:8000")
        self.assertNotIn("S" * 40, repr(value))

    def test_ru_en_menu_links_join_the_preview_base_without_dropping_prefix(self):
        service = ServiceLink("c1", "/bali/visas/c1/", "/en/bali/visas/c1/", "C1", "C1")
        menu = Menus(settings(origin=site_origin(YOGA_PREVIEW_SITE_BASE + "/"), mode="shared_intake"), (service,))
        for locale, home_path, service_path in (("ru", "/", "/bali/visas/c1/"),
                                               ("en", "/en/", "/en/bali/visas/c1/")):
            with self.subTest(locale=locale):
                self.assertEqual(menu.home(locale).buttons[0][0].url, YOGA_PREVIEW_SITE_BASE + home_path)
                self.assertEqual(menu.page(locale, 0).buttons[0][0].url, YOGA_PREVIEW_SITE_BASE + service_path)
                self.assertEqual(menu.home(locale).text, COPY["intake_welcome"][locale])
        self.assertEqual(service.content_id, "c1")


class PreviewExchangeLinkTests(unittest.TestCase):
    def setUp(self):
        self.exchange = ServiceLink("exchange", "/bali/exchange/", "/en/bali/exchange/", "Обмен валют", "Currency exchange")

    def menu(self, origin=YOGA_PREVIEW_SITE_BASE, service=None):
        return Menus(settings(origin=site_origin(origin), mode="shared_intake"), (service or self.exchange,))

    def test_exact_ru_en_exchange_pair_uses_existing_manager_topic(self):
        for locale, route in (("ru", "/bali/exchange/"), ("en", "/en/bali/exchange/")):
            with self.subTest(locale=locale):
                button = self.menu().page(locale, 0).buttons[0][0]
                self.assertIsNone(button.url)
                self.assertEqual(button.callback, "topic:exchange")
                self.assertEqual(button.label, self.exchange.label(locale))
        self.assertEqual(self.exchange.content_id, "exchange")
        self.assertEqual(self.exchange.ru_route, "/bali/exchange/")
        self.assertEqual(self.exchange.en_route, "/en/bali/exchange/")

    def test_home_stays_on_yoga_preview(self):
        menu = self.menu(YOGA_PREVIEW_SITE_BASE + "/")
        self.assertEqual(menu.home("ru").buttons[0][0].url, YOGA_PREVIEW_SITE_BASE + "/")
        self.assertEqual(menu.home("en").buttons[0][0].url, YOGA_PREVIEW_SITE_BASE + "/en/")

    def test_old_dns_origin_never_gets_exchange_host_rewrite(self):
        for locale, route in (("ru", "/bali/exchange/"), ("en", "/en/bali/exchange/")):
            with self.subTest(locale=locale):
                self.assertEqual(self.menu("https://yoga.example.org").page(locale, 0).buttons[0][0].url,
                                 "https://yoga.example.org" + route)

    def test_route_without_exact_exchange_identity_is_not_rewritten(self):
        adjacent = ServiceLink("exchange_guide", self.exchange.ru_route, self.exchange.en_route, "Guide", "Guide")
        for locale in ("ru", "en"):
            with self.subTest(locale=locale):
                self.assertEqual(self.menu(service=adjacent).page(locale, 0).buttons[0][0].url,
                                 YOGA_PREVIEW_SITE_BASE + adjacent.route(locale))

    def test_exchange_identity_with_any_route_drift_fails_closed(self):
        bad_pairs = (("/bali/exchange/other/", "/en/bali/exchange/other/"),
                     ("/en/bali/exchange/", "/bali/exchange/"),
                     ("//evil.example.org/", "https://evil.example.org/"),
                     ("/bali/exchange/?next=admin", "/en/bali/exchange/#token"),
                     ("/bali/%65xchange/", "/en/bali/%65xchange/"),
                     ("/bali/exchange/../admin/", "/en/bali/exchange/../admin/"))
        for ru, en in bad_pairs:
            for locale in ("ru", "en"):
                with self.subTest(ru=ru, en=en, locale=locale):
                    changed = ServiceLink("exchange", ru, en, "Обмен валют", "Currency exchange")
                    with self.assertRaisesRegex(RuntimeConfigError, "^exchange_route_drift$"):
                        self.menu(service=changed).page(locale, 0)

    def test_all_other_catalog_services_and_customer_copy_are_unchanged(self):
        from yoga_bot.catalog import load_catalog
        services = load_catalog(SHARED)
        preview = Menus(settings(origin=YOGA_PREVIEW_SITE_BASE, mode="shared_intake"), services)
        dns = Menus(settings(origin="https://yoga.example.org", mode="shared_intake"), services)
        for locale in ("ru", "en"):
            for index, service in enumerate(services):
                with self.subTest(locale=locale, content_id=service.content_id):
                    page_number, row_number = divmod(index, 8)
                    old_page, new_page = dns.page(locale, page_number), preview.page(locale, page_number)
                    self.assertEqual(new_page.text, old_page.text)
                    # Layout is now two columns; compare the unchanged ordered
                    # canonical URL buttons, independently of navigation rows.
                    old_links = [b for row in old_page.buttons for b in row if b.url]
                    old_button = old_links[row_number]
                    new_links = [b for row in new_page.buttons for b in row if b.label == old_button.label]
                    self.assertEqual(len(new_links), 1)
                    old_button, new_button = old_links[row_number], new_links[0]
                    self.assertEqual(new_button.label, old_button.label)
                    if service.content_id == "exchange":
                        self.assertIsNone(new_button.url)
                        self.assertEqual(new_button.callback, "topic:exchange")
                    else:
                        self.assertEqual(new_button.url, YOGA_PREVIEW_SITE_BASE + service.route(locale))


if __name__ == "__main__":
    unittest.main()
