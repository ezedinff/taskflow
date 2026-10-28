import { randomBytes } from 'node:crypto';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
if (existsSync('.env')) throw new Error('.env already exists; preserve its database passwords');
const secret = () => randomBytes(24).toString('hex');
const admin = secret(),
  project = secret(),
  task = secret(),
  token = secret();
writeFileSync(
  '.env',
  `POSTGRES_PASSWORD=${admin}\nPROJECT_DB_PASSWORD=${project}\nTASK_DB_PASSWORD=${task}\nINTERNAL_TOKEN=${token}\nPROJECT_DATABASE_URL=postgresql://project_user:${project}@localhost:5434/taskflow?schema=projects\nTASK_DATABASE_URL=postgresql://task_user:${task}@localhost:5434/taskflow?schema=tasks\n`,
  { mode: 0o600 },
);
mkdirSync('.taskflow', { recursive: true });
writeFileSync(
  '.taskflow/secrets.yaml',
  JSON.stringify(
    {
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: { name: 'taskflow-secrets', namespace: 'taskflow' },
      type: 'Opaque',
      stringData: {
        POSTGRES_PASSWORD: admin,
        PROJECT_DB_PASSWORD: project,
        TASK_DB_PASSWORD: task,
        INTERNAL_TOKEN: token,
        PROJECT_DATABASE_URL: `postgresql://project_user:${project}@postgres:5432/taskflow?schema=projects`,
        TASK_DATABASE_URL: `postgresql://task_user:${task}@postgres:5432/taskflow?schema=tasks`,
      },
    },
    null,
    2,
  ),
  { mode: 0o600 },
);
console.log('Created local .env and .taskflow/secrets.yaml. Both are ignored by Git.');
