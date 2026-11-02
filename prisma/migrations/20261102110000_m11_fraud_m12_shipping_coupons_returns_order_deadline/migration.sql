-- AlterEnum
ALTER TYPE "FraudReviewStatus" ADD VALUE 'OTP_REQUESTED';

-- AlterEnum
ALTER TYPE "ReturnStatus" ADD VALUE 'RECEIVED';

-- AlterEnum
ALTER TYPE "ShipmentStatus" ADD VALUE 'RETURNING';
ALTER TYPE "ShipmentStatus" ADD VALUE 'RETURNED';

-- AlterTable
ALTER TABLE "Coupon" ADD COLUMN "allowOnSale" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "scopes" JSONB DEFAULT '{}';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "paymentDeadline" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ShippingMethod" ADD COLUMN "freeShippingThreshold" DECIMAL(12,2),
ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Order_paymentDeadline_idx" ON "Order"("paymentDeadline");
