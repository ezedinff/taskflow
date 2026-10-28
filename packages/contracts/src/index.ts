import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';
import swagger from '@fastify/swagger';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { z } from 'zod';
const zodToJsonSchema = (input: z.ZodType) =>
  z.toJSONSchema(input, { io: 'input', unrepresentable: 'any', target: 'openapi-3.0' });
import { timingSafeEqual } from 'node:crypto';
export { z };
export const uuid = z.string().uuid();
export const idParams = z.object({ id: uuid });
export const projectInput = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().max(4000).default(''),
  })
  .strict();
export const projectPatch = z
  .object({
    name: projectInput.shape.name.optional(),
    description: projectInput.shape.description.removeDefault().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field');
export const memberInput = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    role: z.enum(['OWNER', 'MEMBER']).default('MEMBER'),
  })
  .strict();
export const taskInput = z
  .object({
    projectId: uuid,
    title: z.string().trim().min(1).max(200),
    description: z.string().max(4000).default(''),
    status: z.enum(['TODO', 'IN_PROGRESS', 'DONE']).default('TODO'),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
    assigneeId: uuid.nullable().default(null),
    position: z.number().int().min(0).max(2147483647).default(0),
  })
  .strict();
export const taskPatch = z
  .object({
    title: taskInput.shape.title.optional(),
    description: taskInput.shape.description.removeDefault().optional(),
    status: taskInput.shape.status.removeDefault().optional(),
    priority: taskInput.shape.priority.removeDefault().optional(),
    assigneeId: taskInput.shape.assigneeId.removeDefault().optional(),
    position: taskInput.shape.position.removeDefault().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field');
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function requireInternal(token: string) {
  if (token.length < 32) throw new Error('INTERNAL_TOKEN must contain at least 32 characters');
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const received = req.headers.authorization ?? '';
    const expected = `Bearer ${token}`;
    if (
      Buffer.byteLength(received) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(received), Buffer.from(expected))
    )
      return reply.code(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Service authentication required',
          requestId: req.id,
        },
      });
  };
}
export function schema(body?: z.ZodTypeAny, params?: z.ZodTypeAny, query?: z.ZodTypeAny) {
  return {
    ...(body ? { body: zodToJsonSchema(body) } : {}),
    ...(params ? { params: zodToJsonSchema(params) } : {}),
    ...(query ? { querystring: zodToJsonSchema(query) } : {}),
  };
}
export async function createServer(
  title: string,
  ready: () => Promise<unknown>,
  logger = true,
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: logger
      ? {
          level: process.env.LOG_LEVEL ?? 'info',
          redact: ['req.headers.authorization', 'req.headers.cookie', 'DATABASE_URL', 'password'],
        }
      : false,
    bodyLimit: 65536,
    requestTimeout: 15000,
    genReqId: () => crypto.randomUUID(),
  });
  await app.register(swagger, { openapi: { info: { title, version: '1.0.0' } } });
  // Serve only a fixed allowlist of Swagger assets; no general-purpose filesystem routing.
  const require = createRequire(import.meta.url);
  const assets = dirname(require.resolve('swagger-ui-dist/package.json'));
  app.get('/docs', { schema: { hide: true } }, async (_req, reply) => reply.redirect('/docs/'));
  app.get('/docs/', { schema: { hide: true } }, async (_req, reply) =>
    reply
      .type('text/html; charset=utf-8')
      .send(
        `<!doctype html><html><head><meta charset="utf-8"><title>${title} API</title><link rel="stylesheet" href="./swagger-ui.css"></head><body><div id="swagger-ui"></div><script src="./swagger-ui-bundle.js"></script><script src="./init.js"></script></body></html>`,
      ),
  );
  app.get('/docs/json', { schema: { hide: true } }, async () => app.swagger());
  app.get('/docs/init.js', { schema: { hide: true } }, async (_req, reply) =>
    reply
      .type('application/javascript; charset=utf-8')
      .send("SwaggerUIBundle({url:'./json',dom_id:'#swagger-ui',deepLinking:true});"),
  );
  for (const [file, type] of [
    ['swagger-ui.css', 'text/css; charset=utf-8'],
    ['swagger-ui-bundle.js', 'application/javascript; charset=utf-8'],
  ]) {
    app.get(`/docs/${file}`, { schema: { hide: true } }, async (_req, reply) =>
      reply.type(type).send(await readFile(join(assets, file))),
    );
  }
  // Zod remains the authoritative validator; JSON schemas power the interactive documentation.
  app.setValidatorCompiler(() => () => true);
  app.addHook('onSend', async (req, reply) => {
    reply.header('x-request-id', req.id);
    reply.header('x-service-instance', process.env.HOSTNAME ?? title);
  });
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof z.ZodError)
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          requestId: req.id,
        },
      });
    const code = (err as { code?: string }).code;
    const mapped =
      err instanceof AppError
        ? err
        : code === 'P2002'
          ? new AppError(409, 'CONFLICT', 'A record with these values already exists')
          : code === 'P2025'
            ? new AppError(404, 'NOT_FOUND', 'Record not found')
            : new AppError(
                (err as { statusCode?: number }).statusCode ?? 500,
                'REQUEST_FAILED',
                ((err as { statusCode?: number }).statusCode ?? 500) < 500
                  ? err instanceof Error
                    ? err.message
                    : 'Invalid request'
                  : 'The service could not complete the request',
              );
    if (mapped.status >= 500) req.log.error({ err }, 'Request failed');
    return reply
      .code(mapped.status)
      .send({ error: { code: mapped.code, message: mapped.message, requestId: req.id } });
  });
  app.setNotFoundHandler((req, reply) =>
    reply
      .code(404)
      .send({ error: { code: 'NOT_FOUND', message: 'Route not found', requestId: req.id } }),
  );
  app.get('/health/live', async () => ({ status: 'ok' }));
  app.get('/health/ready', async () => {
    try {
      await ready();
      return { status: 'ready' };
    } catch {
      throw new AppError(503, 'NOT_READY', 'Database unavailable');
    }
  });
  return app;
}
export class ServiceClient {
  constructor(
    private base: string,
    private token: string,
    private timeoutMs = 3000,
  ) {
    new URL(base);
  }
  async request<T>(path: string, requestId: string, method = 'GET', body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(new URL(path, this.base), {
        method,
        headers: {
          authorization: `Bearer ${this.token}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          'x-correlation-id': requestId,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new AppError(
        503,
        'UPSTREAM_UNAVAILABLE',
        'A required service is unavailable or timed out',
      );
    }
    if (response.status === 204) return undefined as T;
    let data: any;
    try {
      data = await response.json();
    } catch {
      throw new AppError(
        502,
        'UPSTREAM_INVALID',
        'A required service returned an invalid response',
      );
    }
    if (!response.ok) {
      if ([400, 404, 409].includes(response.status))
        throw new AppError(
          response.status,
          data.error?.code ?? 'UPSTREAM_REJECTED',
          data.error?.message ?? 'Validation rejected',
        );
      throw new AppError(
        response.status >= 500 ? 503 : 502,
        'UPSTREAM_FAILED',
        'A required service failed',
      );
    }
    return data as T;
  }
}
export async function start(app: FastifyInstance, port: number, cleanup: () => Promise<void>) {
  let closing = false;
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => {
      if (closing) return;
      closing = true;
      void app
        .close()
        .then(cleanup)
        .catch((err) => {
          app.log.error(err);
          process.exitCode = 1;
        });
    });
  await app.listen({ port, host: '0.0.0.0' });
}

export const internalSchema: import('fastify').FastifySchema = { hide: true };
