import io
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
import tempfile
import unittest
import urllib.error

from refresh_public_playlist import collect, credentials, publish, run, RefreshError, YouTube

FIRST = "Cf7nNu5gtiM"
SECOND = "6d2Cy0t7wN8"
THIRD = "SvZAA7YatZI"
PLAYLIST = "PLPOOzdEflpdk"


def details(video_id, **status):
    return {"id": video_id, "snippet": {"title": "Public title"}, "status": {
        "privacyStatus": "public", "embeddable": True, "uploadStatus": "processed", **status}}


class API:
    def __init__(self, pages):
        self.pages, self.calls = iter(pages), []

    def get(self, resource, params):
        self.calls.append((resource, params))
        page = next(self.pages)
        if isinstance(page, Exception):
            raise page
        return page


def members(*ids, token=None):
    result = {"items": [{"contentDetails": {"videoId": value}} for value in ids]}
    if token:
        result["nextPageToken"] = token
    return result


class RefreshTests(unittest.TestCase):
    def test_pagination_order_deduplication_and_public_embeddable_filter(self):
        api = API([members(FIRST, SECOND, token="next"), members(FIRST, THIRD),
                   {"items": [details(THIRD, privacyStatus="unlisted"), details(SECOND, embeddable=False), details(FIRST)]}])
        data = collect(api, PLAYLIST)
        self.assertEqual(data["videos"], [{"id": FIRST, "title": "Public title"}])
        self.assertEqual(api.calls[1][1]["pageToken"], "next")
        self.assertEqual(api.calls[2][1]["id"], ",".join([FIRST, SECOND, THIRD]))
        self.assertEqual(set(data), {"version", "source", "playlistId", "fetchedAt", "expiresAt", "videos"})
        self.assertEqual(datetime.fromisoformat(data["expiresAt"]) - datetime.fromisoformat(data["fetchedAt"]), timedelta(days=1))

    def test_complete_empty_playlist_is_published_not_stale_previous_entries(self):
        self.assertEqual(collect(API([members()]), PLAYLIST)["videos"], [])

    def test_page_failure_does_not_replace_last_good_projection(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "playlist.json"
            previous = collect(API([members(FIRST), {"items": [details(FIRST)]}]), PLAYLIST)
            publish(path, previous)
            before = path.read_bytes()
            with self.assertRaises(RefreshError):
                run(path, "test-key", PLAYLIST, API([members(FIRST, token="next"), RefreshError("transport_unavailable")]))
            self.assertEqual(path.read_bytes(), before)
            self.assertEqual(list(Path(directory).glob("tmp*")), [])

    def test_expired_cache_drops_api_titles_and_pagination_loops_fail(self):
        with self.assertRaisesRegex(RefreshError, "invalid_pagination"):
            collect(API([members(FIRST, token="same"), members(SECOND, token="same")]), PLAYLIST)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "playlist.json"
            old = collect(API([members(FIRST), {"items": [details(FIRST)]}]), PLAYLIST,
                          now=datetime.now(timezone.utc) - timedelta(days=2))
            publish(path, old)
            with self.assertRaises(RefreshError):
                run(path, "test-key", PLAYLIST, API([RefreshError("transport_unavailable")]))
            self.assertEqual(json.loads(path.read_text())["videos"], [])

    def test_header_auth_retry_bound_and_sanitized_error(self):
        class Opener:
            def __init__(self):
                self.calls = 0
            def open(self, request, timeout):
                self.calls += 1
                self_request = request
                assert "test-secret" not in self_request.full_url
                assert self_request.get_header("X-goog-api-key") == "test-secret"
                raise urllib.error.HTTPError(request.full_url, 503, "test-secret", {}, io.BytesIO(b'{"error":{"message":"test-secret"}}'))
        opener, delays = Opener(), []
        with self.assertRaisesRegex(RefreshError, "^http_503:unknown$"):
            YouTube("test-secret", opener=opener, sleep=delays.append).get("playlistItems", {})
        self.assertEqual(opener.calls, 3)
        self.assertEqual(delays, [1, 2])

    def test_success_atomic_public_projection_and_credential_file_permissions(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "playlist.json"
            result = run(path, "test-secret", PLAYLIST, API([members(FIRST), {"items": [details(FIRST)]}]))
            self.assertEqual(result["count"], 1)
            self.assertNotIn("test-secret", path.read_text())
            self.assertEqual(path.stat().st_mode & 0o777, 0o644)
            secret = Path(directory) / "secret.env"
            secret.write_text(f"YOUTUBE_API_KEY=test-secret\nYOUTUBE_PLAYLIST_ID={PLAYLIST}\n")
            secret.chmod(0o600)
            self.assertEqual(credentials(secret), ("test-secret", PLAYLIST))
            secret.chmod(0o644)
            with self.assertRaises(RefreshError):
                credentials(secret)


if __name__ == "__main__":
    unittest.main()
