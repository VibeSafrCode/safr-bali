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

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
