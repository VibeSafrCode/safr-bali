"""Pure catalog classification; no bot, API, customer message or runtime start."""
import json
from pathlib import Path
import tempfile
import unittest

from yoga_bot.catalog import SOURCE_COMPONENT_MANIFESTS, load_catalog
from yoga_bot.config import RuntimeConfigError

SHARED = Path(__file__).resolve().parents[2] / "shared" / "content"


class SourceComponentManifestTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="yoga-component-catalog-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "generated/i18n").mkdir(parents=True)
        self.write("service-registry.v1.json", {"schemaVersion": 1, "records": [{
            "contentId": "bank", "kind": "document",
            "published": {"routes": {"ru": "/bali/bank/", "en": "/en/bali/bank/"}},
        }]})
        self.write("generated/i18n/public.v1.json", {"schemaVersion": 1, "entries": {
            "catalog.bali.bank.name": {"ru": "Банк", "en": "Bank"},
        }})

    def write(self, name, value):
        (self.root / name).write_text(json.dumps(value), encoding="utf-8")

    def test_exact_two_source_envelopes_do_not_publish_or_break_existing_links(self):
        before = load_catalog(self.root)
        self.assertEqual(len(SOURCE_COMPONENT_MANIFESTS), 2)
        for name in SOURCE_COMPONENT_MANIFESTS:
            (self.root / name).write_bytes((SHARED / name).read_bytes())
        self.assertEqual(load_catalog(self.root), before)
        self.assertEqual([link.content_id for link in before], ["bank"])

    def test_mutated_known_source_manifest_fails_closed_even_if_it_claims_publication(self):
        for name in SOURCE_COMPONENT_MANIFESTS:
            with self.subTest(name=name):
                data = json.loads((SHARED / name).read_bytes())
                data["publicationAuthorized"] = True
                data["records"] = []
                self.write(name, data)
                with self.assertRaisesRegex(RuntimeConfigError, "source_component_manifest_drift"):
                    load_catalog(self.root)
                (self.root / name).unlink()

    def test_unknown_recordless_manifest_is_not_a_source_only_fallback(self):
        self.write("registry-unknown-build.v1.json", {"schemaVersion": 1, "kind": "SOURCE_ONLY"})
        with self.assertRaisesRegex(RuntimeConfigError, "invalid_build_records"):
            load_catalog(self.root)

    def test_known_component_bytes_under_an_unknown_filename_still_fail(self):
        name = next(iter(SOURCE_COMPONENT_MANIFESTS))
        (self.root / "registry-other-build.v1.json").write_bytes((SHARED / name).read_bytes())
        with self.assertRaisesRegex(RuntimeConfigError, "invalid_build_records"):
            load_catalog(self.root)

    def test_whitespace_only_source_drift_is_not_normalized(self):
        name = next(iter(SOURCE_COMPONENT_MANIFESTS))
        (self.root / name).write_bytes((SHARED / name).read_bytes() + b"\n")
        with self.assertRaisesRegex(RuntimeConfigError, "source_component_manifest_drift"):
            load_catalog(self.root)

    def test_actual_shared_catalog_does_not_gain_website_only_component_links(self):
        ids = {link.content_id for link in load_catalog(SHARED)}
        self.assertNotIn("hospitality", ids)
        self.assertNotIn("sktt", ids)
        self.assertIn("e33g", ids)


if __name__ == "__main__":
    unittest.main()
