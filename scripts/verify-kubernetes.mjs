import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { request, base } from './smoke-test.mjs';
function kubectl(...args) {
  const r = spawnSync('kubectl', args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.trim();
}
let project, task;
try {
  project = await request(
    '/api/projects',
    'POST',
    { name: `Persistence check ${crypto.randomUUID()}` },
    201,
  );
  task = await request(
    '/api/tasks',
    'POST',
    { projectId: project.id, title: 'Survives PostgreSQL pod replacement' },
    201,
  );
  kubectl('scale', 'deployment/project-service', '--replicas=3', '-n', 'taskflow');
  kubectl('scale', 'deployment/task-service', '--replicas=2', '-n', 'taskflow');
  for (const service of ['project-service', 'task-service'])
    kubectl('rollout', 'status', `deployment/${service}`, '-n', 'taskflow', '--timeout=180s');
  for (const [name, path] of [
    ['projects', '/api/projects'],
    ['tasks', `/api/tasks?projectId=${project.id}`],
  ]) {
    const instances = new Set();
    for (let i = 0; i < 24; i++) {
      const r = await fetch(base + path);
      assert.equal(r.status, 200);
      instances.add(r.headers.get('x-service-instance'));
      await r.arrayBuffer();
    }
    assert.ok(instances.size >= 2, `Requests did not reach multiple ${name} replicas`);
    console.log(`PASS independent scaling / ${name}: ${[...instances].join(', ')}`);
  }
  const before = JSON.parse(
    kubectl('get', 'pvc', 'data-postgres-0', '-n', 'taskflow', '-o', 'json'),
  ).metadata.uid;
  kubectl('delete', 'pod', 'postgres-0', '-n', 'taskflow');
  kubectl('wait', '--for=condition=ready', 'pod/postgres-0', '-n', 'taskflow', '--timeout=180s');
  const after = JSON.parse(kubectl('get', 'pvc', 'data-postgres-0', '-n', 'taskflow', '-o', 'json'))
    .metadata.uid;
  assert.equal(after, before);
  let recovered = false;
  for (let i = 0; i < 15; i++) {
    try {
      assert.equal((await request(`/api/tasks/${task.id}`)).title, task.title);
      assert.equal((await request(`/api/projects/${project.id}`)).id, project.id);
      recovered = true;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  assert.ok(recovered, 'Database data unavailable after pod replacement');
  console.log('PASS PostgreSQL pod replacement: same PVC and persisted project/task');
  kubectl('scale', 'deployment/project-service', '--replicas=0', '-n', 'taskflow');
  kubectl(
    'wait',
    '--for=delete',
    'pod',
    '-l',
    'app=project-service',
    '-n',
    'taskflow',
    '--timeout=120s',
  );
  await request(
    '/api/tasks',
    'POST',
    { projectId: project.id, title: 'Must not be inserted' },
    503,
  );
  await request(`/api/tasks?projectId=${project.id}`);
  await request(`/api/tasks/${task.id}`, 'PATCH', { status: 'DONE' });
  console.log(
    'PASS dependency outage: writes fail safely; task reads/status updates remain available',
  );
} finally {
  kubectl('scale', 'deployment/project-service', '--replicas=3', '-n', 'taskflow');
  kubectl('rollout', 'status', 'deployment/project-service', '-n', 'taskflow', '--timeout=180s');
  if (task) await request(`/api/tasks/${task.id}`, 'DELETE', undefined, 204);
  if (project) await request(`/api/projects/${project.id}`, 'DELETE', undefined, 204);
}
