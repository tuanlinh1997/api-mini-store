-- Manual rollback for 20261002043358_init_schema (Prisma does not run this automatically).
-- Run only on a database you intend to wipe; it drops every application table.
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS `document_sequences`;
DROP TABLE IF EXISTS `stock_counts`;
DROP TABLE IF EXISTS `inventory_movements`;
DROP TABLE IF EXISTS `payments`;
DROP TABLE IF EXISTS `sale_items`;
DROP TABLE IF EXISTS `sales`;
DROP TABLE IF EXISTS `purchase_items`;
DROP TABLE IF EXISTS `purchases`;
DROP TABLE IF EXISTS `customers`;
DROP TABLE IF EXISTS `products`;
DROP TABLE IF EXISTS `suppliers`;
DROP TABLE IF EXISTS `categories`;
DROP TABLE IF EXISTS `user_sessions`;
DROP TABLE IF EXISTS `users`;
SET FOREIGN_KEY_CHECKS = 1;
DELETE FROM `_prisma_migrations` WHERE `migration_name` = '20261002043358_init_schema';
