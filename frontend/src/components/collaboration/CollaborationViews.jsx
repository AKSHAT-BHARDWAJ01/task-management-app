import { useEffect, useMemo, useState } from "react";

import { taskApi, workspaceApi } from "../../api/taskApi";
import { TaskForm } from "../TaskForm";

const STATUSES = [
  ["planning", "Planning"],
  ["active", "Active"],
  ["on_hold", "On hold"],
  ["completed", "Completed"],
  ["cancelled", "Cancelled"],
];
const HEALTH = [
  ["on_track", "On track"],
  ["at_risk", "At risk"],
  ["off_track", "Off track"],
];
const TASK_COLUMNS = [
  ["pending", "To Do"],
  ["in-progress", "In Progress"],
  ["completed", "Done"],
];

function label(options, value) {
  return options.find(([key]) => key === value)?.[1] || value;
}

function initials(name) {
  return (name || "?").split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function InfoTip({ label, children }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="info-tip">
      <button className="info-button" type="button" aria-label={label} aria-expanded={open} onClick={(event) => { event.preventDefault(); event.stopPropagation(); setOpen((current) => !current); }}>i</button>
      {open && (
        <span className="info-pop" role="note" onClick={(event) => event.stopPropagation()}>
          {children}
          <button className="text-button" type="button" onClick={() => setOpen(false)}>Close</button>
        </span>
      )}
    </span>
  );
}

function isOverdue(task) {
  if (!task.dueDate || task.status === "completed") return false;
  const due = new Date(task.dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}

export function InviteBanner({ token, onDone }) {
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    workspaceApi.previewInvite(token).then((result) => {
      if (active) setPreview(result);
    }).catch((requestError) => {
      if (active) setError(requestError.message);
    });
    return () => {
      active = false;
    };
  }, [token]);

  async function respond(accept) {
    setBusy(true);
    try {
      if (accept) await workspaceApi.acceptInvite(token);
      else await workspaceApi.declineInvite(token);
      onDone(accept);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="invite-banner motion-glass" aria-live="polite">
      {error && <p>{error}</p>}
      {!error && !preview && <p>Checking the invitation…</p>}
      {preview && (
        <>
          <div>
            <strong>{preview.invited_by?.name || "A teammate"} invited you to {preview.workspace_name}.</strong>
            <p>The invitation is for {preview.invited_email} as {preview.intended_role}. It expires {formatDate(preview.expires_at)}.</p>
          </div>
          <div className="invite-actions">
            <button className="primary-button" type="button" disabled={busy} onClick={() => respond(true)}>Accept</button>
            <button className="secondary-button" type="button" disabled={busy} onClick={() => respond(false)}>Decline</button>
          </div>
        </>
      )}
    </section>
  );
}

export function ProjectsView({ workspace, onOpenTeam, resetSignal = 0 }) {
  const [projects, setProjects] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mode, setMode] = useState("cards");
  const [selectedId, setSelectedId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [filters, setFilters] = useState({ search: "", status: "", health: "", lead_user_id: "", archived: false, sort: "name", target_after: "", target_before: "" });

  useEffect(() => {
    setSelectedId(null);
    setCreating(false);
  }, [workspace.id, resetSignal]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([
      workspaceApi.projects(workspace.id, filters),
      workspaceApi.members(workspace.id),
    ]).then(([projectList, memberList]) => {
      if (!active) return;
      setProjects(projectList);
      setMembers(memberList);
    }).catch((requestError) => {
      if (active) setError(requestError.message);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [workspace.id, filters]);

  if (selectedId) {
    return (
        <ProjectDetail
          projectId={selectedId}
          members={members}
          currentUserId={workspace.currentUserId}
          canManage={workspace.role === "owner" || workspace.role === "admin"}
          onBack={() => setSelectedId(null)}
          onOpenTeam={onOpenTeam}
        />
    );
  }

  return (
    <section className="workspace-module">
      <div className="workspace-toolbar motion-glass">
        <div>
          <p className="eyebrow">{workspace.workspace_type === "personal" ? "Personal workspace" : "Team workspace"}</p>
          <h2>{workspace.name}</h2>
          <p className="quiet-line">Pick a project to see its board, list, and people.</p>
        </div>
        <div className="workspace-toolbar-actions">
          <button className="secondary-button" type="button" onClick={onOpenTeam}>People</button>
          <div className="segmented" role="group" aria-label="Project layout">
            <button type="button" aria-pressed={mode === "cards"} onClick={() => setMode("cards")}>Cards</button>
            <button type="button" aria-pressed={mode === "table"} onClick={() => setMode("table")}>Table</button>
          </div>
          <span className="button-with-tip">
            <button className="primary-button" type="button" onClick={() => setCreating(true)}>New project</button>
            <InfoTip label="How projects work">A project groups tasks, people, and milestones. Tasks you add on the dashboard stay on your personal list.</InfoTip>
          </span>
        </div>
      </div>
      <div className="project-filters motion-glass">
        <label className="field field-wide">Search
          <input aria-label="Search projects" placeholder="Search by name" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} />
        </label>
        <label className="field">Status
          <select aria-label="Status" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
            <option value="">All</option>
            {STATUSES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
        </label>
        <label className="field">Health
          <select aria-label="Health" value={filters.health} onChange={(event) => setFilters({ ...filters, health: event.target.value })}>
            <option value="">All</option>
            {HEALTH.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
        </label>
        <label className="field">Lead
          <select aria-label="Project lead" value={filters.lead_user_id} onChange={(event) => setFilters({ ...filters, lead_user_id: event.target.value })}>
            <option value="">Anyone</option>
            {members.map((member) => <option key={member.user_id} value={member.user_id}>{member.name}</option>)}
          </select>
        </label>
        <label className="field">Sort
          <select aria-label="Sort projects" value={filters.sort} onChange={(event) => setFilters({ ...filters, sort: event.target.value })}>
            <option value="name">Name</option>
            <option value="target_date">Target date</option>
            <option value="updated">Recently updated</option>
          </select>
        </label>
        <label className="field">From
          <input aria-label="Target date from" type="date" value={filters.target_after} onChange={(event) => setFilters({ ...filters, target_after: event.target.value })} />
        </label>
        <label className="field">To
          <input aria-label="Target date to" type="date" value={filters.target_before} onChange={(event) => setFilters({ ...filters, target_before: event.target.value })} />
        </label>
        <label className="check-label"><input type="checkbox" checked={filters.archived} onChange={(event) => setFilters({ ...filters, archived: event.target.checked })} /> Archived</label>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {loading && <p className="empty-copy">Loading projects…</p>}
      {!loading && projects.length === 0 && (
        <div className="empty-state motion-glass">
          <h3>{filters.archived ? "No archived projects." : "No projects in this workspace yet."}</h3>
          <p>Create your first project to organize your team's work.</p>
        </div>
      )}
      {!loading && mode === "cards" && (
        <div className="project-grid">
          {projects.map((project) => (
            <button className="project-card motion-glass" type="button" key={project.id} onClick={() => setSelectedId(project.id)}>
              <span className="project-icon" style={{ background: project.colour || "#667eea" }}>{project.icon || initials(project.name).slice(0, 1)}</span>
              <strong>{project.name}</strong>
              <p>{project.description || "No description yet."}</p>
              <div className="project-meta">
                <span className={`pill pill-${project.status}`}>{label(STATUSES, project.status)}</span>
                <span className={`pill pill-${project.health}`}>{label(HEALTH, project.health)}</span>
                <span>{project.lead?.name || "No lead"}</span>
              </div>
              <div className="progress-track" aria-hidden="true"><span style={{ width: `${project.completion_percent}%` }} /></div>
              <small>{project.completed_tasks} of {project.total_tasks} tasks · {project.overdue_tasks} overdue · Target {formatDate(project.target_date)}</small>
              <span className="avatar-row">
                {project.members.slice(0, 4).map((member) => <span key={member.user_id} title={member.name}>{initials(member.name)}</span>)}
              </span>
            </button>
          ))}
        </div>
      )}
      {!loading && mode === "table" && projects.length > 0 && (
        <div className="table-wrap motion-glass">
          <table className="project-table">
            <thead>
              <tr><th>Project</th><th>Lead</th><th>Status</th><th>Health</th><th>Progress</th><th>Overdue</th><th>Target</th></tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id} onClick={() => setSelectedId(project.id)}>
                  <td>{project.name}</td>
                  <td>{project.lead?.name || "—"}</td>
                  <td>{label(STATUSES, project.status)}</td>
                  <td>{label(HEALTH, project.health)}</td>
                  <td>{project.completion_percent}%</td>
                  <td>{project.overdue_tasks}</td>
                  <td>{formatDate(project.target_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating && (
        <ProjectForm
          members={members}
          onCancel={() => setCreating(false)}
          onCreate={async (values) => {
            const created = await workspaceApi.createProject(workspace.id, values);
            setCreating(false);
            setSelectedId(created.id);
          }}
        />
      )}
    </section>
  );
}

function ProjectForm({ members, onCancel, onCreate }) {
  const [values, setValues] = useState({ name: "", description: "", priority: "medium", visibility: "workspace", status: "planning", health: "on_track" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await onCreate(values);
    } catch (requestError) {
      setError(requestError.message);
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <form className="modal-card project-form" onSubmit={submit}>
        <h3>Create a project</h3>
        <label htmlFor="project-name">Name</label>
        <input id="project-name" required value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} />
        <label htmlFor="project-description">Description</label>
        <textarea id="project-description" value={values.description} onChange={(event) => setValues({ ...values, description: event.target.value })} />
        <label htmlFor="project-lead">Project lead</label>
        <select id="project-lead" value={values.lead_user_id || ""} onChange={(event) => setValues({ ...values, lead_user_id: event.target.value ? Number(event.target.value) : undefined })}>
          <option value="">You</option>
          {members.map((member) => <option key={member.user_id} value={member.user_id}>{member.name}</option>)}
        </select>
        <div className="form-grid">
          <label>Status<select value={values.status} onChange={(event) => setValues({ ...values, status: event.target.value })}>{STATUSES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
          <label>Priority<select value={values.priority} onChange={(event) => setValues({ ...values, priority: event.target.value })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
          <label>Visibility<select value={values.visibility} onChange={(event) => setValues({ ...values, visibility: event.target.value })}><option value="workspace">Workspace</option><option value="private">Private</option></select></label>
          <label>Start<input type="date" value={values.start_date || ""} onChange={(event) => setValues({ ...values, start_date: event.target.value })} /></label>
          <label>Target<input type="date" value={values.target_date || ""} onChange={(event) => setValues({ ...values, target_date: event.target.value })} /></label>
          <label>Icon<input maxLength="8" value={values.icon || ""} onChange={(event) => setValues({ ...values, icon: event.target.value })} /></label>
          <label>Colour<input value={values.colour || ""} onChange={(event) => setValues({ ...values, colour: event.target.value })} placeholder="#667eea" /></label>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="invite-actions">
          <button className="secondary-button" type="button" onClick={onCancel}>Cancel</button>
          <button className="primary-button" type="submit" disabled={saving}>{saving ? "Creating…" : "Create project"}</button>
        </div>
      </form>
    </div>
  );
}

function ProjectDetail({ projectId, members, canManage, currentUserId, onBack, onOpenTeam }) {
  const [tab, setTab] = useState("overview");
  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [activity, setActivity] = useState({ items: [], total: 0 });
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(null);
  const [draft, setDraft] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [editing, setEditing] = useState(false);

  async function reload() {
    const [nextProject, nextTasks, nextMilestones, nextActivity] = await Promise.all([
      workspaceApi.project(projectId),
      workspaceApi.tasks(projectId),
      workspaceApi.milestones(projectId),
      workspaceApi.activity(projectId),
    ]);
    setProject(nextProject);
    setTasks(nextTasks);
    setMilestones(nextMilestones);
    setActivity(nextActivity);
  }

  useEffect(() => {
    let active = true;
    setProject(null);
    setTasks([]);
    reload().catch((requestError) => {
      if (active) setError(requestError.message);
    });
    return () => {
      active = false;
    };
  }, [projectId]);

  const milestoneName = useMemo(() => {
    const names = new Map(milestones.map((item) => [item.id, item.name]));
    return (id) => names.get(id) || "";
  }, [milestones]);

  async function saveTask(id, changes, rollback) {
    try {
      const saved = await taskApi.update(id, changes);
      setTasks((current) => current.map((task) => (task.id === id ? saved : task)));
      const [nextProject, nextActivity] = await Promise.all([
        workspaceApi.project(projectId),
        workspaceApi.activity(projectId),
      ]);
      setProject(nextProject);
      setActivity(nextActivity);
    } catch (requestError) {
      if (rollback) setTasks(rollback);
      setError(requestError.message);
    }
  }

  function moveTask(task, status) {
    const previous = tasks;
    setTasks(tasks.map((item) => (item.id === task.id ? { ...item, status } : item)));
    saveTask(task.id, { status }, previous);
  }

  if (!project) return <p className="empty-copy">{error || "Loading project…"}</p>;
  const myRole = project.members.find((member) => member.user_id === currentUserId)?.role;
  const canEdit = canManage || myRole === "lead" || myRole === "editor";

  async function openComposer(event) {
    event.preventDefault();
    const title = draft.trim();
    if (!title) {
      setError("");
      setComposerOpen(true);
      return;
    }
    setSavingTask(true);
    setError("");
    try {
      await taskApi.create({
        title,
        description: "",
        status: "pending",
        priority: "medium",
        progress: 0,
        project_id: project.id,
      });
      setDraft("");
      setTab("list");
      await reload();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSavingTask(false);
    }
  }

  async function saveProjectDetails(changes) {
    setError("");
    try {
      await workspaceApi.updateProject(project.id, changes);
      await reload();
    } catch (requestError) {
      setError(requestError.message);
      throw requestError;
    }
  }

  async function saveProjectTask(values) {
    setSavingTask(true);
    setError("");
    try {
      await taskApi.create({ ...values, project_id: project.id });
      setComposerOpen(false);
      setDraft("");
      setTab("list");
      await reload();
    } catch (requestError) {
      setError(requestError.message);
      throw requestError;
    } finally {
      setSavingTask(false);
    }
  }

  const tabs = [
    ["overview", "Overview"],
    ["board", "Board"],
    ["list", "List"],
    ["milestones", "Milestones"],
    ["activity", "Activity"],
  ];

  return (
    <section className="workspace-module">
      <div className="project-hero motion-glass">
        <div className="project-heading">
          <button className="text-button project-back" type="button" onClick={onBack}>Projects</button>
          <h2 className="title-with-tip">
            <span>{project.icon ? `${project.icon} ` : ""}{project.name}</span>
            <InfoTip label="How this project page works">Overview is the summary. Board and List show the same tasks in two layouts. Milestones group work by a date. Activity records each change in its own words.</InfoTip>
          </h2>
          <p className="quiet-line">{project.description || "Add a short description so the team knows what this project is for."}</p>
        </div>
        <div className="project-hero-side">
          <span className="avatar-row" aria-label="Project members">
            {project.members.slice(0, 4).map((member) => <span key={member.user_id} title={member.name}>{initials(member.name)}</span>)}
            {project.members.length > 4 && <span>+{project.members.length - 4}</span>}
          </span>
          {canEdit && <button className="secondary-button" type="button" onClick={() => setEditing(true)}>Edit</button>}
          <button className="secondary-button" type="button" onClick={onOpenTeam}>People</button>
          {canEdit && !project.archived_at && <button className="secondary-button" type="button" onClick={() => workspaceApi.archiveProject(project.id).then(reload).catch((requestError) => setError(requestError.message))}>Archive</button>}
          {project.archived_at && canEdit && <button className="secondary-button" type="button" onClick={() => workspaceApi.restoreProject(project.id).then(reload).catch((requestError) => setError(requestError.message))}>Restore</button>}
          {canManage && <button className="danger-button" type="button" onClick={() => { if (window.confirm("Delete this project? Tasks stay in your personal list.")) workspaceApi.deleteProject(project.id).then(onBack).catch((requestError) => setError(requestError.message)); }}>Delete</button>}
        </div>
      </div>
      <div className="project-command motion-glass">
        <div className="segmented" role="tablist" aria-label="Project sections">
          {tabs.map(([item, text]) => (
            <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => { setTab(item); reload().catch((requestError) => setError(requestError.message)); }}>{text}</button>
          ))}
        </div>
        {canEdit && (
          <span className="button-with-tip">
            <form className="new-task-form" onSubmit={openComposer}>
              <input aria-label="New task title" placeholder="Task title" value={draft} onChange={(event) => setDraft(event.target.value)} />
              <button className="primary-button" type="submit" disabled={savingTask}>{savingTask ? "Saving…" : "New task"}</button>
            </form>
            <InfoTip label="How to add a task">Type a title and press New task to put it on the list. Leave the title empty to open the full form for dates and priority.</InfoTip>
          </span>
        )}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {tab === "overview" && <Overview project={project} milestones={milestones} activity={activity.items.slice(0, 5)} members={members} canEdit={canEdit} canManage={canManage} currentUserId={currentUserId} onReload={reload} onSave={saveProjectDetails} onOpenTeam={onOpenTeam} />}
      {tab === "board" && <Board tasks={tasks} milestones={milestoneName} members={project.members} canEdit={canEdit} dragging={dragging} setDragging={setDragging} onMove={moveTask} />}
      {tab === "list" && <TaskTable tasks={tasks} milestones={milestones} members={project.members} canEdit={canEdit} onChange={(task, changes) => saveTask(task.id, changes)} />}
      {tab === "milestones" && <Milestones projectId={project.id} milestones={milestones} canEdit={canEdit} onChanged={reload} />}
      {tab === "activity" && <Activity items={activity.items} total={activity.total} />}
      {editing && (
        <ProjectEditor
          project={project}
          onCancel={() => setEditing(false)}
          onSave={async (values) => {
            await saveProjectDetails(values);
            setEditing(false);
          }}
        />
      )}
      {composerOpen && (
        <TaskForm
          initialTitle={draft}
          onSubmit={saveProjectTask}
          onCancel={() => { if (!savingTask) setComposerOpen(false); }}
          isSaving={savingTask}
        />
      )}
    </section>
  );
}

function ChoiceRow({ legend, options, value, disabled, onChange }) {
  return (
    <div className="choice-block">
      <p className="card-kicker">{legend}</p>
      <div className="choice-pills" role="group" aria-label={legend}>
        {options.map(([item, text]) => (
          <button key={item} type="button" className={`pill pill-${item} ${value === item ? "is-selected" : ""}`} aria-pressed={value === item} disabled={disabled} onClick={() => onChange(item)}>{text}</button>
        ))}
      </div>
    </div>
  );
}

function Overview({ project, milestones, activity, members, canEdit, canManage, currentUserId, onReload, onSave, onOpenTeam }) {
  const [saving, setSaving] = useState("");
  const [localError, setLocalError] = useState("");
  const leadCanSetHealth = canManage || project.lead?.id === currentUserId;

  async function save(field, changes) {
    if (changes[field] === project[field]) return;
    setSaving(field);
    setLocalError("");
    try {
      await onSave(changes);
    } catch (requestError) {
      setLocalError(requestError.message);
    } finally {
      setSaving("");
    }
  }

  return (
    <div className="project-overview">
      <div className="stat-row">
        <article className="tone-card tone-progress-main motion-glass">
          <header className="card-title">
            <p>Progress</p>
            <InfoTip label="How progress is counted">Completed tasks divided by every task in the project. With no tasks, this stays at 0%.</InfoTip>
          </header>
          <strong>{project.completion_percent}%</strong>
          <div className="progress-track"><span style={{ width: `${project.completion_percent}%` }} /></div>
        </article>
        <article className="tone-card tone-todo motion-glass"><p>To do</p><strong>{project.pending_tasks}</strong></article>
        <article className="tone-card tone-doing motion-glass"><p>In progress</p><strong>{project.in_progress_tasks}</strong></article>
        <article className="tone-card tone-done motion-glass"><p>Done</p><strong>{project.completed_tasks}</strong></article>
        <article className="tone-card tone-late motion-glass"><p>Overdue</p><strong>{project.overdue_tasks}</strong></article>
      </div>
      {localError && <p className="form-error" role="alert">{localError}</p>}
      <div className="overview-split">
        <article className="overview-card motion-glass">
          <header className="card-title">
            <h3>Project</h3>
            <InfoTip label="Status and health">Status is the stage, such as Planning or Active. Health is your own judgment: On track, At risk, or Off track. It is not calculated from the task count.</InfoTip>
          </header>
          <p>Lead: {project.lead?.name || "Unassigned"}</p>
          <p>Start {formatDate(project.start_date)} · Target {formatDate(project.target_date)}</p>
          <p>Visibility: {project.visibility === "private" ? "Private" : "Everyone in the workspace"}</p>
          {canEdit ? (
            <ChoiceRow legend="Status" options={STATUSES} value={project.status} disabled={Boolean(saving)} onChange={(status) => save("status", { status })} />
          ) : <p>Status: {label(STATUSES, project.status)}</p>}
          {leadCanSetHealth && canEdit ? (
            <ChoiceRow legend="Health" options={HEALTH} value={project.health} disabled={Boolean(saving)} onChange={(health) => save("health", { health })} />
          ) : <p>Health: {label(HEALTH, project.health)}</p>}
        </article>
        <PeopleCard project={project} members={members} canEdit={canEdit} onReload={onReload} onOpenTeam={onOpenTeam} />
      </div>
      <div className="overview-split">
        <article className="overview-card motion-glass">
          <header className="card-title">
            <h3>Milestones</h3>
            <InfoTip label="What milestones are">A milestone is a dated checkpoint. Link tasks to one from the list. Tasks without a milestone still appear on the board.</InfoTip>
          </header>
          {milestones.length === 0 && <p>No milestones yet.</p>}
          <div className="mini-card-grid">
            {milestones.map((item) => (
              <article key={item.id} className={`mini-card mini-${item.status} motion-glass`}>
                <strong>{item.name}</strong>
                <p>{item.status.replaceAll("_", " ")} · {formatDate(item.target_date)}</p>
                <p>{item.completion_percent}% of its tasks done</p>
              </article>
            ))}
          </div>
        </article>
        <article className="overview-card motion-glass">
          <header className="card-title">
            <h3>Recent activity</h3>
            <InfoTip label="How to read activity">Each card is one change. The colored label tells you whether it was health, a task, or people, so the lines are not all the same.</InfoTip>
          </header>
          <Activity items={activity} total={activity.length} />
        </article>
      </div>
    </div>
  );
}

function ProjectEditor({ project, onCancel, onSave }) {
  const [values, setValues] = useState({
    name: project.name,
    description: project.description || "",
    status: project.status,
    visibility: project.visibility,
    start_date: (project.start_date || "").slice(0, 10),
    target_date: (project.target_date || "").slice(0, 10),
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave({
        ...values,
        name: values.name.trim(),
        start_date: values.start_date || null,
        target_date: values.target_date || null,
      });
    } catch (requestError) {
      setError(requestError.message);
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal-card project-form" onSubmit={submit}>
        <h3>Edit project</h3>
        <label htmlFor="edit-project-name">Name</label>
        <input id="edit-project-name" required value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} />
        <label htmlFor="edit-project-description">Description</label>
        <textarea id="edit-project-description" value={values.description} onChange={(event) => setValues({ ...values, description: event.target.value })} />
        <div className="form-grid">
          <label>Status<select value={values.status} onChange={(event) => setValues({ ...values, status: event.target.value })}>{STATUSES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
          <label>Visibility<select value={values.visibility} onChange={(event) => setValues({ ...values, visibility: event.target.value })}><option value="workspace">Workspace</option><option value="private">Private</option></select></label>
          <label>Start<input type="date" value={values.start_date} onChange={(event) => setValues({ ...values, start_date: event.target.value })} /></label>
          <label>Target<input type="date" value={values.target_date} onChange={(event) => setValues({ ...values, target_date: event.target.value })} /></label>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="invite-actions">
          <button className="secondary-button" type="button" onClick={onCancel} disabled={saving}>Cancel</button>
          <button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
        </div>
      </form>
    </div>
  );
}

function PeopleCard({ project, members, canEdit, onReload, onOpenTeam }) {
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState("editor");
  const [email, setEmail] = useState("");
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const available = members.filter((member) => !project.members.some((existing) => existing.user_id === member.user_id));

  async function addExisting(event) {
    event.preventDefault();
    if (!userId) {
      setError("Choose someone who is already in the workspace, or invite them with an email below.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await workspaceApi.addProjectMember(project.id, { user_id: Number(userId), role });
      setUserId("");
      await onReload();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function invite(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const created = await workspaceApi.invite(project.workspace_id, { email, role: "member" });
      setLink(`${window.location.origin}/?invite=${created.token}`);
      setEmail("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(memberId, nextRole) {
    setError("");
    try {
      await workspaceApi.addProjectMember(project.id, { user_id: memberId, role: nextRole });
      await onReload();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function removeMember(member) {
    if (!window.confirm(`Remove ${member.name} from this project?`)) return;
    setError("");
    try {
      await workspaceApi.removeProjectMember(project.id, member.user_id);
      await onReload();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return (
    <article className="overview-card motion-glass">
      <header className="card-title">
        <h3>People</h3>
        <InfoTip label="How to add people">Add someone who already belongs to this workspace. To bring in a new person, create an invite link with their email. No email is sent. Copy the link and share it. After they join, they appear in the list above.</InfoTip>
      </header>
      <ul className="person-list">
        {project.members.map((member) => (
          <li key={member.user_id}>
            <span className="person-cell">
              <span className="profile-avatar" aria-hidden="true">{initials(member.name)}</span>
              <span><strong>{member.name}</strong><small>{member.role}</small></span>
            </span>
            {canEdit && member.role !== "lead" && (
              <span className="person-controls">
                <select aria-label={`Role for ${member.name}`} value={member.role} onChange={(event) => changeRole(member.user_id, event.target.value)}>
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                  <option value="lead">Lead</option>
                </select>
                <button className="secondary-button" type="button" onClick={() => removeMember(member)}>Remove</button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {canEdit && (
        <>
          <form className="stack-form" onSubmit={addExisting}>
            <label className="field">Add someone already here
              <select aria-label="Workspace member" value={userId} onChange={(event) => setUserId(event.target.value)}>
                <option value="">{available.length ? "Choose a person" : "No one else is in this workspace yet"}</option>
                {available.map((member) => <option key={member.user_id} value={member.user_id}>{member.name}</option>)}
              </select>
            </label>
            <label className="field">Role on this project
              <select aria-label="Role on this project" value={role} onChange={(event) => setRole(event.target.value)}>
                <option value="editor">Editor — can change tasks</option>
                <option value="viewer">Viewer — can look, not change</option>
                <option value="lead">Lead — can set health</option>
              </select>
            </label>
            <button className="secondary-button" type="submit" disabled={busy || !userId}>Add to project</button>
          </form>
          <form className="stack-form" onSubmit={invite}>
            <label className="field">Invite a new person
              <input aria-label="Email address" type="email" required placeholder="teammate@example.com" value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <button className="primary-button" type="submit" disabled={busy}>Create invite link</button>
          </form>
        </>
      )}
      {link && (
        <p className="copy-link">
          <input readOnly value={link} aria-label="Invitation link" />
          <button className="secondary-button" type="button" onClick={() => navigator.clipboard.writeText(link)}>Copy</button>
        </p>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="text-button" type="button" onClick={onOpenTeam}>Open the team page</button>
    </article>
  );
}

function Board({ tasks, milestones, members, canEdit, dragging, setDragging, onMove }) {
  return (
    <div className="board-wrap">
      <p className="section-note">
        Three columns, one for each task status.
        <InfoTip label="How the board works">Drag a card into another column, or use the menu on the card. To do, In progress, and Done are the only statuses.</InfoTip>
      </p>
      <div className="board">
        {TASK_COLUMNS.map(([status, text]) => {
          const column = tasks.filter((task) => task.status === status);
          return (
            <section
              key={status}
              className={`board-column board-${status} motion-glass`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                const task = tasks.find((item) => item.id === dragging);
                if (task && task.status !== status) onMove(task, status);
                setDragging(null);
              }}
            >
              <header><h3>{text}</h3><span>{column.length}</span></header>
              {column.length === 0 && <p className="empty-copy">Nothing in {text}.</p>}
              {column.map((task) => (
                <article key={task.id} className="task-card motion-glass" draggable={canEdit} onDragStart={() => setDragging(task.id)}>
                  <strong>{task.title}</strong>
                  <div className="card-row">
                    <span className={`pill pill-${task.priority}`}>{task.priority}</span>
                    <span className="avatar-row"><span title={members.find((member) => member.user_id === task.assignee_id)?.name || "Unassigned"}>{initials(members.find((member) => member.user_id === task.assignee_id)?.name || "?")}</span></span>
                  </div>
                  <p className={isOverdue(task) ? "overdue" : ""}>{task.dueDate ? formatDate(task.dueDate) : "No due date"}{isOverdue(task) ? " · Overdue" : ""}</p>
                  {task.milestone_id && <p>{milestones(task.milestone_id)}</p>}
                  {canEdit && (
                    <label className="field">Move to
                      <select aria-label={`Move ${task.title}`} value={task.status} onChange={(event) => onMove(task, event.target.value)}>
                        {TASK_COLUMNS.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
                      </select>
                    </label>
                  )}
                </article>
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function TaskTable({ tasks, milestones, members, canEdit, onChange }) {
  if (tasks.length === 0) return <p className="empty-copy">No tasks yet. Type a title above and press New task.</p>;
  return (
    <div className="work-list">
      <p className="section-note">
        The same tasks as the board, one card per task.
        <InfoTip label="How the list works">Each card shows the due date, who it is for, and its priority. Change those with the menus on the card.</InfoTip>
      </p>
      {TASK_COLUMNS.map(([status, text]) => {
        const rows = tasks.filter((task) => task.status === status);
        return (
          <section key={status} className={`work-group work-${status}`}>
            <header><h3>{text}</h3><span className="count-pill">{rows.length}</span></header>
            {rows.length === 0 && <p className="empty-copy">Nothing in {text}.</p>}
            {rows.map((task) => (
              <article key={task.id} className="work-card motion-glass">
                <div>
                  <strong>{task.title}</strong>
                  <p>{task.description || "No description"}</p>
                  <p className={isOverdue(task) ? "overdue" : ""}>{task.dueDate ? `Due ${formatDate(task.dueDate)}` : "No due date"}{isOverdue(task) ? " · Overdue" : ""}</p>
                </div>
                <label className="field">Status
                  {canEdit ? (
                    <select aria-label={`Move ${task.title}`} value={task.status} onChange={(event) => onChange(task, { status: event.target.value })}>
                      {TASK_COLUMNS.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
                    </select>
                  ) : <span className={`pill pill-${task.status}`}>{text}</span>}
                </label>
                <label className="field">Person
                  {canEdit ? (
                    <select aria-label={`Assignee for ${task.title}`} value={task.assignee_id || ""} onChange={(event) => onChange(task, { assignee_id: event.target.value ? Number(event.target.value) : null })}>
                      <option value="">Unassigned</option>
                      {members.map((member) => <option key={member.user_id} value={member.user_id}>{member.name}</option>)}
                    </select>
                  ) : <span>{members.find((member) => member.user_id === task.assignee_id)?.name || "Unassigned"}</span>}
                </label>
                <label className="field">Milestone
                  {canEdit ? (
                    <select aria-label={`Milestone for ${task.title}`} value={task.milestone_id || ""} onChange={(event) => onChange(task, { milestone_id: event.target.value ? Number(event.target.value) : null })}>
                      <option value="">None</option>
                      {milestones.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                  ) : <span>{milestones.find((item) => item.id === task.milestone_id)?.name || "None"}</span>}
                </label>
                <label className="field">Priority
                  {canEdit ? (
                    <select aria-label={`Priority for ${task.title}`} value={task.priority} onChange={(event) => onChange(task, { priority: event.target.value })}>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  ) : <span className={`pill pill-${task.priority}`}>{task.priority}</span>}
                </label>
              </article>
            ))}
          </section>
        );
      })}
    </div>
  );
}

function Milestones({ projectId, milestones, canEdit, onChanged }) {
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [error, setError] = useState("");
  return (
    <div className="milestone-panel">
      <p className="section-note">
        Checkpoints with a date. Tasks can be linked to one from the list.
        <InfoTip label="How milestones work">Add a name and an optional target date. Mark it complete when that checkpoint is done. Tasks without a milestone stay on the board and list.</InfoTip>
      </p>
      {canEdit && (
        <form className="stack-form milestone-form motion-glass" onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          try {
            await workspaceApi.createMilestone(projectId, { name, target_date: target || null });
            setName("");
            setTarget("");
            await onChanged();
          } catch (requestError) {
            setError(requestError.message);
          }
        }}>
          <label className="field">Name
            <input aria-label="Milestone name" placeholder="For example, Beta release" value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
          <label className="field">Target date
            <input aria-label="Milestone target date" type="date" value={target} onChange={(event) => setTarget(event.target.value)} />
          </label>
          <button className="primary-button" type="submit">Add milestone</button>
        </form>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="mini-card-grid">
        {milestones.map((item) => (
          <article key={item.id} className={`mini-card mini-${item.status} motion-glass`}>
            <strong>{item.name}</strong>
            <p>{item.status.replaceAll("_", " ")} · Target {formatDate(item.target_date)}</p>
            <p>{item.completed_task_count} of {item.task_count} tasks · {item.completion_percent}%</p>
            <div className="progress-track"><span style={{ width: `${item.completion_percent}%` }} /></div>
            {canEdit && item.status !== "completed" && <button className="secondary-button" type="button" onClick={() => workspaceApi.updateMilestone(projectId, item.id, { completed: true }).then(onChanged).catch((requestError) => setError(requestError.message))}>Mark complete</button>}
          </article>
        ))}
      </div>
      {milestones.length === 0 && <p className="empty-copy">No milestones yet.</p>}
    </div>
  );
}

function activityTag(type = "") {
  if (type.includes("health")) return ["Health", "tag-health"];
  if (type.includes("status") || type.includes("reopened")) return ["Status", "tag-status"];
  if (type.includes("completed")) return ["Done", "tag-done"];
  if (type.includes("member") || type.includes("lead") || type.includes("assigned")) return ["People", "tag-people"];
  if (type.includes("created") || type.includes("added")) return ["Added", "tag-added"];
  if (type.includes("deleted") || type.includes("removed") || type.includes("archived")) return ["Removed", "tag-removed"];
  return ["Edited", "tag-edited"];
}

function Activity({ items, total }) {
  return (
    <div className="activity-feed">
      <p className="eyebrow">{total} {total === 1 ? "event" : "events"}</p>
      <ul className="activity-list">
        {items.map((item) => {
          const [tag, tone] = activityTag(item.event_type);
          return (
            <li key={item.id} className="activity-card motion-glass">
              <span className={`activity-tag ${tone}`}>{tag}</span>
              <span className="activity-copy">{item.description}</span>
              <small>{formatDate(item.created_at)}</small>
            </li>
          );
        })}
      </ul>
      {items.length === 0 && <p className="empty-copy">Nothing has been recorded yet.</p>}
    </div>
  );
}

export function MembersView({ workspace, currentUser, onWorkspaceChanged }) {
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [link, setLink] = useState("");
  const [name, setName] = useState(workspace.name);
  const canInvite = workspace.role === "owner" || workspace.role === "admin";
  const isOwner = workspace.role === "owner";

  async function reload() {
    const nextMembers = await workspaceApi.members(workspace.id);
    setMembers(nextMembers);
    if (canInvite) setInvites(await workspaceApi.invitations(workspace.id));
  }

  useEffect(() => {
    let active = true;
    setMembers([]);
    setInvites([]);
    setLink("");
    reload().catch((requestError) => {
      if (active) setError(requestError.message);
    });
    return () => {
      active = false;
    };
  }, [workspace.id]);

  async function invite(event) {
    event.preventDefault();
    setError("");
    try {
      const created = await workspaceApi.invite(workspace.id, { email, role });
      const url = `${window.location.origin}/?invite=${created.token}`;
      setLink(url);
      setEmail("");
      await reload();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  const pending = invites.filter((invite) => invite.status === "pending");

  return (
    <section className="workspace-module">
      <div className="workspace-toolbar motion-glass">
        <div>
          <p className="eyebrow">People</p>
          <h2>{workspace.name}</h2>
          <p className="quiet-line">{members.length} {members.length === 1 ? "person" : "people"} in this workspace.</p>
        </div>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="people-layout">
        <section className="panel motion-glass">
          <h3>Members</h3>
          <div className="table-wrap">
            <table className="project-table people-table">
              <thead><tr><th>Person</th><th>Role</th><th>Joined</th><th>Actions</th></tr></thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.user_id}>
                    <td>
                      <span className="person-cell">
                        <span className="profile-avatar" aria-hidden="true">{initials(member.name)}</span>
                        <span><strong>{member.name}</strong><small>{member.email}</small></span>
                      </span>
                    </td>
                    <td><span className="pill">{member.role}</span></td>
                    <td>{formatDate(member.joined_at)}</td>
                    <td>
                      {canInvite && member.role !== "owner" && member.user_id !== currentUser.id ? (
                        <span className="member-actions">
                          {isOwner && member.role === "member" && <button className="text-button" type="button" onClick={() => workspaceApi.changeRole(workspace.id, member.user_id, "admin").then(reload)}>Make admin</button>}
                          {isOwner && member.role === "admin" && <button className="text-button" type="button" onClick={() => workspaceApi.changeRole(workspace.id, member.user_id, "member").then(reload)}>Make member</button>}
                          {isOwner && workspace.workspace_type !== "personal" && <button className="text-button" type="button" onClick={() => { if (window.confirm(`Transfer ownership to ${member.name}?`)) workspaceApi.transfer(workspace.id, member.user_id).then(onWorkspaceChanged); }}>Make owner</button>}
                          <button className="text-button" type="button" onClick={() => workspaceApi.removeMember(workspace.id, member.user_id).then(reload)}>Remove</button>
                        </span>
                      ) : <span className="muted-cell">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        {canInvite && (
          <section className="panel motion-glass">
            <h3 className="title-with-tip">Invite someone <InfoTip label="How invitations work">No email is sent. Create a link, copy it, and share it yourself. The person must sign in with that exact email address. The link works once and expires in 7 days.</InfoTip></h3>
            <p className="quiet-line">No email is sent. Create a link and share it. They must sign in with that address.</p>
            {workspace.workspace_type !== "personal" && (
              <form className="stack-form" onSubmit={async (event) => { event.preventDefault(); await workspaceApi.update(workspace.id, { name }); onWorkspaceChanged(); }}>
                <label className="field">Workspace name
                  <input aria-label="Workspace name" value={name} onChange={(event) => setName(event.target.value)} />
                </label>
                <button className="secondary-button" type="submit">Save name</button>
              </form>
            )}
            <form className="stack-form" onSubmit={invite}>
              <label className="field">Email
                <input aria-label="Email address" type="email" required placeholder="teammate@example.com" value={email} onChange={(event) => setEmail(event.target.value)} />
              </label>
              <label className="field">Role
                <select aria-label="Invitation role" value={role} onChange={(event) => setRole(event.target.value)}>
                  <option value="member">Member</option>
                  {isOwner && <option value="admin">Admin</option>}
                </select>
              </label>
              <button className="primary-button" type="submit">Create link</button>
            </form>
            {link && (
              <p className="copy-link">
                <input readOnly value={link} aria-label="Invitation link" />
                <button className="secondary-button" type="button" onClick={() => navigator.clipboard.writeText(link)}>Copy</button>
              </p>
            )}
            <h3>Pending</h3>
            {pending.length === 0 && <p className="quiet-line">No invitations waiting.</p>}
            <ul className="plain-list">
              {pending.map((invite) => (
                <li key={invite.id}>
                  <span><strong>{invite.invited_email}</strong><small>{invite.intended_role} · expires {formatDate(invite.expires_at)}</small></span>
                  <span className="member-actions">
                    <button className="text-button" type="button" onClick={async () => {
                      const resent = await workspaceApi.resendInvite(workspace.id, invite.id);
                      setLink(`${window.location.origin}/?invite=${resent.token}`);
                      reload();
                    }}>Resend</button>
                    <button className="text-button" type="button" onClick={() => workspaceApi.revokeInvite(workspace.id, invite.id).then(reload)}>Revoke</button>
                  </span>
                </li>
              ))}
            </ul>
            {isOwner && workspace.workspace_type !== "personal" && (
              <button className="danger-button" type="button" onClick={() => { if (window.confirm("Delete this workspace? Personal tasks are kept.")) workspaceApi.remove(workspace.id).then(onWorkspaceChanged); }}>Delete workspace</button>
            )}
          </section>
        )}
      </div>
    </section>
  );
}
