import assert from 'node:assert/strict';
export const base = process.env.BASE_URL ?? 'http://localhost:8080';
export async function request(path, method = 'GET', body, status = 200) {
  const r = await fetch(`${base}${path}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const data = r.status === 204 ? undefined : await r.json();
  assert.equal(r.status, status, `${method} ${path}: ${JSON.stringify(data)}`);
  return data;
}
export async function smoke() {
  let p, t;
  try {
    p = await request(
      '/api/projects',
      'POST',
      { name: `Smoke ${crypto.randomUUID()}`, description: 'Automated verification' },
      201,
    );
    assert.equal((await request(`/api/projects/${p.id}`)).name, p.name);
    const member = await request(
      `/api/projects/${p.id}/members`,
      'POST',
      { name: 'Alice', email: 'alice@example.com' },
      201,
    );
    t = await request('/api/tasks', 'POST', { projectId: p.id, title: 'Deploy TaskFlow' }, 201);
    t = await request(`/api/tasks/${t.id}`, 'PATCH', {
      assigneeId: member.id,
      status: 'IN_PROGRESS',
      priority: 'HIGH',
    });
    assert.equal(t.assigneeId, member.id);
    await request(`/api/tasks/${t.id}`, 'PATCH', { status: 'DONE' });
    assert.equal((await request(`/api/tasks/${t.id}`)).status, 'DONE');
    await request(`/api/projects/${p.id}`, 'DELETE', undefined, 409);
    await request(`/api/projects/${p.id}/members/${member.id}`, 'DELETE', undefined, 409);
    await request(`/api/tasks/${t.id}`, 'DELETE', undefined, 204);
    t = undefined;
    await request(`/api/projects/${p.id}`, 'DELETE', undefined, 204);
    p = undefined;
    console.log('PASS smoke: project, member, task, assignment, status, deletion guard, cleanup');
  } finally {
    if (t) await request(`/api/tasks/${t.id}`, 'DELETE', undefined, 204);
    if (p) await request(`/api/projects/${p.id}`, 'DELETE', undefined, 204);
  }
}
if (process.argv[1]?.endsWith('smoke-test.mjs')) await smoke();
