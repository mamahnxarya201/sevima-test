-- AlterTable
ALTER TABLE "WorkflowVersion" ADD COLUMN IF NOT EXISTS "editorState" JSONB;
