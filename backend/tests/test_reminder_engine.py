import unittest
from datetime import datetime, timedelta, timezone

from app.services.reminder_engine import ReminderPreferences, plan_reminders


class TaskStub:
    def __init__(self, **kwargs):
        self.id = kwargs["id"]
        self.title = kwargs["title"]
        self.status = kwargs.get("status", "pending")
        self.priority = kwargs.get("priority", "medium")
        self.due_date = kwargs.get("due_date")


def plan(tasks, now, preferences=None, existing=None):
    return plan_reminders(tasks, preferences or ReminderPreferences(timezone="UTC"), now, existing or set())


class ReminderEngineTests(unittest.TestCase):
    def test_date_only_task_due_tomorrow_has_no_one_hour_alert(self):
        now = datetime(2026, 10, 27, 15, 0, tzinfo=timezone.utc)
        task = TaskStub(id=1, title="Finish API integration", due_date=datetime(2026, 10, 28))
        planned = plan([task], now)
        self.assertEqual([item.idempotency_key for item in planned], ["upcoming:1:2026-10-28:1d"])
        self.assertNotIn("one hour", planned[0].message)

    def test_date_only_due_today_is_a_summary_not_a_timed_alert(self):
        now = datetime(2026, 10, 27, 9, 30, tzinfo=timezone.utc)
        task = TaskStub(id=2, title="Complete mobile QA", due_date=datetime(2026, 10, 27))
        planned = plan([task], now)
        self.assertEqual(len(planned), 1)
        self.assertEqual(planned[0].type, "summary")
        self.assertIn("1 task due today", planned[0].message)
        self.assertIn("Complete mobile QA", planned[0].message)
        self.assertNotIn("one hour", planned[0].message)

    def test_overdue_incomplete_task_is_included_once(self):
        now = datetime(2026, 10, 27, 9, 0, tzinfo=timezone.utc)
        task = TaskStub(id=3, title="database migration", priority="high", due_date=datetime(2026, 10, 25))
        planned = plan([task], now)
        overdue = [item for item in planned if item.type == "overdue"]
        self.assertEqual(len(overdue), 1)
        self.assertIn("overdue by 2 days", overdue[0].message)
        again = plan([task], now, existing={item.idempotency_key for item in planned})
        self.assertEqual(again, [])

    def test_completed_and_deleted_tasks_do_not_generate_reminders(self):
        now = datetime(2026, 10, 27, 12, 0, tzinfo=timezone.utc)
        completed = TaskStub(id=4, title="Done", status="completed", due_date=datetime(2026, 10, 26))
        self.assertEqual(plan([completed], now), [])

    def test_changing_the_due_date_uses_a_new_key(self):
        now = datetime(2026, 10, 27, 12, 0, tzinfo=timezone.utc)
        first = TaskStub(id=5, title="Report", due_date=datetime(2026, 10, 28))
        moved = TaskStub(id=5, title="Report", due_date=datetime(2026, 10, 29))
        first_keys = {item.idempotency_key for item in plan([first], now)}
        moved_keys = {item.idempotency_key for item in plan([moved], now)}
        self.assertTrue(first_keys)
        self.assertTrue(moved_keys.isdisjoint(first_keys))

    def test_daily_summary_respects_time_timezone_and_preference(self):
        early = datetime(2026, 10, 27, 3, 0, tzinfo=timezone.utc)  # 08:30 in Kolkata
        ready = datetime(2026, 10, 27, 3, 30, tzinfo=timezone.utc)  # 09:00 in Kolkata
        task = TaskStub(id=6, title="QA", due_date=datetime(2026, 10, 27))
        preferences = ReminderPreferences(timezone="Asia/Kolkata")
        self.assertEqual(plan([task], early, preferences), [])
        self.assertEqual(plan([task], ready, preferences)[0].type, "summary")
        disabled = ReminderPreferences(timezone="Asia/Kolkata", daily_reminders_enabled=False)
        self.assertEqual(plan([task], ready, disabled), [])

    def test_date_rollover_uses_the_user_local_day(self):
        # 02:00 UTC on the 28th is still 19:00 on the 27th in Los Angeles.
        now = datetime(2026, 10, 28, 2, 0, tzinfo=timezone.utc)
        task = TaskStub(id=7, title="Rollover", due_date=datetime(2026, 10, 27))
        planned = plan([task], now, ReminderPreferences(timezone="America/Los_Angeles"))
        summary = next(item for item in planned if item.type == "summary")
        self.assertEqual(summary.idempotency_key, "summary:2026-10-27")

    def test_timed_deadline_uses_24_hour_and_1_hour_windows(self):
        due = datetime(2026, 10, 28, 15, 0)
        task = TaskStub(id=8, title="Submit the project report", due_date=due)
        day_before = datetime(2026, 10, 27, 15, 0, tzinfo=timezone.utc)
        hour_before = datetime(2026, 10, 28, 14, 15, tzinfo=timezone.utc)
        at_due = datetime(2026, 10, 28, 15, 5, tzinfo=timezone.utc)
        self.assertIn("24h", plan([task], day_before)[0].idempotency_key)
        self.assertIn("in one hour", plan([task], hour_before)[0].message)
        self.assertIn("Due now", plan([task], at_due)[0].message)

    def test_overdue_reminders_can_be_disabled(self):
        now = datetime(2026, 10, 27, 12, 0, tzinfo=timezone.utc)
        task = TaskStub(id=9, title="Old work", due_date=datetime(2026, 10, 20))
        preferences = ReminderPreferences(overdue_reminders_enabled=False)
        self.assertEqual(plan([task], now, preferences), [])

    def test_summary_is_skipped_before_the_saved_time(self):
        now = datetime(2026, 10, 27, 8, 59, tzinfo=timezone.utc)
        task = TaskStub(id=10, title="Morning task", due_date=datetime(2026, 10, 27))
        self.assertEqual(plan([task], now), [])


if __name__ == "__main__":
    unittest.main()
