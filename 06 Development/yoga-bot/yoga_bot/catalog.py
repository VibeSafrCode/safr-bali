"""Read canonical route/title inputs. Never copy prices, FX or visa bodies."""
from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
import re
from .config import RuntimeConfigError

PATH = re.compile(r"/(?:en/)?(?:bali|thailand|russia|nepal|visas)(?:/[a-z0-9-]+)*/")
KIND = frozenset({"hub", "visa", "service", "extension", "conversion", "document", "business", "license",
                  "world_visa", "comparison", "triage", "guide", "media"})
GATES = frozenset({"ACTUAL_SCOPED_RENDER_QA_PASS", "ACTUAL_RENDER_QA_PASS", "PASS_ACTUAL_RENDER_QA"})
GATE_KEYS = ("render", "responsive", "accessibility", "crossSurfacePriceParity", "sourceUncertaintyReview")


def canonical_route(route, locale):
    if not isinstance(route, str) or not PATH.fullmatch(route):
        raise RuntimeConfigError("invalid_canonical_route")
    if route.startswith("/en/") != (locale == "en"):
        raise RuntimeConfigError("route_locale_mismatch")
    return route


def _json(path):
    try:
        if path.stat().st_size > 20_000_000:
            raise RuntimeConfigError("canonical_input_too_large")
        result = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(result, dict) or result.get("schemaVersion") != 1:
            raise RuntimeConfigError("invalid_canonical_input")
        return result
    except (OSError, UnicodeError, json.JSONDecodeError):
        raise RuntimeConfigError("canonical_input_unavailable") from None


def _read_pinned(root, relative, expected):
    if (not isinstance(relative, str) or not relative.startswith("registry-copy/")
            or not re.fullmatch(r"registry-copy/[a-zA-Z0-9_.-]+", relative)
            or not isinstance(expected, str) or not re.fullmatch(r"[a-f0-9]{64}", expected)):
        raise RuntimeConfigError("invalid_content_pin")
    try:
        target = (root / relative).resolve(strict=True)
        if not target.is_relative_to(root.resolve()) or target.stat().st_size > 2_000_000:
            raise RuntimeConfigError("invalid_content_pin")
        raw = target.read_bytes()
    except OSError:
        raise RuntimeConfigError("content_pin_unavailable") from None
    if hashlib.sha256(raw).hexdigest() != expected:
        raise RuntimeConfigError("content_pin_drift")
    return raw


def _label(value):
    if not isinstance(value, str) or not value.strip() or any(ord(c) < 32 for c in value):
        raise RuntimeConfigError("invalid_service_label")
    # Telegram button limits are presentation only; no service prose is rewritten.
    return value.strip()[:60]


@dataclass(frozen=True)
class ServiceLink:
    content_id: str
    ru_route: str
    en_route: str
    ru_label: str
    en_label: str

    def route(self, locale):
        return self.ru_route if locale == "ru" else self.en_route

    def label(self, locale):
        return self.ru_label if locale == "ru" else self.en_label


def load_catalog(root):
    root = Path(root)
    registry = _json(root / "service-registry.v1.json")
    i18n = _json(root / "generated/i18n/public.v1.json").get("entries", {})
    if (not isinstance(i18n, dict) or not isinstance(registry.get("records"), list)
            or len(registry["records"]) > 1000):
        raise RuntimeConfigError("invalid_registry_records")
    records = {}
    links = {}
    for record in registry["records"]:
        if not isinstance(record, dict):
            raise RuntimeConfigError("invalid_registry_records")
        cid = record.get("contentId")
        if not isinstance(cid, str) or not re.fullmatch(r"[a-z][a-z0-9_]*", cid) or cid in records:
            raise RuntimeConfigError("invalid_registry_identity")
        records[cid] = record
        if not record.get("published") or record.get("kind") not in KIND:
            continue
        routes = record["published"].get("routes", {})
        if routes.get("ru") == "/":
            continue
        ru, en = canonical_route(routes.get("ru"), "ru"), canonical_route(routes.get("en"), "en")
        if en != "/en" + ru:
            raise RuntimeConfigError("published_route_pair_drift")
        segments = ru.strip("/").split("/")
        key = "catalog.destination." + segments[0] + ".name" if len(segments) == 1 else "catalog." + ".".join(segments) + ".name"
        entry = i18n.get(key)
        if not entry:
            raise RuntimeConfigError("published_label_translation_missing")
        links[cid] = ServiceLink(cid, ru, en, _label(entry.get("ru")), _label(entry.get("en")))
    # Candidates without actual publication/render gates never become bot links.
    for path in sorted(root.glob("registry-*-build.v1.json")):
        build = _json(path)
        if not isinstance(build.get("records"), list) or len(build["records"]) > 1000:
            raise RuntimeConfigError("invalid_build_records")
        for row in build.get("records", []):
            if not isinstance(row, dict):
                raise RuntimeConfigError("invalid_build_records")
            publication = row.get("publication", {})
            if publication.get("indexable") is not True:
                continue
            if (publication.get("gateStatus") not in GATES
                    or any(build.get("publicationGates", {}).get(key) is not True for key in GATE_KEYS)):
                continue
            record = records.get(row.get("contentId"))
            if not record or record.get("kind") not in KIND:
                continue
            candidate = record.get("candidate", {})
            # sourceRevision pins the rendered RU body; approvedSourceRevision
            # may instead pin the original Founder Markdown in full-payload packs.
            revision = row.get("sourceRevision")
            if (not isinstance(revision, str) or not re.fullmatch(r"sha256:[a-f0-9]{64}", revision)
                    or revision != candidate.get("revision")):
                # Superseded build projections are not current content authority.
                continue
            ru_copy = candidate.get("ru", {})
            if ru_copy.get("status") != "owner_approved_semantics" or ru_copy.get("approvalRevision") != revision:
                raise RuntimeConfigError("source_approval_drift")
            titles, routes = {}, {}
            for locale in ("ru", "en"):
                copy = ru_copy if locale == "ru" else candidate.get("translations", {}).get("en", {})
                projection = row.get("locales", {}).get(locale, {})
                if not projection:
                    raise RuntimeConfigError("published_locale_missing")
                if locale == "en" and (copy.get("sourceRevision") != revision or copy.get("complete") is not True or copy.get("qa") != "passed"):
                    raise RuntimeConfigError("translation_approval_drift")
                if projection.get("bodySha256") != copy.get("bodySha256") or projection.get("metadataSha256") != copy.get("metadataSha256"):
                    raise RuntimeConfigError("projection_pin_drift")
                _read_pinned(root, copy.get("bodyFile"), copy.get("bodySha256"))
                raw = _read_pinned(root, copy.get("metadataFile"), copy.get("metadataSha256"))
                try:
                    metadata = json.loads(raw)
                except (UnicodeError, json.JSONDecodeError):
                    raise RuntimeConfigError("invalid_metadata") from None
                if not isinstance(metadata, dict):
                    raise RuntimeConfigError("invalid_metadata")
                titles[locale] = _label(metadata.get("h1"))
                routes[locale] = canonical_route(projection.get("route"), locale)
                expected = candidate.get("route")
                if routes[locale] != ("/en" + expected if locale == "en" else expected):
                    raise RuntimeConfigError("projection_route_drift")
            cid = record["contentId"]
            links[cid] = ServiceLink(cid, routes["ru"], routes["en"], titles["ru"], titles["en"])
    if not links:
        raise RuntimeConfigError("empty_published_catalog")
    return tuple(links[cid] for cid in sorted(links))
