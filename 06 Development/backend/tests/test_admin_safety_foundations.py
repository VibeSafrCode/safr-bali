from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.core.config import settings
from app.db.base import Base
from app.models.admin_action import AdminAction
from app.models.admin_safety import BusinessSettingVersion, ReferralAttributionCorrection, StaffGrant, VisaCaseDeletionTombstone
from app.models.referral import Referral
from app.models.service import Service
from app.models.user import User
from app.models.visa_lifecycle import (
    ClientInternalNote,
    CredentialVaultItem,
    VisaCase,
    VisaCaseAssignment,
    VisaDocument,
    VisaEvent,
    VisaNotificationDelivery,
    VisaProcess,
    VisaType,
)
from app.models.web_portal import WebConversation
from app.services.referral_corrections import (
    ReferralCorrectionBlocked,
    apply_referral_correction,
    build_referral_correction_preview,
)
from app.services.visa_deletion import VisaDeleteBlocked, build_visa_delete_plan, permanently_delete_visa_case
from app.api import visa_lifecycle as visa_api
from app.api import web_admin as web_admin_api
from fastapi import HTTPException


def database():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, expire_on_commit=False)()


def user(db, telegram_id: int, ref_code: str, *, role: str = "client", invited_by_user_id=None):
    row = User(
        telegram_id=telegram_id,
        ref_code=ref_code,
        role=role,
        status="active",
        locale="ru",
        invited_by_user_id=invited_by_user_id,
    )
    db.add(row); db.flush()
    return row


def test_permanent_visa_delete_is_allow_listed_and_leaves_non_case_domains(monkeypatch):
    db = database()
    root = user(db, 100, "root", role="admin")
    client = user(db, 200, "client", invited_by_user_id=root.id)
    db.add(Referral(parent_user_id=root.id, child_user_id=client.id, level=1, source="fixture"))
    visa_type = VisaType(country_code="ID", code="B1", name="B1", version=1)
    db.add(visa_type); db.flush()
    visa = VisaCase(user_id=client.id, visa_type_id=visa_type.id, assigned_admin_id=root.id, publication_status="ARCHIVED")
    db.add(visa); db.flush()
    process = VisaProcess(visa_case_id=visa.id, process_type="APPLICATION", external_status="PROCESSING")
    db.add(process); db.flush()
    event = VisaEvent(visa_case_id=visa.id, visa_process_id=process.id, event_type="CASE_UPDATED", source="admin")
    db.add(event); db.flush()
    db.add_all([
        VisaNotificationDelivery(visa_case_id=visa.id, visa_event_id=event.id, recipient_user_id=client.id, recipient_kind="client", locale="ru", notification_type="CASE_UPDATED", payload={}, dedupe_key="delete-test", due_at=datetime.now(timezone.utc)),
        ClientInternalNote(user_id=client.id, visa_case_id=visa.id, author_admin_id=root.id, body="fixture"),
        CredentialVaultItem(user_id=client.id, visa_case_id=visa.id, provider="fixture", secret_envelope=b"encrypted", created_by_admin_id=root.id, updated_by_admin_id=root.id),
        VisaDocument(user_id=client.id, visa_case_id=visa.id, document_type="fixture", display_name="fixture.pdf", storage_key="", visibility="INTERNAL", uploaded_by_admin_id=root.id),
        WebConversation(user_id=client.id, source="admin", route_context={}),
    ])
    db.commit()
    monkeypatch.setattr(settings, "VISA_DOCUMENT_STORAGE_ROOT", "")
    monkeypatch.setattr(settings, "DEFAULT_ADMIN_TELEGRAM_ID", root.telegram_id)

    plan = build_visa_delete_plan(db, visa.id)
    assert plan.executable is True
    assert plan.unexpected_dependencies == ()
    assert sum(plan.dependency_counts.values()) == 6

    tombstone, replay = permanently_delete_visa_case(
        db, case_id=visa.id, expected_version=visa.version, actor=root,
        reason="Founder-approved fixture deletion", idempotency_key="delete-fixture-0001",
    )
    db.commit()
    assert replay is False
    assert tombstone.visa_case_id == visa.id
    assert db.query(VisaCase).count() == 0
    assert db.query(VisaCaseDeletionTombstone).count() == 1
    assert db.query(User).count() == 2
    assert db.query(Referral).count() == 1
    assert db.query(WebConversation).count() == 1
    for model in (VisaProcess, VisaEvent, VisaNotificationDelivery, ClientInternalNote, CredentialVaultItem, VisaDocument):
        assert db.query(model).count() == 0

    repeated, replay = permanently_delete_visa_case(
        db, case_id=visa.id, expected_version=visa.version, actor=root,
        reason="Founder-approved fixture deletion", idempotency_key="delete-fixture-0001",
    )
    assert replay is True
    assert repeated.id == tombstone.id
    for changed_reason, changed_version in (("Different deletion reason", visa.version), ("Founder-approved fixture deletion", visa.version + 1)):
        try:
            permanently_delete_visa_case(
                db, case_id=visa.id, expected_version=changed_version, actor=root,
                reason=changed_reason, idempotency_key="delete-fixture-0001",
            )
        except Exception as error:
            assert "another delete" in str(error)
        else:
            raise AssertionError("delete replay must bind reason and expected version")


def test_referral_correction_is_previewed_idempotent_and_reward_neutral():
    db = database()
    root = user(db, 100, "root", role="admin")
    previous = user(db, 200, "previous")
    replacement = user(db, 300, "replacement")
    child = user(db, 400, "child", invited_by_user_id=previous.id)
    relation = Referral(parent_user_id=previous.id, child_user_id=child.id, level=1, source="explicit_referral")
    db.add(relation); db.commit()

    preview = build_referral_correction_preview(db, child_user_id=child.id, new_parent_user_id=replacement.id)
    assert preview.executable is True
    assert preview.reward_ledger_rows == 0
    correction, replay = apply_referral_correction(
        db, child_user_id=child.id, new_parent_user_id=replacement.id, actor=root,
        reason="Founder manual attribution correction", idempotency_key="referral-fix-0001",
    )
    db.commit()
    assert replay is False
    assert correction.previous_parent_user_id == previous.id
    assert db.get(User, child.id).invited_by_user_id == replacement.id
    assert db.get(Referral, relation.id).parent_user_id == replacement.id
    assert db.query(Referral).filter_by(child_user_id=child.id).count() == 1
    assert db.query(ReferralAttributionCorrection).count() == 1
    assert db.query(AdminAction).filter_by(action_type="REFERRAL_ATTRIBUTION_CORRECTED").count() == 1

    repeated, replay = apply_referral_correction(
        db, child_user_id=child.id, new_parent_user_id=replacement.id, actor=root,
        reason="Founder manual attribution correction", idempotency_key="referral-fix-0001",
    )
    assert replay is True
    assert repeated.id == correction.id
    try:
        apply_referral_correction(
            db, child_user_id=child.id, new_parent_user_id=replacement.id, actor=root,
            reason="Changed correction reason", idempotency_key="referral-fix-0001",
        )
    except ReferralCorrectionBlocked as error:
        assert "another correction" in str(error)
    else:
        raise AssertionError("referral replay must bind the normalized reason")


def test_referral_correction_rejects_self_link():
    db = database()
    root = user(db, 100, "root", role="admin")
    previous = user(db, 200, "previous")
    child = user(db, 300, "child", invited_by_user_id=previous.id)
    db.add(Referral(parent_user_id=previous.id, child_user_id=child.id, level=1, source="fixture")); db.commit()
    preview = build_referral_correction_preview(db, child_user_id=child.id, new_parent_user_id=child.id)
    assert "self_referral" in preview.conflicts
    try:
        apply_referral_correction(db, child_user_id=child.id, new_parent_user_id=child.id, actor=root, reason="invalid fixture", idempotency_key="referral-self-01")
    except ReferralCorrectionBlocked:
        pass
    else:
        raise AssertionError("self-referral correction must remain blocked")


def test_referral_correction_rejects_assigning_child_under_descendant():
    db = database()
    root = user(db, 100, "root", role="admin")
    child = user(db, 200, "child", invited_by_user_id=root.id)
    descendant = user(db, 300, "descendant", invited_by_user_id=child.id)
    db.add_all([
        Referral(parent_user_id=root.id, child_user_id=child.id, level=1, source="fixture"),
        Referral(parent_user_id=child.id, child_user_id=descendant.id, level=1, source="fixture"),
    ]); db.commit()
    preview = build_referral_correction_preview(db, child_user_id=child.id, new_parent_user_id=descendant.id)
    assert preview.executable is False and "referral_cycle" in preview.conflicts
    try:
        apply_referral_correction(db, child_user_id=child.id, new_parent_user_id=descendant.id, actor=root, reason="invalid descendant fixture", idempotency_key="referral-cycle-01")
    except ReferralCorrectionBlocked as error:
        assert "referral_cycle" in str(error)
    else:
        raise AssertionError("child-to-descendant reassignment must be rejected")


def test_visa_manager_scope_is_deny_by_default_and_assignment_bound(monkeypatch):
    db = database()
    root = user(db, 100, "root", role="admin")
    manager = user(db, 200, "manager", role="visa_manager")
    other_manager = user(db, 300, "other-manager", role="visa_manager")
    assigned_client = user(db, 400, "assigned-client")
    other_client = user(db, 500, "other-client")
    visa_type = VisaType(country_code="ID", code="B1", name="B1", version=1)
    db.add(visa_type); db.flush()
    manager_grant = StaffGrant(user_id=manager.id, role_code="visa_manager", granted_by_admin_id=root.id, grant_reason="fixture", grant_idempotency_key="scope-manager-grant")
    other_grant = StaffGrant(user_id=other_manager.id, role_code="visa_manager", granted_by_admin_id=root.id, grant_reason="fixture", grant_idempotency_key="scope-other-grant")
    db.add_all([manager_grant, other_grant]); db.flush()
    assigned_case = VisaCase(user_id=assigned_client.id, visa_type_id=visa_type.id, assigned_admin_id=manager.id)
    other_case = VisaCase(user_id=other_client.id, visa_type_id=visa_type.id, assigned_admin_id=other_manager.id)
    db.add_all([assigned_case, other_case]); db.flush()
    db.add_all([
        VisaCaseAssignment(visa_case_id=assigned_case.id, staff_user_id=manager.id, staff_grant_id=manager_grant.id, assigned_by_admin_id=root.id, assignment_reason="fixture", assignment_idempotency_key="scope-manager-assignment"),
        VisaCaseAssignment(visa_case_id=other_case.id, staff_user_id=other_manager.id, staff_grant_id=other_grant.id, assigned_by_admin_id=root.id, assignment_reason="fixture", assignment_idempotency_key="scope-other-assignment"),
        CredentialVaultItem(user_id=assigned_client.id, provider="fixture", secret_envelope=b"encrypted", created_by_admin_id=root.id, updated_by_admin_id=root.id),
    ])
    db.commit()
    factory = sessionmaker(bind=db.bind, expire_on_commit=False)
    monkeypatch.setattr(settings, "VISA_MANAGER_RBAC_ENABLED", True)
    monkeypatch.setattr(settings, "DEFAULT_ADMIN_TELEGRAM_ID", root.telegram_id)
    monkeypatch.setattr(settings, "VISA_LIFECYCLE_ENABLED", True)
    monkeypatch.setattr(settings, "CLIENT_CABINET_ENABLED", True)
    monkeypatch.setattr(settings, "ADMIN_CLIENT_CRM_ENABLED", True)
    monkeypatch.setattr(visa_api, "SessionLocal", factory)

    assert [row.user_id for row in visa_api._case_query(db, manager).all()] == [assigned_client.id]
    assert visa_api._assigned_client(db, assigned_client.id, manager) is True
    assert visa_api._assigned_client(db, other_client.id, manager) is False
    detail = visa_api.admin_client_detail(assigned_client.id, manager)
    assert [row["id"] for row in detail["visa_cases"]]
    assert detail["credentials"] == []
    try:
        visa_api.admin_client_detail(other_client.id, manager)
    except HTTPException as error:
        assert error.status_code == 404
    else:
        raise AssertionError("visa manager must not access another manager's client")


def test_root_assignment_reassign_and_revoke_is_optimistic_idempotent_and_immediate(monkeypatch):
    db = database()
    root = user(db, 100, "root", role="admin")
    first = user(db, 200, "first", role="visa_manager")
    second = user(db, 300, "second", role="visa_manager")
    client = user(db, 400, "client")
    visa_type = VisaType(country_code="ID", code="B1", name="B1", version=1)
    db.add(visa_type); db.flush()
    visa = VisaCase(user_id=client.id, visa_type_id=visa_type.id, assigned_admin_id=first.id)
    db.add_all([
        visa,
        StaffGrant(user_id=first.id, role_code="visa_manager", granted_by_admin_id=root.id, grant_reason="fixture", grant_idempotency_key="fixture-first-grant"),
        StaffGrant(user_id=second.id, role_code="visa_manager", granted_by_admin_id=root.id, grant_reason="fixture", grant_idempotency_key="fixture-second-grant"),
    ]); db.commit()
    factory = sessionmaker(bind=db.bind, expire_on_commit=False)
    monkeypatch.setattr(settings, "VISA_MANAGER_RBAC_ENABLED", True)
    monkeypatch.setattr(settings, "DEFAULT_ADMIN_TELEGRAM_ID", root.telegram_id)
    monkeypatch.setattr(settings, "VISA_LIFECYCLE_ENABLED", True)
    monkeypatch.setattr(settings, "CLIENT_CABINET_ENABLED", True)
    monkeypatch.setattr(settings, "ADMIN_CLIENT_CRM_ENABLED", True)
    monkeypatch.setattr(visa_api, "SessionLocal", factory)
    payload = visa_api.VisaAssignmentRequest(assigned_admin_id=second.id, expected_version=1, reason="Reassign fixture", idempotency_key="assignment-fixture-1")
    changed = visa_api.admin_assign_visa_case(visa.id, payload, root)
    assert changed["assigned_admin"]["id"] == second.id and changed["idempotent_replay"] is False
    assert visa_api._case_query(factory(), first).filter(VisaCase.id == visa.id).first() is None
    assert visa_api._case_query(factory(), second).filter(VisaCase.id == visa.id).one().id == visa.id
    replay = visa_api.admin_assign_visa_case(visa.id, payload, root)
    assert replay["idempotent_replay"] is True
    try:
        visa_api.admin_assign_visa_case(visa.id, payload.model_copy(update={"assigned_admin_id": root.id}), root)
    except HTTPException as error:
        assert error.status_code == 409
    else:
        raise AssertionError("assignment idempotency conflict must be rejected")
    revoked = visa_api.admin_assign_visa_case(visa.id, visa_api.VisaAssignmentRequest(assigned_admin_id=root.id, expected_version=2, reason="Return to root", idempotency_key="assignment-fixture-2"), root)
    assert revoked["assigned_admin"]["id"] == root.id
    assert visa_api._case_query(factory(), second).filter(VisaCase.id == visa.id).first() is None


def test_referral_graph_is_named_and_never_exposes_telegram_identifiers(monkeypatch):
    db = database()
    root = user(db, 100, "root", role="admin")
    root.first_name = "Root"
    child = user(db, 200, "child", invited_by_user_id=root.id)
    child.first_name = "Client"
    db.add(Referral(parent_user_id=root.id, child_user_id=child.id, level=1, source="fixture")); db.commit()
    monkeypatch.setattr(web_admin_api, "SessionLocal", sessionmaker(bind=db.bind, expire_on_commit=False))
    result = web_admin_api.referral_graph(limit=1000, user=root)
    assert result["total_edges"] == 1
    assert {node["label"] for node in result["nodes"]} == {"Root", "Client"}
    assert all("telegram_id" not in node for node in result["nodes"])
    assert result["edges"] == [{"id": 1, "parent_id": root.id, "child_id": child.id, "source": "fixture"}]


def test_business_setting_change_captures_baseline_and_creates_immutable_version():
    db = database()
    root = user(db, 100, "root", role="admin")
    visa = VisaType(country_code="ID", code="B1", name="B1 old", version=1, active=True, rules_verified=False, rule_payload={"source": "fixture"})
    service = Service(name="Villa", slug="villa", category="housing", description="Old", is_active=True, can_pay_with_points=False)
    db.add_all([visa, service]); db.commit()

    version = web_admin_api._apply_business_setting(
        db, entity_type="visa", entity_key="B1", fields={"name": "B1 verified"},
        effective_from=datetime.now(timezone.utc), expected_active_version=0,
        reason="Verified title correction", actor=root,
    )
    db.commit()
    assert version.version == 2
    assert db.query(BusinessSettingVersion).filter_by(entity_type="visa", entity_key="B1").count() == 2
    active = db.query(VisaType).filter_by(code="B1", active=True).one()
    assert active.version == 2 and active.name == "B1 verified"
    assert active.rule_payload == {"source": "fixture"}
    assert db.query(AdminAction).filter_by(action_type="BUSINESS_SETTING_VERSION_CREATED").count() == 1

    service_version = web_admin_api._apply_business_setting(
        db, entity_type="service", entity_key="villa", fields={"description": "Verified service copy", "is_active": False},
        effective_from=datetime.now(timezone.utc), expected_active_version=0,
        reason="Service availability correction", actor=root,
    )
    db.commit()
    assert service_version.version == 2
    saved_service = db.query(Service).filter_by(slug="villa").one()
    assert saved_service.description == "Verified service copy" and saved_service.is_active is False

    try:
        web_admin_api._apply_business_setting(
            db, entity_type="service", entity_key="villa", fields={"name": "stale"},
            effective_from=datetime.now(timezone.utc), expected_active_version=0,
            reason="Stale update", actor=root,
        )
    except HTTPException as error:
        assert error.status_code == 409
    else:
        raise AssertionError("stale settings version must be rejected")


def test_successor_migration_keeps_supported_referral_path_and_owner_alignment():
    source = (Path(__file__).resolve().parents[1] / "alembic" / "versions" / "a3c8e1f4b726_add_admin_safety_foundations.py").read_text()
    assert 'down_revision: Union[str, Sequence[str], None] = "f7a1c2d3e465"' in source
    for table in ("visa_case_deletion_tombstones", "referral_attribution_corrections", "business_setting_versions"):
        assert table in source
    assert "safr_apply_referral_correction" in source
    assert "SECURITY DEFINER SET search_path = public, pg_temp" in source
    assert "REVOKE ALL ON FUNCTION" in source
    assert "referral correction evidence is append-only" in source
    assert "reward ledger activity exists" in source
    assert "WITH RECURSIVE ancestry" in source
    assert "referral correction would create a cycle" in source
    assert "normalized_reason" in source
    assert "existing.reason" in source
    assert 'sa.Column("expected_version", sa.Integer(), nullable=False)' in source
    assert '_align_runtime_owner("visa_case_deletion_tombstones", "referral_attribution_corrections", "business_setting_versions")' in source
    assert "DISABLE TRIGGER" not in source


def test_permanent_delete_requires_archive_and_blocks_protected_metadata_without_storage(monkeypatch):
    db = database()
    root = user(db, 100, "root", role="admin")
    client = user(db, 200, "client")
    visa_type = VisaType(country_code="ID", code="B1", name="B1", version=1)
    db.add(visa_type); db.flush()
    visa = VisaCase(user_id=client.id, visa_type_id=visa_type.id, assigned_admin_id=root.id, publication_status="PUBLISHED")
    db.add(visa); db.flush()
    try: build_visa_delete_plan(db, visa.id)
    except Exception as error: assert "archived" in str(error).lower()
    else: raise AssertionError("non-archived visa must never be deletable")
    visa.publication_status = "ARCHIVED"
    db.add(VisaDocument(user_id=client.id, visa_case_id=visa.id, document_type="VISA", display_name="Protected.pdf", storage_key="protected.enc", upload_idempotency_key="protected-upload", checksum_sha256="a" * 64, mime_type="application/pdf", size_bytes=10, visibility="INTERNAL", uploaded_by_admin_id=root.id))
    db.commit(); monkeypatch.setattr(settings, "VISA_DOCUMENT_STORAGE_ROOT", "")
    monkeypatch.setattr(settings, "DEFAULT_ADMIN_TELEGRAM_ID", root.telegram_id)
    plan = build_visa_delete_plan(db, visa.id)
    assert plan.protected_files_present is True and plan.executable is False
    try: permanently_delete_visa_case(db, case_id=visa.id, expected_version=visa.version, actor=root, reason="must block", idempotency_key="protected-delete-01")
    except Exception as error: assert "cleanup" in str(error).lower()
    else: raise AssertionError("missing storage config must not orphan protected files")


def test_permanent_delete_service_requires_active_configured_root_and_meaningful_reason(monkeypatch):
    db = database()
    root = user(db, 100, "root", role="admin")
    wrong_admin = user(db, 101, "wrong-admin", role="admin")
    client = user(db, 200, "client")
    visa_type = VisaType(country_code="ID", code="B1", name="B1", version=1)
    db.add(visa_type); db.flush()
    visa = VisaCase(
        user_id=client.id, visa_type_id=visa_type.id,
        assigned_admin_id=root.id, publication_status="ARCHIVED",
    )
    db.add(visa); db.commit()
    monkeypatch.setattr(settings, "DEFAULT_ADMIN_TELEGRAM_ID", root.telegram_id)

    for actor in (client, wrong_admin):
        try:
            permanently_delete_visa_case(
                db, case_id=visa.id, expected_version=visa.version, actor=actor,
                reason="Unauthorized delete", idempotency_key=f"delete-denied-{actor.id}",
            )
        except VisaDeleteBlocked as error:
            assert "root admin" in str(error)
        else:
            raise AssertionError("non-root actor reached permanent deletion")
    root.status = "inactive"; db.commit()
    try:
        permanently_delete_visa_case(
            db, case_id=visa.id, expected_version=visa.version, actor=root,
            reason="Inactive root delete", idempotency_key="delete-inactive-root",
        )
    except VisaDeleteBlocked as error:
        assert "root admin" in str(error)
    else:
        raise AssertionError("inactive root reached permanent deletion")
    root.status = "active"; db.commit()
    try:
        permanently_delete_visa_case(
            db, case_id=visa.id, expected_version=visa.version, actor=root,
            reason="   \t\n", idempotency_key="delete-empty-reason",
        )
    except VisaDeleteBlocked as error:
        assert "meaningful" in str(error)
    else:
        raise AssertionError("whitespace-only delete reason was accepted")
    assert db.get(VisaCase, visa.id) is not None
