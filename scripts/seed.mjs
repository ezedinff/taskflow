import { request } from './smoke-test.mjs';
const projects = await request('/api/projects');
if (projects.some((p) => p.name === 'Website launch')) {
  console.log('Demo project already exists; left unchanged.');
  process.exit(0);
}
const p = await request(
  '/api/projects',
  'POST',
  {
    name: 'Website launch',
    description: 'A fresh look, a clear vision. Let’s bring our next chapter to life.',
  },
  201,
);
const alice = await request(
  `/api/projects/${p.id}/members`,
  'POST',
  { name: 'Alice Chen', email: 'alice@example.com', role: 'OWNER' },
  201,
);
const bob = await request(
  `/api/projects/${p.id}/members`,
  'POST',
  { name: 'Bob Wilson', email: 'bob@example.com' },
  201,
);
for (const [title, description, status, priority, assigneeId] of [
  [
    'Map out the user journey',
    'Think through the moments that matter, from first visit to first project.',
    'TODO',
    'HIGH',
    alice.id,
  ],
  [
    'Write the launch announcement',
    'A few thoughtful words to introduce what we’ve been building.',
    'TODO',
    'MEDIUM',
    null,
  ],
  [
    'Review mobile experience',
    'Make sure every little detail feels right on a smaller screen.',
    'TODO',
    'LOW',
    bob.id,
  ],
  [
    'Build the component library',
    'Bring the visual language together into reusable building blocks.',
    'IN_PROGRESS',
    'HIGH',
    alice.id,
  ],
  [
    'Connect the service APIs',
    'Wire up projects and tasks, with graceful handling when things go sideways.',
    'IN_PROGRESS',
    'MEDIUM',
    bob.id,
  ],
  [
    'Define the project direction',
    'A shared vision, a clear scope, and a good place to begin.',
    'DONE',
    'LOW',
    alice.id,
  ],
  [
    'Set up the workspace',
    'Our tools, our team, and everything we need to get going.',
    'DONE',
    'MEDIUM',
    bob.id,
  ],
])
  await request(
    '/api/tasks',
    'POST',
    { projectId: p.id, title, description, status, priority, assigneeId },
    201,
  );
console.log('Created Website launch demo project with two members and seven tasks.');
