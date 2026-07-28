from __future__ import annotations

import unittest
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.web_portal import upsert_oidc_user
from app.db.base import Base
from app.models.referral import Referral
from app.models.user import User


class BrowserLoginReferralInvariantTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite+pysqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()
        self.admin = self._user(telegram_id=1, ref_code="ADMIN", role="admin")
        self.inviter = self._user(telegram_id=2, ref_code="VALIDREF")
        self.other_inviter = self._user(telegram_id=3, ref_code="OTHERREF")
        self.db.commit()

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def _user(
        self,
        *,
        telegram_id: int,
        ref_code: str,
        role: str = "client",
        invited_by_user_id: int | None = None,
    ) -> User:
        user = User(
            telegram_id=telegram_id,
            first_name=f"User {telegram_id}",
            language="ru",
            role=role,
            ref_code=ref_code,
            invited_by_user_id=invited_by_user_id,
            status="active",
        )
        self.db.add(user)
        self.db.flush()
        return user

    @staticmethod
    def _claims(telegram_id: int) -> dict:
        return {
            "telegram_id": telegram_id,
            "given_name": f"Login {telegram_id}",
            "preferred_username": f"user{telegram_id}",
        }

    def _referrals_for(self, user: User) -> list[Referral]:
        return (
            self.db.query(Referral)
            .filter(Referral.child_user_id == user.id)
            .all()
        )

    def test_existing_user_without_referral_is_not_attributed_on_login(self):
        user = self._user(telegram_id=50, ref_code="EXISTING50")
        self.db.commit()

        with patch("app.api.web_portal.settings.DEFAULT_ADMIN_TELEGRAM_ID", 1):
            logged_in, is_new = upsert_oidc_user(
                self.db,
                self._claims(50),
                None,
            )
            self.db.commit()

        self.assertFalse(is_new)
        self.assertIsNone(logged_in.invited_by_user_id)
        self.assertEqual(self._referrals_for(user), [])

    def test_existing_user_with_referral_ignores_different_ref_on_login(self):
        user = self._user(
            telegram_id=51,
            ref_code="EXISTING51",
            invited_by_user_id=self.inviter.id,
        )
        self.db.add(
            Referral(
                parent_user_id=self.inviter.id,
                child_user_id=user.id,
                level=1,
                source="existing",
            )
        )
        self.db.commit()

        logged_in, is_new = upsert_oidc_user(
            self.db,
            self._claims(51),
            self.other_inviter.ref_code,
        )
        self.db.commit()

        self.assertFalse(is_new)
        self.assertEqual(logged_in.invited_by_user_id, self.inviter.id)
        referrals = self._referrals_for(user)
        self.assertEqual(len(referrals), 1)
        self.assertEqual(referrals[0].parent_user_id, self.inviter.id)

    def test_existing_user_without_ref_does_not_gain_default_admin(self):
        user = self._user(telegram_id=52, ref_code="EXISTING52")
        self.db.commit()

        with patch("app.api.web_portal.settings.DEFAULT_ADMIN_TELEGRAM_ID", 1):
            logged_in, _ = upsert_oidc_user(
                self.db,
                self._claims(52),
                "",
            )
            self.db.commit()

        self.assertIsNone(logged_in.invited_by_user_id)
        self.assertEqual(self._referrals_for(user), [])

    def test_new_user_with_valid_ref_is_attributed_once(self):
        user, is_new = upsert_oidc_user(
            self.db,
            self._claims(60),
            self.inviter.ref_code,
        )
        self.db.commit()

        self.assertTrue(is_new)
        self.assertEqual(user.invited_by_user_id, self.inviter.id)
        self.assertEqual(len(self._referrals_for(user)), 1)

        same_user, second_is_new = upsert_oidc_user(
            self.db,
            self._claims(60),
            self.inviter.ref_code,
        )
        self.db.commit()

        self.assertFalse(second_is_new)
        self.assertEqual(same_user.id, user.id)
        self.assertEqual(len(self._referrals_for(user)), 1)

    def test_invalid_ref_does_not_change_existing_user(self):
        user = self._user(telegram_id=61, ref_code="EXISTING61")
        self.db.commit()

        logged_in, is_new = upsert_oidc_user(
            self.db,
            self._claims(61),
            "NOT-A-REF",
        )
        self.db.commit()

        self.assertFalse(is_new)
        self.assertIsNone(logged_in.invited_by_user_id)
        self.assertEqual(self._referrals_for(user), [])

    def test_new_user_without_valid_ref_is_not_default_attributed(self):
        with patch("app.api.web_portal.settings.DEFAULT_ADMIN_TELEGRAM_ID", 1):
            user, is_new = upsert_oidc_user(
                self.db,
                self._claims(62),
                "NOT-A-REF",
            )
            self.db.commit()

        self.assertTrue(is_new)
        self.assertIsNone(user.invited_by_user_id)
        self.assertEqual(self._referrals_for(user), [])


if __name__ == "__main__":
    unittest.main()
