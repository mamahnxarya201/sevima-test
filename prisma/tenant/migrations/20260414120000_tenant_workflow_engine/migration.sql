-- Tenant-isolated workflow + execution schema (NOT the management DB).
-- This migration lives under prisma/tenant/migrations so `migrate deploy --schema prisma/tenant/schema.prisma`
-- does not reuse prisma/migrations (management / Better Auth).

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'RETRYING', 'TIMEOUT');

-- CreateTable
CREATE TABLE "Workflow" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ownerId" TEXT NOT NULL,
    "activeVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowVersion" (
    "id" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "definition" JSONB NOT NULL,
    "workflowId" TEXT NOT NULL,

    CONSTRAINT "WorkflowVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowRun" (
    "id" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'PENDING',
    "workflowVersionId" TEXT NOT NULL,
    "triggeredById" TEXT,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "duration" INTEGER,

    CONSTRAINT "WorkflowRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StepRun" (
    "id" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "logs" TEXT,
    "errorMessage" TEXT,
    "outputs" JSONB,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "StepRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Workflow_ownerId_idx" ON "Workflow"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowVersion_workflowId_versionNumber_key" ON "WorkflowVersion"("workflowId", "versionNumber");

-- CreateIndex
CREATE INDEX "WorkflowRun_status_startedAt_idx" ON "WorkflowRun"("status", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "WorkflowRun_triggeredById_idx" ON "WorkflowRun"("triggeredById");

-- CreateIndex
CREATE INDEX "StepRun_runId_idx" ON "StepRun"("runId");

-- AddForeignKey
ALTER TABLE "WorkflowVersion" ADD CONSTRAINT "WorkflowVersion_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_workflowVersionId_fkey" FOREIGN KEY ("workflowVersionId") REFERENCES "WorkflowVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepRun" ADD CONSTRAINT "StepRun_runId_fkey" FOREIGN KEY ("runId") REFERENCES "WorkflowRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
