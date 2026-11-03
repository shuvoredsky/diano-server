-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('RENT', 'SALARIES', 'UTILITIES', 'MARKETING', 'PACKAGING', 'LOGISTICS', 'OFFICE_SUPPLIES', 'SOFTWARE_SUBSCRIPTION', 'MAINTENANCE', 'OTHER');

-- AlterTable
ALTER TABLE "Refund" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Expense" (
    "id" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Expense_date_idx" ON "Expense"("date");
CREATE INDEX IF NOT EXISTS "Expense_category_idx" ON "Expense"("category");
CREATE INDEX IF NOT EXISTS "Expense_category_date_idx" ON "Expense"("category", "date");
CREATE INDEX IF NOT EXISTS "CheckoutEvent_occurredAt_idx" ON "CheckoutEvent"("occurredAt");
CREATE INDEX IF NOT EXISTS "CheckoutEvent_type_occurredAt_idx" ON "CheckoutEvent"("type", "occurredAt");
CREATE INDEX IF NOT EXISTS "Order_deliveredAt_idx" ON "Order"("deliveredAt");
CREATE INDEX IF NOT EXISTS "Order_status_placedAt_idx" ON "Order"("status", "placedAt");
CREATE INDEX IF NOT EXISTS "Refund_completedAt_idx" ON "Refund"("completedAt");
CREATE INDEX IF NOT EXISTS "Refund_status_completedAt_idx" ON "Refund"("status", "completedAt");
CREATE INDEX IF NOT EXISTS "Refund_createdAt_idx" ON "Refund"("createdAt");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Expense_createdBy_fkey'
    ) THEN
        ALTER TABLE "Expense" ADD CONSTRAINT "Expense_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;
