CREATE TYPE "Status" AS ENUM ('TODO','IN_PROGRESS','DONE');
CREATE TYPE "Priority" AS ENUM ('LOW','MEDIUM','HIGH');
CREATE TABLE "Task" (
 "id" UUID NOT NULL,
 "projectId" UUID NOT NULL,
 "title" VARCHAR(200) NOT NULL,
 "description" VARCHAR(4000) NOT NULL DEFAULT '',
 "status" "Status" NOT NULL DEFAULT 'TODO',
 "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
 "assigneeId" UUID,
 "position" INTEGER NOT NULL DEFAULT 0,
 "version" INTEGER NOT NULL DEFAULT 0,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "Task_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "Task_position_check" CHECK ("position" >= 0)
);
CREATE INDEX "Task_projectId_status_position_idx" ON "Task"("projectId","status","position");
CREATE INDEX "Task_status_idx" ON "Task"("status");
CREATE INDEX "Task_assigneeId_idx" ON "Task"("assigneeId");
