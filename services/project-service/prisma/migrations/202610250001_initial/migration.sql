CREATE TABLE "Project" (
 "id" UUID NOT NULL,
 "name" VARCHAR(120) NOT NULL,
 "description" VARCHAR(4000) NOT NULL DEFAULT '',
 "state" TEXT NOT NULL DEFAULT 'ACTIVE',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "Project_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "Project_state_check" CHECK ("state" IN ('ACTIVE', 'DELETING'))
);
CREATE TABLE "ProjectMember" (
 "id" UUID NOT NULL,
 "projectId" UUID NOT NULL,
 "name" VARCHAR(120) NOT NULL,
 "email" VARCHAR(254) NOT NULL,
 "role" TEXT NOT NULL DEFAULT 'MEMBER',
 CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "ProjectMember_role_check" CHECK ("role" IN ('OWNER','MEMBER'))
);
CREATE TABLE "WritePermit" (
 "id" UUID NOT NULL,
 "projectId" UUID NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "WritePermit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProjectMember_projectId_email_key" ON "ProjectMember"("projectId","email");
CREATE INDEX "ProjectMember_projectId_idx" ON "ProjectMember"("projectId");
CREATE INDEX "WritePermit_projectId_idx" ON "WritePermit"("projectId");
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WritePermit" ADD CONSTRAINT "WritePermit_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
