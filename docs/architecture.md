# TaskFlow architecture

TaskFlow organizes project work into To do, In progress, and Done. People can manage projects and members, assign tasks, set priorities, filter work, and follow progress in a responsive browser interface. Status selects support keyboard users without relying on drag and drop.

Exactly two custom business microservices implement the system:

| Component | Ownership | Communication |
| --- | --- | --- |
| Project Service, Fastify on 3001 | Projects, members, deletion state, write permits | Public project REST API; authenticated task existence checks |
| Task Service, Fastify on 3002 | Tasks, statuses, priorities, assignments, positions | Public task REST API; HTTP project/membership validation and write permits |
| PostgreSQL 17 | One server with private `projects` and `tasks` schemas | Separate restricted service roles, no cross-schema joins or foreign keys |
| React frontend / static Nginx | Browser interface and public path routing | Relative `/api/projects` and `/api/tasks` URLs |

See [the diagram](architecture-diagram.md). Nginx is the static web server, not a third custom backend or business gateway. The NodePort web Service provides one external entry point. No end-user identity service is introduced.

## Patterns and ownership

The database-per-service pattern uses private schemas on a shared server rather than physically separate servers. Each schema has an independent Prisma model, generated client, credentials, and migration history. Database permissions enforce ownership. Sharing the server saves operational work but couples availability, capacity, backup schedules, and maintenance. It remains a single point of failure.

Services are stateless across requests: replicas share authoritative database records, never in-memory coordination state. Kubernetes DNS resolves `project-service:3001`, `task-service:3002`, and `postgres:5432`. REST clients have a 3-second timeout, explicit 502/503 mapping, and no retries. A task creation makes a public validation GET, then an authenticated permit POST that revalidates inside a row-locked transaction. Logs show these interactions and correlation IDs. Task listing, status changes, and deletions remain usable during Project Service failure; new task creation and new assignments fail closed.

## Deletion protocol

A plain validation-then-check protocol has a race: an in-flight task could commit after a project is deleted. TaskFlow uses persistent write permits:

1. Project Service locks the project row, checks ACTIVE state and membership, and inserts a WritePermit in its own schema.
2. Task Service writes to its own schema, then releases the permit over authenticated REST after confirmed success. A failed database operation retains the permit because its commit outcome may be ambiguous.
3. Deletion locks that same project row. If a permit exists, it refuses with 409. Otherwise it changes the project to DELETING and commits, blocking subsequent permits.
4. Project Service asks Task Service whether tasks exist. Tasks present yields 409; a failed call yields 503. Both restore ACTIVE state. With no tasks, it deletes the project and its members.
5. Member removal uses the same freeze protocol and checks for assigned tasks, preventing dangling assignments.

Requests racing to acquire permits or freeze a project serialize on the database row lock. Task updates use optimistic version checks to reject lost updates. A new assignment requires a permit; changing status or clearing an assignee does not introduce a new reference. Task creation never writes without a permit.

This is **not a distributed transaction**. Crashes can leave durable permits or DELETING records and prevent progress. Permits deliberately do not expire: expiring a permit while a delayed write is still running would reopen the orphan race. Failure ambiguity and manual operator repair remain limitations; see [operations](deployment.md#recovering-stuck-coordination). Database commit uncertainty must be resolved before operator repair. Network partitions trade availability for consistency. More complex production alternatives include a durable saga/outbox and reconciliation workers, which this two-service MVP does not implement.

## Commercial assessment

A small task application would normally be simpler and cheaper as a monolith. Two services add HTTP latency, deployment order, more credentials, tracing work, failure modes, and consistency coordination. This assignment intentionally makes those tradeoffs visible.

Independent deployment and scaling become commercially reasonable with separate teams owning project governance versus high-volume task operations, many concurrent boards, integration-heavy task processing, or substantially different CPU/throughput needs. Task workers could scale independently from the slower-changing project catalog. Revenue, load, and team autonomy would need to justify extra platform and on-call costs. A larger deployment should measure actual saturation and database connection capacity before adding replicas.
