"""Narrow local PDF presentation parity; never regenerate the Main artifact."""
import contextlib
import hashlib
import io
import re
import runpy
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from pypdf import PdfReader


SITE = Path(__file__).resolve().parents[1]
SCRIPT = SITE / "scripts/generate-all-indonesia-pdf.py"
MAIN = SITE / "public/downloads/all-indonesia-client-guide-safrway-2026.pdf"
YOGA = SITE / "public/downloads/all-indonesia-client-guide-yoga-2026.pdf"
MAIN_SHA256 = "830441318cbb7836b050df95eb4ed3f35a8a3e10b495518ddd57a22fa89e7a34"
YOGA_SITE = "https://62.133.61.231/yoga-preview/"
FORBIDDEN = re.compile(r"safrway|safr_bali_bot|\bsafr\b", re.IGNORECASE)


def normalize(text):
    return re.sub(r"\s+", " ", text).strip()


def yoga_presentation(text):
    return (text.replace("SAFRWAY", "Yoga Ganster")
            .replace("safrway.online", YOGA_SITE)
            .replace("@safr_bali_bot", "@Yoga_ganster_bot"))


def links(reader):
    result = []
    for number, page in enumerate(reader.pages, 1):
        for annotation in page.get("/Annots", []):
            action = annotation.get_object().get("/A", {})
            if action.get("/URI"):
                result.append((number, str(action["/URI"])))
    return result


class GuideBrandTests(unittest.TestCase):
    def test_main_artifact_exact_original_bytes(self):
        self.assertEqual(hashlib.sha256(MAIN.read_bytes()).hexdigest(), MAIN_SHA256)

    def test_default_configuration_remains_main_without_writing(self):
        # Exercise the normal no-argument configuration, but never invoke its
        # renderer/write. The existing directory already exists; no output is made.
        with patch.object(sys, "argv", [str(SCRIPT)]), \
                patch("reportlab.platypus.BaseDocTemplate.build") as build, \
                contextlib.redirect_stdout(io.StringIO()):
            configuration = runpy.run_path(str(SCRIPT), run_name="__main__")
        self.assertFalse(configuration["YOGA_BRAND"])
        self.assertEqual(configuration["OUTPUT"], MAIN)
        self.assertEqual(configuration["SERVICE_NAME"], "SAFRWAY")
        self.assertEqual(configuration["SERVICE_SITE"], "safrway.online")
        self.assertEqual(configuration["SERVICE_BOT"], "@safr_bali_bot")
        build.assert_called_once()
        self.assertEqual(hashlib.sha256(MAIN.read_bytes()).hexdigest(), MAIN_SHA256)

    def test_all_ten_pages_complete_modulo_presentation(self):
        main, yoga = PdfReader(MAIN), PdfReader(YOGA)
        self.assertEqual(len(main.pages), 10)
        self.assertEqual(len(yoga.pages), 10)
        for number, (original, branded) in enumerate(zip(main.pages, yoga.pages), 1):
            with self.subTest(page=number):
                self.assertEqual(original.mediabox, branded.mediabox)
                expected = yoga_presentation(original.extract_text())
                actual = branded.extract_text()
                self.assertEqual(normalize(actual), normalize(expected))
                self.assertNotRegex(actual, FORBIDDEN)
        text = "\n".join(page.extract_text() for page in yoga.pages)
        self.assertEqual(text.count("25.08.2026"), 2)
        self.assertIn("@Yoga_ganster_bot", text)
        self.assertIn(YOGA_SITE, text)

    def test_metadata_and_clickable_links_have_no_main_brand(self):
        main, yoga = PdfReader(MAIN), PdfReader(YOGA)
        self.assertEqual(yoga.metadata.author, "Yoga Ganster")
        self.assertEqual(yoga.metadata.title, yoga_presentation(main.metadata.title))
        self.assertEqual(yoga.metadata.subject, main.metadata.subject)
        self.assertNotRegex(str(dict(yoga.metadata)), FORBIDDEN)
        self.assertEqual(links(yoga), links(main))
        self.assertEqual(links(yoga), [(1, "https://allindonesia.imigrasi.go.id/"),
                                       (10, "https://allindonesia.imigrasi.go.id/")])
        for _, url in links(yoga):
            self.assertNotRegex(url, FORBIDDEN)


if __name__ == "__main__":
    unittest.main()
