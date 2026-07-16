-- CreateEnum
CREATE TYPE "HouseholdStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'MOVED_OUT');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

-- CreateTable
CREATE TABLE "households" (
    "id" UUID NOT NULL,
    "masjid_id" UUID NOT NULL,
    "family_name" TEXT NOT NULL,
    "head_name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address_line1" TEXT,
    "address_line2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postal_code" TEXT,
    "country" TEXT,
    "notes" TEXT,
    "status" "HouseholdStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "households_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "household_members" (
    "id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "relationship" TEXT,
    "gender" "Gender",
    "date_of_birth" DATE,
    "phone" TEXT,
    "email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "household_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "households_masjid_id_status_idx" ON "households"("masjid_id", "status");

-- CreateIndex
CREATE INDEX "households_masjid_id_family_name_idx" ON "households"("masjid_id", "family_name");

-- CreateIndex
CREATE INDEX "household_members_household_id_idx" ON "household_members"("household_id");

-- AddForeignKey
ALTER TABLE "households" ADD CONSTRAINT "households_masjid_id_fkey" FOREIGN KEY ("masjid_id") REFERENCES "masjids"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "households" ADD CONSTRAINT "households_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
