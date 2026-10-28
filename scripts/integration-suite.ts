import assert from 'node:assert/strict';
import { ServiceClient } from '@taskflow/contracts';
import { PrismaClient as ProjectDB } from '../services/project-service/generated/client/index.js';
import { PrismaClient as TaskDB } from '../services/task-service/generated/client/index.js';
import { Projects } from '../services/project-service/src/business.js';
import { Tasks } from '../services/task-service/src/business.js';
import { buildApp as projectApp } from '../services/project-service/src/app.js';
import { buildApp as taskApp } from '../services/task-service/src/app.js';
if (process.env.TEST_DATABASE !== 'isolated')
  throw new Error('Use npm run test:integration to create an isolated disposable database');
const pd = new ProjectDB({ datasourceUrl: process.env.PROJECT_DATABASE_URL });
const td = new TaskDB({ datasourceUrl: process.env.TASK_DATABASE_URL });
const token = process.env.INTERNAL_TOKEN!;
const pc = new ServiceClient('http://127.0.0.1:1', token, 250);
const tc = new ServiceClient('http://127.0.0.1:1', token, 250);
const projects = new Projects(pd, tc);
const tasks = new Tasks(td, pc);
const pa = await projectApp(projects, () => pd.$queryRaw`SELECT 1`, token, false);
const ta = await taskApp(tasks, () => td.$queryRaw`SELECT 1`, token, false);
await pa.listen({ host: '127.0.0.1', port: 0 });
await ta.listen({ host: '127.0.0.1', port: 0 });
// Clients are configured only after ephemeral ports have been allocated.
const pu = `http://127.0.0.1:${(pa.server.address() as { port: number }).port}`;
const tu = `http://127.0.0.1:${(ta.server.address() as { port: number }).port}`;
Object.assign(pc, { base: pu });
Object.assign(tc, { base: tu });
let checks = 0;
async function req(base: string, path: string, method = 'GET', body?: unknown, status = 200) {
  const r = await fetch(base + path, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = r.status === 204 ? undefined : await r.json();
  assert.equal(r.status, status, JSON.stringify(data));
  checks++;
  return data;
}
try {
  const p = await req(pu, '/api/projects', 'POST', { name: 'Integration' }, 201);
  assert.equal((await req(pu, `/api/projects/${p.id}`)).name, 'Integration');
  await req(pu, `/api/projects/${p.id}`, 'PATCH', { name: 'Renamed' });
  const member = await req(
    pu,
    `/api/projects/${p.id}/members`,
    'POST',
    { name: 'Alice', email: 'Alice@example.com' },
    201,
  );
  await req(
    pu,
    `/api/projects/${p.id}/members`,
    'POST',
    { name: 'Duplicate', email: 'ALICE@example.com' },
    409,
  );
  await req(
    tu,
    '/api/tasks',
    'POST',
    { projectId: crypto.randomUUID(), title: 'Invalid project' },
    404,
  );
  await req(
    tu,
    '/api/tasks',
    'POST',
    { projectId: p.id, title: 'Invalid member', assigneeId: crypto.randomUUID() },
    400,
  );
  const t = await req(
    tu,
    '/api/tasks',
    'POST',
    { projectId: p.id, title: 'Real task', assigneeId: member.id },
    201,
  );
  for (const status of ['IN_PROGRESS', 'DONE', 'TODO'])
    assert.equal((await req(tu, `/api/tasks/${t.id}`, 'PATCH', { status })).status, status);
  assert.equal((await req(tu, `/api/tasks?projectId=${p.id}`)).length, 1);
  await req(pu, `/api/projects/${p.id}`, 'DELETE', undefined, 409);
  await req(pu, `/api/projects/${p.id}/members/${member.id}`, 'DELETE', undefined, 409);
  // Durable permits prevent deletion/member removal while a validated write is in flight.
  const permit = await projects.permit(p.id, member.id);
  await req(pu, `/api/projects/${p.id}`, 'DELETE', undefined, 409);
  await req(pu, `/api/projects/${p.id}/members/${member.id}`, 'DELETE', undefined, 409);
  await projects.release(p.id, permit.id);
  // A frozen project rejects new permits and public validation.
  await pd.project.update({ where: { id: p.id }, data: { state: 'DELETING' } });
  await assert.rejects(() => projects.permit(p.id), { status: 409 });
  checks++;
  await req(tu, '/api/tasks', 'POST', { projectId: p.id, title: 'During delete' }, 409);
  await pd.project.update({ where: { id: p.id }, data: { state: 'ACTIVE' } });
  // Simulate service loss using a refused TCP port: task reads/status updates still work.
  Object.assign(pc, { base: 'http://127.0.0.1:1' });
  await req(tu, '/api/tasks', 'POST', { projectId: p.id, title: 'Upstream down' }, 503);
  await req(tu, `/api/tasks/${t.id}`);
  await req(tu, `/api/tasks/${t.id}`, 'PATCH', { status: 'DONE' });
  assert.equal(await td.task.count(), 1);
  checks++;
  Object.assign(pc, { base: pu });
  await req(tu, `/api/tasks/${t.id}`, 'DELETE', undefined, 204);
  Object.assign(tc, { base: 'http://127.0.0.1:1' });
  await req(pu, `/api/projects/${p.id}`, 'DELETE', undefined, 503);
  assert.equal((await pd.project.findUniqueOrThrow({ where: { id: p.id } })).state, 'ACTIVE');
  checks++;
  Object.assign(tc, { base: tu });
  await req(pu, `/api/projects/${p.id}/members/${member.id}`, 'DELETE', undefined, 204);
  await req(pu, `/api/projects/${p.id}`, 'DELETE', undefined, 204);
  await req(pu, `/api/projects/${p.id}`, 'GET', undefined, 404);
  // Assert both credentials are unable to read the other service’s tables.
  await assert.rejects(() => pd.$queryRawUnsafe('SELECT * FROM tasks."Task"'));
  checks++;
  await assert.rejects(() => td.$queryRawUnsafe('SELECT * FROM projects."Project"'));
  checks++;
  await req(tu, `/internal/projects/${crypto.randomUUID()}/tasks`, 'GET', undefined, 401);
  // Stress the actual distributed deletion race: successful deletes must have no orphan rows.
  for (let i = 0; i < 12; i++) {
    const project = await req(pu, '/api/projects', 'POST', { name: `Race ${i}` }, 201);
    const [created, deleted] = await Promise.all([
      fetch(tu + '/api/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId: project.id, title: 'Concurrent task' }),
      }),
      fetch(pu + `/api/projects/${project.id}`, { method: 'DELETE' }),
    ]);
    assert.ok([201, 404, 409].includes(created.status), `unexpected task result ${created.status}`);
    assert.ok([204, 409].includes(deleted.status), `unexpected delete result ${deleted.status}`);
    const exists = await pd.project.count({ where: { id: project.id } });
    const count = await td.task.count({ where: { projectId: project.id } });
    assert.ok(exists > 0 || count === 0, 'Project deletion left orphaned tasks');
    checks++;
    if (created.status === 201) {
      const task = await created.json();
      await req(tu, `/api/tasks/${task.id}`, 'DELETE', undefined, 204);
    }
    if (exists) await req(pu, `/api/projects/${project.id}`, 'DELETE', undefined, 204);
  }

  console.log(
    `PASS ${checks} integration checks: real PostgreSQL, HTTP communication, ownership, deletion coordination, validation, workflow, failure isolation`,
  );
} finally {
  await pa.close();
  await ta.close();
  await pd.$disconnect();
  await td.$disconnect();
}
