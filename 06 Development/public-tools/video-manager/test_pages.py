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

    def test_analytics_addendum_versions_anchor_and_readonly_boundary(self):
        text = (ROOT / 'privacy/index.html').read_text()
        page = Page(text)
        self.assertEqual(sum(a.get('id') == 'analytics' for _, a in page.nodes), 1)
        self.assertIn(('a', {'href': '#analytics'}), page.nodes)
        self.assertIn('Effective date: 23 October 2026 · Policy version 2026-10-23', text)
        self.assertIn('Analytics addendum version 2026-10-25. Base upload-policy version remains 2026-10-23.', text)
        for term in ['youtube.readonly and yt-analytics.readonly',
                     'does not request monetary analytics permission',
                     'existing upload authorization is stored separately',
                     'does not authorize new uploads, publication changes or changes to another channel',
                     'maximum 30-calendar-day refresh-or-removal rule',
                     'does not promise an always-on cleanup service',
                     'also removes the analytics credentials and retained analytics reports',
                     'Existing YouTube schedules remain on YouTube']:
            self.assertIn(term, text)
        self.assertNotIn('yt-analytics-monetary', text)

    def test_analytics_addendum_preserves_approved_paragraphs_verbatim(self):
        text = (ROOT / 'privacy/index.html').read_text()
        paragraphs = [
            "When the owner separately enables analytics, the utility can read YouTube Analytics reports for the expressly authorized channel. These reports can include views and engaged views, watch time, average viewing duration and percentage, audience retention, subscriber changes, engagement, and aggregate breakdowns such as date, video, country and traffic source, where YouTube makes the report available. The analytics feature requests youtube.readonly and yt-analytics.readonly. It does not request monetary analytics permission. The existing upload authorization is stored separately and is not replaced by the analytics authorization.",
            "Analytics data is used only to answer the owner's channel-performance questions, compare videos and prepare owner-requested reports or content recommendations. Selected reports and results may be processed by the owner's authorized AI assistant as described below. Analytics access does not authorize new uploads, publication changes or changes to another channel. Data is not sold or used through this utility to train a general-purpose AI model.",
            "Analytics tokens and channel-bound connection records are held in the same protected local application profile, in separate files. API-derived analytics reports are stored outside the public website and source repository and follow the existing maximum 30-calendar-day refresh-or-removal rule. The feature checks retention when used; this does not promise an always-on cleanup service. Disconnecting or deleting local application data also removes the analytics credentials and retained analytics reports. Existing YouTube schedules remain on YouTube unless the owner separately directs a change.",
        ]
        for paragraph in paragraphs:
            self.assertEqual(text.count('<p>' + paragraph + '</p>'), 1)

    def test_css_is_local_responsive_and_keyboard_visible(self):
        css = (ROOT / 'site.css').read_text()
        self.assertIn(':focus-visible', css)
        self.assertIn('@media(max-width:420px)', css)
        self.assertNotIn('url(', css)
        self.assertNotIn('@import', css)

if __name__ == '__main__':
    unittest.main()
