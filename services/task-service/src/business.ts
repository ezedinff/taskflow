import { AppError, ServiceClient, uuid, type z, taskInput, taskPatch } from '@taskflow/contracts';
import { PrismaClient } from '../generated/client/index.js';
export class Tasks {
  constructor(
    private db: PrismaClient,
    private projects: ServiceClient,
    private log: (obj: unknown, message: string) => void = () => {},
  ) {}
  list(projectId: string) {
    return this.db.task.findMany({
      where: { projectId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
  }
  async get(id: string) {
    const task = await this.db.task.findUnique({ where: { id } });
    if (!task) throw new AppError(404, 'TASK_NOT_FOUND', 'Task not found');
    return task;
  }
  async hasTasks(projectId: string, assigneeId?: string) {
    return {
      hasTasks:
        (await this.db.task.count({
          where: { projectId, ...(assigneeId ? { assigneeId } : {}) },
        })) > 0,
    };
  }
  private async validatedWrite<T>(
    projectId: string,
    assigneeId: string | null,
    requestId: string,
    write: () => Promise<T>,
  ) {
    this.log(
      { projectId, requestId },
      'Calling Project Service for project and membership validation',
    );
    const validation = await this.projects.request<{
      exists: boolean;
      active: boolean;
      memberValid: boolean | null;
    }>(
      `/api/projects/${projectId}/validation${assigneeId ? `?memberId=${assigneeId}` : ''}`,
      requestId,
    );
    if (!validation.exists || !validation.active || (assigneeId && !validation.memberValid))
      throw new AppError(
        502,
        'INVALID_VALIDATION',
        'Project Service returned an invalid validation result',
      );
    // A durable permit closes the validation/deletion race. No expiry: crashes fail closed.
    const permit = await this.projects.request<{ id: string }>(
      `/internal/projects/${projectId}/permits`,
      requestId,
      'POST',
      { assigneeId },
    );
    if (!uuid.safeParse(permit.id).success)
      throw new AppError(502, 'UPSTREAM_INVALID', 'Project Service returned an invalid permit');
    let committed = false;
    try {
      const result = await write();
      committed = true;
      return result;
    } finally {
      // A rejected database operation may have an ambiguous commit outcome. Keep its permit.
      if (!committed)
        this.log(
          { projectId, permitId: permit.id, requestId },
          'Task write failed; permit retained until operator reconciliation',
        );
      if (committed)
        try {
          await this.projects.request(
            `/internal/projects/${projectId}/permits/${permit.id}`,
            requestId,
            'DELETE',
          );
        } catch (err) {
          this.log(
            {
              projectId,
              permitId: permit.id,
              requestId,
              error: err instanceof Error ? err.message : 'release failed',
            },
            'Permit release failed; operator reconciliation required',
          );
        }
    }
  }
  create(data: z.infer<typeof taskInput>, requestId: string) {
    return this.validatedWrite(data.projectId, data.assigneeId, requestId, () =>
      this.db.task.create({ data }),
    );
  }
  async update(id: string, data: z.infer<typeof taskPatch>, requestId: string) {
    const current = await this.get(id);
    const write = async () => {
      const result = await this.db.task.updateMany({
        where: { id, version: current.version },
        data: { ...data, version: { increment: 1 } },
      });
      if (!result.count)
        throw new AppError(409, 'TASK_CHANGED', 'Task changed concurrently; reload and retry');
      return this.get(id);
    };
    // Changes that retain/remove the existing assignee need no upstream call. New assignments do.
    if (data.assigneeId && data.assigneeId !== current.assigneeId)
      return this.validatedWrite(current.projectId, data.assigneeId, requestId, write);
    return write();
  }
  async remove(id: string) {
    await this.db.task.delete({ where: { id } });
  }
}
