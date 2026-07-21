-- Reset development data: wipe everything EXCEPT platform admin account(s).
--
-- Safe to run while the app is under development. Keeps every user whose role
-- is PLATFORM_ADMIN and removes all masjids and their data.
--
-- Order matters: users.masjid_id is ON DELETE RESTRICT, so non-admin users must
-- go before their masjids. Deleting a masjid cascades its households (and their
-- members/payments), prayer times, announcements, events, invitations, and
-- member relationships. Deleting a user cascades its refresh/reset tokens.
--
-- Run inside a transaction so a mistake rolls back cleanly.

BEGIN;

-- Audit history is not tied to a masjid by a foreign key, so clear it explicitly.
DELETE FROM audit_logs;

-- Remove every non-platform-admin account. This frees the RESTRICT on masjids
-- and cascades each user's refresh tokens and password reset tokens.
DELETE FROM users WHERE role <> 'PLATFORM_ADMIN';

-- With no users left pointing at them, delete all masjids. This cascades all
-- masjid-scoped content (households, members, payments, prayer times,
-- announcements, events, invitations, member relationships).
DELETE FROM masjids;

-- Sanity check: only platform admin(s) remain, and nothing else is left.
--   SELECT count(*) FROM users;     -- expect your admin count
--   SELECT count(*) FROM masjids;   -- expect 0

COMMIT;
