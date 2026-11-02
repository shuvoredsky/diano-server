-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'INITIATED';
ALTER TYPE "PaymentStatus" ADD VALUE 'PAID';
ALTER TYPE "PaymentStatus" ADD VALUE 'EXPIRED';
ALTER TYPE "PaymentStatus" ADD VALUE 'REFUND_PENDING';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "bankTranId" TEXT;

-- AlterTable
ALTER TABLE "Refund" ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Refund_idempotencyKey_key" ON "Refund"("idempotencyKey");
