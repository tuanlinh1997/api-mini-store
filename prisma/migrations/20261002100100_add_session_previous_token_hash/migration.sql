-- Refresh-token reuse detection (task 006): remember the hash of the token a rotation replaced.
-- Nullable and unique (MySQL allows many NULLs), so existing sessions need no backfill.

-- AlterTable
ALTER TABLE `user_sessions` ADD COLUMN `previous_refresh_token_hash` CHAR(64) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `user_sessions_previous_refresh_token_hash_key` ON `user_sessions`(`previous_refresh_token_hash`);
