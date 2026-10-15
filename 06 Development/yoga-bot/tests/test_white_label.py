"""Yoga is a presentation derivative; canonical sources and user data stay exact."""
import re
import unittest
from yoga_bot.presentation import display_copy, visa_display_copy
from yoga_bot.visas import CARDS, renderer
from yoga_bot.menu import COPY, Menus
from yoga_bot.catalog import load_catalog
from yoga_bot.config import YOGA_PREVIEW_SITE_BASE
from tests.test_foundation import settings, SHARED
from tests.test_static_copy_boundary import expected_static_card


class WhiteLabelTests(unittest.TestCase):
    def test_static_copy_and_whitespace_without_touching_opaque_tokens(self):
        self.assertEqual(display_copy('HTTPS://SAFRWAY.ONLINE/x?SAFRWAY=1'), 'HTTPS://SAFRWAY.ONLINE/x?SAFRWAY=1')
        value = '  SAFRWAY · SAFR Points · SAFRWAY Points · сервис SAFR · SAFR Bali\n{name} {SAFRWAY} https://safrway.online/ user@safrway.online  '
        self.assertEqual(display_copy(value), '  Yoga Ganster · Points · Points · сервис Yoga Ganster · Yoga Ganster\n{name} {SAFRWAY} https://safrway.online/ user@safrway.online  ')
        for values in COPY.values():
            for text in values.values():
                self.assertNotRegex(text, r'(?i)\bSAFR(?:WAY)?\b')

    def test_complete_ruen_cards_have_only_brand_and_vetted_public_url_delta(self):
        core = renderer()  # Existing eight input SHA pins are verified here.
        for locale in ('ru', 'en'):
            for key, _ in CARDS.values():
                with self.subTest(locale=locale, key=key):
                    source = core.card(key, locale=locale, pricing_projection=None)
                    expected = expected_static_card(key, locale, YOGA_PREVIEW_SITE_BASE)
                    projected = core.card(key, locale=locale, pricing_projection=None,
                                          static_copy=lambda raw: visa_display_copy(raw, YOGA_PREVIEW_SITE_BASE))
                    self.assertEqual(projected, expected)
                    self.assertNotRegex(projected, r'(?i)\bSAFR(?:WAY)?\b')
                    self.assertEqual(re.findall(r'\d[\d.,]*', re.sub(r'https?://\S+', '', projected)), re.findall(r'\d[\d.,]*', re.sub(r'https?://\S+', '', source)))
                    self.assertEqual(core.card(key, locale=locale, pricing_projection=None), source)

    def test_unknown_canonical_link_is_not_fabricated_or_rewritten_into_auth(self):
        for route in ('/admin/', '/account/?ref=1', '/bali/visas/e33g/?token=2'):
            with self.assertRaisesRegex(ValueError, 'unreviewed_public_visa_link'):
                visa_display_copy('https://safrway.online' + route, YOGA_PREVIEW_SITE_BASE)

    def test_exchange_keeps_existing_miniapp_or_manager_journey_not_main(self):
        for mini in ('', 'https://yoga.example.org/mini-app/'):
            menus = Menus(settings(origin=YOGA_PREVIEW_SITE_BASE, mini_app_url=mini), load_catalog(SHARED))
            for locale in ('ru', 'en'):
                button = menus.categories(locale).buttons[4][1]
                self.assertIsNone(button.url)
                if mini:
                    self.assertEqual(button.web_app_url, mini + '#/services/bali/exchange/usdt-idr')
                else:
                    self.assertEqual(button.callback, 'topic:exchange')


if __name__ == '__main__':
    unittest.main()
