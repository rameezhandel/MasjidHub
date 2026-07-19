-- CreateEnum
CREATE TYPE "FeeFrequency" AS ENUM ('MONTHLY', 'YEARLY');

-- AlterTable
ALTER TABLE "households" ADD COLUMN     "fee_amount_cents" INTEGER,
ADD COLUMN     "fee_frequency" "FeeFrequency",
ADD COLUMN     "fee_start_on" DATE;

-- CreateTable
CREATE TABLE "household_payments" (
    "id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "paid_on" DATE NOT NULL,
    "method" TEXT,
    "period_label" TEXT,
    "note" TEXT,
    "recorded_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "household_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "household_payments_household_id_paid_on_idx" ON "household_payments"("household_id", "paid_on");

-- AddForeignKey
ALTER TABLE "household_payments" ADD CONSTRAINT "household_payments_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_payments" ADD CONSTRAINT "household_payments_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
