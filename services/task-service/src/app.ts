import {
  internalSchema,
  createServer,
  requireInternal,
  schema,
  z,
  uuid,
  idParams,
  taskInput,
  taskPatch,
} from '@taskflow/contracts';
import type { Tasks } from './business.js';
export async function buildApp(
  service: Tasks,
  ready: () => Promise<unknown>,
  token: string,
  logger = true,
) {
  const app = await createServer('TaskFlow Task Service', ready, logger);
  const auth = requireInternal(token);
  const query = z.object({ projectId: uuid }).strict();
  app.get('/api/tasks', { schema: schema(undefined, undefined, query) }, async (req) =>
    service.list(query.parse(req.query).projectId),
  );
  app.post('/api/tasks', { schema: schema(taskInput) }, async (req, reply) =>
    reply.code(201).send(await service.create(taskInput.parse(req.body), req.id)),
  );
  app.get('/api/tasks/:id', { schema: schema(undefined, idParams) }, async (req) =>
    service.get(idParams.parse(req.params).id),
  );
  app.patch('/api/tasks/:id', { schema: schema(taskPatch, idParams) }, async (req) =>
    service.update(idParams.parse(req.params).id, taskPatch.parse(req.body), req.id),
  );
  app.delete('/api/tasks/:id', { schema: schema(undefined, idParams) }, async (req, reply) => {
    await service.remove(idParams.parse(req.params).id);
    return reply.code(204).send();
  });
  app.get(
    '/internal/projects/:id/tasks',
    { preHandler: auth, schema: internalSchema },
    async (req) => {
      const q = z.object({ assigneeId: uuid.optional() }).strict().parse(req.query);
      return service.hasTasks(idParams.parse(req.params).id, q.assigneeId);
    },
  );
  return app;
}
