import { AppError, ServiceClient, type z, projectInput, memberInput } from '@taskflow/contracts';
import { PrismaClient, type Prisma } from '../generated/client/index.js';
type Tx = Prisma.TransactionClient;
export class Projects {
  constructor(
    private db: PrismaClient,
    private tasks: ServiceClient,
  ) {}
  private async lock(tx: Tx, id: string) {
    await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${id}::uuid FOR UPDATE`;
    const p = await tx.project.findUnique({ where: { id } });
    if (!p) throw new AppError(404, 'PROJECT_NOT_FOUND', 'Project not found');
    if (p.state !== 'ACTIVE')
      throw new AppError(409, 'PROJECT_BUSY', 'Project is being deleted; try again later');
    return p;
  }
  list() {
    return this.db.project.findMany({
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { members: true } } },
    });
  }
  async get(id: string) {
    const p = await this.db.project.findUnique({ where: { id }, include: { members: true } });
    if (!p) throw new AppError(404, 'PROJECT_NOT_FOUND', 'Project not found');
    return p;
  }
  create(data: z.infer<typeof projectInput>) {
    return this.db.project.create({ data });
  }
  update(id: string, data: Partial<z.infer<typeof projectInput>>) {
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, id);
      return tx.project.update({ where: { id }, data });
    });
  }
  async validate(id: string, memberId?: string) {
    const p = await this.get(id);
    if (p.state !== 'ACTIVE') throw new AppError(409, 'PROJECT_BUSY', 'Project is being deleted');
    if (memberId && !p.members.some((m) => m.id === memberId))
      throw new AppError(400, 'INVALID_ASSIGNEE', 'Assignee must belong to this project');
    return { projectId: id, exists: true, active: true, memberValid: memberId ? true : null };
  }
  members(id: string) {
    return this.get(id).then((p) => p.members);
  }
  addMember(id: string, data: z.infer<typeof memberInput>) {
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, id);
      return tx.projectMember.create({ data: { ...data, projectId: id } });
    });
  }
  async permit(id: string, memberId?: string | null) {
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, id);
      if (
        memberId &&
        !(await tx.projectMember.findFirst({ where: { id: memberId, projectId: id } }))
      )
        throw new AppError(400, 'INVALID_ASSIGNEE', 'Assignee must belong to this project');
      return tx.writePermit.create({ data: { projectId: id } });
    });
  }
  async release(id: string, permitId: string) {
    await this.db.writePermit.deleteMany({ where: { id: permitId, projectId: id } });
  }
  private async freeze(id: string) {
    await this.db.$transaction(async (tx) => {
      await this.lock(tx, id);
      if (await tx.writePermit.count({ where: { projectId: id } }))
        throw new AppError(
          409,
          'WRITES_IN_PROGRESS',
          'Task writes are in progress; retry after they finish',
        );
      await tx.project.update({ where: { id }, data: { state: 'DELETING' } });
    });
  }
  async remove(id: string, requestId: string) {
    await this.freeze(id);
    try {
      const result = await this.tasks.request<{ hasTasks: boolean }>(
        `/internal/projects/${id}/tasks`,
        requestId,
      );
      if (typeof result.hasTasks !== 'boolean')
        throw new AppError(
          502,
          'UPSTREAM_INVALID',
          'Task Service returned an invalid existence check',
        );
      if (result.hasTasks)
        throw new AppError(
          409,
          'PROJECT_HAS_TASKS',
          'Delete all project tasks before deleting the project',
        );
      await this.db.project.delete({ where: { id } });
    } catch (err) {
      await this.db.project.updateMany({
        where: { id, state: 'DELETING' },
        data: { state: 'ACTIVE' },
      });
      throw err;
    }
  }
  async removeMember(id: string, memberId: string, requestId: string) {
    await this.freeze(id);
    try {
      const result = await this.tasks.request<{ hasTasks: boolean }>(
        `/internal/projects/${id}/tasks?assigneeId=${memberId}`,
        requestId,
      );
      if (typeof result.hasTasks !== 'boolean')
        throw new AppError(
          502,
          'UPSTREAM_INVALID',
          'Task Service returned an invalid existence check',
        );
      if (result.hasTasks)
        throw new AppError(
          409,
          'MEMBER_ASSIGNED',
          'Unassign this member’s tasks before removing the member',
        );
      const deleted = await this.db.projectMember.deleteMany({
        where: { id: memberId, projectId: id },
      });
      if (!deleted.count) throw new AppError(404, 'MEMBER_NOT_FOUND', 'Member not found');
    } finally {
      await this.db.project.updateMany({
        where: { id, state: 'DELETING' },
        data: { state: 'ACTIVE' },
      });
    }
  }
}
