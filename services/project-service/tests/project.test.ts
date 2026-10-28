import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  projectInput,
  projectPatch,
  memberInput,
  ServiceClient,
  AppError,
} from '@taskflow/contracts';
import { buildApp } from '../src/app.js';
import type { Projects } from '../src/business.js';
const token = 'a'.repeat(48);
afterEach(() => vi.unstubAllGlobals());
describe('project and member input', () => {
  it('preserves omitted fields on project updates', () => {
    expect(projectPatch.parse({ name: 'Rename' })).toEqual({ name: 'Rename' });
    expect(() => projectPatch.parse({})).toThrow();
  });
  it('rejects blank projects and unexpected fields', () => {
    expect(() => projectInput.parse({ name: '  ' })).toThrow();
    expect(() => projectInput.parse({ name: 'A', admin: true })).toThrow();
  });
  it('normalizes member emails and validates roles', () => {
    expect(memberInput.parse({ name: 'Alice', email: 'ALICE@example.com' }).email).toBe(
      'alice@example.com',
    );
    expect(() => memberInput.parse({ name: 'Alice', email: 'invalid' })).toThrow();
    expect(() =>
      memberInput.parse({ name: 'Alice', email: 'a@example.com', role: 'ADMIN' }),
    ).toThrow();
  });
  it('validates identifiers before reaching business logic', async () => {
    const get = vi.fn();
    const app = await buildApp({ get } as unknown as Projects, async () => true, token, false);
    const r = await app.inject('/api/projects/not-a-uuid');
    expect(r.statusCode).toBe(400);
    expect(get).not.toHaveBeenCalled();
    await app.close();
  });
  it('maps deletion refusal and dependency failure consistently', async () => {
    for (const status of [409, 503]) {
      const app = await buildApp(
        {
          remove: vi.fn().mockRejectedValue(new AppError(status, 'BLOCKED', 'Cannot delete')),
        } as unknown as Projects,
        async () => true,
        token,
        false,
      );
      const r = await app.inject({
        method: 'DELETE',
        url: '/api/projects/1a61346a-e71a-46d6-aa69-6fd0a943f945',
      });
      expect(r.statusCode).toBe(status);
      expect(r.json().error.requestId).toBeTruthy();
      await app.close();
    }
  });
  it('authenticates internal routes and hides them from OpenAPI', async () => {
    const app = await buildApp(
      { permit: vi.fn() } as unknown as Projects,
      async () => true,
      token,
      false,
    );
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/internal/projects/1a61346a-e71a-46d6-aa69-6fd0a943f945/permits',
          payload: {},
        })
      ).statusCode,
    ).toBe(401);
    expect(JSON.stringify(app.swagger())).not.toContain('/internal/');
    await app.close();
  });
});
describe('typed upstream client', () => {
  it('maps refused connections and timeouts to 503', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')));
    await expect(
      new ServiceClient('http://project-service:3001', token).request('/x', 'request'),
    ).rejects.toMatchObject({ status: 503, code: 'UPSTREAM_UNAVAILABLE' });
  });
  it('maps invalid JSON to 502', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not json')));
    await expect(
      new ServiceClient('http://project-service:3001', token).request('/x', 'request'),
    ).rejects.toMatchObject({ status: 502 });
  });
  it('propagates validation rejection without retries', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: 'INVALID_ASSIGNEE', message: 'Invalid assignee' } }),
          { status: 400 },
        ),
      );
    vi.stubGlobal('fetch', fetch);
    await expect(
      new ServiceClient('http://project-service:3001', token).request('/x', 'r'),
    ).rejects.toMatchObject({ status: 400 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('passes correlation and authentication headers, accepts empty deletion result', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetch);
    await new ServiceClient('http://project-service:3001', token).request(
      '/x',
      'correlation',
      'DELETE',
    );
    expect(fetch.mock.calls[0][1].headers['x-correlation-id']).toBe('correlation');
    expect(fetch.mock.calls[0][1].headers.authorization).toBe(`Bearer ${token}`);
  });
});
