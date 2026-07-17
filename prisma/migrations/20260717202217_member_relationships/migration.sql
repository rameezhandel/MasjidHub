-- CreateEnum
CREATE TYPE "RelationshipType" AS ENUM ('PARENT', 'SPOUSE');

-- CreateTable
CREATE TABLE "member_relationships" (
    "id" UUID NOT NULL,
    "masjid_id" UUID NOT NULL,
    "type" "RelationshipType" NOT NULL,
    "from_member_id" UUID NOT NULL,
    "to_member_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "member_relationships_masjid_id_idx" ON "member_relationships"("masjid_id");

-- CreateIndex
CREATE INDEX "member_relationships_from_member_id_idx" ON "member_relationships"("from_member_id");

-- CreateIndex
CREATE INDEX "member_relationships_to_member_id_idx" ON "member_relationships"("to_member_id");

-- CreateIndex
CREATE UNIQUE INDEX "member_relationships_from_member_id_to_member_id_type_key" ON "member_relationships"("from_member_id", "to_member_id", "type");

-- AddForeignKey
ALTER TABLE "member_relationships" ADD CONSTRAINT "member_relationships_masjid_id_fkey" FOREIGN KEY ("masjid_id") REFERENCES "masjids"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_relationships" ADD CONSTRAINT "member_relationships_from_member_id_fkey" FOREIGN KEY ("from_member_id") REFERENCES "household_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_relationships" ADD CONSTRAINT "member_relationships_to_member_id_fkey" FOREIGN KEY ("to_member_id") REFERENCES "household_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
