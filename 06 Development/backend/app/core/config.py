from urllib.parse import urlsplit

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "SAFR Bali API"
    ENVIRONMENT: str = "local"
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
    VISA_LIFECYCLE_ENABLED: bool = False
    CLIENT_CABINET_ENABLED: bool = False
    ADMIN_CLIENT_CRM_ENABLED: bool = False
    VISA_EXTERNAL_TRACKER_ENABLED: bool = False
    VISA_AI_IMPORT_ENABLED: bool = False
    VISA_PII_KEY_VERSION: str = ""
    VISA_PII_KEYS: str = ""
    VISA_DOCUMENT_STORAGE_ROOT: str = ""
    VISA_DOCUMENT_SCANNER_COMMAND: str = ""
    VISA_DOCUMENT_MAX_BYTES: int = 10 * 1024 * 1024
    VISA_DOCUMENT_RETENTION_POLICY: str = ""
    VISA_DOCUMENT_KEY_CUSTODY_CONFIRMED: bool = False
    VISA_DOCUMENT_BACKUP_RESTORE_PROOF_SHA256: str = ""
    VISA_LEGACY_DOCUMENT_REFERENCE_ENABLED: bool = False
    VISA_PERMANENT_DELETE_ENABLED: bool = False
    REFERRAL_CORRECTION_ENABLED: bool = False
    VISA_MANAGER_RBAC_ENABLED: bool = False
    TELEGRAM_AVATAR_PROXY_ENABLED: bool = False
    TELEGRAM_AVATAR_CACHE_ROOT: str = ""
    TELEGRAM_AVATAR_CACHE_TTL_SECONDS: int = 86400
    CANONICAL_PRICING_ENFORCED: bool = False

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", hide_input_in_errors=True,
    )

    @model_validator(mode="after")
    def validate_production_security(self):
        if self.ENVIRONMENT.strip().lower() not in {"prod", "production"}:
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
    def mini_app_origins(self) -> list[str]:
        return [
            origin.strip().rstrip("/")
            for origin in self.MINI_APP_ORIGINS.split(",")
            if origin.strip()
        ]


settings = Settings()
