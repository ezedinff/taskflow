import {
  internalSchema,
  createServer,
  requireInternal,
  schema,
  z,
  uuid,
  idParams,
  projectInput,
  projectPatch,
  memberInput,
} from '@taskflow/contracts';
import type { Projects } from './business.js';
export async function buildApp(
  service: Projects,
  ready: () => Promise<unknown>,
  token: string,
  logger = true,
) {
  const app = await createServer('TaskFlow Project Service', ready, logger);
  const auth = requireInternal(token);
  app.get('/api/projects', async () => service.list());
  app.post('/api/projects', { schema: schema(projectInput) }, async (req, reply) =>
    reply.code(201).send(await service.create(projectInput.parse(req.body))),
  );
  app.get('/api/projects/:id', { schema: schema(undefined, idParams) }, async (req) =>
    service.get(idParams.parse(req.params).id),
  );
  app.patch('/api/projects/:id', { schema: schema(projectPatch, idParams) }, async (req) =>
    service.update(idParams.parse(req.params).id, projectPatch.parse(req.body)),
  );
  app.delete('/api/projects/:id', { schema: schema(undefined, idParams) }, async (req, reply) => {
    await service.remove(idParams.parse(req.params).id, req.id);
    return reply.code(204).send();
  });
  app.get('/api/projects/:id/members', { schema: schema(undefined, idParams) }, async (req) =>
    service.members(idParams.parse(req.params).id),
  );
  app.post(
    '/api/projects/:id/members',
    { schema: schema(memberInput, idParams) },
    async (req, reply) =>
      reply
        .code(201)
        .send(await service.addMember(idParams.parse(req.params).id, memberInput.parse(req.body))),
  );
  const memberParams = idParams.extend({ memberId: uuid });
  app.delete(
    '/api/projects/:id/members/:memberId',
    { schema: schema(undefined, memberParams) },
    async (req, reply) => {
      const p = memberParams.parse(req.params);
      await service.removeMember(p.id, p.memberId, req.id);
      return reply.code(204).send();
    },
  );
  const validationQuery = z.object({ memberId: uuid.optional() }).strict();
  app.get(
    '/api/projects/:id/validation',
    { schema: schema(undefined, idParams, validationQuery) },
    async (req) => {
      req.log.info(
        { correlationId: req.headers['x-correlation-id'] },
        'Validating project membership',
      );
      return service.validate(
        idParams.parse(req.params).id,
        validationQuery.parse(req.query).memberId,
      );
    },
  );
  const permitInput = z.object({ assigneeId: uuid.nullable().optional() }).strict();
  app.post(
    '/internal/projects/:id/permits',
    { preHandler: auth, schema: internalSchema },
    async (req, reply) =>
      reply
        .code(201)
        .send(
          await service.permit(
            idParams.parse(req.params).id,
            permitInput.parse(req.body).assigneeId,
          ),
        ),
  );
  app.delete(
    '/internal/projects/:id/permits/:permitId',
    { preHandler: auth, schema: internalSchema },
    async (req, reply) => {
      const p = idParams.extend({ permitId: uuid }).parse(req.params);
      await service.release(p.id, p.permitId);
      return reply.code(204).send();
    },
  );
  return app;
}
