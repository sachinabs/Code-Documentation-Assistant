-- AlterTable
ALTER TABLE "Milestone" ADD COLUMN     "completedWork" JSONB,
ADD COLUMN     "conversationId" TEXT,
ADD COLUMN     "decisions" JSONB,
ADD COLUMN     "pendingWork" JSONB,
ADD COLUMN     "recommendations" JSONB,
ADD COLUMN     "technologies" JSONB;
