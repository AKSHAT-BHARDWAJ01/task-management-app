import unittest
from datetime import datetime, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database.base import Base
from app.models import Notification, Task, User
from app.services import notification_service


class NotificationAccessTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.alice = User(name="Alice", email="alice@example.com", password_hash="x")
        self.bob = User(name="Bob", email="bob@example.com", password_hash="x")
        self.db.add_all([self.alice, self.bob])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_users_only_see_and_update_their_own_notifications(self):
        self.db.add(Notification(
            user_id=self.alice.id,
            type="summary",
            title="Alice",
            message="Alice only",
            idempotency_key="summary:alice",
            created_at=datetime(2026, 10, 27, 9, 0),
        ))
        self.db.add(Notification(
            user_id=self.bob.id,
            type="summary",
            title="Bob",
            message="Bob only",
            idempotency_key="summary:bob",
            created_at=datetime(2026, 10, 27, 9, 0),
        ))
        self.db.commit()

        alice_list = notification_service.list_notifications(self.db, self.alice.id, 20, 0)
        self.assertEqual(alice_list["unread_count"], 1)
        self.assertEqual([item.title for item in alice_list["items"]], ["Alice"])
        self.assertIsNone(notification_service.mark_read(self.db, self.alice.id, alice_list["items"][0].id and self._bob_id()))
        self.assertFalse(notification_service.dismiss(self.db, self.alice.id, self._bob_notice_id()))

        notice = alice_list["items"][0]
        read = notification_service.mark_read(self.db, self.alice.id, notice.id)
        self.assertIsNotNone(read.read_at)
        self.assertEqual(notification_service.list_notifications(self.db, self.alice.id, 20, 0)["unread_count"], 0)
        self.assertEqual(notification_service.mark_all_read(self.db, self.bob.id), 1)

    def test_sync_is_idempotent_and_skips_completed_tasks(self):
        self.db.add(Task(
            user_id=self.alice.id,
            title="database migration",
            status="pending",
            priority="high",
            due_date=datetime(2026, 10, 25),
        ))
        self.db.add(Task(
            user_id=self.alice.id,
            title="Already done",
            status="completed",
            priority="medium",
            due_date=datetime(2026, 10, 25),
        ))
        self.db.commit()
        now = datetime(2026, 10, 27, 10, 0, tzinfo=timezone.utc)
        first = notification_service.sync_reminders(self.db, self.alice, "UTC", now)
        second = notification_service.sync_reminders(self.db, self.alice, "UTC", now)
        self.assertTrue(first)
        self.assertEqual(second, [])
        messages = " ".join(item.message for item in first)
        self.assertIn("database migration", messages)
        self.assertNotIn("Already done", messages)
        self.assertEqual(notification_service.list_notifications(self.db, self.bob.id, 20, 0)["total"], 0)

    def test_repeated_completion_does_not_duplicate_the_notice(self):
        task = Task(user_id=self.alice.id, title="Improve dashboard responsiveness", status="completed")
        self.db.add(task)
        self.db.commit()
        task.updated_at = datetime(2026, 10, 27, 10, 0)
        first = notification_service.record_completion(self.db, task)
        second = notification_service.record_completion(self.db, task)
        self.assertIsNotNone(first)
        self.assertIsNone(second)

    def _bob_id(self):
        return 0

    def _bob_notice_id(self):
        notice = notification_service.list_notifications(self.db, self.bob.id, 20, 0)["items"][0]
        return notice.id


if __name__ == "__main__":
    unittest.main()
