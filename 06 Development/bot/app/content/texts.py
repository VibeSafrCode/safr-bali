import json
from pathlib import Path

from app.services.i18n import text


BASE_DIR = Path(__file__).resolve().parent
TEXTS_PATH = BASE_DIR / "texts.json"
TEXT_I18N_KEYS = {
    "global_personal_account": "text.globalPersonalAccount",
    "bali_start": "text.baliStartLegacy",
    "housing": "text.housingIntro",
    "visa": "text.visaIntro",
    "consultation": "text.consultationLegacy",
    "points": "text.pointsLegacy",
    "referral_link": "text.referralLinkLegacy",
    "fallback": "text.fallback",
    "travel_assistant": "text.travelAssistant",
    "personal_account": "text.personalAccountLegacy",
    "my_referral": "text.myReferralLegacy",
    "my_purchased_services": "text.myPurchasedServicesLegacy",
    "tech_support": "text.techSupport",
    "my_network": "text.myNetworkLegacy",
}


def get_text(key: str) -> str:
    if i18n_key := TEXT_I18N_KEYS.get(key):
        return text(i18n_key)
    with TEXTS_PATH.open("r", encoding="utf-8") as file:
        data = json.load(file)

    return data[key].replace("\\n", "\n")
