import { describe, it, expect, vi } from 'vitest';
import { taskInput, taskPatch, AppError } from '@taskflow/contracts';
import { buildApp } from '../src/app.js';
import type { Tasks } from '../src/business.js';
const projectId = '1a61346a-e71a-46d6-aa69-6fd0a943f945';
describe('task validation and workflow', () => {
  it('keeps PATCH inputs sparse so status changes preserve assignments', () => {
    expect(taskPatch.parse({ status: 'DONE' })).toEqual({ status: 'DONE' });
  });
  it('sets useful defaults and rejects invalid project and assignee IDs', () => {
    expect(taskInput.parse({ projectId, title: 'Task' })).toMatchObject({
      status: 'TODO',
      priority: 'MEDIUM',
      assigneeId: null,
    });
    for (const body of [
      { projectId: 'bad', title: 'Task' },
      { projectId, title: '' },
      { projectId, title: 'Task', assigneeId: 'bad' },
      { projectId, title: 'Task', position: -1 },
    ])
      expect(() => taskInput.parse(body)).toThrow();
  });
  it.each(['TODO', 'IN_PROGRESS', 'DONE'])('allows transition to %s', (status) => {
    expect(taskPatch.parse({ status }).status).toBe(status);
  });
  it('rejects unknown states, project moves, and empty updates', () => {
    for (const body of [{ status: 'ARCHIVED' }, { projectId }, {}])
      expect(() => taskPatch.parse(body)).toThrow();
  });
  it('does not call the business layer for invalid task input', async () => {
    const create = vi.fn();
    const app = await buildApp(
      { create } as unknown as Tasks,
      async () => true,
      'a'.repeat(48),
      false,
    );
    const r = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { projectId, title: '' },
    });
    expect(r.statusCode).toBe(400);
    expect(create).not.toHaveBeenCalled();
    await app.close();
  });
  it('fails readiness on database failure but stays live', async () => {
    const app = await buildApp(
      {} as Tasks,
      async () => {
        throw new Error('db offline');
      },
      'a'.repeat(48),
      false,
    );
    expect((await app.inject('/health/ready')).statusCode).toBe(503);
    expect((await app.inject('/health/live')).statusCode).toBe(200);
    await app.close();
  });
  it('returns a safe failure when project service is unavailable', async () => {
    const app = await buildApp(
      {
        create: vi
          .fn()
          .mockRejectedValue(
            new AppError(503, 'UPSTREAM_UNAVAILABLE', 'A required service is unavailable'),
          ),
      } as unknown as Tasks,
      async () => true,
      'a'.repeat(48),
      false,
    );
    const r = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { projectId, title: 'Task' },
    });
    expect(r.statusCode).toBe(503);
    await app.close();
  });
});

describe('write permit safety', () => {
  it('retains the permit on an ambiguous database failure', async () => {
    const { Tasks } = await import('../src/business.js');
    const request = vi
      .fn()
      .mockResolvedValueOnce({ exists: true, active: true, memberValid: null })
      .mockResolvedValueOnce({ id: projectId });
    const create = vi.fn().mockRejectedValue(new Error('Connection lost during commit'));
    const service = new Tasks({ task: { create } } as any, { request } as any);
    await expect(
      service.create(taskInput.parse({ projectId, title: 'Uncertain commit' }), 'r'),
    ).rejects.toThrow('Connection lost');
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('releases the permit only after a confirmed write', async () => {
    const { Tasks } = await import('../src/business.js');
    const request = vi
      .fn()
      .mockResolvedValueOnce({ exists: true, active: true, memberValid: null })
      .mockResolvedValueOnce({ id: projectId })
      .mockResolvedValueOnce(undefined);
    const create = vi.fn().mockResolvedValue({ id: projectId });
    const service = new Tasks({ task: { create } } as any, { request } as any);
    await service.create(taskInput.parse({ projectId, title: 'Committed' }), 'r');
    expect(request).toHaveBeenLastCalledWith(
      `/internal/projects/${projectId}/permits/${projectId}`,
      'r',
      'DELETE',
    );
  });
});
