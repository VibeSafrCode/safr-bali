import os
import stat
from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "SAFR Bali API"
    # Preview is an existing isolated operator profile, not a production alias.
    ENVIRONMENT: Literal["local", "test", "preview", "production"] = "local"
    DEBUG: bool = True
    SQL_ECHO: bool = False
    DATABASE_URL: str

    SERVICE_API_TOKEN: str
    ADMIN_API_TOKEN: str
    RATE_LIMIT_PER_MINUTE: int = 60
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_BOT_USERNAME: str = "safr_bali_bot"
    MINI_APP_ORIGINS: str = "http://localhost:3000,http://localhost:5173"
    MINI_APP_ACCESS_COOKIE_NAME: str = "safr_mini_access"
    MINI_APP_REFRESH_COOKIE_NAME: str = "safr_mini_refresh"
    MINI_APP_ACCESS_TTL_MINUTES: int = 30
    MINI_APP_REFRESH_TTL_DAYS: int = 30
    MINI_APP_COOKIE_SECURE: bool = False
    TELEGRAM_OIDC_CLIENT_ID: str = ""
    TELEGRAM_OIDC_CLIENT_SECRET: str = ""
    TELEGRAM_OIDC_REDIRECT_URI: str = (
        "http://localhost:3000/api/web/auth/callback"
    )
    TELEGRAM_OIDC_ISSUER: str = "https://oauth.telegram.org"
    TELEGRAM_OIDC_AUTH_URL: str = "https://oauth.telegram.org/auth"
    TELEGRAM_OIDC_TOKEN_URL: str = "https://oauth.telegram.org/token"
    TELEGRAM_OIDC_JWKS_URL: str = (
        "https://oauth.telegram.org/.well-known/jwks.json"
    )
    WEBSITE_URL: str = "http://localhost:3000"
    APPLICATION_URL: str = "http://localhost:5173"
    WEB_SESSION_COOKIE_NAME: str = "safr_session"
    WEB_SESSION_TTL_DAYS: int = 30
    WEB_COOKIE_SECURE: bool = False
    DEFAULT_ADMIN_TELEGRAM_ID: int = 0
    SUPPORT_CHAT_IDS: str = ""
    SUPPORT_REPLY_CHAT_IDS: str = ""
    YOGA_CHANNEL_ENABLED: bool = False
    YOGA_ACCOUNT_ENABLED: bool = False
    PUBLIC_REFERRAL_ALIAS_ISSUANCE_ENABLED: bool = False
    YOGA_PARTNER_TELEGRAM_ID: int = 0
    YOGA_MINI_APP_ENABLED: bool = False
    YOGA_MINI_APP_ORIGIN: str = ""
    YOGA_BOT_TOKEN: str = Field(default="", repr=False)
    YOGA_SERVICE_API_TOKEN: str = ""
    YOGA_OBSERVER_TELEGRAM_ID: int = 0
    YOGA_MAIN_STAFF_CHAT_IDS: str = ""
    VISA_LIFECYCLE_ENABLED: bool = False
    CLIENT_CABINET_ENABLED: bool = False
    ADMIN_CLIENT_CRM_ENABLED: bool = False
    VISA_EXTERNAL_TRACKER_ENABLED: bool = False
    VISA_AI_IMPORT_ENABLED: bool = False
    VISA_PII_KEY_VERSION: str = ""
    VISA_PII_KEYS: str = ""
    VISA_AGENT_REFERENCE_LOOKUP_KEY: str = ""
    VISA_DOCUMENT_STORAGE_ROOT: str = ""
    VISA_DOCUMENT_SCANNER_COMMAND: str = ""
    VISA_DOCUMENT_MAX_BYTES: int = 10 * 1024 * 1024
    VISA_DOCUMENT_RETENTION_POLICY: str = ""
    VISA_DOCUMENT_KEY_CUSTODY_CONFIRMED: bool = False
    VISA_DOCUMENT_BACKUP_RESTORE_PROOF_SHA256: str = ""
    VISA_LEGACY_DOCUMENT_REFERENCE_ENABLED: bool = False
    VISA_PERMANENT_DELETE_ENABLED: bool = False
    REFERRAL_CORRECTION_ENABLED: bool = False
    BOT_MESSAGING_ENABLED: bool = False
    VISA_MANAGER_RBAC_ENABLED: bool = False
    TELEGRAM_AVATAR_PROXY_ENABLED: bool = False
    TELEGRAM_AVATAR_CACHE_ROOT: str = ""
    TELEGRAM_AVATAR_CACHE_TTL_SECONDS: int = 86400
    CANONICAL_PRICING_ENFORCED: bool = False

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", hide_input_in_errors=True,
    )

    @field_validator("ENVIRONMENT", mode="before")
    @classmethod
    def normalize_environment(cls, value):
        if not isinstance(value, str):
            raise RuntimeError("Unsupported ENVIRONMENT profile")
        profile = value.strip().lower()
        if profile == "prod":
            profile = "production"
        if profile not in {"local", "test", "preview", "production"}:
            # Never echo an arbitrary environment value in a startup failure.
            raise RuntimeError("Unsupported ENVIRONMENT profile")
        return profile

    @model_validator(mode="after")
    def validate_production_security(self):
        if self.ENVIRONMENT != "production":
            return self
        invalid = []
        for name in ("SERVICE_API_TOKEN", "ADMIN_API_TOKEN", "TELEGRAM_BOT_TOKEN"):
            value = getattr(self, name)
            normalized = value.strip().lower()
            if (len(normalized) < 32 or value != value.strip()
                    or any(marker in normalized for marker in (
                        "changeme", "change-me", "change_me", "example", "placeholder",
                        "replace-me", "replace_me", "your-token", "your_token",
                    ))):
                invalid.append(name)
        if self.SERVICE_API_TOKEN == self.ADMIN_API_TOKEN:
            invalid.append("SERVICE_API_TOKEN/ADMIN_API_TOKEN must differ")
        if self.YOGA_CHANNEL_ENABLED:
            value = self.YOGA_SERVICE_API_TOKEN
            if (len(value.strip()) < 32 or value != value.strip()
                    or any(marker in value.lower() for marker in (
                        "changeme", "change-me", "change_me", "example", "placeholder",
                        "replace-me", "replace_me", "your-token", "your_token",
                    ))
                    or value in {self.SERVICE_API_TOKEN, self.ADMIN_API_TOKEN}):
                invalid.append("YOGA_SERVICE_API_TOKEN")
            try:
                recipients = self.yoga_main_staff_chat_ids
                if not recipients or len(recipients) > 100 or any(i <= 0 for i in recipients):
                    invalid.append("YOGA_MAIN_STAFF_CHAT_IDS")
            except ValueError:
                invalid.append("YOGA_MAIN_STAFF_CHAT_IDS")
            if self.YOGA_OBSERVER_TELEGRAM_ID <= 0:
                invalid.append("YOGA_OBSERVER_TELEGRAM_ID")
        if self.YOGA_MINI_APP_ENABLED:
            import re
            origin = urlsplit(self.YOGA_MINI_APP_ORIGIN)
            if (not self.YOGA_CHANNEL_ENABLED or not self.YOGA_ACCOUNT_ENABLED
                    or self.YOGA_PARTNER_TELEGRAM_ID <= 0
                    or not re.fullmatch(r"[0-9]{5,15}:[A-Za-z0-9_-]{20,80}", self.YOGA_BOT_TOKEN)
                    or self.YOGA_BOT_TOKEN == self.TELEGRAM_BOT_TOKEN
                    or origin.scheme != "https" or not origin.hostname
                    or origin.username or origin.password or origin.query or origin.fragment
                    or origin.path or "*" in self.YOGA_MINI_APP_ORIGIN):
                invalid.append("YOGA_MINI_APP_CONFIGURATION")
        if self.DEBUG or self.SQL_ECHO:
            invalid.append("DEBUG/SQL_ECHO")
        for name in ("MINI_APP_COOKIE_SECURE", "WEB_COOKIE_SECURE"):
            if not getattr(self, name):
                invalid.append(name)

        def safe_https(value):
            try:
                parsed = urlsplit(value)
                parsed.port  # Validate malformed/out-of-range ports without logging the URL.
                return (parsed.scheme == "https" and bool(parsed.hostname)
                        and parsed.hostname not in {"localhost", "127.0.0.1", "::1"}
                        and not parsed.username and not parsed.password
                        and not parsed.fragment and not parsed.query
                        and not any(char.isspace() for char in value))
            except ValueError:
                return False

        for name in ("WEBSITE_URL", "APPLICATION_URL"):
            if not safe_https(getattr(self, name)):
                invalid.append(name)
        if not self.mini_app_origins or any(
            not safe_https(origin) or urlsplit(origin).path not in {"", "/"}
            for origin in self.mini_app_origins
        ):
            invalid.append("MINI_APP_ORIGINS")
        if self.TELEGRAM_OIDC_CLIENT_ID or self.TELEGRAM_OIDC_CLIENT_SECRET:
            if not self.TELEGRAM_OIDC_CLIENT_ID.strip() or not self.TELEGRAM_OIDC_CLIENT_SECRET.strip():
                invalid.append("TELEGRAM_OIDC credentials")
            for name in ("TELEGRAM_OIDC_REDIRECT_URI", "TELEGRAM_OIDC_ISSUER",
                         "TELEGRAM_OIDC_AUTH_URL", "TELEGRAM_OIDC_TOKEN_URL", "TELEGRAM_OIDC_JWKS_URL"):
                if not safe_https(getattr(self, name)):
                    invalid.append(name)
        if invalid:
            # RuntimeError deliberately avoids a validation-error input repr containing secrets.
            raise RuntimeError("Unsafe production configuration: " + ", ".join(invalid))
        return self

    @property
    def support_chat_ids(self) -> list[int]:
        return list(dict.fromkeys(int(value.strip()) for value in self.SUPPORT_CHAT_IDS.split(",") if value.strip()))

    @property
    def support_reply_chat_ids(self) -> list[int]:
        """Only explicitly granted existing support recipients may answer clients."""
        try:
            recipients = list(dict.fromkeys(int(value.strip()) for value in self.SUPPORT_REPLY_CHAT_IDS.split(",") if value.strip()))
            configured = self.support_chat_ids
        except ValueError:
            return []
        return recipients if len(recipients) <= 100 and all(
            value > 0 and value in configured for value in recipients
        ) else []

    @property
    def yoga_main_staff_chat_ids(self) -> list[int]:
        # Deployment mirrors the existing main bot staff list; no role grants.
        return list(dict.fromkeys(int(value.strip()) for value in self.YOGA_MAIN_STAFF_CHAT_IDS.split(",") if value.strip()))

    @property
    def mini_app_origins(self) -> list[str]:
        return [
            origin.strip().rstrip("/")
            for origin in self.MINI_APP_ORIGINS.split(",")
            if origin.strip()
        ]


def _settings_profile_arguments():
    """An explicit launcher profile never falls back to the caller's .env.

    Installed preflight additionally binds owner, group, hash and identity.
    Ordinary launches without this opt-in retain their existing dotenv policy.
    """
    value = os.environ.get("SAFR_SETTINGS_ENV_FILE")
    if value is None:
        return {}
    try:
        if (not value.startswith("/") or "//" in value
                or os.path.normpath(value) != value
                or any(ord(char) < 32 or ord(char) == 127 for char in value)):
            raise ValueError()
        info = os.lstat(value)
        if (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1
                or not 0 < info.st_size <= 262144):
            raise ValueError()
    except (OSError, ValueError):
        raise RuntimeError("Invalid explicit settings profile") from None
    return {"_env_file": value}


settings = Settings(**_settings_profile_arguments())
