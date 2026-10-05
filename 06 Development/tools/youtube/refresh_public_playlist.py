"""Read-only YouTube Data API projection. No OAuth, playlist writes or client keys."""
import argparse
from datetime import datetime, timedelta, timezone
import fcntl
import json
import os
from pathlib import Path
import re
import stat
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

MAX_ITEMS = 500
MAX_BYTES = 1_000_000
VIDEO_ID = re.compile(r"[A-Za-z0-9_-]{11}\Z")
PLAYLIST_ID = re.compile(r"[A-Za-z0-9_-]{1,100}\Z")
SAFE_REASONS = {"accessNotConfigured", "keyInvalid", "forbidden", "quotaExceeded",
                "dailyLimitExceeded", "playlistNotFound", "playlistItemsNotAccessible",
                "ipRefererBlocked", "API_KEY_INVALID", "API_KEY_SERVICE_BLOCKED",
                "API_KEY_IP_ADDRESS_BLOCKED", "API_KEY_HTTP_REFERRER_BLOCKED",
                "SERVICE_DISABLED"}


class RefreshError(Exception):
    """Only sanitized codes may be placed in this exception."""


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None  # Never forward the credential to another origin.


def credentials(env_file=None):
    values = {key: os.environ.get(key, "") for key in ("YOUTUBE_API_KEY", "YOUTUBE_PLAYLIST_ID")}
    if env_file:
        path = Path(env_file)
        info = path.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077:
            raise RefreshError("credential_file_requires_regular_0600")
        for line in path.read_text().splitlines():
            if "=" not in line or line.lstrip().startswith("#"):
                continue
            key, value = line.split("=", 1)
            if key.strip() in values:
                values[key.strip()] = value.strip().strip("\"'")
    key, playlist = values["YOUTUBE_API_KEY"], values["YOUTUBE_PLAYLIST_ID"]
    if not key or not PLAYLIST_ID.fullmatch(playlist):
        raise RefreshError("missing_or_invalid_configuration")
    return key, playlist


class YouTube:
    def __init__(self, key, opener=None, sleep=time.sleep):
        self.key = key
        self.opener = opener or urllib.request.build_opener(NoRedirect())
        self.sleep = sleep
        self.deadline = time.monotonic() + 150

    def get(self, resource, params):
        if resource not in {"playlistItems", "videos"}:
            raise RefreshError("invalid_resource")
        url = "https://www.googleapis.com/youtube/v3/" + resource + "?" + urllib.parse.urlencode(params)
        request = urllib.request.Request(url, headers={"X-Goog-Api-Key": self.key, "Accept": "application/json"})
        for attempt in range(3):
            if time.monotonic() >= self.deadline:
                raise RefreshError("refresh_deadline_exceeded")
            try:
                with self.opener.open(request, timeout=min(10, max(.1, self.deadline - time.monotonic()))) as response:
                    raw = response.read(MAX_BYTES + 1)
                if len(raw) > MAX_BYTES:
                    raise RefreshError("response_too_large")
                body = json.loads(raw)
                if not isinstance(body, dict) or not isinstance(body.get("items"), list):
                    raise RefreshError("invalid_api_response")
                return body
            except urllib.error.HTTPError as exc:
                reason = "unknown"
                try:
                    error = json.loads(exc.read(32000)).get("error", {})
                    for item in error.get("errors", []) + error.get("details", []):
                        if item.get("reason") in SAFE_REASONS:
                            reason = item["reason"]
                except (ValueError, AttributeError, TypeError):
                    pass
                if exc.code not in {429, 500, 502, 503, 504} or attempt == 2:
                    raise RefreshError(f"http_{exc.code}:{reason}") from None
            except (urllib.error.URLError, TimeoutError, OSError):
                if attempt == 2:
                    raise RefreshError("transport_unavailable") from None
            except (ValueError, UnicodeError):
                raise RefreshError("invalid_api_json") from None
            self.sleep(2 ** attempt)


def collect(api, playlist, now=None):
    ids, tokens, token = [], set(), None
    for _ in range(10):
        params = {"part": "contentDetails", "playlistId": playlist, "maxResults": 50,
                  "fields": "nextPageToken,items(contentDetails/videoId)"}
        if token:
            params["pageToken"] = token
        page = api.get("playlistItems", params)
        if len(page["items"]) > 50:
            raise RefreshError("invalid_page_size")
        for item in page["items"]:
            video_id = item.get("contentDetails", {}).get("videoId", "")
            if VIDEO_ID.fullmatch(video_id) and video_id not in ids:
                ids.append(video_id)
                if len(ids) > MAX_ITEMS:
                    raise RefreshError("playlist_exceeds_500_items")
        token = page.get("nextPageToken")
        if not token:
            break
        if not isinstance(token, str) or token in tokens or len(token) > 2048:
            raise RefreshError("invalid_pagination")
        tokens.add(token)
    else:
        raise RefreshError("playlist_exceeds_500_items")  # Never publish partial pages.
    playable = {}
    for offset in range(0, len(ids), 50):
        batch = ids[offset:offset + 50]
        page = api.get("videos", {"part": "snippet,status", "id": ",".join(batch),
                                  "fields": "items(id,snippet/title,status(privacyStatus,embeddable,uploadStatus))"})
        for item in page["items"]:
            status = item.get("status", {})
            title = item.get("snippet", {}).get("title")
            if (item.get("id") in batch and status.get("privacyStatus") == "public"
                    and status.get("embeddable") is True and status.get("uploadStatus") == "processed"
                    and isinstance(title, str) and title.strip()):
                playable[item["id"]] = {"id": item["id"], "title": title.strip()[:300]}
    now = now or datetime.now(timezone.utc)
    return {"version": 1, "source": "youtube-data-api-v3", "playlistId": playlist,
            "fetchedAt": now.isoformat(), "expiresAt": (now + timedelta(hours=24)).isoformat(),
            "videos": [playable[video_id] for video_id in ids if video_id in playable]}


def publish(path, manifest):
    """Readers see the entire previous or entire new public projection, never a partial file."""
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf8", dir=path.parent, delete=False) as stream:
            temporary = Path(stream.name)
            json.dump(manifest, stream, ensure_ascii=False, separators=(",", ":"))
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
            os.fchmod(stream.fileno(), 0o644)  # Only allowlisted public fields above.
        os.replace(temporary, path)
    finally:
        if temporary and temporary.exists():
            temporary.unlink()


def expire_cache(path):
    """Do not retain outdated API titles forever during a prolonged outage."""
    try:
        cached = json.loads(path.read_text())
        if datetime.fromisoformat(cached["expiresAt"]) <= datetime.now(timezone.utc):
            publish(path, {key: value for key, value in cached.items() if key != "videos"} | {"videos": []})
    except (OSError, ValueError, KeyError, TypeError):
        pass


def run(output, key, playlist, api=None):
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.with_suffix(".lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return {"status": "already_running"}
        try:
            manifest = collect(api or YouTube(key), playlist)
            publish(output, manifest)
            return {"status": "updated", "count": len(manifest["videos"]), "fetchedAt": manifest["fetchedAt"]}
        except Exception:
            expire_cache(output)
            raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", help="Local regular 0600 credential file; production uses EnvironmentFile")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        key, playlist = credentials(args.env_file)
        result = run(args.output, key, playlist)
    except Exception as exc:
        # Never print a request, response body, traceback, environment or raw exception.
        code = str(exc) if isinstance(exc, RefreshError) else type(exc).__name__
        print(json.dumps({"status": "failed", "code": code}))
        return 1
    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
