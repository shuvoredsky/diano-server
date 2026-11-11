-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "averageRating" DECIMAL(3,2) NOT NULL DEFAULT 0.00,
ADD COLUMN     "reviewCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "moderatedAt" TIMESTAMP(3),
ADD COLUMN     "moderatedById" TEXT,
ADD COLUMN     "moderationReason" TEXT;

-- CreateIndex
CREATE INDEX "Review_status_deletedAt_idx" ON "Review"("status", "deletedAt");

