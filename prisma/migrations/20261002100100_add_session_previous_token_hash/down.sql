-- Manual rollback for 20261002100100_add_session_previous_token_hash (Prisma does not run this automatically).
-- Drops only the reuse-detection hashes; sessions themselves are untouched.
DROP INDEX `user_sessions_previous_refresh_token_hash_key` ON `user_sessions`;
ALTER TABLE `user_sessions` DROP COLUMN `previous_refresh_token_hash`;
DELETE FROM `_prisma_migrations` WHERE `migration_name` = '20261002100100_add_session_previous_token_hash';
