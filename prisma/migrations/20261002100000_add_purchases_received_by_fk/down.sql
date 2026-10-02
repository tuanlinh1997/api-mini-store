-- Manual rollback for 20261002100000_add_purchases_received_by_fk (Prisma does not run this automatically).
ALTER TABLE `purchases` DROP FOREIGN KEY `purchases_received_by_fkey`;
DROP INDEX `idx_purchases_received_by` ON `purchases`;
DELETE FROM `_prisma_migrations` WHERE `migration_name` = '20261002100000_add_purchases_received_by_fk';
