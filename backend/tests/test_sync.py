import os
import unittest
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.base import Base
from app.models import DevicePushToken, DomainEvent, Notification, NotificationDelivery, Task, User
from app.routers.sync import _authorize_scheduler
from app.schemas.notification import PushTokenRegister
from app.services import (
    collaboration_service,
    device_service,
    event_service,
    job_service,
    notification_service,
    push_service,
    task_service,
)
from app.services.collaboration_service import CollaborationError

EXPO_TOKEN = "ExponentPushToken[abcdefghijklmnop]"


def later(seconds: int = 30) -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(seconds=seconds)


class FakeExpo:
    def __init__(self, ticket=None, receipts=None):
        self.ticket = ticket or {"status": "ok", "id": "ticket-1"}
        self.receipts = receipts or {}
        self.sent = []

    def __call__(self, url, body):
        if url == push_service.EXPO_RECEIPTS_URL:
            return {"data": self.receipts}
        self.sent.extend(body)
        return {"data": [dict(self.ticket) for _ in body]}


def memory_engine():
    """One shared in-memory SQLite DB across connections (needed for TestClient)."""
    return create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )


class SyncTestCase(unittest.TestCase):
    def setUp(self):
        self.engine = memory_engine()
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.owner = User(name="Akshat", email="akshat@example.com", password_hash="x")
        self.member = User(name="Rahul", email="rahul@example.com", password_hash="x")
        self.outsider = User(name="Neha", email="neha@example.com", password_hash="x")
        self.db.add_all([self.owner, self.member, self.outsider])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def team(self, visibility="workspace"):
        team = collaboration_service.create_team_workspace(self.db, self.owner, "Product", None)
        invite = collaboration_service.create_invitation(self.db, self.owner, team["id"], self.member.email, "member")
        collaboration_service.accept_invitation(self.db, self.member, invite["token"])
        project = collaboration_service.create_project(self.db, self.owner, team["id"], {"name": "Launch", "visibility": visibility})
        return team, project

    def feed(self, user, after=0):
        return event_service.list_events(self.db, user, after, 200, now=later())

    def types(self, user, after=0):
        return [event["type"] for event in self.feed(user, after)["events"]]

    def register(self, user, device_id="device-0001", token=EXPO_TOKEN):
        return device_service.register(self.db, user, {
            "device_id": device_id, "platform": "android", "provider": "expo", "token": token,
        })


class EventFeedTests(SyncTestCase):
    def test_personal_task_events_reach_only_the_owner(self):
        task_service.create_task(self.db, self.owner.id, {"title": "Private errand"})
        self.assertIn("task.created", self.types(self.owner))
        self.assertNotIn("task.created", self.types(self.member))
        self.assertNotIn("task.created", self.types(self.outsider))

    def test_envelope_is_versioned_and_carries_ids_only(self):
        task = task_service.create_task(self.db, self.owner.id, {"title": "Write spec"})
        event = next(item for item in self.feed(self.owner)["events"] if item["type"] == "task.created")
        self.assertEqual(event["version"], event_service.EVENT_VERSION)
        self.assertEqual(event["entity"], {"type": "task", "id": task.id})
        self.assertNotIn("title", event["data"])
        self.assertTrue(event["event_id"])

    def test_private_project_events_are_hidden_from_members_without_access(self):
        team, project = self.team(visibility="private")
        task_service.create_task(self.db, self.owner.id, {"title": "Secret", "project_id": project["id"]})
        self.assertIn("task.created", self.types(self.owner))
        self.assertNotIn("task.created", self.types(self.member))
        collaboration_service.add_project_member(self.db, self.owner, project["id"], self.member.id, "viewer")
        self.assertIn("task.created", self.types(self.member))

    def test_removed_member_stops_seeing_workspace_events_but_hears_the_removal(self):
        team, project = self.team()
        cursor = self.feed(self.member)["cursor"]
        collaboration_service.remove_member(self.db, self.owner, team["id"], self.member.id)
        task_service.create_task(self.db, self.owner.id, {"title": "After removal", "project_id": project["id"]})
        seen = self.types(self.member, cursor)
        self.assertIn("workspace.member_removed", seen)
        self.assertNotIn("task.created", seen)

    def test_bootstrap_returns_a_cursor_without_history(self):
        task_service.create_task(self.db, self.owner.id, {"title": "Old"})
        first = event_service.list_events(self.db, self.owner, None, 100, now=later())
        self.assertEqual(first["events"], [])
        self.assertGreater(first["cursor"], 0)
        task_service.create_task(self.db, self.owner.id, {"title": "New"})
        self.assertEqual(self.types(self.owner, first["cursor"]).count("task.created"), 1)

    def test_cursor_holds_back_until_events_settle(self):
        task_service.create_task(self.db, self.owner.id, {"title": "Fresh"})
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        fresh = event_service.list_events(self.db, self.owner, 0, 100, now=now)
        self.assertTrue(fresh["events"])
        self.assertEqual(fresh["cursor"], 0)
        settled = event_service.list_events(self.db, self.owner, 0, 100, now=now + timedelta(seconds=10))
        self.assertGreater(settled["cursor"], 0)

    def test_pruned_history_asks_the_client_to_reset(self):
        for index in range(3):
            task_service.create_task(self.db, self.owner.id, {"title": f"Task {index}"})
        rows = self.db.scalars(select(DomainEvent).order_by(DomainEvent.id)).all()
        for row in rows[:-1]:
            row.created_at = datetime(2020, 1, 1)
        self.db.commit()
        event_service.prune(self.db)
        self.assertTrue(event_service.list_events(self.db, self.owner, 1, 100, now=later())["reset"])

    def test_unknown_event_types_are_rejected(self):
        with self.assertRaises(ValueError):
            event_service.emit(self.db, "task.exploded", entity_type="task", entity_id=1, user_id=self.owner.id)


class RecipientRuleTests(SyncTestCase):
    def notices(self, user):
        return notification_service.list_notifications(self.db, user.id, 50, 0)["items"]

    def test_assignee_is_notified_and_the_actor_is_not(self):
        team, project = self.team()
        task = task_service.create_task(self.db, self.owner.id, {
            "title": "Draft release notes", "project_id": project["id"], "assignee_id": self.member.id,
        })
        assigned = [item for item in self.notices(self.member) if item.event_type == "task.assigned"]
        self.assertEqual(len(assigned), 1)
        self.assertEqual(assigned[0].link, f"/tasks/{task.id}")
        self.assertEqual(assigned[0].actor_user_id, self.owner.id)
        self.assertFalse([item for item in self.notices(self.owner) if item.event_type == "task.assigned"])
        self.assertFalse(self.notices(self.outsider))

    def test_assignee_hears_about_completion_by_someone_else(self):
        team, project = self.team()
        task = task_service.create_task(self.db, self.owner.id, {
            "title": "QA pass", "project_id": project["id"], "assignee_id": self.member.id,
        })
        task_service.update_task(self.db, task, {"status": "completed"}, self.owner.id)
        self.assertIn("task.completed", [item.event_type for item in self.notices(self.member)])

    def test_cannot_assign_someone_outside_the_workspace(self):
        team, project = self.team()
        with self.assertRaises(CollaborationError):
            task_service.create_task(self.db, self.owner.id, {
                "title": "Nope", "project_id": project["id"], "assignee_id": self.outsider.id,
            })

    def test_member_removed_from_workspace_gets_no_more_task_notices(self):
        team, project = self.team()
        task = task_service.create_task(self.db, self.owner.id, {
            "title": "Ops", "project_id": project["id"], "assignee_id": self.member.id,
        })
        collaboration_service.remove_member(self.db, self.owner, team["id"], self.member.id)
        before = len(self.notices(self.member))
        task_service.update_task(self.db, task, {"status": "completed"}, self.owner.id)
        self.assertEqual(len(self.notices(self.member)), before)

    def test_invitation_role_and_project_notices(self):
        team = collaboration_service.create_team_workspace(self.db, self.owner, "Design", None)
        collaboration_service.create_invitation(self.db, self.owner, team["id"], self.member.email, "member")
        self.assertIn("invitation.created", [item.event_type for item in self.notices(self.member)])
        pending = collaboration_service.list_my_invitations(self.db, self.member)
        self.assertEqual(len(pending), 1)
        with self.assertRaises(CollaborationError) as other:
            collaboration_service.respond_to_invitation(self.db, self.outsider, pending[0]["id"], True)
        self.assertEqual(other.exception.status_code, 404)
        collaboration_service.respond_to_invitation(self.db, self.member, pending[0]["id"], True)
        self.assertIn("invitation.accepted", [item.event_type for item in self.notices(self.owner)])
        collaboration_service.change_member_role(self.db, self.owner, team["id"], self.member.id, "admin")
        self.assertIn("workspace.role_changed", [item.event_type for item in self.notices(self.member)])
        project = collaboration_service.create_project(self.db, self.owner, team["id"], {"name": "Brand"})
        collaboration_service.add_project_member(self.db, self.owner, project["id"], self.member.id, "editor")
        milestone = collaboration_service.create_milestone(self.db, self.owner, project["id"], {"name": "Beta"})
        collaboration_service.update_milestone(self.db, self.owner, project["id"], milestone["id"], {"completed": True})
        member_types = [item.event_type for item in self.notices(self.member)]
        self.assertIn("project.member_added", member_types)
        self.assertIn("milestone.completed", member_types)
        self.assertNotIn("milestone.completed", [item.event_type for item in self.notices(self.owner)])

    def test_read_state_is_shared_and_published(self):
        task_service.create_task(self.db, self.owner.id, {"title": "Shared read"})
        notice = self.notices(self.owner)[0]
        notification_service.mark_read(self.db, self.owner.id, notice.id)
        self.assertIn("notification.read", self.types(self.owner))
        self.assertEqual(notification_service.unread_count(self.db, self.owner.id), 0)


class ReminderSchedulerTests(SyncTestCase):
    def test_tick_creates_reminders_with_no_client_and_is_idempotent(self):
        self.db.add(Task(user_id=self.owner.id, title="Overdue report", status="pending", priority="high",
                         due_date=datetime(2026, 11, 10)))
        self.db.commit()
        now = datetime(2026, 11, 16, 10, 0)
        first = job_service.run_tick(self.db, now)
        self.assertEqual(first["status"], "ok")
        self.assertGreaterEqual(first["reminders"]["created"], 1)
        second = job_service.run_tick(self.db, now + timedelta(minutes=10))
        self.assertEqual(second["reminders"]["created"], 0)

    def test_assigned_project_tasks_remind_the_assignee(self):
        team, project = self.team()
        task_service.create_task(self.db, self.owner.id, {
            "title": "Assigned and late", "project_id": project["id"], "assignee_id": self.member.id,
            "due_date": datetime(2026, 11, 10),
        })
        job_service.run_tick(self.db, datetime(2026, 11, 16, 10, 0))
        member_types = [item.type for item in notification_service.list_notifications(self.db, self.member.id, 50, 0)["items"]]
        owner_types = [item.type for item in notification_service.list_notifications(self.db, self.owner.id, 50, 0)["items"]]
        self.assertIn("overdue", member_types)
        self.assertNotIn("overdue", owner_types)

    def test_completed_tasks_cancel_and_moved_deadlines_recalculate(self):
        task = task_service.create_task(self.db, self.owner.id, {"title": "Moving target", "due_date": datetime(2026, 11, 17)})
        now = datetime(2026, 11, 16, 10, 0, tzinfo=timezone.utc)
        self.assertTrue(notification_service.sync_reminders(self.db, self.owner, "UTC", now))
        task_service.update_task(self.db, task, {"due_date": datetime(2026, 11, 15)})
        recalculated = notification_service.sync_reminders(self.db, self.owner, "UTC", now)
        self.assertIn("overdue", [item.type for item in recalculated])
        task_service.update_task(self.db, task, {"status": "completed"})
        self.assertEqual(notification_service.sync_reminders(self.db, self.owner, "UTC", now + timedelta(days=1)), [])

    def test_dismissed_reminders_do_not_come_back(self):
        self.db.add(Task(user_id=self.owner.id, title="Dismiss me", status="pending", due_date=datetime(2026, 11, 10)))
        self.db.commit()
        now = datetime(2026, 11, 16, 8, 0, tzinfo=timezone.utc)
        created = notification_service.sync_reminders(self.db, self.owner, "UTC", now)
        for notice in created:
            self.assertTrue(notification_service.dismiss(self.db, self.owner.id, notice.id))
        self.assertEqual(notification_service.sync_reminders(self.db, self.owner, "UTC", now), [])

    def test_digest_follows_the_users_timezone(self):
        self.owner.reminder_timezone = "Asia/Kolkata"
        self.db.add(Task(user_id=self.owner.id, title="Due today", status="pending", due_date=datetime(2026, 11, 16)))
        self.db.commit()
        before = notification_service.sync_reminders(self.db, self.owner, None, datetime(2026, 11, 16, 3, 0, tzinfo=timezone.utc))
        after = notification_service.sync_reminders(self.db, self.owner, None, datetime(2026, 11, 16, 3, 40, tzinfo=timezone.utc))
        self.assertNotIn("summary", [item.type for item in before])
        self.assertIn("summary", [item.type for item in after])

    def test_thresholds_turn_off_upcoming_reminders(self):
        notification_service.update_preferences(self.db, self.owner, {"upcoming_reminders_enabled": False})
        self.db.add(Task(user_id=self.owner.id, title="Tomorrow", status="pending", due_date=datetime(2026, 11, 17)))
        self.db.commit()
        created = notification_service.sync_reminders(self.db, self.owner, "UTC", datetime(2026, 11, 16, 8, 0, tzinfo=timezone.utc))
        self.assertNotIn("deadline", [item.type for item in created])

    def test_lease_blocks_an_overlapping_run(self):
        now = datetime(2026, 11, 16, 10, 0)
        holder = job_service.acquire_lease(self.db, "tick", 120, now)
        self.assertIsNotNone(holder)
        self.assertEqual(job_service.run_tick(self.db, now + timedelta(seconds=5))["status"], "skipped")
        job_service.release_lease(self.db, "tick", holder, {})
        self.assertEqual(job_service.run_tick(self.db, now + timedelta(seconds=10))["status"], "ok")

    def test_scheduler_endpoint_requires_the_secret(self):
        previous = os.environ.pop("CRON_SECRET", None)
        try:
            with self.assertRaises(HTTPException) as missing:
                _authorize_scheduler("Bearer anything")
            self.assertEqual(missing.exception.status_code, 503)
            os.environ["CRON_SECRET"] = "s3cret-value"
            with self.assertRaises(HTTPException) as wrong:
                _authorize_scheduler("Bearer wrong")
            self.assertEqual(wrong.exception.status_code, 401)
            _authorize_scheduler("Bearer s3cret-value")
        finally:
            os.environ.pop("CRON_SECRET", None)
            if previous is not None:
                os.environ["CRON_SECRET"] = previous


class PushDeliveryTests(SyncTestCase):
    def setUp(self):
        super().setUp()
        # Built before any device exists, so setup notices (invite, accepted) queue no pushes.
        _team, self.project = self.team()

    def deliveries(self):
        return self.db.scalars(select(NotificationDelivery)).all()

    def assign_to_member(self):
        return task_service.create_task(self.db, self.owner.id, {
            "title": "Push me", "project_id": self.project["id"], "assignee_id": self.member.id,
        })

    def test_token_validation(self):
        with self.assertRaises(ValidationError):
            PushTokenRegister(device_id="device-0001", platform="android", provider="expo", token="not-a-token")
        with self.assertRaises(ValidationError):
            PushTokenRegister(device_id="device-0001", platform="web", provider="webpush", token="http://insecure.example")
        PushTokenRegister(device_id="device-0001", platform="ios", provider="expo", token=EXPO_TOKEN)

    def test_devices_are_private_and_masked(self):
        self.register(self.member)
        listed = device_service.list_devices(self.db, self.member)
        self.assertEqual(len(listed), 1)
        self.assertNotIn(EXPO_TOKEN, str(listed))
        self.assertEqual(device_service.list_devices(self.db, self.outsider), [])
        self.assertFalse(device_service.unregister(self.db, self.outsider, "device-0001"))
        self.assertTrue(device_service.unregister(self.db, self.member, "device-0001"))

    def test_a_token_moves_with_the_signed_in_account(self):
        self.register(self.member)
        self.register(self.outsider, device_id="device-0002")
        rows = self.db.scalars(select(DevicePushToken)).all()
        self.assertEqual([row.user_id for row in rows], [self.outsider.id])

    def test_outbox_rows_only_for_other_peoples_actions_and_reminders(self):
        self.register(self.owner, device_id="owner-device")
        self.register(self.member, device_id="member-device", token="ExponentPushToken[zyxwvutsrqponmlk]")
        self.assign_to_member()
        rows = self.deliveries()
        self.assertEqual({row.user_id for row in rows}, {self.member.id})

    def test_drain_sends_once_and_records_the_ticket(self):
        self.register(self.member)
        self.assign_to_member()
        expo = FakeExpo()
        counts = push_service.drain(self.db, later(), expo_transport=expo)
        self.assertEqual(counts["sent"], 1)
        self.assertEqual(expo.sent[0]["to"], EXPO_TOKEN)
        self.assertIn("link", expo.sent[0]["data"])
        self.assertEqual(push_service.drain(self.db, later(), expo_transport=expo)["sent"], 0)
        row = self.deliveries()[0]
        self.assertEqual((row.status, row.provider_ticket_id), ("sent", "ticket-1"))
        self.assertIsNotNone(self.db.scalar(select(Notification).where(Notification.id == row.notification_id)))

    def test_unregistered_devices_are_disabled(self):
        self.register(self.member)
        self.assign_to_member()
        push_service.drain(self.db, later(), expo_transport=FakeExpo(
            ticket={"status": "error", "message": "gone", "details": {"error": "DeviceNotRegistered"}}
        ))
        device = self.db.scalars(select(DevicePushToken)).one()
        self.assertIsNotNone(device.disabled_at)

    def test_provider_outage_is_retried_with_backoff(self):
        self.register(self.member)
        self.assign_to_member()

        def down(_url, _body):
            raise OSError("network down")

        now = later()
        counts = push_service.drain(self.db, now, expo_transport=down)
        row = self.deliveries()[0]
        self.assertEqual(counts["retry"], 1)
        self.assertEqual((row.status, row.attempts), ("pending", 1))
        self.assertGreater(row.next_attempt_at, now)

    def test_quiet_hours_defer_and_reading_cancels(self):
        self.register(self.member)
        notification_service.update_preferences(self.db, self.member, {
            "quiet_hours_enabled": True, "quiet_hours_start": "00:00", "quiet_hours_end": "23:59", "timezone": "UTC",
        })
        self.assign_to_member()
        row = self.deliveries()[0]
        self.assertGreater(row.next_attempt_at, later())
        notification_service.mark_all_read(self.db, self.member.id)
        self.assertEqual(self.deliveries()[0].status, "cancelled")
        # Drain also skips if a pending row races with a read that did not cancel yet.
        notice = self.db.scalars(select(Notification).where(Notification.user_id == self.member.id)).first()
        device = self.db.scalars(select(DevicePushToken).where(DevicePushToken.user_id == self.member.id)).one()
        orphan = NotificationDelivery(
            notification_id=notice.id,
            user_id=self.member.id,
            device_token_id=device.id,
            channel="expo",
            status="pending",
            attempts=0,
            next_attempt_at=datetime(2020, 1, 1),
        )
        self.db.add(orphan)
        self.db.commit()
        notification_service.update_preferences(self.db, self.member, {"quiet_hours_enabled": False})
        counts = push_service.drain(self.db, later(), expo_transport=FakeExpo())
        self.assertEqual(counts["skipped"], 1)
        self.assertEqual(orphan.status, "cancelled")

    def test_web_push_is_reported_unconfigured_rather_than_sent(self):
        for name in ("VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"):
            os.environ.pop(name, None)
        device_service.register(self.db, self.member, {
            "device_id": "browser-0001", "platform": "web", "provider": "webpush",
            "token": "https://push.example.com/abc", "keys": {"p256dh": "p" * 20, "auth": "a" * 12},
        })
        self.assign_to_member()
        counts = push_service.drain(self.db, later(), web_transport=lambda *_: self.fail("must not send"))
        self.assertEqual(counts["failed"], 1)
        self.assertIn("not configured", self.deliveries()[0].last_error)

    def test_receipts_mark_delivery(self):
        self.register(self.member)
        self.assign_to_member()
        sent_at = later()
        push_service.drain(self.db, sent_at, expo_transport=FakeExpo())
        counts = push_service.check_receipts(
            self.db, sent_at + timedelta(minutes=20), transport=FakeExpo(receipts={"ticket-1": {"status": "ok"}})
        )
        self.assertEqual(counts["delivered"], 1)
        self.assertEqual(self.deliveries()[0].status, "delivered")

    def test_push_off_creates_no_outbox_rows(self):
        self.register(self.member)
        notification_service.update_preferences(self.db, self.member, {"push_enabled": False})
        self.assign_to_member()
        self.assertEqual(self.deliveries(), [])
        self.assertTrue(notification_service.list_notifications(self.db, self.member.id, 10, 0)["items"])

    def test_web_push_sends_when_vapid_configured(self):
        os.environ["VAPID_PUBLIC_KEY"] = "public-test-key"
        os.environ["VAPID_PRIVATE_KEY"] = "private-test-key"
        try:
            device_service.register(self.db, self.member, {
                "device_id": "browser-0002", "platform": "web", "provider": "webpush",
                "token": "https://push.example.com/xyz", "keys": {"p256dh": "p" * 20, "auth": "a" * 12},
            })
            self.assign_to_member()
            sent = []

            def fake_web(device, payload):
                sent.append((device.token, payload))

            counts = push_service.drain(self.db, later(), web_transport=fake_web)
            self.assertEqual(counts["sent"], 1)
            self.assertEqual(sent[0][0], "https://push.example.com/xyz")
            self.assertEqual(self.deliveries()[0].status, "sent")
            self.assertTrue(push_service.web_push_config()["enabled"])
        finally:
            os.environ.pop("VAPID_PUBLIC_KEY", None)
            os.environ.pop("VAPID_PRIVATE_KEY", None)

    def test_multiple_devices_get_separate_delivery_rows(self):
        self.register(self.member, device_id="phone-a", token="ExponentPushToken[aaaaaaaaaaaaaaaa]")
        self.register(self.member, device_id="phone-b", token="ExponentPushToken[bbbbbbbbbbbbbbbb]")
        self.assign_to_member()
        rows = self.deliveries()
        self.assertEqual(len(rows), 2)
        self.assertEqual(len({row.device_token_id for row in rows}), 2)


class MilestoneReminderTests(SyncTestCase):
    def test_open_milestones_create_approaching_reminders(self):
        team, project = self.team()
        collaboration_service.create_milestone(
            self.db, self.owner, project["id"],
            {"name": "Launch gate", "target_date": datetime(2026, 11, 17)},
        )
        created = notification_service.sync_reminders(
            self.db, self.owner, "UTC", datetime(2026, 11, 16, 9, 5, tzinfo=timezone.utc)
        )
        milestone_types = [item.type for item in created if item.type == "milestone"]
        self.assertEqual(len(milestone_types), 1)
        again = notification_service.sync_reminders(
            self.db, self.owner, "UTC", datetime(2026, 11, 16, 9, 10, tzinfo=timezone.utc)
        )
        self.assertEqual([item.type for item in again if item.type == "milestone"], [])

    def test_outsider_does_not_see_milestone_reminders(self):
        team, project = self.team()
        collaboration_service.create_milestone(
            self.db, self.owner, project["id"],
            {"name": "Private gate", "target_date": datetime(2026, 11, 10)},
        )
        created = notification_service.sync_reminders(
            self.db, self.outsider, "UTC", datetime(2026, 11, 16, 10, 0, tzinfo=timezone.utc)
        )
        self.assertEqual([item for item in created if item.type == "milestone"], [])


class SecurityIsolationTests(SyncTestCase):
    def test_notification_read_is_owner_only(self):
        task_service.create_task(self.db, self.owner.id, {"title": "Mine"})
        notice = notification_service.list_notifications(self.db, self.owner.id, 10, 0)["items"][0]
        self.assertIsNone(notification_service.mark_read(self.db, self.member.id, notice.id))
        self.assertEqual(notification_service.unread_count(self.db, self.owner.id), 1)

    def test_personal_task_without_workspace_stays_compatible(self):
        task = task_service.create_task(self.db, self.owner.id, {"title": "Legacy personal"})
        self.assertIsNone(task.workspace_id)
        self.assertIsNone(task.project_id)
        listed = task_service.list_tasks(self.db, self.owner.id)
        self.assertTrue(any(item.id == task.id for item in listed))


class SchemaSafetyTests(unittest.TestCase):
    def test_sync_tables_create_with_constraints(self):
        engine = memory_engine()
        Base.metadata.create_all(engine)
        names = set(Base.metadata.tables)
        for required in (
            "domain_event",
            "device_push_token",
            "notification_delivery",
            "job_lease",
            "notification",
        ):
            self.assertIn(required, names)
        device_table = Base.metadata.tables["device_push_token"]
        constraint_names = {constraint.name for constraint in device_table.constraints if constraint.name}
        self.assertIn("uq_device_push_token_user_device", constraint_names)
        delivery_table = Base.metadata.tables["notification_delivery"]
        delivery_names = {constraint.name for constraint in delivery_table.constraints if constraint.name}
        self.assertIn("uq_delivery_notice_device", delivery_names)
        engine.dispose()


class EndpointIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.engine = memory_engine()
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()
        self.user = User(name="Akshat", email="endpoint@example.com", password_hash="x")
        self.other = User(name="Other", email="other@example.com", password_hash="x")
        self.db.add_all([self.user, self.other])
        self.db.commit()

        from app.database import get_db
        from app.main import app
        from app.services.auth_service import create_access_token
        from fastapi.testclient import TestClient

        def override_db():
            session = self.Session()
            try:
                yield session
            finally:
                session.close()

        app.dependency_overrides[get_db] = override_db
        self.app = app
        # Lifespan would call init_db() against the process DATABASE_URL; skip it.
        self.client = TestClient(app, raise_server_exceptions=True)
        self.token = create_access_token(self.user)
        self.other_token = create_access_token(self.other)
        self.headers = {"Authorization": f"Bearer {self.token}"}

    def tearDown(self):
        self.app.dependency_overrides.clear()
        self.db.close()
        self.engine.dispose()

    def test_events_devices_unread_and_cron_endpoints(self):
        task_service.create_task(self.db, self.user.id, {"title": "Via API"})
        self.db.commit()

        bootstrap = self.client.get("/api/events", headers=self.headers)
        self.assertEqual(bootstrap.status_code, 200)
        cursor = bootstrap.json()["cursor"]
        settled = self.client.get(f"/api/events?after={cursor}", headers=self.headers)
        self.assertEqual(settled.status_code, 200)

        register = self.client.post(
            "/api/devices/push-tokens",
            headers=self.headers,
            json={"device_id": "phone-01", "platform": "android", "provider": "expo", "token": EXPO_TOKEN},
        )
        self.assertEqual(register.status_code, 200, register.text)
        self.assertEqual(self.client.get("/api/devices", headers=self.headers).status_code, 200)
        stolen = self.client.delete(
            "/api/devices/push-tokens/phone-01",
            headers={"Authorization": f"Bearer {self.other_token}"},
        )
        self.assertEqual(stolen.status_code, 404)
        removed = self.client.delete("/api/devices/push-tokens/phone-01", headers=self.headers)
        self.assertEqual(removed.status_code, 200)

        unread = self.client.get("/api/notifications/unread-count", headers=self.headers)
        self.assertEqual(unread.status_code, 200)
        self.assertIn("unread_count", unread.json())

        previous = os.environ.pop("CRON_SECRET", None)
        try:
            os.environ["CRON_SECRET"] = "endpoint-secret"
            denied = self.client.post("/api/internal/jobs/tick")
            self.assertEqual(denied.status_code, 401)
            ok = self.client.post(
                "/api/internal/jobs/tick",
                headers={"Authorization": "Bearer endpoint-secret"},
            )
            self.assertEqual(ok.status_code, 200)
            self.assertIn(ok.json()["status"], {"ok", "skipped"})
            config = self.client.get("/api/devices/web-push/config", headers=self.headers)
            self.assertEqual(config.status_code, 200)
            self.assertIn("enabled", config.json())
        finally:
            os.environ.pop("CRON_SECRET", None)
            if previous is not None:
                os.environ["CRON_SECRET"] = previous

    def test_unauthenticated_sync_routes_are_rejected(self):
        self.assertEqual(self.client.get("/api/events").status_code, 401)
        self.assertEqual(self.client.get("/api/devices").status_code, 401)
        self.assertEqual(self.client.get("/api/notifications/unread-count").status_code, 401)


if __name__ == "__main__":
    unittest.main()
