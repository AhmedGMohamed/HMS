-- 004_admin_users_roles.sql
--
-- Phase 6.12 admin schema: account status, last login, and the
-- system/automation principal.
--
-- There is no migration runner in this project — `setUpDatabase.initDB()`
-- only runs when the database is first created, so this file documents the
-- change and mirrors `ensureAdminSchema()`, which runs on every boot and is
-- the mechanism that actually applies it. Kept in the 001–003 convention so
-- the schema history stays readable.

-- ---------------------------------------------------------------- columns
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS is_active  BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS is_system  BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS last_login TIMESTAMP;
ALTER TABLE Role   ADD COLUMN IF NOT EXISTS is_system  BOOLEAN NOT NULL DEFAULT FALSE;

-- ------------------------------------------------------------- System role
-- `Role.is_system` marks the automation role only. `Admin` is NOT a system
-- role: it stays visible, its permissions stay editable, and it is protected
-- solely because its name is a code contract (`isPrivilegedRole`).
--
-- The name matching below is a one-time bootstrap affordance. Once a role is
-- flagged, `is_system` is authoritative and the name is never consulted.
UPDATE Role
   SET is_system = TRUE
 WHERE LOWER(name) = 'system'
   AND is_system = FALSE;

INSERT INTO Role (name, is_system)
SELECT 'System', TRUE
 WHERE NOT EXISTS (
	SELECT 1 FROM Role WHERE LOWER(name) = 'system'
 );

-- ------------------------------------------------- move the automation user
-- The seeded `system` account previously borrowed the Admin role. It must own
-- the System role instead; `isPrivilegedRole` still grants it the bypass.
UPDATE "User"
   SET is_system = TRUE
 WHERE username = 'system';

UPDATE "User"
   SET role_id = (
		SELECT role_id FROM Role WHERE is_system = TRUE ORDER BY role_id LIMIT 1
	   )
 WHERE is_system = TRUE
   AND role_id IS DISTINCT FROM (
		SELECT role_id FROM Role WHERE is_system = TRUE ORDER BY role_id LIMIT 1
	   );

-- ---------------------------------------------------------------- indexes
CREATE INDEX IF NOT EXISTS idx_user_role_id   ON "User"(role_id);
CREATE INDEX IF NOT EXISTS idx_user_is_active ON "User"(is_active);
CREATE INDEX IF NOT EXISTS idx_user_is_system ON "User"(is_system);
