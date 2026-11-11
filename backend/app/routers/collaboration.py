from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.schemas.task import TaskRead
from app.services.auth_service import get_current_user
from app.services import collaboration_service


collaboration_router = APIRouter(prefix="/api", tags=["Collaboration"])


class WorkspaceCreate(BaseModel):
    name: str = Field(max_length=120)
    description: str | None = Field(default=None, max_length=500)


class WorkspaceUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=500)


class TransferOwner(BaseModel):
    user_id: int


class RoleChange(BaseModel):
    role: str


class InvitationCreate(BaseModel):
    email: str
    role: str = "member"


class TokenBody(BaseModel):
    token: str


class ProjectWrite(BaseModel):
    name: str | None = Field(default=None, max_length=160)
    description: str | None = Field(default=None, max_length=1000)
    lead_user_id: int | None = None
    status: str | None = None
    health: str | None = None
    priority: str | None = None
    visibility: str | None = None
    start_date: str | None = None
    target_date: str | None = None
    icon: str | None = None
    colour: str | None = None


class ProjectMemberWrite(BaseModel):
    user_id: int
    role: str = "editor"


class MilestoneWrite(BaseModel):
    name: str | None = Field(default=None, max_length=160)
    description: str | None = Field(default=None, max_length=500)
    target_date: str | None = None
    completed: bool | None = None


@collaboration_router.get("/workspaces")
def get_workspaces(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return collaboration_service.list_workspaces(db, current_user)


@collaboration_router.post("/workspaces", status_code=201)
def post_workspace(payload: WorkspaceCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return collaboration_service.create_team_workspace(db, current_user, payload.name, payload.description)


@collaboration_router.patch("/workspaces/{workspace_id}")
def patch_workspace(
    workspace_id: int,
    payload: WorkspaceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return collaboration_service.update_workspace(db, current_user, workspace_id, payload.model_dump(exclude_unset=True))


@collaboration_router.delete("/workspaces/{workspace_id}")
def remove_workspace(workspace_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    collaboration_service.delete_workspace(db, current_user, workspace_id)
    return {"message": "Workspace deleted"}


@collaboration_router.post("/workspaces/{workspace_id}/transfer")
def transfer_workspace(
    workspace_id: int,
    payload: TransferOwner,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return collaboration_service.transfer_ownership(db, current_user, workspace_id, payload.user_id)


@collaboration_router.get("/workspaces/{workspace_id}/members")
def get_members(workspace_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return collaboration_service.list_members(db, current_user, workspace_id)


@collaboration_router.patch("/workspaces/{workspace_id}/members/{member_user_id}")
def patch_member(
    workspace_id: int,
    member_user_id: int,
    payload: RoleChange,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return collaboration_service.change_member_role(db, current_user, workspace_id, member_user_id, payload.role)


@collaboration_router.delete("/workspaces/{workspace_id}/members/{member_user_id}")
def delete_member(
    workspace_id: int,
    member_user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    collaboration_service.remove_member(db, current_user, workspace_id, member_user_id)
    return {"message": "Member removed"}


@collaboration_router.post("/workspaces/{workspace_id}/invitations", status_code=201)
def post_invitation(
    workspace_id: int,
    payload: InvitationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return collaboration_service.create_invitation(db, current_user, workspace_id, payload.email, payload.role)


@collaboration_router.get("/workspaces/{workspace_id}/invitations")
def get_invitations(workspace_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return collaboration_service.list_invitations(db, current_user, workspace_id)


@collaboration_router.post("/workspaces/{workspace_id}/invitations/{invitation_id}/revoke")
def post_revoke(
    workspace_id: int,
    invitation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return collaboration_service.revoke_invitation(db, current_user, workspace_id, invitation_id)


@collaboration_router.post("/workspaces/{workspace_id}/invitations/{invitation_id}/resend")
def post_resend(
    workspace_id: int,
    invitation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return collaboration_service.resend_invitation(db, current_user, workspace_id, invitation_id)


@collaboration_router.get("/invitations/preview")
def preview_invitation(token: str = Query(min_length=10), db: Session = Depends(get_db)):
    return collaboration_service.preview_invitation(db, token)


@collaboration_router.post("/invitations/accept")
def accept_invitation(payload: TokenBody, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return collaboration_service.accept_invitation(db, current_user, payload.token)


@collaboration_router.post("/invitations/decline")
def decline_invitation(payload: TokenBody, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    collaboration_service.decline_invitation(db, current_user, payload.token)
    return {"message": "Invitation declined"}


@collaboration_router.get("/workspaces/{workspace_id}/projects")
def get_projects(
    workspace_id: int,
    search: str | None = None,
    status: str | None = None,
    health: str | None = None,
    lead_user_id: int | None = None,
    archived: bool = False,
    sort: str = "name",
    target_after: str | None = None,
    target_before: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return collaboration_service.list_projects(
        db,
        current_user,
        workspace_id,
        {
            "search": search,
            "status": status,
            "health": health,
            "lead_user_id": lead_user_id,
            "archived": archived,
            "sort": sort,
            "target_after": target_after,
            "target_before": target_before,
        },
    )


@collaboration_router.post("/workspaces/{workspace_id}/projects", status_code=201)
def post_project(
    workspace_id: int,
    payload: ProjectWrite,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return collaboration_service.create_project(db, current_user, workspace_id, payload.model_dump(exclude_unset=True))


@collaboration_router.get("/projects/{project_id}")
def get_project(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return collaboration_service.get_project(db, current_user, project_id)


@collaboration_router.get("/projects/{project_id}/analytics")
def get_analytics(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    project = collaboration_service.get_project(db, current_user, project_id)
    milestones = collaboration_service.list_milestones(db, current_user, project_id)
    return {
        "total_tasks": project["total_tasks"],
        "completed_tasks": project["completed_tasks"],
        "in_progress_tasks": project["in_progress_tasks"],
        "pending_tasks": project["pending_tasks"],
        "overdue_tasks": project["overdue_tasks"],
        "completion_percent": project["completion_percent"],
        "by_priority": project["by_priority"],
        "by_assignee": project["by_assignee"],
        "milestones": milestones,
    }


@collaboration_router.patch("/projects/{project_id}")
def patch_project(
    project_id: int,
    payload: ProjectWrite,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return collaboration_service.update_project(db, current_user, project_id, payload.model_dump(exclude_unset=True))


@collaboration_router.post("/projects/{project_id}/archive")
def archive_project(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return collaboration_service.archive_project(db, current_user, project_id, restore=False)


@collaboration_router.post("/projects/{project_id}/restore")
def restore_project(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return collaboration_service.archive_project(db, current_user, project_id, restore=True)


@collaboration_router.delete("/projects/{project_id}")
def remove_project(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    collaboration_service.delete_project(db, current_user, project_id)
    return {"message": "Project deleted. Its tasks were kept as personal tasks."}


@collaboration_router.post("/projects/{project_id}/members")
def post_project_member(
    project_id: int,
    payload: ProjectMemberWrite,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return collaboration_service.add_project_member(db, current_user, project_id, payload.user_id, payload.role)


@collaboration_router.delete("/projects/{project_id}/members/{member_user_id}")
def delete_project_member(
    project_id: int,
    member_user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return collaboration_service.remove_project_member(db, current_user, project_id, member_user_id)


@collaboration_router.get("/projects/{project_id}/tasks", response_model=list[TaskRead])
def get_project_tasks(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return collaboration_service.list_project_tasks(db, current_user, project_id)


@collaboration_router.get("/projects/{project_id}/milestones")
def get_milestones(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return collaboration_service.list_milestones(db, current_user, project_id)


@collaboration_router.post("/projects/{project_id}/milestones", status_code=201)
def post_milestone(
    project_id: int,
    payload: MilestoneWrite,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return collaboration_service.create_milestone(db, current_user, project_id, payload.model_dump(exclude_unset=True))


@collaboration_router.patch("/projects/{project_id}/milestones/{milestone_id}")
def patch_milestone(
    project_id: int,
    milestone_id: int,
    payload: MilestoneWrite,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return collaboration_service.update_milestone(
        db, current_user, project_id, milestone_id, payload.model_dump(exclude_unset=True)
    )


@collaboration_router.delete("/projects/{project_id}/milestones/{milestone_id}")
def remove_milestone(
    project_id: int,
    milestone_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    collaboration_service.delete_milestone(db, current_user, project_id, milestone_id)
    return {"message": "Milestone deleted"}


@collaboration_router.get("/projects/{project_id}/activity")
def get_activity(
    project_id: int,
    limit: int = Query(default=30, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return collaboration_service.list_activity(db, current_user, project_id, limit, offset)
