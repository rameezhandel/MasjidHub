-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED');

-- CreateTable
CREATE TABLE "prayer_timetable_entries" (
    "id" UUID NOT NULL,
    "masjid_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "fajr" TEXT NOT NULL,
    "fajr_iqamah" TEXT,
    "dhuhr" TEXT NOT NULL,
    "dhuhr_iqamah" TEXT,
    "asr" TEXT NOT NULL,
    "asr_iqamah" TEXT,
    "maghrib" TEXT NOT NULL,
    "maghrib_iqamah" TEXT,
    "isha" TEXT NOT NULL,
    "isha_iqamah" TEXT,
    "jumuah1" TEXT,
    "jumuah2" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prayer_timetable_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" UUID NOT NULL,
    "masjid_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "masjid_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3),
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "prayer_timetable_entries_masjid_id_date_key" ON "prayer_timetable_entries"("masjid_id", "date");

-- CreateIndex
CREATE INDEX "announcements_masjid_id_status_idx" ON "announcements"("masjid_id", "status");

-- CreateIndex
CREATE INDEX "events_masjid_id_starts_at_idx" ON "events"("masjid_id", "starts_at");

-- CreateIndex
CREATE INDEX "events_masjid_id_status_idx" ON "events"("masjid_id", "status");

-- AddForeignKey
ALTER TABLE "prayer_timetable_entries" ADD CONSTRAINT "prayer_timetable_entries_masjid_id_fkey" FOREIGN KEY ("masjid_id") REFERENCES "masjids"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_masjid_id_fkey" FOREIGN KEY ("masjid_id") REFERENCES "masjids"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_masjid_id_fkey" FOREIGN KEY ("masjid_id") REFERENCES "masjids"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
