import { useState, useEffect, useRef, type FormEvent, type ReactNode } from 'react';
import { useNavigate, useParams, Routes, Route } from 'react-router';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { api, type Project, type Task, type Member } from './api';
const states = ['TODO', 'IN_PROGRESS', 'DONE'] as const;
const labels = { TODO: 'To do', IN_PROGRESS: 'In progress', DONE: 'Done' };
function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog ref={ref} onCancel={close} aria-label={title}>
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon" onClick={close} aria-label="Close dialog">
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
function Board() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [modal, setModal] = useState<'project' | 'edit-project' | 'task' | 'members' | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  const [initialStatus, setInitialStatus] = useState<Task['status']>('TODO');
  const [error, setError] = useState('');
  const [priority, setPriority] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const [search, setSearch] = useState('');
  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<Project[]>('/api/projects'),
  });
  const project = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api<Project>(`/api/projects/${projectId}`),
    enabled: !!projectId,
  });
  const tasks = useQuery({
    queryKey: ['tasks', projectId],
    queryFn: () => api<Task[]>(`/api/tasks?projectId=${projectId}`),
    enabled: !!projectId,
  });
  useEffect(() => {
    if (!projectId && projects.data?.length)
      navigate(`/projects/${projects.data[0].id}`, { replace: true });
  }, [projects.data, projectId, navigate]);
  useEffect(() => {
    setModal(null);
    setEditing(null);
    setError('');
  }, [projectId]);
  const mutation = useMutation({
    mutationFn: async ({ path, method, body }: { path: string; method: string; body?: unknown }) =>
      api<any>(path, method, body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['projects'] });
      void client.invalidateQueries({ queryKey: ['project', projectId] });
      void client.invalidateQueries({ queryKey: ['tasks', projectId] });
      setError('');
    },
    onError: (e) => setError(e.message),
  });
  async function send(path: string, method: string, body?: unknown) {
    try {
      return await mutation.mutateAsync({ path, method, body });
    } catch {
      return null;
    }
  }
  async function submitProject(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const result = await send(
      modal === 'edit-project' ? `/api/projects/${projectId}` : '/api/projects',
      modal === 'edit-project' ? 'PATCH' : 'POST',
      { name: d.get('name'), description: d.get('description') },
    );
    if (result) {
      setModal(null);
      navigate(`/projects/${result.id}`);
    }
  }
  async function submitTask(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const body = {
      title: d.get('title'),
      description: d.get('description'),
      status: d.get('status'),
      priority: d.get('priority'),
      assigneeId: d.get('assigneeId') || null,
      ...(!editing ? { projectId } : {}),
    };
    const result = await send(
      editing ? `/api/tasks/${editing.id}` : '/api/tasks',
      editing ? 'PATCH' : 'POST',
      body,
    );
    if (result) {
      setModal(null);
      setEditing(null);
    }
  }
  async function deleteProject() {
    if (confirm('Delete this project? All tasks must be deleted first.')) {
      const result = await send(`/api/projects/${projectId}`, 'DELETE');
      if (result !== null) {
        await client.invalidateQueries({ queryKey: ['projects'] });
        navigate('/');
      }
    }
  }
  const all = tasks.data ?? [];
  const members = project.data?.members ?? [];
  const filtered = all.filter(
    (t) =>
      (priority === 'ALL' || t.priority === priority) &&
      (status === 'ALL' || t.status === status) &&
      t.title.toLowerCase().includes(search.toLowerCase()),
  );
  const problem =
    error || projects.error?.message || project.error?.message || tasks.error?.message;
  return (
    <div className="shell">
      <aside className="sidebar">
        <a href="/" className="brand">
          <span className="brand-mark">
            t<span>f</span>
          </span>
          TaskFlow<span className="brand-dot">●</span>
        </a>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <div className="workspace-name">
          <span className="workspace-avatar">W</span> My workspace{' '}
          <span className="workspace-chevron">⌄</span>
        </div>
        <div className="side-heading">
          <span>PROJECTS</span>
          <button
            className="icon"
            aria-label="Create project"
            onClick={() => {
              setError('');
              setModal('project');
            }}
          >
            +
          </button>
        </div>
        <nav aria-label="Projects">
          {projects.isLoading ? (
            <p className="side-muted">Loading projects…</p>
          ) : (
            projects.data?.map((p) => (
              <button
                key={p.id}
                className={`project-link ${p.id === projectId ? 'active' : ''}`}
                onClick={() => navigate(`/projects/${p.id}`)}
              >
                <span className="project-symbol">▧</span>
                <span>{p.name}</span>
                {p.id === projectId && <span className="active-dot">●</span>}
              </button>
            ))
          )}
        </nav>
        <button
          className="new-project"
          onClick={() => {
            setError('');
            setModal('project');
          }}
        >
          + <span>New project</span>
        </button>
        <div className="sidebar-footer">
          <div className="small-art">↗</div>
          <strong>Make room for great work.</strong>
          <p>
            A little structure.
            <br />A lot of possibility.
          </p>
          <span className="version">TASKFLOW / WORKSPACE 01</span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>
            Workspace <span className="breadcrumb">/</span>{' '}
            <strong>{project.data?.name ?? 'Your projects'}</strong>
          </span>
          <span className="local-label">
            <i />{' '}
            {problem
              ? 'Connection needs attention'
              : projects.isLoading
                ? 'Connecting workspace'
                : 'Workspace connected'}
          </span>
          <span className="user-avatar">ME</span>
        </header>
        <main>
          {problem && (
            <div role="alert" className="error">
              {problem}
              <button
                onClick={() => {
                  setError('');
                  void client.invalidateQueries();
                }}
                aria-label="Retry loading"
              >
                Retry
              </button>
            </div>
          )}
          {!projectId ? (
            <section className="welcome">
              <div className="eyebrow">A FRESH START</div>
              <h1>
                Good work starts
                <br />
                with a little clarity.
              </h1>
              <p>
                Create a project, bring your people together,
                <br />
                and move your next idea forward.
              </p>
              <button className="primary" onClick={() => setModal('project')}>
                + Create your first project
              </button>
            </section>
          ) : (
            <>
              <div className="project-header">
                <div>
                  <div className="eyebrow">PROJECT OVERVIEW</div>
                  <h1>{project.data?.name ?? 'Loading project…'}</h1>
                  <p className="description">
                    {project.data?.description || 'A shared space to turn plans into progress.'}
                  </p>
                </div>
                <div className="project-actions">
                  <button className="secondary" onClick={() => setModal('edit-project')}>
                    Edit project
                  </button>
                  <button
                    className="primary"
                    onClick={() => {
                      setEditing(null);
                      setInitialStatus('TODO');
                      setModal('task');
                    }}
                  >
                    + New task
                  </button>
                </div>
              </div>
              <div className="stats">
                <div>
                  <span className="stat-icon">▤</span>
                  <span>
                    <strong>{all.length}</strong>
                    <small>Total tasks</small>
                  </span>
                </div>
                <div>
                  <span className="stat-icon amber">◷</span>
                  <span>
                    <strong>{all.filter((t) => t.status === 'IN_PROGRESS').length}</strong>
                    <small>In progress</small>
                  </span>
                </div>
                <div>
                  <span className="stat-icon green">✓</span>
                  <span>
                    <strong>{all.filter((t) => t.status === 'DONE').length}</strong>
                    <small>Completed</small>
                  </span>
                </div>
                <button className="members-stat" onClick={() => setModal('members')}>
                  <span className="avatar-stack">
                    {members.length ? (
                      members
                        .slice(0, 3)
                        .map((m) => <span key={m.id}>{m.name.slice(0, 1).toUpperCase()}</span>)
                    ) : (
                      <span>+</span>
                    )}
                  </span>
                  <span>
                    <strong>{members.length} members</strong>
                    <small>Manage team →</small>
                  </span>
                </button>
              </div>
              <div className="board-toolbar">
                <div className="board-tab">
                  ▦ <span>Board view</span>
                </div>
                <div className="filters">
                  <label className="search">
                    <span>⌕</span>
                    <input
                      aria-label="Search tasks"
                      placeholder="Search tasks…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  <select
                    aria-label="Filter by priority"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                  >
                    <option value="ALL">All priorities</option>
                    <option>HIGH</option>
                    <option>MEDIUM</option>
                    <option>LOW</option>
                  </select>
                  <select
                    aria-label="Filter by status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="ALL">All statuses</option>
                    {states.map((s) => (
                      <option key={s} value={s}>
                        {labels[s]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {tasks.isLoading ? (
                <p role="status">Loading your board…</p>
              ) : (
                <div className="board">
                  {states.map((s) => (
                    <section key={s} className={`column column-${s}`} aria-label={labels[s]}>
                      <div className="column-heading">
                        <h2>
                          <span className="status-dot" />
                          {labels[s]}{' '}
                          <span className="count">{all.filter((t) => t.status === s).length}</span>
                        </h2>
                        <button
                          className="icon"
                          aria-label={`Add task to ${labels[s]}`}
                          onClick={() => {
                            setEditing(null);
                            setInitialStatus(s);
                            setModal('task');
                            setStatus('ALL');
                          }}
                        >
                          +
                        </button>
                      </div>
                      <div className="column-body">
                        {filtered
                          .filter((t) => t.status === s)
                          .map((t) => (
                            <article className="task-card" key={t.id}>
                              <div className="card-top">
                                <span className={`priority ${t.priority.toLowerCase()}`}>
                                  <i />
                                  {t.priority.toLowerCase()} priority
                                </span>
                                <button
                                  className="icon"
                                  aria-label={`Edit ${t.title}`}
                                  onClick={() => {
                                    setEditing(t);
                                    setModal('task');
                                  }}
                                >
                                  ↗
                                </button>
                              </div>
                              <button
                                className="task-title"
                                onClick={() => {
                                  setEditing(t);
                                  setModal('task');
                                }}
                              >
                                {t.title}
                              </button>
                              {t.description && <p>{t.description}</p>}
                              <div className="card-bottom">
                                <label>
                                  <span className="sr-only">Status of {t.title}</span>
                                  <select
                                    value={t.status}
                                    disabled={mutation.isPending}
                                    onChange={(e) =>
                                      void send(`/api/tasks/${t.id}`, 'PATCH', {
                                        status: e.target.value,
                                      })
                                    }
                                  >
                                    {states.map((st) => (
                                      <option key={st} value={st}>
                                        {labels[st]}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <span
                                  className="assignee"
                                  title={
                                    members.find((m) => m.id === t.assigneeId)?.name ?? 'Unassigned'
                                  }
                                >
                                  {members
                                    .find((m) => m.id === t.assigneeId)
                                    ?.name.slice(0, 2)
                                    .toUpperCase() ?? '—'}
                                </span>
                              </div>
                            </article>
                          ))}
                        {!filtered.some((t) => t.status === s) && (
                          <div className="empty-column">
                            <span>{s === 'DONE' ? '✓' : s === 'IN_PROGRESS' ? '↗' : '+'}</span>
                            <p>
                              {s === 'DONE'
                                ? 'Good things take a little time.'
                                : s === 'IN_PROGRESS'
                                  ? 'Ready when you are.'
                                  : 'Room for your next idea.'}
                            </p>
                          </div>
                        )}
                        <button
                          className="add-task"
                          onClick={() => {
                            setEditing(null);
                            setInitialStatus(s);
                            setModal('task');
                          }}
                        >
                          + Add task
                        </button>
                      </div>
                    </section>
                  ))}
                </div>
              )}
              <div className="board-footer">
                <span>Small steps. Meaningful progress.</span>
                <span>
                  {all.length
                    ? Math.round((all.filter((t) => t.status === 'DONE').length / all.length) * 100)
                    : 0}
                  % complete
                </span>
              </div>
            </>
          )}
        </main>
        <footer className="app-footer">
          <span>Thoughtfully organized. Effortlessly yours.</span>
          <span>TaskFlow © {new Date().getFullYear()}</span>
        </footer>
      </div>
      {(modal === 'project' || modal === 'edit-project') && (
        <Modal
          title={modal === 'project' ? 'Create a project' : 'Edit project'}
          close={() => setModal(null)}
        >
          <form onSubmit={submitProject}>
            <label>
              Project name
              <input
                name="name"
                required
                maxLength={120}
                defaultValue={modal === 'edit-project' ? project.data?.name : ''}
                placeholder="e.g. Website launch"
                autoFocus
              />
            </label>
            <label>
              Description
              <textarea
                name="description"
                maxLength={4000}
                defaultValue={modal === 'edit-project' ? project.data?.description : ''}
                placeholder="What are we working towards?"
              />
            </label>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <div className="form-actions">
              {modal === 'edit-project' && (
                <button
                  type="button"
                  className="danger"
                  disabled={mutation.isPending}
                  onClick={() => void deleteProject()}
                >
                  Delete project
                </button>
              )}
              <button className="primary" disabled={mutation.isPending}>
                Save project
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modal === 'task' && (
        <Modal
          title={editing ? 'Edit task' : 'Create a task'}
          close={() => {
            setModal(null);
            setEditing(null);
          }}
        >
          <form onSubmit={submitTask}>
            <label>
              Title
              <input
                name="title"
                required
                maxLength={200}
                defaultValue={editing?.title}
                autoFocus
              />
            </label>
            <label>
              Description
              <textarea name="description" maxLength={4000} defaultValue={editing?.description} />
            </label>
            <div className="form-row">
              <label>
                Status
                <select name="status" defaultValue={editing?.status ?? initialStatus}>
                  {states.map((s) => (
                    <option key={s} value={s}>
                      {labels[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Priority
                <select name="priority" defaultValue={editing?.priority ?? 'MEDIUM'}>
                  <option>LOW</option>
                  <option>MEDIUM</option>
                  <option>HIGH</option>
                </select>
              </label>
            </div>
            <label>
              Assignee
              <select name="assigneeId" defaultValue={editing?.assigneeId ?? ''}>
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <div className="form-actions">
              {editing && (
                <button
                  type="button"
                  className="danger"
                  disabled={mutation.isPending}
                  onClick={async () => {
                    if (confirm('Delete this task?')) {
                      const result = await send(`/api/tasks/${editing.id}`, 'DELETE');
                      if (result !== null) setModal(null);
                    }
                  }}
                >
                  Delete task
                </button>
              )}
              <button className="primary" disabled={mutation.isPending}>
                {editing ? 'Save changes' : 'Create task'}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modal === 'members' && (
        <Modal title="Project members" close={() => setModal(null)}>
          <ul className="member-list">
            {members.map((m: Member) => (
              <li key={m.id}>
                <span className="assignee">{m.name.slice(0, 2).toUpperCase()}</span>
                <span>
                  <strong>{m.name}</strong>
                  <small>
                    {m.email} · {m.role.toLowerCase()}
                  </small>
                </span>
                <button
                  className="danger"
                  disabled={mutation.isPending}
                  onClick={() => {
                    if (confirm(`Remove ${m.name} from this project?`))
                      void send(`/api/projects/${projectId}/members/${m.id}`, 'DELETE');
                  }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          {!members.length && <p>No members yet. Invite your first collaborator below.</p>}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const d = new FormData(form);
              const result = await send(`/api/projects/${projectId}/members`, 'POST', {
                name: d.get('name'),
                email: d.get('email'),
                role: d.get('role'),
              });
              if (result) form.reset();
            }}
          >
            <label>
              Name
              <input name="name" required maxLength={120} />
            </label>
            <label>
              Email
              <input name="email" type="email" required maxLength={254} />
            </label>
            <label>
              Role
              <select name="role">
                <option>MEMBER</option>
                <option>OWNER</option>
              </select>
            </label>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <button className="primary" disabled={mutation.isPending}>
              Add member
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
export function App() {
  return (
    <Routes>
      <Route path="/" element={<Board />} />
      <Route path="/projects/:projectId" element={<Board />} />
      <Route path="*" element={<Board />} />
    </Routes>
  );
}
