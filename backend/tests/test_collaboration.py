import unittest
from datetime import datetime, timedelta

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.database.base import Base
from app.models import ProjectActivity, Task, User, WorkspaceInvitation
from app.services import collaboration_service, task_service
from app.services.collaboration_service import CollaborationError


class CollaborationTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
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

    def test_personal_workspace_is_created_once_and_team_workspace_is_separate(self):
        first = collaboration_service.list_workspaces(self.db, self.owner)
        second = collaboration_service.list_workspaces(self.db, self.owner)
        self.assertEqual(len(first), 1)
        self.assertEqual(first[0]["workspace_type"], "personal")
        self.assertEqual(first[0]["role"], "owner")
        self.assertEqual(len(second), 1)
        team = collaboration_service.create_team_workspace(self.db, self.owner, "Julley Product Team", "Ship the release")
        self.assertEqual(team["workspace_type"], "team")
        self.assertEqual(len(collaboration_service.list_workspaces(self.db, self.owner)), 2)

    def test_member_cannot_delete_workspace_or_invite_an_admin(self):
        team = collaboration_service.create_team_workspace(self.db, self.owner, "TaskFlow Development", None)
        invite = collaboration_service.create_invitation(self.db, self.owner, team["id"], self.member.email, "member")
        collaboration_service.accept_invitation(self.db, self.member, invite["token"])
        with self.assertRaises(CollaborationError) as deleted:
            collaboration_service.delete_workspace(self.db, self.member, team["id"])
        self.assertEqual(deleted.exception.status_code, 403)
        with self.assertRaises(CollaborationError) as invited:
            collaboration_service.create_invitation(self.db, self.member, team["id"], self.outsider.email, "admin")
        self.assertEqual(invited.exception.status_code, 403)

    def test_invitation_stores_only_a_hash_and_requires_the_invited_email(self):
        team = collaboration_service.create_team_workspace(self.db, self.owner, "Julley Product Team", None)
        invite = collaboration_service.create_invitation(self.db, self.owner, team["id"], self.member.email, "member")
        stored = self.db.get(WorkspaceInvitation, invite["id"])
        self.assertNotIn(invite["token"], stored.token_hash)
        self.assertEqual(stored.token_hash, collaboration_service.hash_token(invite["token"]))
        self.assertEqual(invite["delivery"], "link")
        with self.assertRaises(CollaborationError) as wrong:
            collaboration_service.accept_invitation(self.db, self.outsider, invite["token"])
        self.assertEqual(wrong.exception.status_code, 403)
        joined = collaboration_service.accept_invitation(self.db, self.member, invite["token"])
        self.assertEqual(joined["workspace_id"], team["id"])
        with self.assertRaises(CollaborationError):
            collaboration_service.accept_invitation(self.db, self.member, invite["token"])

    def test_owner_cannot_be_removed_and_private_projects_stay_hidden(self):
        team = collaboration_service.create_team_workspace(self.db, self.owner, "Julley Product Team", None)
        invite = collaboration_service.create_invitation(self.db, self.owner, team["id"], self.member.email, "member")
        collaboration_service.accept_invitation(self.db, self.member, invite["token"])
        with self.assertRaises(CollaborationError) as removed:
            collaboration_service.remove_member(self.db, self.member, team["id"], self.owner.id)
        self.assertEqual(removed.exception.status_code, 403)
        private = collaboration_service.create_project(
            self.db, self.owner, team["id"], {"name": "Quiet launch", "visibility": "private"}
        )
        with self.assertRaises(CollaborationError) as hidden:
            collaboration_service.get_project(self.db, self.member, private["id"])
        self.assertEqual(hidden.exception.status_code, 404)
        visible = [item["id"] for item in collaboration_service.list_projects(self.db, self.member, team["id"], {})]
        self.assertNotIn(private["id"], visible)
        collaboration_service.add_project_member(self.db, self.owner, private["id"], self.member.id, "viewer")
        self.assertEqual(collaboration_service.get_project(self.db, self.member, private["id"])["name"], "Quiet launch")

    def test_personal_tasks_stay_on_the_old_list_and_project_tasks_do_not(self):
        personal = task_service.create_task(self.db, self.owner.id, {"title": "Buy milk", "description": ""})
        team = collaboration_service.create_team_workspace(self.db, self.owner, "Julley Product Team", None)
        project = collaboration_service.create_project(self.db, self.owner, team["id"], {"name": "API"})
        project_task = task_service.create_task(
            self.db,
            self.owner.id,
            {"title": "API integration", "description": "", "project_id": project["id"], "assignee_id": self.owner.id},
        )
        listed = task_service.list_tasks(self.db, self.owner.id)
        self.assertEqual([task.id for task in listed], [personal.id])
        self.assertEqual(task_service.get_task_stats(self.db, self.owner.id)["total_tasks"], 1)
        self.assertIsNone(personal.project_id)
        self.assertEqual(project_task.project_id, project["id"])
        self.assertEqual(project_task.user_id, self.owner.id)
        board = collaboration_service.list_project_tasks(self.db, self.owner, project["id"])
        self.assertEqual([task.title for task in board], ["API integration"])
        with self.assertRaises(CollaborationError):
            task_service.create_task(
                self.db,
                self.owner.id,
                {"title": "Nope", "description": "", "project_id": project["id"], "assignee_id": self.outsider.id},
            )

    def test_milestone_progress_activity_and_archive_keep_tasks(self):
        team = collaboration_service.create_team_workspace(self.db, self.owner, "Julley Product Team", None)
        project = collaboration_service.create_project(self.db, self.owner, team["id"], {"name": "Launch"})
        milestone = collaboration_service.create_milestone(
            self.db,
            self.owner,
            project["id"],
            {"name": "Backend API Complete", "target_date": "2020-01-01"},
        )
        self.assertEqual(milestone["status"], "overdue")
        self.assertEqual(milestone["completion_percent"], 0)
        task = task_service.create_task(
            self.db,
            self.owner.id,
            {
                "title": "Ship endpoints",
                "description": "",
                "project_id": project["id"],
                "milestone_id": milestone["id"],
            },
        )
        task_service.update_task(self.db, task, {"status": "completed"}, self.owner.id)
        refreshed = collaboration_service.list_milestones(self.db, self.owner, project["id"])[0]
        self.assertEqual(refreshed["completion_percent"], 100)
        completed = collaboration_service.update_milestone(
            self.db, self.owner, project["id"], milestone["id"], {"completed": True}
        )
        self.assertEqual(completed["status"], "completed")
        activity = collaboration_service.list_activity(self.db, self.owner, project["id"], 20, 0)
        descriptions = " ".join(item["description"] for item in activity["items"])
        self.assertIn("created the project Launch", descriptions)
        self.assertIn("completed Ship endpoints", descriptions)
        archived = collaboration_service.archive_project(self.db, self.owner, project["id"])
        self.assertIsNotNone(archived["archived_at"])
        kept = self.db.get(Task, task.id)
        self.assertEqual(kept.project_id, project["id"])
        self.assertGreater(self.db.scalar(select(ProjectActivity.id).limit(1)), 0)

    def test_expired_invitation_cannot_be_used(self):
        team = collaboration_service.create_team_workspace(self.db, self.owner, "Julley Product Team", None)
        invite = collaboration_service.create_invitation(self.db, self.owner, team["id"], self.member.email, "member")
        stored = self.db.get(WorkspaceInvitation, invite["id"])
        stored.expires_at = datetime.utcnow() - timedelta(days=1)
        self.db.commit()
        with self.assertRaises(CollaborationError) as expired:
            collaboration_service.accept_invitation(self.db, self.member, invite["token"])
        self.assertEqual(expired.exception.status_code, 410)


if __name__ == "__main__":
    unittest.main()
