#!/usr/bin/env python3
"""Founder-local deterministic YouTube inventory and playlist operator.

OAuth credentials never belong in this repository. Read-only inventory and
classification are separated from additive playlist mutation by an exact plan
SHA-256 approval gate.
"""

from __future__ import annotations

import argparse
import base64
import fcntl
import hashlib
import json
import os
import re
import secrets
import stat
import sys
import tempfile
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from contextlib import contextmanager
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any, Callable, Iterable


API_BASE = "https://www.googleapis.com/youtube/v3"
AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
SCOPES = {
    "readonly": "https://www.googleapis.com/auth/youtube.readonly",
    "manage": "https://www.googleapis.com/auth/youtube",
}
REPO_ROOT = Path(__file__).resolve().parents[3]
TIMECODE_RE = re.compile(r"(?m)^\s*(?:\d{1,2}:)?\d{1,2}:\d{2}\s+(.+)$")
TIMECODE_LINE_RE = re.compile(r"(?m)^\s*(?:\d{1,2}:)?\d{1,2}:\d{2}\s+.+$")
PUBLIC_DESCRIPTION_LIMIT = 500
PUBLIC_THUMBNAIL_HOSTS = {"i.ytimg.com", "img.youtube.com"}


class OperatorError(RuntimeError):
    pass


def canonical_json(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def sha256_payload(value: Any) -> str:
    return hashlib.sha256(canonical_json(value)).hexdigest()


def _inside(path: Path, parent: Path) -> bool:
    try:
        path.resolve().relative_to(parent.resolve())
        return True
    except ValueError:
        return False


def _absolute_without_resolving(path: Path) -> Path:
    expanded = path.expanduser()
    return expanded if expanded.is_absolute() else Path.cwd() / expanded


def _assert_no_symlink_components(path: Path) -> None:
    current = Path(path.anchor)
    for part in path.parts[1:]:
        current /= part
        if current.exists() and current.is_symlink():
            raise OperatorError(f"Private path must not contain symlinks: {current}")


def require_private_directory(path: Path) -> Path:
    absolute = _absolute_without_resolving(path)
    _assert_no_symlink_components(absolute)
    if not absolute.exists() or not absolute.is_dir():
        raise OperatorError(
            "Create a dedicated private directory first (mode 0700) outside the repository"
        )
    resolved = absolute.resolve()
    if _inside(resolved, REPO_ROOT):
        raise OperatorError("OAuth material must be outside the SAFRWAY repository")
    metadata = resolved.stat()
    if metadata.st_uid != os.getuid():
        raise OperatorError("Private directory must be owned by the current user")
    if stat.S_IMODE(metadata.st_mode) != 0o700:
        raise OperatorError("Private directory must have exact mode 0700")
    return resolved


def require_private_path(path: Path, *, must_exist: bool) -> Path:
    absolute = _absolute_without_resolving(path)
    _assert_no_symlink_components(absolute)
    parent = require_private_directory(absolute.parent)
    resolved = parent / absolute.name
    if _inside(resolved, REPO_ROOT):
        raise OperatorError("OAuth material must be outside the SAFRWAY repository")
    if must_exist:
        if not resolved.is_file():
            raise OperatorError(f"Private file does not exist: {resolved}")
        metadata = resolved.stat()
        if metadata.st_uid != os.getuid() or stat.S_IMODE(metadata.st_mode) != 0o600:
            raise OperatorError("Private file must be owned by the current user with exact mode 0600")
    elif resolved.exists():
        metadata = resolved.stat()
        if not resolved.is_file() or metadata.st_uid != os.getuid() or stat.S_IMODE(metadata.st_mode) != 0o600:
            raise OperatorError("Existing private file must be owned by the current user with mode 0600")
    return resolved


def write_private_json(path: Path, value: Any) -> None:
    resolved = require_private_path(path, must_exist=False)
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{resolved.name}.", dir=resolved.parent)
    temporary = Path(temporary_name)
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(value, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, resolved)
        os.chmod(resolved, 0o600)
        directory_descriptor = os.open(resolved.parent, os.O_RDONLY)
        try:
            os.fsync(directory_descriptor)
        finally:
            os.close(directory_descriptor)
    finally:
        if temporary.exists():
            temporary.unlink()


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def read_private_json(path: Path) -> Any:
    return read_json(require_private_path(path, must_exist=True))


@contextmanager
def exclusive_apply_lock(journal_path: Path) -> Iterable[Path]:
    """Hold one nonblocking apply lock beside the private journal."""
    journal = require_private_path(journal_path, must_exist=False)
    lock_path = require_private_path(
        journal.with_name(f".{journal.name}.apply.lock"),
        must_exist=False,
    )
    flags = os.O_RDWR | os.O_CREAT
    flags |= getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0)
    descriptor = os.open(lock_path, flags, 0o600)
    try:
        metadata = os.fstat(descriptor)
        if (
            not stat.S_ISREG(metadata.st_mode)
            or metadata.st_uid != os.getuid()
            or stat.S_IMODE(metadata.st_mode) != 0o600
        ):
            raise OperatorError("Apply lock must be a current-user regular file with exact mode 0600")
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise OperatorError("Another apply is already running for this journal") from error
        yield lock_path
    finally:
        try:
            fcntl.flock(descriptor, fcntl.LOCK_UN)
        finally:
            os.close(descriptor)


def write_public_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _scope_set(value: Any) -> set[str]:
    if isinstance(value, str):
        return {item for item in value.split() if item}
    if isinstance(value, list):
        return {str(item) for item in value if str(item)}
    return set()


def validate_token_scopes(token: dict[str, Any], profile: str) -> None:
    if profile not in SCOPES:
        raise OperatorError(f"Unknown OAuth scope profile: {profile}")
    actual = _scope_set(token.get("scope"))
    expected = {SCOPES[profile]}
    if actual != expected:
        raise OperatorError(
            f"OAuth granted scopes do not exactly match the {profile} profile; authorize again"
        )


def form_request(url: str, values: dict[str, str]) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        data=urllib.parse.urlencode(values).encode("utf-8"),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    return _request_json(request)


def _request_json(request: urllib.request.Request) -> dict[str, Any]:
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = _redact_error_detail(error.read().decode("utf-8", errors="replace")[:600])
        raise OperatorError(f"YouTube API returned HTTP {error.code}: {detail}") from error
    except urllib.error.URLError as error:
        raise OperatorError(f"YouTube API connection failed: {error.reason}") from error
    if not isinstance(payload, dict):
        raise OperatorError("YouTube API returned an unexpected payload")
    return payload


def _redact_error_detail(detail: str) -> str:
    protected = re.sub(
        r'(?i)("?(?:access_token|refresh_token|client_secret|authorization)"?\s*[:=]\s*")([^"]+)(")',
        r"\1[redacted]\3",
        detail,
    )
    return re.sub(r"(?i)(bearer\s+)[a-z0-9._~-]+", r"\1[redacted]", protected)


def _client_config(path: Path) -> dict[str, Any]:
    private_path = require_private_path(path, must_exist=True)
    payload = read_json(private_path)
    installed = payload.get("installed") if isinstance(payload, dict) else None
    if not isinstance(installed, dict):
        raise OperatorError("Expected a Google OAuth Desktop application client JSON")
    if not installed.get("client_id") or not installed.get("client_secret"):
        raise OperatorError("OAuth Desktop client JSON is missing client_id/client_secret")
    return installed


class _OAuthHandler(BaseHTTPRequestHandler):
    response: dict[str, str] = {}
    expected_state = ""

    def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler contract
        query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        state = query.get("state", [""])[0]
        code = query.get("code", [""])[0]
        error = query.get("error", [""])[0]
        if state != self.expected_state:
            type(self).response = {"error": "state_mismatch"}
            status = 400
        elif error:
            type(self).response = {"error": error}
            status = 400
        elif not code:
            type(self).response = {"error": "missing_code"}
            status = 400
        else:
            type(self).response = {"code": code}
            status = 200
        body = (
            "<html><body><h1>SAFRWAY YouTube</h1>"
            "<p>Authorization received. You may close this tab.</p></body></html>"
        ).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, _format: str, *_args: Any) -> None:
        return


def authorize(client_json: Path, token_file: Path, scope_name: str) -> None:
    client = _client_config(client_json)
    verifier = base64.urlsafe_b64encode(secrets.token_bytes(64)).rstrip(b"=").decode("ascii")
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode("ascii")).digest()).rstrip(b"=").decode("ascii")
    state = secrets.token_urlsafe(32)
    server = HTTPServer(("127.0.0.1", 0), _OAuthHandler)
    server.timeout = 300
    redirect_uri = f"http://127.0.0.1:{server.server_port}/"
    _OAuthHandler.response = {}
    _OAuthHandler.expected_state = state
    params = {
        "client_id": str(client["client_id"]),
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": SCOPES[scope_name],
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    }
    url = AUTH_URL + "?" + urllib.parse.urlencode(params)
    print("Opening Google authorization in your local browser. No credential value will be printed.")
    webbrowser.open(url, new=1, autoraise=True)
    server.handle_request()
    response = _OAuthHandler.response
    server.server_close()
    if response.get("error"):
        raise OperatorError(f"OAuth authorization failed: {response['error']}")
    if not response.get("code"):
        raise OperatorError("OAuth authorization timed out before a code was received")
    token = form_request(
        str(client.get("token_uri") or TOKEN_URL),
        {
            "client_id": str(client["client_id"]),
            "client_secret": str(client["client_secret"]),
            "code": response["code"],
            "code_verifier": verifier,
            "grant_type": "authorization_code",
            "redirect_uri": redirect_uri,
        },
    )
    validate_token_scopes(token, scope_name)
    expires_in = int(token.get("expires_in") or 3600)
    protected = {
        "schema_version": 1,
        "scope_profile": scope_name,
        "scope": token.get("scope", SCOPES[scope_name]),
        "access_token": token.get("access_token"),
        "refresh_token": token.get("refresh_token"),
        "expires_at": int(time.time()) + expires_in - 60,
        "client_id": client["client_id"],
        "client_secret": client["client_secret"],
        "token_uri": client.get("token_uri") or TOKEN_URL,
    }
    if not protected["access_token"] or not protected["refresh_token"]:
        raise OperatorError("Google did not return the required access and refresh tokens")
    write_private_json(token_file, protected)
    print(f"Authorization stored securely at {token_file.expanduser().resolve()} (mode 0600).")


def load_token(path: Path, *, required_profile: str | None = None) -> dict[str, Any]:
    private_path = require_private_path(path, must_exist=True)
    token = read_json(private_path)
    if not isinstance(token, dict) or token.get("schema_version") != 1:
        raise OperatorError("Unsupported token file")
    if required_profile and token.get("scope_profile") != required_profile:
        raise OperatorError(f"This operation requires a separate {required_profile} authorization")
    profile = str(token.get("scope_profile") or "")
    validate_token_scopes(token, profile)
    if int(token.get("expires_at") or 0) <= int(time.time()):
        refreshed = form_request(
            str(token.get("token_uri") or TOKEN_URL),
            {
                "client_id": str(token.get("client_id") or ""),
                "client_secret": str(token.get("client_secret") or ""),
                "refresh_token": str(token.get("refresh_token") or ""),
                "grant_type": "refresh_token",
            },
        )
        if not refreshed.get("access_token"):
            raise OperatorError("OAuth refresh did not return an access token")
        if refreshed.get("scope") is not None:
            token["scope"] = refreshed["scope"]
        validate_token_scopes(token, profile)
        token["access_token"] = refreshed["access_token"]
        token["expires_at"] = int(time.time()) + int(refreshed.get("expires_in") or 3600) - 60
        write_private_json(private_path, token)
    return token


@dataclass
class YouTubeApi:
    token: dict[str, Any]
    request_json: Callable[[urllib.request.Request], dict[str, Any]] = _request_json

    def request(self, method: str, resource: str, *, params: dict[str, Any] | None = None, body: dict[str, Any] | None = None) -> dict[str, Any]:
        url = API_BASE + "/" + resource
        if params:
            url += "?" + urllib.parse.urlencode({key: value for key, value in params.items() if value is not None})
        data = canonical_json(body) if body is not None else None
        headers = {"Authorization": f"Bearer {self.token['access_token']}", "Accept": "application/json"}
        if data is not None:
            headers["Content-Type"] = "application/json"
        return self.request_json(urllib.request.Request(url, data=data, headers=headers, method=method))

    def pages(self, resource: str, *, params: dict[str, Any]) -> Iterable[dict[str, Any]]:
        token: str | None = None
        while True:
            page = self.request("GET", resource, params={**params, "pageToken": token})
            yield page
            token = page.get("nextPageToken")
            if not token:
                return


def chunks(values: list[str], size: int) -> Iterable[list[str]]:
    for index in range(0, len(values), size):
        yield values[index : index + size]


def collect_inventory(api: YouTubeApi) -> dict[str, Any]:
    channel_response = api.request("GET", "channels", params={"part": "snippet,contentDetails", "mine": "true"})
    channels = channel_response.get("items") or []
    if len(channels) != 1:
        raise OperatorError(f"Expected exactly one authorized YouTube channel, received {len(channels)}")
    channel = channels[0]
    uploads_id = channel.get("contentDetails", {}).get("relatedPlaylists", {}).get("uploads")
    if not uploads_id:
        raise OperatorError("Authorized channel has no uploads playlist")
    video_ids: list[str] = []
    for page in api.pages("playlistItems", params={"part": "contentDetails", "playlistId": uploads_id, "maxResults": 50}):
        for item in page.get("items") or []:
            video_id = item.get("contentDetails", {}).get("videoId")
            if video_id:
                video_ids.append(str(video_id))
    if len(video_ids) != len(set(video_ids)):
        raise OperatorError("Uploads playlist returned duplicate video ids")
    videos: list[dict[str, Any]] = []
    for batch in chunks(video_ids, 50):
        response = api.request(
            "GET",
            "videos",
            params={"part": "snippet,contentDetails,statistics,status", "id": ",".join(batch), "maxResults": 50},
        )
        for item in response.get("items") or []:
            snippet = item.get("snippet") or {}
            videos.append({
                "video_id": item.get("id"),
                "channel_id": snippet.get("channelId"),
                "title": snippet.get("title", ""),
                "description": snippet.get("description", ""),
                "tags": snippet.get("tags") or [],
                "published_at": snippet.get("publishedAt"),
                "thumbnails": snippet.get("thumbnails") or {},
                "duration": (item.get("contentDetails") or {}).get("duration"),
                "statistics": item.get("statistics") or {},
                "privacy_status": (item.get("status") or {}).get("privacyStatus"),
                "source": "authorized_uploads_playlist",
            })
    returned_ids = {str(video.get("video_id") or "") for video in videos}
    if returned_ids != set(video_ids):
        raise OperatorError("YouTube did not return metadata for every authorized-channel upload")
    channel_id = str(channel.get("id") or "")
    if any(str(video.get("channel_id") or "") != channel_id for video in videos):
        raise OperatorError("Uploads inventory contains a video owned by another channel")
    playlists: list[dict[str, Any]] = []
    for page in api.pages("playlists", params={"part": "snippet,status", "mine": "true", "maxResults": 50}):
        for item in page.get("items") or []:
            playlist_id = str(item.get("id") or "")
            members: list[str] = []
            if playlist_id:
                for member_page in api.pages("playlistItems", params={"part": "contentDetails", "playlistId": playlist_id, "maxResults": 50}):
                    members.extend(
                        str(member.get("contentDetails", {}).get("videoId"))
                        for member in member_page.get("items") or []
                        if member.get("contentDetails", {}).get("videoId")
                    )
            playlists.append({
                "playlist_id": playlist_id,
                "title": (item.get("snippet") or {}).get("title", ""),
                "privacy_status": (item.get("status") or {}).get("privacyStatus"),
                "video_ids": members,
            })
    safe_channel = {
        "channel_id": channel_id,
        "title": (channel.get("snippet") or {}).get("title", ""),
        "uploads_playlist_id": uploads_id,
    }
    return {
        "schema_version": 1,
        "generated_at": int(time.time()),
        "channel": safe_channel,
        "videos": sorted(videos, key=lambda item: str(item.get("published_at") or ""), reverse=True),
        "playlists": sorted(playlists, key=lambda item: str(item.get("title") or "").casefold()),
    }


def _text_fields(video: dict[str, Any]) -> dict[str, str]:
    description = str(video.get("description") or "")
    return {
        "title": _normalize_text(str(video.get("title") or "")),
        "tags": _normalize_text(" ".join(str(tag) for tag in video.get("tags") or [])),
        "description": _normalize_text(TIMECODE_LINE_RE.sub(" ", description)),
        "timecodes": _normalize_text(" ".join(TIMECODE_RE.findall(description))),
    }


def _normalize_text(value: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", value).casefold().split())


def _keyword_pattern(keyword: str) -> re.Pattern[str]:
    normalized = _normalize_text(keyword)
    prefix = normalized.endswith("*")
    if prefix:
        normalized = normalized[:-1].rstrip()
    if not normalized:
        raise OperatorError("Classification keyword must not be empty")
    suffix = r"[\w-]*" if prefix else r"(?![\w])"
    return re.compile(rf"(?<![\w]){re.escape(normalized)}{suffix}", re.UNICODE)


def _keyword_matches(keyword: str, text: str) -> bool:
    return bool(_keyword_pattern(keyword).search(text))


def classify_inventory(inventory: dict[str, Any], rules: dict[str, Any]) -> dict[str, Any]:
    if inventory.get("schema_version") != 1:
        raise OperatorError("Unsupported YouTube inventory")
    channel_id = str((inventory.get("channel") or {}).get("channel_id") or "")
    if not channel_id:
        raise OperatorError("Inventory is missing its authorized channel id")
    if rules.get("schema_version") != 1:
        raise OperatorError("Unsupported classification rules")
    weights = rules.get("weights") or {}
    topics = rules.get("topics") or []
    topic_keys = {str(topic.get("key") or "") for topic in topics}
    if "" in topic_keys or len(topic_keys) != len(topics):
        raise OperatorError("Classification topics must have unique non-empty keys")
    overrides = rules.get("overrides") or {}
    if not isinstance(overrides, dict):
        raise OperatorError("Classification overrides must be an object")
    minimum = int(rules.get("minimum_score") or 1)
    review_margin = max(1, int(rules.get("review_margin") or 2))
    inventory_video_ids = {str(video.get("video_id") or "") for video in inventory.get("videos") or []}
    stale_overrides = sorted(set(str(key) for key in overrides) - inventory_video_ids)
    if stale_overrides:
        raise OperatorError(f"Overrides reference videos absent from this inventory: {', '.join(stale_overrides)}")
    results: list[dict[str, Any]] = []
    for video in inventory.get("videos") or []:
        video_id = str(video.get("video_id") or "")
        title = str(video.get("title") or "")
        privacy_status = str(video.get("privacy_status") or "")
        if (
            not video_id
            or str(video.get("channel_id") or "") != channel_id
            or video.get("source") != "authorized_uploads_playlist"
        ):
            raise OperatorError("Inventory video is not bound to the authorized channel uploads playlist")
        if privacy_status != "public":
            results.append({
                "video_id": video_id,
                "title": title,
                "privacy_status": privacy_status,
                "topics": [],
                "scores": {},
                "evidence": [],
                "review": True,
                "review_reasons": ["not_public"],
                "source": "needs_review",
            })
            continue
        override = overrides.get(video_id) if isinstance(overrides, dict) else None
        if isinstance(override, dict):
            assigned = sorted(set(str(key) for key in override.get("topics") or []))
            unknown_topics = set(assigned) - topic_keys
            if unknown_topics:
                raise OperatorError(f"Override for {video_id!r} references unknown topics")
            results.append({
                "video_id": video_id,
                "title": title,
                "privacy_status": privacy_status,
                "topics": assigned,
                "scores": {},
                "evidence": [{"source": "founder_override", "topics": assigned}],
                "review": False,
                "review_reasons": [],
                "source": "override",
            })
            continue
        fields = _text_fields(video)
        scores: dict[str, int] = {}
        evidence: list[dict[str, Any]] = []
        for topic in topics:
            key = str(topic.get("key") or "")
            keywords = [str(value) for value in topic.get("keywords") or [] if str(value).strip()]
            excluded = [str(value) for value in topic.get("exclude") or [] if str(value).strip()]
            combined = " ".join(fields.values())
            excluded_matches = [value for value in excluded if _keyword_matches(value, combined)]
            if excluded_matches:
                continue
            score = 0
            for field, text_value in fields.items():
                field_weight = int(weights.get(field) or 0)
                for keyword in keywords:
                    if _keyword_matches(keyword, text_value):
                        score += field_weight
                        evidence.append({
                            "topic": key,
                            "field": field,
                            "keyword": keyword,
                            "score": field_weight,
                        })
            if score >= minimum:
                scores[key] = score
        assigned = sorted(scores, key=lambda key: (-scores[key], key))
        review_reasons: list[str] = []
        if not assigned:
            review_reasons.append("no_match")
        else:
            top = scores[assigned[0]]
            if top - minimum < review_margin:
                review_reasons.append("low_margin")
            if len(assigned) > 1 and top - scores[assigned[1]] < review_margin:
                review_reasons.append("topic_tie" if top == scores[assigned[1]] else "topic_low_margin")
        results.append({
            "video_id": video_id,
            "title": title,
            "privacy_status": privacy_status,
            "topics": assigned,
            "scores": scores,
            "evidence": [item for item in evidence if item["topic"] in scores],
            "review": bool(review_reasons),
            "review_reasons": review_reasons,
            "source": "rules" if not review_reasons else "needs_review",
        })
    return {
        "schema_version": 1,
        "rules_sha256": sha256_payload(rules),
        "inventory_sha256": sha256_payload(inventory),
        "channel_id": channel_id,
        "topics": [{"key": topic.get("key"), "playlist_title": topic.get("playlist_title"), "routes": topic.get("routes") or []} for topic in topics],
        "videos": results,
    }


def build_plan(inventory: dict[str, Any], classification: dict[str, Any]) -> dict[str, Any]:
    inventory_channel = str((inventory.get("channel") or {}).get("channel_id") or "")
    if not inventory_channel or str(classification.get("channel_id") or "") != inventory_channel:
        raise OperatorError("Classification and inventory channel ids do not match")
    if classification.get("inventory_sha256") != sha256_payload(inventory):
        raise OperatorError("Classification is not bound to this exact inventory")
    inventory_videos: dict[str, dict[str, Any]] = {}
    for video in inventory.get("videos") or []:
        video_id = str(video.get("video_id") or "")
        if not video_id or video_id in inventory_videos:
            raise OperatorError("Inventory video ids must be unique and non-empty")
        if str(video.get("channel_id") or "") != inventory_channel or video.get("source") != "authorized_uploads_playlist":
            raise OperatorError("Inventory contains a video outside the authorized uploads playlist")
        inventory_videos[video_id] = video
    classification_rows: dict[str, dict[str, Any]] = {}
    for row in classification.get("videos") or []:
        video_id = str(row.get("video_id") or "")
        if video_id not in inventory_videos or video_id in classification_rows:
            raise OperatorError("Classification video ids must map one-to-one to inventory uploads")
        source_video = inventory_videos[video_id]
        if (
            str(row.get("title") or "") != str(source_video.get("title") or "")
            or str(row.get("privacy_status") or "") != str(source_video.get("privacy_status") or "")
        ):
            raise OperatorError("Classification display metadata does not match the bound inventory")
        classification_rows[video_id] = row
    if set(classification_rows) != set(inventory_videos):
        raise OperatorError("Classification does not cover this exact inventory")
    unresolved = [
        row for row in classification_rows.values()
        if row.get("review") and str(row.get("privacy_status") or "") == "public"
    ]
    if unresolved:
        labels = ", ".join(f"{row.get('title')!r} ({row.get('video_id')})" for row in unresolved[:10])
        raise OperatorError(f"Founder review/override is required before planning: {labels}")
    existing_by_title: dict[str, list[dict[str, Any]]] = {}
    for playlist in inventory.get("playlists") or []:
        existing_by_title.setdefault(str(playlist.get("title") or ""), []).append(playlist)
    topic_contracts: dict[str, dict[str, Any]] = {}
    playlist_titles: set[str] = set()
    for item in classification.get("topics") or []:
        key = str(item.get("key") or "")
        title = str(item.get("playlist_title") or "")
        if not key or not title or key in topic_contracts or title in playlist_titles:
            raise OperatorError("Topics and playlist titles must be unique and non-empty")
        topic_contracts[key] = item
        playlist_titles.add(title)
    operations: list[dict[str, Any]] = []
    playlist_bindings: list[dict[str, Any]] = []
    for key, contract in sorted(topic_contracts.items()):
        title = str(contract.get("playlist_title") or "")
        matches = existing_by_title.get(title, [])
        if len(matches) > 1:
            raise OperatorError(f"Multiple existing playlists have the exact title {title!r}")
        if matches and str(matches[0].get("privacy_status") or "") != "private":
            raise OperatorError(
                f"Existing target playlist {title!r} must remain private until a separate publication gate"
            )
        playlist_id = str(matches[0].get("playlist_id") or "") if matches else None
        playlist_bindings.append({
            "topic": key,
            "title": title,
            "playlist_id": playlist_id,
            "privacy_status": "private",
        })
        if not matches:
            operations.append({"action": "create_playlist", "topic": key, "title": title, "privacy_status": "private"})
    assigned_by_topic: dict[str, set[str]] = {key: set() for key in topic_contracts}
    for video in classification.get("videos") or []:
        video_id = str(video.get("video_id") or "")
        if video.get("topics") and (
            video.get("review")
            or str(video.get("privacy_status") or "") != "public"
            or str(inventory_videos[video_id].get("privacy_status") or "") != "public"
        ):
            raise OperatorError("Only reviewed public authorized-channel videos may enter a plan")
        for topic in video.get("topics") or []:
            if topic not in assigned_by_topic:
                raise OperatorError(f"Classification references unknown topic {topic!r}")
            assigned_by_topic[topic].add(video_id)
    for key, video_ids in sorted(assigned_by_topic.items()):
        title = str(topic_contracts[key].get("playlist_title") or "")
        matches = existing_by_title.get(title, [])
        for video_id in sorted(video_ids):
            row = classification_rows[video_id]
            operations.append({
                "action": "add_video",
                "topic": key,
                "playlist_title": title,
                "playlist_id": str(matches[0].get("playlist_id") or "") if matches else None,
                "video_id": video_id,
                "video_title": row.get("title"),
                "match_evidence": row.get("evidence") or [],
            })
    unsigned = {
        "schema_version": 1,
        "mode": "additive_only",
        "channel_id": classification.get("channel_id"),
        "inventory_sha256": sha256_payload(inventory),
        "classification_sha256": sha256_payload(classification),
        "playlist_bindings": playlist_bindings,
        "operations": operations,
    }
    return {**unsigned, "plan_sha256": sha256_payload(unsigned)}


def _journal_operation_rows(operations: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "index": index,
            "operation_sha256": sha256_payload(operation),
            "action": operation.get("action"),
            "topic": operation.get("topic"),
            "video_id": operation.get("video_id"),
            "state": "pending",
        }
        for index, operation in enumerate(operations)
    ]


def _update_journal_summary(journal: dict[str, Any]) -> None:
    rows = journal.get("operations") or []
    journal["completed"] = [row["index"] for row in rows if row.get("state") == "completed"]
    journal["unknown"] = [row["index"] for row in rows if row.get("state") in {"attempting", "unknown"}]
    journal["remaining"] = [row["index"] for row in rows if row.get("state") in {"pending", "failed"}]


def _store_journal(path: Path, journal: dict[str, Any]) -> None:
    journal["updated_at"] = int(time.time())
    _update_journal_summary(journal)
    write_private_json(path, journal)


def _load_or_create_journal(path: Path, plan: dict[str, Any], operations: list[dict[str, Any]]) -> dict[str, Any]:
    resolved = require_private_path(path, must_exist=False)
    if resolved.exists():
        journal = read_private_json(resolved)
        if (
            not isinstance(journal, dict)
            or journal.get("schema_version") != 1
            or journal.get("plan_sha256") != plan.get("plan_sha256")
            or journal.get("channel_id") != plan.get("channel_id")
        ):
            raise OperatorError("Existing apply journal belongs to a different plan or channel")
        rows = journal.get("operations") or []
        if len(rows) != len(operations) or any(
            row.get("index") != index or row.get("operation_sha256") != sha256_payload(operation)
            for index, (row, operation) in enumerate(zip(rows, operations))
        ):
            raise OperatorError("Existing apply journal operation set does not match the approved plan")
        return journal
    journal = {
        "schema_version": 1,
        "plan_sha256": plan.get("plan_sha256"),
        "channel_id": plan.get("channel_id"),
        "status": "preflight",
        "resolved_playlist_ids": {},
        "operations": _journal_operation_rows(operations),
    }
    _store_journal(resolved, journal)
    return journal


def apply_plan(
    api: YouTubeApi,
    plan: dict[str, Any],
    approved_sha256: str,
    *,
    journal_path: Path,
    approved_unknown_add_retries: set[str] | None = None,
) -> dict[str, Any]:
    with exclusive_apply_lock(journal_path):
        return _apply_plan_locked(
            api,
            plan,
            approved_sha256,
            journal_path=journal_path,
            approved_unknown_add_retries=approved_unknown_add_retries or set(),
        )


def _apply_plan_locked(
    api: YouTubeApi,
    plan: dict[str, Any],
    approved_sha256: str,
    *,
    journal_path: Path,
    approved_unknown_add_retries: set[str],
) -> dict[str, Any]:
    expected = str(plan.get("plan_sha256") or "")
    unsigned = {key: value for key, value in plan.items() if key != "plan_sha256"}
    if expected != sha256_payload(unsigned) or not secrets.compare_digest(expected, approved_sha256.lower()):
        raise OperatorError("Plan checksum does not match the exact Founder-approved SHA-256")
    if plan.get("mode") != "additive_only":
        raise OperatorError("Only additive-only plans are supported")
    operations = plan.get("operations") or []
    if not isinstance(operations, list) or any(
        not isinstance(operation, dict)
        or operation.get("action") not in {"create_playlist", "add_video"}
        for operation in operations
    ):
        raise OperatorError("Plan contains an unsupported operation")
    bindings = plan.get("playlist_bindings") or []
    if not isinstance(bindings, list):
        raise OperatorError("Plan playlist bindings are invalid")
    binding_by_topic: dict[str, dict[str, Any]] = {}
    for binding in bindings:
        topic = str(binding.get("topic") or "") if isinstance(binding, dict) else ""
        title = str(binding.get("title") or "") if isinstance(binding, dict) else ""
        if not topic or not title or topic in binding_by_topic:
            raise OperatorError("Plan playlist bindings must be unique and complete")
        if binding.get("privacy_status") != "private":
            raise OperatorError("Target playlists must remain private until a separate publication gate")
        binding_by_topic[topic] = binding
    for operation in operations:
        topic = str(operation.get("topic") or "")
        if topic not in binding_by_topic:
            raise OperatorError(f"Plan operation references missing playlist binding {topic!r}")
        binding = binding_by_topic[topic]
        if operation.get("action") == "create_playlist" and operation.get("privacy_status") != "private":
            raise OperatorError("New playlists must be created private for review")
        if operation.get("action") == "create_playlist" and str(operation.get("title") or "") != str(binding.get("title") or ""):
            raise OperatorError("Create operation does not match its approved playlist binding")
        if operation.get("action") == "add_video":
            if not str(operation.get("video_id") or ""):
                raise OperatorError("Add-video operation is missing a video id")
            if (
                str(operation.get("playlist_title") or "") != str(binding.get("title") or "")
                or str(operation.get("playlist_id") or "") != str(binding.get("playlist_id") or "")
            ):
                raise OperatorError("Add-video operation does not match its approved playlist binding")
    journal = _load_or_create_journal(journal_path, plan, operations)
    channel_response = api.request("GET", "channels", params={"part": "id", "mine": "true"})
    live_channel_ids = [str(item.get("id") or "") for item in channel_response.get("items") or []]
    if live_channel_ids != [str(plan.get("channel_id") or "")]:
        raise OperatorError("Authorized YouTube channel does not match the approved plan")
    live_playlists_by_title: dict[str, list[dict[str, Any]]] = {}
    live_playlists_by_id: dict[str, dict[str, Any]] = {}
    for page in api.pages("playlists", params={"part": "snippet,status", "mine": "true", "maxResults": 50}):
        for item in page.get("items") or []:
            playlist_id = str(item.get("id") or "")
            title = str((item.get("snippet") or {}).get("title") or "")
            if not playlist_id or playlist_id in live_playlists_by_id:
                raise OperatorError("Live playlists returned a missing or duplicate id")
            live_playlists_by_id[playlist_id] = item
            live_playlists_by_title.setdefault(title, []).append(item)

    add_video_ids = sorted({
        str(operation.get("video_id") or "")
        for operation in operations
        if operation.get("action") == "add_video"
    })
    live_videos: dict[str, dict[str, Any]] = {}
    for batch in chunks(add_video_ids, 50):
        response = api.request(
            "GET",
            "videos",
            params={"part": "snippet,status", "id": ",".join(batch), "maxResults": 50},
        )
        for item in response.get("items") or []:
            live_videos[str(item.get("id") or "")] = item
    if set(live_videos) != set(add_video_ids):
        raise OperatorError("A planned video is unavailable during live preflight")
    for video_id, item in live_videos.items():
        if (
            str((item.get("snippet") or {}).get("channelId") or "") != str(plan.get("channel_id") or "")
            or str((item.get("status") or {}).get("privacyStatus") or "") != "public"
        ):
            raise OperatorError(f"Planned video {video_id!r} is not a public upload of the authorized channel")

    resolved_ids = journal.setdefault("resolved_playlist_ids", {})
    playlist_ids_by_topic: dict[str, str] = {}
    for topic, binding in binding_by_topic.items():
        title = str(binding.get("title") or "")
        approved_id = str(binding.get("playlist_id") or "")
        journal_id = str(resolved_ids.get(topic) or "")
        playlist_id = approved_id or journal_id
        if playlist_id:
            live = live_playlists_by_id.get(playlist_id)
            if (
                not live
                or str((live.get("snippet") or {}).get("title") or "") != title
                or str((live.get("status") or {}).get("privacyStatus") or "")
                != str(binding.get("privacy_status") or "")
            ):
                raise OperatorError(f"Approved playlist binding for {topic!r} is missing or changed")
            playlist_ids_by_topic[topic] = playlist_id
            resolved_ids[topic] = playlist_id
            continue
        create_indexes = [
            index for index, operation in enumerate(operations)
            if operation.get("action") == "create_playlist" and str(operation.get("topic") or "") == topic
        ]
        if len(create_indexes) != 1:
            raise OperatorError(f"Topic {topic!r} has neither an approved playlist id nor one create operation")
        matches = live_playlists_by_title.get(title, [])
        row = journal["operations"][create_indexes[0]]
        if matches:
            if row.get("state") not in {"attempting", "unknown", "completed"} or len(matches) != 1:
                raise OperatorError(f"Unapproved live playlist already uses title {title!r}; rebuild the plan")
            candidate = matches[0]
            if str((candidate.get("status") or {}).get("privacyStatus") or "") != "private":
                raise OperatorError("Ambiguous recovered playlist is not private")
            playlist_id = str(candidate.get("id") or "")
            playlist_ids_by_topic[topic] = playlist_id
            resolved_ids[topic] = playlist_id
            row["state"] = "completed"
            row["result"] = "reconciled_existing"

    member_cache: dict[str, set[str]] = {}
    for playlist_id in sorted(set(playlist_ids_by_topic.values())):
        members: set[str] = set()
        for page in api.pages("playlistItems", params={"part": "contentDetails", "playlistId": playlist_id, "maxResults": 50}):
            members.update(
                str(item.get("contentDetails", {}).get("videoId"))
                for item in page.get("items") or []
                if item.get("contentDetails", {}).get("videoId")
            )
        member_cache[playlist_id] = members

    for index, operation in enumerate(operations):
        if operation.get("action") != "add_video":
            continue
        row = journal["operations"][index]
        topic = str(operation.get("topic") or "")
        playlist_id = playlist_ids_by_topic.get(topic)
        if playlist_id and str(operation.get("video_id") or "") in member_cache.get(playlist_id, set()):
            row["state"] = "completed"
            row["result"] = "reconciled_existing"
            continue
        if row.get("state") == "completed":
            journal["status"] = "partial"
            _store_journal(journal_path, journal)
            raise OperatorError(
                f"Previously completed add-video operation {index} is not visible live; refusing to POST again"
            )
        if row.get("state") in {"attempting", "unknown"}:
            unknown_attempt = int(row.get("attempt_count") or 0)
            approval_token = f"{index}:{unknown_attempt}"
            if approval_token not in approved_unknown_add_retries:
                journal["status"] = "partial"
                _store_journal(journal_path, journal)
                raise OperatorError(
                    "UNKNOWN add-video operation is not visible live; wait for positive reconciliation "
                    f"or obtain Founder approval and pass --approve-unknown-add-retry {approval_token}"
                )
            row.setdefault("retry_decisions", []).append({
                "decision": "founder_approved_retry_after_missing_membership",
                "unknown_attempt": unknown_attempt,
                "operation_sha256": row.get("operation_sha256"),
                "recorded_at": int(time.time()),
            })
            row["state"] = "pending"
            row["result"] = "founder_approved_retry"
            _store_journal(journal_path, journal)

    journal["status"] = "applying"
    _store_journal(journal_path, journal)
    results: list[dict[str, str]] = []
    for index, operation in enumerate(operations):
        if operation.get("action") != "create_playlist":
            continue
        row = journal["operations"][index]
        if row.get("state") == "completed":
            results.append({"action": "create_playlist", "status": str(row.get("result") or "already_exists"), "topic": str(operation.get("topic"))})
            continue
        row["state"] = "attempting"
        _store_journal(journal_path, journal)
        title = str(operation.get("title") or "")
        topic = str(operation.get("topic") or "")
        try:
            created = api.request("POST", "playlists", params={"part": "snippet,status"}, body={"snippet": {"title": title}, "status": {"privacyStatus": "private"}})
            playlist_id = str(created.get("id") or "")
            if not playlist_id:
                raise OperatorError("YouTube did not return a playlist id after creation")
            if str((created.get("status") or {}).get("privacyStatus") or "") != "private":
                raise OperatorError("YouTube did not confirm exact private privacy after playlist creation")
        except Exception:
            row["state"] = "unknown"
            journal["status"] = "partial"
            _store_journal(journal_path, journal)
            raise
        playlist_ids_by_topic[topic] = playlist_id
        resolved_ids[topic] = playlist_id
        member_cache[playlist_id] = set()
        row["state"] = "completed"
        row["result"] = "created_private"
        _store_journal(journal_path, journal)
        results.append({"action": "create_playlist", "status": "created_private", "topic": topic})
    for index, operation in enumerate(operations):
        if operation.get("action") != "add_video":
            continue
        row = journal["operations"][index]
        topic = str(operation.get("topic") or "")
        playlist_id = playlist_ids_by_topic.get(topic, "")
        if not playlist_id:
            raise OperatorError(f"No unique live playlist for topic {topic!r}")
        video_id = str(operation.get("video_id") or "")
        if video_id in member_cache[playlist_id] or row.get("state") == "completed":
            results.append({"action": "add_video", "status": "already_exists", "topic": topic, "video_id": video_id})
            continue
        row["attempt_count"] = int(row.get("attempt_count") or 0) + 1
        row["state"] = "attempting"
        _store_journal(journal_path, journal)
        try:
            api.request("POST", "playlistItems", params={"part": "snippet"}, body={"snippet": {"playlistId": playlist_id, "resourceId": {"kind": "youtube#video", "videoId": video_id}}})
        except Exception:
            row["state"] = "unknown"
            journal["status"] = "partial"
            _store_journal(journal_path, journal)
            raise
        member_cache[playlist_id].add(video_id)
        row["state"] = "completed"
        row["result"] = "added"
        _store_journal(journal_path, journal)
        results.append({"action": "add_video", "status": "added", "topic": topic, "video_id": video_id})
    journal["status"] = "complete"
    _store_journal(journal_path, journal)
    return {"schema_version": 1, "plan_sha256": expected, "results": results}


def _sanitize_public_description(value: Any) -> str:
    normalized = unicodedata.normalize("NFKC", str(value or ""))
    without_controls = "".join(character for character in normalized if character in "\n\t" or ord(character) >= 32)
    without_emails = re.sub(r"(?i)\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b", "[contact removed]", without_controls)
    without_phones = re.sub(r"(?<!\w)(?:\+?\d[\d\s().-]{7,}\d)(?!\w)", "[contact removed]", without_emails)
    compact = re.sub(r"[ \t]+", " ", without_phones).strip()
    return compact[:PUBLIC_DESCRIPTION_LIMIT].rstrip()


def _safe_public_thumbnails(value: Any) -> dict[str, dict[str, Any]]:
    safe: dict[str, dict[str, Any]] = {}
    if not isinstance(value, dict):
        return safe
    for key, thumbnail in value.items():
        if not isinstance(thumbnail, dict):
            continue
        url = str(thumbnail.get("url") or "")
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme != "https" or parsed.hostname not in PUBLIC_THUMBNAIL_HOSTS:
            continue
        safe[str(key)] = {
            "url": url,
            "width": thumbnail.get("width"),
            "height": thumbnail.get("height"),
        }
    return safe


def site_snapshot(inventory: dict[str, Any], classification: dict[str, Any]) -> dict[str, Any]:
    channel_id = str((inventory.get("channel") or {}).get("channel_id") or "")
    if (
        not channel_id
        or str(classification.get("channel_id") or "") != channel_id
        or classification.get("inventory_sha256") != sha256_payload(inventory)
    ):
        raise OperatorError("Snapshot inputs are not bound to the same exact channel inventory")
    videos_by_id = {str(video.get("video_id")): video for video in inventory.get("videos") or []}
    assignments: dict[str, list[str]] = {}
    for result in classification.get("videos") or []:
        video_id = str(result.get("video_id") or "")
        source_video = videos_by_id.get(video_id)
        if source_video is None:
            raise OperatorError("Snapshot classification references a video absent from inventory")
        if result.get("topics") and (
            result.get("review")
            or str(result.get("privacy_status") or "") != "public"
            or str(source_video.get("privacy_status") or "") != "public"
            or str(source_video.get("channel_id") or "") != channel_id
            or source_video.get("source") != "authorized_uploads_playlist"
        ):
            raise OperatorError("Snapshot may contain only reviewed public authorized-channel videos")
        for topic in result.get("topics") or []:
            assignments.setdefault(str(topic), []).append(video_id)
    topics = []
    for topic in classification.get("topics") or []:
        key = str(topic.get("key") or "")
        public_videos = []
        for video_id in assignments.get(key, []):
            video = videos_by_id.get(video_id) or {}
            public_videos.append({
                "video_id": video_id,
                "title": video.get("title"),
                "description": _sanitize_public_description(video.get("description")),
                "published_at": video.get("published_at"),
                "duration": video.get("duration"),
                "thumbnails": _safe_public_thumbnails(video.get("thumbnails")),
            })
        topics.append({"key": key, "playlist_title": topic.get("playlist_title"), "routes": topic.get("routes") or [], "videos": public_videos})
    unsigned = {
        "schema_version": 1,
        "channel": {"channel_id": channel_id, "title": (inventory.get("channel") or {}).get("title")},
        "topics": topics,
    }
    return {**unsigned, "content_sha256": sha256_payload(unsigned)}


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__)
    commands = root.add_subparsers(dest="command", required=True)
    auth = commands.add_parser("auth")
    auth.add_argument("--scope", choices=sorted(SCOPES), required=True)
    auth.add_argument("--client-json", type=Path, required=True)
    auth.add_argument("--token-file", type=Path, required=True)
    inventory = commands.add_parser("inventory")
    inventory.add_argument("--token-file", type=Path, required=True)
    inventory.add_argument("--out", type=Path, required=True)
    classify = commands.add_parser("classify")
    classify.add_argument("--inventory", type=Path, required=True)
    classify.add_argument("--rules", type=Path, required=True)
    classify.add_argument("--out", type=Path, required=True)
    plan = commands.add_parser("plan-playlists")
    plan.add_argument("--inventory", type=Path, required=True)
    plan.add_argument("--classification", type=Path, required=True)
    plan.add_argument("--out", type=Path, required=True)
    apply = commands.add_parser("apply")
    apply.add_argument("--token-file", type=Path, required=True)
    apply.add_argument("--plan", type=Path, required=True)
    apply.add_argument("--approved-plan-sha256", required=True)
    apply.add_argument("--journal", type=Path, required=True)
    apply.add_argument(
        "--approve-unknown-add-retry",
        action="append",
        default=[],
        metavar="INDEX:ATTEMPT",
        help="Founder-approved one-attempt retry token printed after an unresolved UNKNOWN add",
    )
    export = commands.add_parser("export-site-snapshot")
    export.add_argument("--inventory", type=Path, required=True)
    export.add_argument("--classification", type=Path, required=True)
    export.add_argument("--out", type=Path, required=True)
    return root


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        if args.command == "auth":
            if _absolute_without_resolving(args.client_json) == _absolute_without_resolving(args.token_file):
                raise OperatorError("OAuth client and token files must be different")
            authorize(args.client_json, args.token_file, args.scope)
        elif args.command == "inventory":
            token = load_token(args.token_file, required_profile="readonly")
            if require_private_path(args.token_file, must_exist=True) == require_private_path(args.out, must_exist=False):
                raise OperatorError("Inventory output must not overwrite the OAuth token")
            write_private_json(args.out, collect_inventory(YouTubeApi(token)))
        elif args.command == "classify":
            if require_private_path(args.inventory, must_exist=True) == require_private_path(args.out, must_exist=False):
                raise OperatorError("Classification output must not overwrite inventory")
            write_private_json(args.out, classify_inventory(read_private_json(args.inventory), read_json(args.rules)))
        elif args.command == "plan-playlists":
            inventory_path = require_private_path(args.inventory, must_exist=True)
            classification_path = require_private_path(args.classification, must_exist=True)
            output_path = require_private_path(args.out, must_exist=False)
            if len({inventory_path, classification_path, output_path}) != 3:
                raise OperatorError("Inventory, classification and plan files must be different")
            plan = build_plan(read_private_json(inventory_path), read_private_json(classification_path))
            write_private_json(output_path, plan)
            print(f"Plan SHA-256: {plan['plan_sha256']}")
        elif args.command == "apply":
            token = load_token(args.token_file, required_profile="manage")
            token_path = require_private_path(args.token_file, must_exist=True)
            plan_path = require_private_path(args.plan, must_exist=True)
            journal_path = require_private_path(args.journal, must_exist=False)
            if len({token_path, plan_path, journal_path}) != 3:
                raise OperatorError("Token, plan and journal files must be different")
            result = apply_plan(
                YouTubeApi(token),
                read_private_json(plan_path),
                args.approved_plan_sha256,
                journal_path=journal_path,
                approved_unknown_add_retries=set(args.approve_unknown_add_retry),
            )
            print(json.dumps(result, ensure_ascii=False, indent=2))
        elif args.command == "export-site-snapshot":
            inventory_path = require_private_path(args.inventory, must_exist=True)
            classification_path = require_private_path(args.classification, must_exist=True)
            output_path = _absolute_without_resolving(args.out)
            if output_path in {inventory_path, classification_path}:
                raise OperatorError("Public snapshot must not overwrite private operator inputs")
            write_public_json(output_path, site_snapshot(read_private_json(inventory_path), read_private_json(classification_path)))
    except OperatorError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
