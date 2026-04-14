-- Supports run summary lookups by workflow version and latest startedAt.
CREATE INDEX "WorkflowRun_workflowVersionId_startedAt_id_idx"
ON "WorkflowRun"("workflowVersionId", "startedAt" DESC, "id" DESC);
