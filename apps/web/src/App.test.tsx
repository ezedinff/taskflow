// @vitest-environment jsdom
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { render, screen, waitFor, cleanup, within, configure } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
configure({ asyncUtilTimeout: 10000 });
let calls: { path: string; method: string; body: any }[] = [];
let tasks: any[] = [];
let projectList: (typeof project)[] = [];
const project = {
  id: 'p1',
  name: 'Website launch',
  description: 'Build something useful',
  state: 'ACTIVE',
  members: [],
};
beforeEach(() => {
  calls = [];
  tasks = [];
  projectList = [project, { ...project, id: 'p2', name: 'Mobile app' }];
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  vi.stubGlobal('confirm', () => true);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, opts: any = {}) => {
      const method = opts.method ?? 'GET';
      const body = opts.body ? JSON.parse(opts.body) : undefined;
      calls.push({ path, method, body });
      if (method === 'POST' && path === '/api/tasks') {
        if (body.title === 'fail')
          return new Response(
            JSON.stringify({ error: { message: 'Project Service unavailable' } }),
            { status: 503 },
          );
        const t = { ...body, id: 't1' };
        tasks.push(t);
        return new Response(JSON.stringify(t), { status: 201 });
      }
      if (method === 'DELETE' && path.startsWith('/api/projects/')) {
        projectList = projectList.filter((p) => path !== `/api/projects/${p.id}`);
        return new Response(null, { status: 204 });
      }
      if (method === 'PATCH') {
        tasks = tasks.map((t) => ({ ...t, ...body }));
        return new Response(JSON.stringify(tasks[0]));
      }
      return new Response(
        JSON.stringify(
          path === '/api/projects'
            ? projectList
            : path.startsWith('/api/tasks')
              ? tasks
              : (projectList.find((p) => path === `/api/projects/${p.id}`) ?? project),
        ),
      );
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function mount() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <MemoryRouter initialEntries={['/projects/p1']}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
it('selects a project from the sidebar', async () => {
  mount();
  await userEvent.click(await screen.findByRole('button', { name: /Mobile app/ }));
  await waitFor(() => expect(calls.some((c) => c.path === '/api/projects/p2')).toBe(true));
});
it('creates a task and changes its status', async () => {
  mount();
  await userEvent.click(await screen.findByRole('button', { name: '+ New task' }));
  const dialog = screen.getByRole('dialog');
  await userEvent.type(within(dialog).getByLabelText('Title'), 'Ship the board');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Create task' }));
  await screen.findByRole('button', { name: 'Ship the board' });
  await userEvent.selectOptions(screen.getByLabelText('Status of Ship the board'), 'DONE');
  await waitFor(() =>
    expect(calls.some((c) => c.method === 'PATCH' && c.body.status === 'DONE')).toBe(true),
  );
});
it('shows validation and upstream errors without losing the form', async () => {
  mount();
  await userEvent.click(await screen.findByRole('button', { name: '+ New task' }));
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByLabelText('Title')).toBeRequired();
  await userEvent.type(within(dialog).getByLabelText('Title'), 'fail');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Create task' }));
  await waitFor(() =>
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Project Service unavailable'),
  );
  expect(within(dialog).getByLabelText('Title')).toHaveValue('fail');
});

it('selects a remaining project after deleting the current project', async () => {
  mount();
  await screen.findByRole('heading', { name: 'Website launch' });
  await userEvent.click(screen.getByRole('button', { name: 'Edit project' }));
  await userEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete project' }),
  );
  await screen.findByRole('heading', { name: 'Mobile app' });
  expect(screen.queryByRole('button', { name: /▧ Website launch/ })).not.toBeInTheDocument();
});
