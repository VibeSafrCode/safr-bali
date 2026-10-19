"""Synthetic transactional message/audience tests. No Telegram or production IO."""
from datetime import datetime, timedelta, timezone
import os
import unittest
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.engine import make_url

import app.models  # noqa: F401
from app.core.config import settings
from app.db.base import Base
from app.models.bot_messaging import BotCampaignRecipient, BotContact
from app.models.onboarding import OnboardingState, OnboardingVersion, OnboardingEnrollment, OnboardingDelivery
from app.models.user import User
from app.services import bot_messaging as service, onboarding
from app.services.admin_user_selection import select_users


class BotMessagingTests(unittest.TestCase):
    def setUp(self):
        url = os.environ.get("SAFR_MESSAGING_TEST_URL", "sqlite:///:memory:")
        parsed = make_url(url)
        if parsed.drivername != "sqlite":
            assert parsed.drivername == "postgresql+psycopg" and not parsed.host
            assert parsed.query.get("host", "").startswith("/private/tmp/safr-messaging-pg-20261018.")
            assert parsed.database.startswith("bot_messaging_test_")
        self.engine = create_engine(url)
        Base.metadata.create_all(self.engine)
        self.connection = self.engine.connect()
        self.transaction = self.connection.begin()
        self.db = sessionmaker(bind=self.connection, expire_on_commit=False, join_transaction_mode="create_savepoint")()
        self.now = datetime(2030, 1, 1, tzinfo=timezone.utc)
        self.root = self.user(1, "Synthetic root", role="admin")
        self.client = self.user(2, "Synthetic client")
        self.config = patch.object(settings, "DEFAULT_ADMIN_TELEGRAM_ID", self.root.telegram_id)
        self.config.start()
        for bot, state_id in onboarding.BOT_STATE_IDS.items():
            content = {"locales": {locale: {"welcome_text": f"Synthetic {bot} {locale}",
                                           "followup_text": f"Synthetic question {locale}"} for locale in ("ru", "en")}}
            self.db.add(OnboardingVersion(version=state_id, bot_key=bot, content=content,
                created_at=self.now, created_by=self.root.id))
            self.db.add(OnboardingState(id=state_id, revision=0, enabled=True,
                activation_cutoff=self.now - timedelta(hours=1), published_version=state_id, draft=content))
        self.db.commit()

    def tearDown(self):
        self.config.stop(); self.db.close(); self.transaction.rollback(); self.connection.close(); self.engine.dispose()

    def user(self, number, name, role="client"):
        user = User(telegram_id=810000 + number, first_name=name, ref_code=f"synthetic-{number}",
                    role=role, status="active", locale="en", bot_status="unknown")
        self.db.add(user); self.db.flush()
        return user

    def contact(self, user=None, bot="safrway", *, now=None):
        user = user or self.client
        return service.record_private_contact(self.db, user, bot_key=bot, locale="en",
            event=f"private:{user.id}:1", occurred_at=now or self.now, now=now or self.now)

    def campaign(self, bot="safrway", kind="announcement", audience=None, followup=False):
        return service.create_campaign(self.db, actor=self.root, bot_key=bot, kind=kind,
            title="Synthetic reviewed campaign", audience=audience or {},
            content={"ru": "Синтетическое сообщение", "en": "Synthetic message"},
            content_version=onboarding.BOT_STATE_IDS[bot] if kind == "welcome_backfill" else None,
            followup=followup, now=self.now)

    def confirm(self, campaign, *, key="synthetic-confirmation-0001"):
        preview = service.preview_campaign(self.db, campaign.id, actor=self.root, expected_revision=campaign.revision)
        self.db.flush()
        result = service.confirm_campaign(self.db, campaign.id, actor=self.root,
            expected_revision=preview["revision"], snapshot_sha256=preview["snapshot_sha256"],
            idempotency_key=key, now=self.now)
        return preview, result

    def test_same_account_receives_separate_one_time_welcomes_per_bot(self):
        ref_code, language = self.client.ref_code, self.client.locale
        for bot in ("safrway", "yoga"):
            _, first = self.contact(bot=bot)
            self.assertTrue(first)
            _, first = self.contact(bot=bot)
            self.assertFalse(first)
        self.db.commit()
        self.assertEqual(self.db.query(BotContact).count(), 2)
        self.assertEqual(self.db.query(OnboardingEnrollment).count(), 2)
        self.assertEqual(self.db.query(OnboardingDelivery).count(), 2)
        self.assertEqual(self.client.ref_code, ref_code)
        self.assertEqual(self.client.locale, language)
        self.assertIsNone(self.client.invited_by_user_id)
        self.assertEqual(self.client.bot_status, "unknown")

    def test_claim_and_settlement_are_bot_scoped_not_main_bot_status(self):
        self.contact(bot="yoga"); self.db.commit()
        later = self.now + timedelta(minutes=16)
        self.assertEqual(onboarding.claim(self.db, later, bot_key="safrway"), [])
        item = onboarding.claim(self.db, later, bot_key="yoga")[0]
        self.assertEqual(item["bot_key"], "yoga")
        self.assertEqual(item["locale"], "en")
        self.assertEqual(item["text"], "Synthetic yoga en")
        self.db.commit()
        with self.assertRaisesRegex(ValueError, "Stale delivery lease"):
            onboarding.settle(self.db, item["id"], item["lease_token"], "DELIVERED", "11", now=later, bot_key="safrway")
        self.db.rollback()
        self.assertEqual(self.db.get(OnboardingDelivery, item["id"]).state, "CLAIMED")

    def test_contact_while_disabled_needs_explicit_catch_up(self):
        state = self.db.get(OnboardingState, 1); state.enabled = False
        self.contact(); self.db.commit()
        state.enabled = True; state.activation_cutoff = self.now + timedelta(minutes=1); self.db.commit()
        self.contact(now=self.now + timedelta(minutes=2)); self.db.commit()
        self.assertEqual(self.db.query(OnboardingEnrollment).count(), 0)
        campaign = self.campaign(kind="welcome_backfill")
        self.confirm(campaign); self.db.commit()
        enrollment = self.db.query(OnboardingEnrollment).one()
        self.assertEqual(enrollment.origin, "backfill")
        self.assertTrue(enrollment.registration_event.startswith("safrway:campaign:"))

    def test_snapshot_is_fixed_and_confirm_is_idempotent(self):
        self.contact(); campaign = self.campaign()
        preview = service.preview_campaign(self.db, campaign.id, actor=self.root, expected_revision=0)
        newcomer = self.user(3, "Late synthetic contact"); self.contact(newcomer); self.db.commit()
        args = dict(actor=self.root, expected_revision=preview["revision"],
            snapshot_sha256=preview["snapshot_sha256"], idempotency_key="synthetic-confirmation-0001", now=self.now)
        _, replay = service.confirm_campaign(self.db, campaign.id, **args); self.db.commit()
        self.assertFalse(replay)
        _, replay = service.confirm_campaign(self.db, campaign.id, **args)
        self.assertTrue(replay)
        recipients = self.db.query(BotCampaignRecipient).filter_by(campaign_id=campaign.id).all()
        self.assertEqual([r.user_id for r in recipients], [self.client.id])
        with self.assertRaisesRegex(service.MessagingConflict, "confirmation_payload_conflict"):
            service.confirm_campaign(self.db, campaign.id, **{**args, "snapshot_sha256": "0" * 64})

    def test_backfill_does_not_duplicate_automatic_or_prior_pending_welcome(self):
        self.contact(); self.db.commit()
        campaign = self.campaign(kind="welcome_backfill")
        self.confirm(campaign); self.db.commit()
        self.assertEqual(self.db.query(OnboardingEnrollment).count(), 1)
        self.assertEqual(self.db.query(OnboardingDelivery).count(), 1)
        self.assertEqual(self.db.query(BotCampaignRecipient).one().state, "SKIPPED")

    def test_individuals_optout_and_bot_identity_limit_audience(self):
        main, _ = self.contact(); main.announcements_opted_out = True
        self.contact(bot="yoga")
        other = self.user(3, "Other person"); self.contact(other); self.db.commit()
        main_campaign = self.campaign(audience={"user_ids": [self.client.id]})
        p = service.preview_campaign(self.db, main_campaign.id, actor=self.root, expected_revision=0)
        self.assertEqual(p["recipient_count"], 0)
        yoga_campaign = self.campaign(bot="yoga", audience={"user_ids": [self.client.id]})
        p = service.preview_campaign(self.db, yoga_campaign.id, actor=self.root, expected_revision=0)
        self.assertEqual(p["recipient_count"], 1)
        self.assertEqual(self.db.query(BotCampaignRecipient).filter_by(campaign_id=yoga_campaign.id).one().user_id, self.client.id)

    def test_disabled_or_changed_welcome_cannot_be_silently_confirmed(self):
        self.contact(); self.db.commit()
        campaign = self.campaign(kind="welcome_backfill")
        preview = service.preview_campaign(self.db, campaign.id, actor=self.root, expected_revision=0)
        self.db.get(OnboardingState, 1).enabled = False; self.db.commit()
        with self.assertRaisesRegex(service.MessagingConflict, "welcome_policy_changed_repreview"):
            service.confirm_campaign(self.db, campaign.id, actor=self.root, expected_revision=preview["revision"],
                snapshot_sha256=preview["snapshot_sha256"], idempotency_key="synthetic-disabled", now=self.now)
        self.assertEqual(campaign.state, "PREVIEW")

    def test_wrong_brand_text_nonroot_and_mixed_audience_are_rejected(self):
        with self.assertRaisesRegex(service.MessagingConflict, "root_admin_required"):
            service.create_campaign(self.db, actor=self.client, bot_key="safrway", kind="announcement", title="No", audience={})
        with self.assertRaisesRegex(service.MessagingConflict, "wrong_brand_text"):
            service.create_campaign(self.db, actor=self.root, bot_key="yoga", kind="announcement", title="Wrong",
                audience={}, content={"ru": "SAFRWAY", "en": "Wrong brand"})
        with self.assertRaisesRegex(service.MessagingConflict, "choose_segments_or_individuals"):
            self.campaign(audience={"user_ids": [self.client.id], "filters": {"q": "Synthetic"}})

    def test_cancellation_preserves_claimed_history_and_stops_next_welcome_part(self):
        state = self.db.get(OnboardingState, 1); state.enabled = False
        self.contact(); self.db.commit()
        state.enabled = True; self.db.commit()
        campaign = self.campaign(kind="welcome_backfill", followup=True)
        self.confirm(campaign); self.db.commit()
        item = onboarding.claim(self.db, self.now)[0]; self.db.commit()
        service.cancel_campaign(self.db, campaign.id, actor=self.root, expected_revision=campaign.revision); self.db.commit()
        onboarding.settle(self.db, item["id"], item["lease_token"], "DELIVERED", "17", now=self.now); self.db.commit()
        self.assertEqual(self.db.query(OnboardingDelivery).count(), 1)
        self.assertEqual(self.db.query(OnboardingDelivery).one().state, "DELIVERED")
        self.assertEqual(campaign.state, "CANCELLED")

    def test_shared_search_supports_names_usernames_and_numeric_ids(self):
        self.client.first_name, self.client.last_name = "Synthetic", "Person"
        self.client.username = "synthetic_example"
        self.db.commit()
        for query in ("Synthetic Person", "@synthetic_example", str(self.client.id)):
            self.assertIn(self.client.id, [user.id for user in select_users(self.db, q=query).all()])

    def test_announcement_claim_and_receipt_cannot_cross_bots(self):
        self.contact(); campaign = self.campaign(); self.confirm(campaign); self.db.commit()
        self.assertEqual(service.claim_announcement(self.db, bot_key="yoga", now=self.now), [])
        delivery = service.claim_announcement(self.db, bot_key="safrway", now=self.now)[0]; self.db.commit()
        with self.assertRaisesRegex(service.MessagingConflict, "stale_announcement_lease"):
            service.settle_announcement(self.db, delivery["id"], bot_key="yoga",
                lease_token=delivery["lease_token"], outcome="DELIVERED", message_id="42", now=self.now)
        self.db.rollback()
        self.assertEqual(self.db.get(BotCampaignRecipient, delivery["id"]).state, "CLAIMED")

    def test_expired_announcement_is_unknown_and_accepts_only_original_positive_receipt(self):
        self.contact(); campaign = self.campaign(); self.confirm(campaign); self.db.commit()
        delivery = service.claim_announcement(self.db, bot_key="safrway", now=self.now)[0]; self.db.commit()
        later = self.now + timedelta(minutes=3)
        self.assertEqual(service.claim_announcement(self.db, bot_key="safrway", now=later), [])
        self.db.commit()
        self.assertEqual(self.db.get(BotCampaignRecipient, delivery["id"]).state, "UNKNOWN")
        result = service.settle_announcement(self.db, delivery["id"], bot_key="safrway",
            lease_token=delivery["lease_token"], outcome="DELIVERED", message_id="42", delivered_at=self.now, now=later)
        self.db.commit()
        again = service.settle_announcement(self.db, delivery["id"], bot_key="safrway",
            lease_token=delivery["lease_token"], outcome="DELIVERED", message_id="42", delivered_at=self.now, now=later)
        self.assertEqual(again.id, result.id)
        self.assertEqual(result.state, "DELIVERED")

    def test_confirmed_rate_limit_delays_all_same_bot_messages_and_allows_bounded_retry(self):
        self.contact(); campaign = self.campaign(); self.confirm(campaign); self.db.commit()
        delivery = service.claim_announcement(self.db, bot_key="safrway", now=self.now)[0]; self.db.commit()
        retry = dict(bot_key="safrway", lease_token=delivery["lease_token"], outcome="RETRY",
            error_code="TELEGRAM_RETRY_AFTER", retry_after_seconds=1200, now=self.now)
        service.settle_announcement(self.db, delivery["id"], **retry); self.db.commit()
        first_due = self.db.get(BotCampaignRecipient, delivery["id"]).due_at
        service.settle_announcement(self.db, delivery["id"], **retry); self.db.commit()
        self.assertEqual(self.db.get(BotCampaignRecipient, delivery["id"]).due_at, first_due)
        self.assertEqual(service.claim_announcement(self.db, bot_key="safrway", now=self.now + timedelta(minutes=1)), [])
        self.assertEqual(onboarding.claim(self.db, self.now + timedelta(minutes=16)), [])
        retried = service.claim_announcement(self.db, bot_key="safrway", now=self.now + timedelta(minutes=21))[0]
        self.assertEqual(retried["id"], delivery["id"])
        self.assertNotEqual(retried["lease_token"], delivery["lease_token"])
        self.assertEqual(self.db.get(BotCampaignRecipient, delivery["id"]).attempts, 2)

    def test_welcome_rate_limit_is_not_ambiguous_and_is_never_immediately_reclaimed(self):
        self.contact(); self.db.commit()
        due = self.now + timedelta(minutes=16)
        delivery = onboarding.claim(self.db, due)[0]; self.db.commit()
        onboarding.settle(self.db, delivery["id"], delivery["lease_token"], "RETRY",
            error_code="TELEGRAM_RETRY_AFTER", retry_after_seconds=120, now=due)
        self.db.commit()
        self.assertEqual(onboarding.claim(self.db, due + timedelta(seconds=1)), [])
        retried = onboarding.claim(self.db, due + timedelta(seconds=121))[0]
        self.assertEqual(retried["id"], delivery["id"])
        self.assertEqual(self.db.get(OnboardingDelivery, delivery["id"]).attempts, 2)

    def test_cancelled_backfill_rate_limit_cannot_resurrect_delivery(self):
        policy = self.db.get(OnboardingState, 1); policy.enabled = False
        self.contact(); self.db.commit()
        policy.enabled = True; self.db.commit()
        campaign = self.campaign(kind="welcome_backfill")
        self.confirm(campaign); self.db.commit()
        item = onboarding.claim(self.db, self.now)[0]; self.db.commit()
        service.cancel_campaign(self.db, campaign.id, actor=self.root, expected_revision=campaign.revision)
        self.db.commit()
        for _ in range(2):
            result = onboarding.settle(self.db, item["id"], item["lease_token"], "RETRY",
                error_code="TELEGRAM_RETRY_AFTER", retry_after_seconds=30, now=self.now)
            self.db.commit()
            self.assertEqual(result.state, "SUPPRESSED")
        self.assertEqual(onboarding.claim(self.db, self.now + timedelta(minutes=2)), [])

    def test_old_policy_epoch_rate_limit_cannot_resurrect_delivery(self):
        self.contact(); self.db.commit()
        due = self.now + timedelta(minutes=16)
        item = onboarding.claim(self.db, due)[0]; self.db.commit()
        self.db.get(OnboardingState, 1).activation_cutoff = due + timedelta(seconds=1)
        self.db.commit()
        item = onboarding.settle(self.db, item["id"], item["lease_token"], "RETRY",
            error_code="TELEGRAM_RETRY_AFTER", retry_after_seconds=30, now=due)
        self.db.commit()
        self.assertEqual(item.state, "SUPPRESSED")
        self.assertEqual(onboarding.claim(self.db, due + timedelta(minutes=2)), [])

    def test_legacy_registration_does_not_reserve_russian_slot_for_english_contact(self):
        with patch.object(settings, "BOT_MESSAGING_ENABLED", True):
            result = onboarding.enroll(self.db, self.client, event=f"telegram-start:{self.client.telegram_id}:1",
                occurred_at=self.now, verified_new=True, now=self.now)
        self.assertIsNone(result)
        self.contact(); self.db.commit()
        enrollment = self.db.query(OnboardingEnrollment).one()
        self.assertEqual(enrollment.locale, "en")
        self.assertEqual(onboarding.claim(self.db, self.now + timedelta(minutes=16))[0]["text"], "Synthetic safrway en")

    def test_language_selection_before_first_send_updates_whole_pending_chain_only(self):
        self.contact(); self.db.commit()
        later = self.now + timedelta(minutes=1)
        service.record_private_contact(self.db, self.client, bot_key="safrway", locale="ru",
            event="private:language-choice", occurred_at=later, now=later)
        self.db.commit()
        item = onboarding.claim(self.db, self.now + timedelta(minutes=16))[0]; self.db.commit()
        self.assertEqual((item["locale"], item["text"]), ("ru", "Synthetic safrway ru"))
        after_claim = self.now + timedelta(minutes=17)
        service.record_private_contact(self.db, self.client, bot_key="safrway", locale="en",
            event="private:later-choice", occurred_at=after_claim, now=after_claim)
        self.db.commit()
        self.assertEqual(self.db.query(OnboardingEnrollment).one().locale, "ru")
        # A delayed old metadata retry cannot overwrite the newer preference.
        service.record_private_contact(self.db, self.client, bot_key="safrway", locale="ru",
            event="private:old-retry", occurred_at=later, now=after_claim)
        self.db.commit()
        self.assertEqual(self.db.query(BotContact).one().locale, "en")

    def test_legacy_main_help_cannot_use_yoga_enrollment(self):
        self.contact(bot="yoga"); self.db.commit()
        enrollment = self.db.query(OnboardingEnrollment).one()
        with self.assertRaisesRegex(ValueError, "does not belong"):
            onboarding.request_help(self.db, enrollment.id, self.client.telegram_id, [self.root.telegram_id])
        self.assertFalse(onboarding.can_reply(self.db, enrollment.id, self.root.telegram_id))

    def test_off_policy_dry_preview_and_atomic_cutover_rejects_unreviewed_contact(self):
        policy = self.db.get(OnboardingState, 1); policy.enabled = False
        self.contact(); self.db.commit()
        campaign = self.campaign(kind="welcome_backfill")
        preview = service.preview_campaign(self.db, campaign.id, actor=self.root, expected_revision=0)
        self.db.commit()
        self.assertFalse(policy.enabled)
        self.assertEqual(self.db.query(OnboardingDelivery).count(), 0)
        newcomer = self.user(3, "Synthetic contact between review and cutover")
        self.contact(newcomer); self.db.commit()
        with self.assertRaisesRegex(service.MessagingConflict, "welcome_audience_changed_repreview"):
            service.confirm_campaign(self.db, campaign.id, actor=self.root, expected_revision=preview["revision"],
                snapshot_sha256=preview["snapshot_sha256"], idempotency_key="synthetic-atomic-cutover", now=self.now)
        self.db.rollback()
        self.assertFalse(self.db.get(OnboardingState, 1).enabled)
        self.assertEqual(self.db.query(OnboardingEnrollment).count(), 0)
        preview = service.preview_campaign(self.db, campaign.id, actor=self.root, expected_revision=campaign.revision)
        service.confirm_campaign(self.db, campaign.id, actor=self.root, expected_revision=preview["revision"],
            snapshot_sha256=preview["snapshot_sha256"], idempotency_key="synthetic-atomic-cutover", now=self.now)
        self.db.commit()
        self.assertTrue(self.db.get(OnboardingState, 1).enabled)
        self.assertEqual(self.db.query(OnboardingEnrollment).count(), 2)
        self.assertEqual(self.db.query(OnboardingDelivery).count(), 2)

    def test_late_real_private_update_is_not_lost_after_cutover_or_fake_registration(self):
        occurred = self.now - timedelta(days=1)
        service.record_private_contact(self.db, self.client, bot_key="yoga", locale="en",
            event="private:late-real-update", occurred_at=occurred, now=self.now)
        self.db.commit()
        enrollment = self.db.query(OnboardingEnrollment).one()
        self.assertEqual(onboarding.utc(enrollment.registered_at), occurred)
        self.assertEqual(enrollment.origin, "first_contact")
        self.assertEqual(onboarding.utc(self.db.query(OnboardingDelivery).one().due_at), self.now + timedelta(minutes=15))
        self.assertIsNone(self.client.invited_by_user_id)

    def legacy(self):
        self.db.get(OnboardingState, 1).enabled = False
        self.client.bot_status = "active"; self.db.commit()
        inventory = service.main_legacy_inventory(self.db)[1]
        service.bootstrap_main_legacy(self.db, actor=self.root, expected_snapshot_sha256=inventory["snapshot_sha256"])
        self.db.commit()
        return self.db.query(BotContact).filter_by(bot_key="safrway").one()

    def test_legacy_main_bootstrap_is_unknown_metadata_only_and_snapshot_bound(self):
        contact = self.legacy()
        self.assertEqual((contact.source, contact.status), ("legacy_main_registration", "unknown"))
        self.assertIsNone(contact.first_contact_at)
        self.assertEqual(self.db.query(OnboardingEnrollment).count(), 0)
        self.assertEqual(self.client.locale, "en")
        self.assertIsNone(self.client.invited_by_user_id)
        with self.assertRaisesRegex(service.MessagingConflict, "legacy_inventory_changed"):
            service.bootstrap_main_legacy(self.db, actor=self.root, expected_snapshot_sha256="0" * 64)

    def test_unknown_legacy_oneoff_needs_explicit_consent_and_never_opts_into_broadcasts(self):
        contact = self.legacy()
        self.assertEqual(service.preview_campaign(self.db, self.campaign().id, actor=self.root, expected_revision=0)["recipient_count"], 0)
        campaign = service.create_campaign(self.db, actor=self.root, bot_key="safrway", kind="welcome_backfill",
            title="Reviewed one-off legacy welcome", audience={"legacy_main_once": True}, content_version=1)
        preview = service.preview_campaign(self.db, campaign.id, actor=self.root, expected_revision=0); self.db.commit()
        self.assertEqual(preview["unverified_main_registration_count"], 1)
        request = dict(actor=self.root, expected_revision=preview["revision"], snapshot_sha256=preview["snapshot_sha256"],
            idempotency_key="synthetic-explicit-legacy", now=self.now)
        with self.assertRaisesRegex(service.MessagingConflict, "explicit_legacy_main_once_confirmation_required"):
            service.confirm_campaign(self.db, campaign.id, **request)
        self.db.rollback()
        self.assertFalse(self.db.get(OnboardingState, 1).enabled)
        service.confirm_campaign(self.db, campaign.id, **request, allow_unverified_main_once=True); self.db.commit()
        with self.assertRaisesRegex(service.MessagingConflict, "confirmation_payload_conflict"):
            service.confirm_campaign(self.db, campaign.id, **request)
        item = onboarding.claim(self.db, self.now)[0]; self.db.commit()
        onboarding.settle(self.db, item["id"], item["lease_token"], "DELIVERED", "12", now=self.now); self.db.commit()
        self.assertEqual(contact.status, "unknown")
        self.assertEqual(service.preview_campaign(self.db, self.campaign().id, actor=self.root, expected_revision=0)["recipient_count"], 0)
        _, first_proof = self.contact(now=self.now + timedelta(minutes=1)); self.db.commit()
        self.assertTrue(first_proof)
        self.assertEqual(contact.status, "active")
        self.assertEqual(self.db.query(OnboardingEnrollment).count(), 1)

    def test_legacy_consent_never_bypasses_block_optout_or_yoga_brand(self):
        contact = self.legacy()
        for status, opted_out in (("blocked", False), ("unknown", True)):
            contact.status, contact.announcements_opted_out = status, opted_out; self.db.commit()
            campaign = service.create_campaign(self.db, actor=self.root, bot_key="safrway", kind="welcome_backfill",
                title="Cannot override blocked", audience={"legacy_main_once": True}, content_version=1)
            self.assertEqual(service.preview_campaign(self.db, campaign.id, actor=self.root, expected_revision=0)["recipient_count"], 0)
        with self.assertRaisesRegex(service.MessagingConflict, "legacy_main_oneoff_welcome_only"):
            service.create_campaign(self.db, actor=self.root, bot_key="yoga", kind="welcome_backfill",
                title="No Main substitution", audience={"legacy_main_once": True}, content_version=2)

    def test_proven_yoga_bootstrap_is_deduplicated_and_never_rewrites_canonical_account(self):
        self.db.get(OnboardingState, 2).enabled = False; self.db.commit()
        before = (self.client.locale, self.client.ref_code, self.client.invited_by_user_id, self.client.bot_status)
        records = [{"user_id": self.client.id, "locale": "en", "last_contact_at": self.now}]
        request = dict(actor=self.root, records=records, proof_sha256="a" * 64, source="legacy_yoga_context", now=self.now)
        result = service.bootstrap_proven_yoga_contacts(self.db, **request); self.db.commit()
        self.assertEqual(result["created"], 1)
        self.assertEqual(service.bootstrap_proven_yoga_contacts(self.db, **request)["created"], 0)
        self.assertEqual((self.client.locale, self.client.ref_code, self.client.invited_by_user_id, self.client.bot_status), before)
        self.assertEqual(self.db.query(OnboardingEnrollment).count(), 0)
        contact = self.db.query(BotContact).one()
        self.assertEqual((contact.bot_key, contact.status, contact.source), ("yoga", "active", "legacy_yoga_context"))
        self.assertIsNone(contact.first_contact_at)


if __name__ == "__main__":
    unittest.main()
