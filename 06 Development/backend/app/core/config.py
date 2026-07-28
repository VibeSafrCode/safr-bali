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

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def mini_app_origins(self) -> list[str]:
        return [
            origin.strip().rstrip("/")
            for origin in self.MINI_APP_ORIGINS.split(",")
            if origin.strip()
        ]


settings = Settings()
