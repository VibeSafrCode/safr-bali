from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    BOT_TOKEN: str
    BACKEND_API_URL: str = "http://127.0.0.1:8000"

    ADMIN_CHAT_ID: int
    MANAGER_CHAT_IDS: str = ""
    VISA_ADMIN_CHAT_IDS: str = ""
    SPB_MANAGER_CHAT_IDS: str = ""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @staticmethod
    def _parse_chat_ids(raw_value: str) -> list[int]:
        return list(
            dict.fromkeys(
                int(chat_id.strip())
                for chat_id in raw_value.split(",")
                if chat_id.strip()
            )
        )

    @property
    def manager_chat_ids(self) -> list[int]:
        if not self.MANAGER_CHAT_IDS.strip():
            return []
        return self._parse_chat_ids(self.MANAGER_CHAT_IDS)

    @property
    def staff_chat_ids(self) -> list[int]:
        return list(dict.fromkeys([self.ADMIN_CHAT_ID, *self.manager_chat_ids]))

    @property
    def visa_admin_chat_ids(self) -> list[int]:
        if not self.VISA_ADMIN_CHAT_IDS.strip():
            return []
        return self._parse_chat_ids(self.VISA_ADMIN_CHAT_IDS)

    @property
    def visa_staff_chat_ids(self) -> list[int]:
        return list(dict.fromkeys([self.ADMIN_CHAT_ID, *self.visa_admin_chat_ids]))

    @property
    def spb_manager_chat_ids(self) -> list[int]:
        if not self.SPB_MANAGER_CHAT_IDS.strip():
            return []
        return self._parse_chat_ids(self.SPB_MANAGER_CHAT_IDS)

    @property
    def spb_staff_chat_ids(self) -> list[int]:
        return list(dict.fromkeys([self.ADMIN_CHAT_ID, *self.spb_manager_chat_ids]))

    @property
    def all_staff_chat_ids(self) -> list[int]:
        return list(
            dict.fromkeys(
                [
                    *self.staff_chat_ids,
                    *self.visa_admin_chat_ids,
                    *self.spb_manager_chat_ids,
                ]
            )
        )


settings = Settings()
