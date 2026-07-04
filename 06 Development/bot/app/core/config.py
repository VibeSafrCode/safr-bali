from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    BOT_TOKEN: str
    BACKEND_API_URL: str = "http://127.0.0.1:8000"

    ADMIN_CHAT_ID: int
    MANAGER_CHAT_IDS: str = ""
    VISA_ADMIN_CHAT_IDS: str = ""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def manager_chat_ids(self) -> list[int]:
        if not self.MANAGER_CHAT_IDS.strip():
            return []

        return [
            int(chat_id.strip())
            for chat_id in self.MANAGER_CHAT_IDS.split(",")
            if chat_id.strip()
        ]

    @property
    def staff_chat_ids(self) -> list[int]:
        return [self.ADMIN_CHAT_ID] + self.manager_chat_ids

    @property
    def visa_admin_chat_ids(self) -> list[int]:
        if not self.VISA_ADMIN_CHAT_IDS.strip():
            return []

        return [
            int(chat_id.strip())
            for chat_id in self.VISA_ADMIN_CHAT_IDS.split(",")
            if chat_id.strip()
        ]

    @property
    def visa_staff_chat_ids(self) -> list[int]:
        chat_ids = [self.ADMIN_CHAT_ID] + self.visa_admin_chat_ids

        unique_chat_ids = []
        for chat_id in chat_ids:
            if chat_id not in unique_chat_ids:
                unique_chat_ids.append(chat_id)

        return unique_chat_ids


settings = Settings()
