import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
const name = `taskflow-test-${randomBytes(6).toString('hex')}`;
const password = randomBytes(24).toString('hex');
function run(cmd, args, env = process.env) {
  const r = spawnSync(cmd, args, { env, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${cmd} ${args[0]} failed: ${r.stdout}\n${r.stderr}`);
  return r.stdout.trim();
}
try {
  run('docker', [
    'run',
    '-d',
    '--name',
    name,
    '-e',
    `POSTGRES_PASSWORD=${password}`,
    '-e',
    'POSTGRES_DB=taskflow',
    '-e',
    `PROJECT_DB_PASSWORD=${password}`,
    '-e',
    `TASK_DB_PASSWORD=${password}`,
    '-p',
    '127.0.0.1::5432',
    '-v',
    `${path.resolve('infrastructure/init-db.sh')}:/docker-entrypoint-initdb.d/10-init.sh:ro`,
    'postgres:17-alpine',
  ]);
  const port = JSON.parse(run('docker', ['inspect', name]))[0].NetworkSettings.Ports['5432/tcp'][0]
    .HostPort;
  let ready = false;
  for (let i = 0; i < 60; i++) {
    const r = spawnSync('docker', ['exec', name, 'pg_isready', '-U', 'postgres', '-d', 'taskflow']);
    if (r.status === 0) {
      ready = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!ready) throw new Error('Test database did not become ready');
  // pg_isready can succeed during first-time init; wait for final TCP listener and service roles.
  let initialized = false;
  for (let i = 0; i < 60; i++) {
    const r = spawnSync(
      'docker',
      [
        'exec',
        '-e',
        `PGPASSWORD=${password}`,
        name,
        'psql',
        '-h',
        '127.0.0.1',
        '-U',
        'postgres',
        '-d',
        'taskflow',
        '-tAc',
        "SELECT 1 FROM pg_roles WHERE rolname='task_user'",
      ],
      { encoding: 'utf8', env: { ...process.env, PGPASSWORD: password } },
    );
    if (r.status === 0 && r.stdout.trim() === '1') {
      initialized = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!initialized) throw new Error('Test database initialization did not finish');
  const project = `postgresql://project_user:${password}@127.0.0.1:${port}/taskflow?schema=projects`;
  const task = `postgresql://task_user:${password}@127.0.0.1:${port}/taskflow?schema=tasks`;
  for (const [service, url] of [
    ['project', project],
    ['task', task],
  ])
    run('npm', ['run', 'migrate', '-w', `@taskflow/${service}-service`], {
      ...process.env,
      DATABASE_URL: url,
    });
  console.log(
    run('node', ['--import', 'tsx', 'scripts/integration-suite.ts'], {
      ...process.env,
      PROJECT_DATABASE_URL: project,
      TASK_DATABASE_URL: task,
      INTERNAL_TOKEN: password,
      TEST_DATABASE: 'isolated',
    }),
  );
} finally {
  spawnSync('docker', ['rm', '-f', '-v', name], { stdio: 'ignore' });
}
