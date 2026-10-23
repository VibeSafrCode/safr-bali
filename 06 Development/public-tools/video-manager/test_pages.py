from pathlib import Path
from html.parser import HTMLParser
import unittest

ROOT = Path(__file__).resolve().parent

class Page(HTMLParser):
    def __init__(self, text):
        super().__init__(convert_charrefs=True)
        self.nodes = []
        self.feed(text)
        self.close()

    def handle_starttag(self, tag, attrs):
        self.nodes.append((tag, dict(attrs)))

class PublicPages(unittest.TestCase):
    def test_two_exact_canonical_pages_and_safe_static_markup(self):
        for file, url in [('index.html', 'https://safrway.online/tools/video-manager/'), ('privacy/index.html', 'https://safrway.online/tools/video-manager/privacy/')]:
            with self.subTest(file=file):
                text = (ROOT / file).read_text(encoding='utf-8')
                page = Page(text)
                self.assertTrue(text.endswith('\n'))
                self.assertIn(('html', {'lang': 'en'}), page.nodes)
                self.assertEqual(sum(t == 'h1' for t, a in page.nodes), 1)
                self.assertIn(('link', {'rel': 'canonical', 'href': url}), page.nodes)
                self.assertIn(('meta', {'name': 'robots', 'content': 'index,follow'}), page.nodes)
                self.assertFalse(any(t in ['script', 'iframe', 'form', 'input', 'style'] for t, a in page.nodes))
                self.assertFalse(any('style' in a or any(k.startswith('on') for k in a) for t, a in page.nodes))
                self.assertIn(('link', {'rel': 'stylesheet', 'href': '/tools/video-manager/site.css'}), page.nodes)
                for t, a in page.nodes:
                    if 'href' in a:
                        self.assertTrue(a['href'].startswith(('https://', '/', '#')))
                self.assertIn('https://policies.google.com/privacy', text)
                self.assertIn('https://www.youtube.com/t/terms', text)
                self.assertIn('https://t.me/safr_bali_bot', text)
                self.assertNotIn('client_secret', text)
                self.assertNotIn('oauth.json', text)

    def test_privacy_disclosures_and_no_automatic_cleanup_claim(self):
        text = (ROOT / 'privacy/index.html').read_text()
        for term in ['YouTube API Services', 'OpenAI', 'not necessarily local', '30 calendar days', '7 calendar days', 'no always-on cleanup', 'https://security.google.com/settings/security/permissions', 'does not delete videos', 'request information', 'Contact and policy changes']:
            self.assertIn(term, text)

    def test_routes_are_exact_get_only_and_inherit_security_headers(self):
        conf = (ROOT / 'nginx.locations.conf').read_text()
        self.assertEqual(conf.count('location = '), 5)
        self.assertEqual(conf.count('limit_except GET HEAD { deny all; }'), 3)
        self.assertNotIn('proxy_pass', conf)
        self.assertNotIn('add_header', conf)
        self.assertNotIn('/var/www/safr/astro-site', conf)
        self.assertNotIn('server_name', conf)
        self.assertEqual(conf.count('root /var/www/safr/video-manager;'), 2)
        self.assertIn('try_files /index.html =404;', conf)
        self.assertIn('try_files /privacy/index.html =404;', conf)
        self.assertNotIn('alias /var/www/safr/video-manager/index.html;', conf)
        self.assertNotIn('alias /var/www/safr/video-manager/privacy/index.html;', conf)

    def test_css_is_local_responsive_and_keyboard_visible(self):
        css = (ROOT / 'site.css').read_text()
        self.assertIn(':focus-visible', css)
        self.assertIn('@media(max-width:420px)', css)
        self.assertNotIn('url(', css)
        self.assertNotIn('@import', css)

if __name__ == '__main__':
    unittest.main()
