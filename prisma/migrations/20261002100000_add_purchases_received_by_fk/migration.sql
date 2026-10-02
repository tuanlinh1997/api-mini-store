-- Referential integrity for purchases.received_by (was a plain INT with no FK).
-- Fails (rather than silently rewriting data) if any received_by points at a missing user.
-- Index first, then the constraint, so the FK never has to build its own implicit index.

-- CreateIndex
CREATE INDEX `idx_purchases_received_by` ON `purchases`(`received_by`);

-- AddForeignKey
ALTER TABLE `purchases` ADD CONSTRAINT `purchases_received_by_fkey` FOREIGN KEY (`received_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
