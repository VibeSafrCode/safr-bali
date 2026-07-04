import json
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
VISAS_PATH = BASE_DIR / "visas.json"


def get_visa_card(key: str) -> str:
    with VISAS_PATH.open("r", encoding="utf-8") as file:
        data = json.load(file)

    visa = data[key]
    visa_text = visa["text"].replace("\\n", "\n")

    return (
        f"{visa_text}\n\n"
        "❗️Сроки, условия и требования могут меняться из-за работы иммиграционной системы, "
        "новых постановлений, праздников и технических сбоев.\n\n"
        "Перед оплатой мы дополнительно проверим актуальные условия по вашей ситуации.\n\n"
        "Чтобы оставить заявку или задать вопрос по этой визе — напишите следующим сообщением."
    )
