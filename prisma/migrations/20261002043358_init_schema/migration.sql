-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `username` VARCHAR(50) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `full_name` VARCHAR(120) NOT NULL,
    `role` ENUM('ADMIN', 'CASHIER', 'STOCKKEEPER') NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_username_key`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_sessions` (
    `id` CHAR(36) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `refresh_token_hash` CHAR(64) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `user_agent` VARCHAR(255) NULL,
    `ip` VARCHAR(64) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `user_sessions_refresh_token_hash_key`(`refresh_token_hash`),
    INDEX `idx_user_sessions_user_id_revoked_at`(`user_id`, `revoked_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(120) NOT NULL,
    `description` VARCHAR(500) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `categories_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `suppliers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(200) NOT NULL,
    `phone` VARCHAR(20) NULL,
    `email` VARCHAR(255) NULL,
    `address` VARCHAR(500) NULL,
    `note` VARCHAR(1000) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_suppliers_name`(`name`),
    INDEX `idx_suppliers_phone`(`phone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `products` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `category_id` INTEGER NOT NULL,
    `sku` VARCHAR(50) NOT NULL,
    `barcode` VARCHAR(50) NULL,
    `name` VARCHAR(200) NOT NULL,
    `unit` VARCHAR(30) NOT NULL,
    `sale_price` DECIMAL(12, 2) NOT NULL,
    `cost_price` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `stock_qty` DECIMAL(12, 3) NOT NULL DEFAULT 0,
    `reorder_level` DECIMAL(12, 3) NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `products_sku_key`(`sku`),
    UNIQUE INDEX `products_barcode_key`(`barcode`),
    INDEX `idx_products_name`(`name`),
    INDEX `idx_products_category_id`(`category_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `customer_code` VARCHAR(20) NOT NULL,
    `full_name` VARCHAR(120) NOT NULL,
    `phone` VARCHAR(20) NULL,
    `email` VARCHAR(255) NULL,
    `loyalty_points` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `customers_customer_code_key`(`customer_code`),
    UNIQUE INDEX `customers_phone_key`(`phone`),
    INDEX `idx_customers_full_name`(`full_name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchases` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `purchase_no` VARCHAR(20) NOT NULL,
    `supplier_id` INTEGER NOT NULL,
    `created_by` INTEGER NOT NULL,
    `status` ENUM('DRAFT', 'RECEIVED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `subtotal` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `total` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `note` VARCHAR(1000) NULL,
    `received_at` DATETIME(3) NULL,
    `received_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `purchases_purchase_no_key`(`purchase_no`),
    INDEX `idx_purchases_supplier_id`(`supplier_id`),
    INDEX `idx_purchases_created_by`(`created_by`),
    INDEX `idx_purchases_status_created_at`(`status`, `created_at`),
    INDEX `idx_purchases_created_at`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `purchase_id` INTEGER NOT NULL,
    `product_id` INTEGER NOT NULL,
    `quantity` DECIMAL(12, 3) NOT NULL,
    `unit_cost` DECIMAL(12, 2) NOT NULL,
    `line_total` DECIMAL(12, 2) NOT NULL,

    INDEX `idx_purchase_items_product_id`(`product_id`),
    UNIQUE INDEX `uq_purchase_items_purchase_id_product_id`(`purchase_id`, `product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sales` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `invoice_no` VARCHAR(20) NOT NULL,
    `customer_id` INTEGER NULL,
    `cashier_id` INTEGER NOT NULL,
    `status` ENUM('PAID') NOT NULL DEFAULT 'PAID',
    `subtotal` DECIMAL(12, 2) NOT NULL,
    `discount_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `total` DECIMAL(12, 2) NOT NULL,
    `points_earned` INTEGER NOT NULL DEFAULT 0,
    `note` VARCHAR(500) NULL,
    `sold_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sales_invoice_no_key`(`invoice_no`),
    INDEX `idx_sales_sold_at`(`sold_at`),
    INDEX `idx_sales_customer_id`(`customer_id`),
    INDEX `idx_sales_cashier_id_sold_at`(`cashier_id`, `sold_at`),
    INDEX `idx_sales_created_at`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sale_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sale_id` INTEGER NOT NULL,
    `product_id` INTEGER NOT NULL,
    `sku_snapshot` VARCHAR(50) NOT NULL,
    `name_snapshot` VARCHAR(200) NOT NULL,
    `quantity` DECIMAL(12, 3) NOT NULL,
    `unit_price` DECIMAL(12, 2) NOT NULL,
    `unit_cost_snapshot` DECIMAL(12, 2) NOT NULL,
    `discount_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `line_total` DECIMAL(12, 2) NOT NULL,

    INDEX `idx_sale_items_sale_id`(`sale_id`),
    INDEX `idx_sale_items_product_id`(`product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sale_id` INTEGER NOT NULL,
    `method` ENUM('CASH', 'CARD', 'TRANSFER', 'OTHER') NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `tendered_amount` DECIMAL(12, 2) NOT NULL,
    `change_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `paid_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `reference` VARCHAR(100) NULL,

    INDEX `idx_payments_sale_id`(`sale_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inventory_movements` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `product_id` INTEGER NOT NULL,
    `movement_type` ENUM('PURCHASE', 'SALE', 'ADJUSTMENT', 'REVERSAL') NOT NULL,
    `quantity_change` DECIMAL(12, 3) NOT NULL,
    `reference_type` ENUM('PURCHASE', 'SALE', 'STOCK_COUNT') NOT NULL,
    `reference_id` INTEGER NOT NULL,
    `created_by` INTEGER NOT NULL,
    `note` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_inventory_movements_product_id_created_at`(`product_id`, `created_at`),
    INDEX `idx_inventory_movements_reference`(`reference_type`, `reference_id`),
    INDEX `idx_inventory_movements_created_at`(`created_at`),
    INDEX `idx_inventory_movements_created_by`(`created_by`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stock_counts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `count_no` VARCHAR(20) NOT NULL,
    `product_id` INTEGER NOT NULL,
    `system_qty` DECIMAL(12, 3) NOT NULL,
    `counted_qty` DECIMAL(12, 3) NOT NULL,
    `difference` DECIMAL(12, 3) NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `created_by` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `stock_counts_count_no_key`(`count_no`),
    INDEX `idx_stock_counts_product_id_created_at`(`product_id`, `created_at`),
    INDEX `idx_stock_counts_created_at`(`created_at`),
    INDEX `idx_stock_counts_created_by`(`created_by`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `document_sequences` (
    `sequence_key` VARCHAR(40) NOT NULL,
    `last_value` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`sequence_key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_sessions` ADD CONSTRAINT `user_sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `products` ADD CONSTRAINT `products_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchases` ADD CONSTRAINT `purchases_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchases` ADD CONSTRAINT `purchases_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_items` ADD CONSTRAINT `purchase_items_purchase_id_fkey` FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_items` ADD CONSTRAINT `purchase_items_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales` ADD CONSTRAINT `sales_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales` ADD CONSTRAINT `sales_cashier_id_fkey` FOREIGN KEY (`cashier_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sale_items` ADD CONSTRAINT `sale_items_sale_id_fkey` FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sale_items` ADD CONSTRAINT `sale_items_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_sale_id_fkey` FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_movements` ADD CONSTRAINT `inventory_movements_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_movements` ADD CONSTRAINT `inventory_movements_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_counts` ADD CONSTRAINT `stock_counts_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_counts` ADD CONSTRAINT `stock_counts_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Manual: CHECK constraints (MySQL 8.0.16+ enforces them; Prisma cannot model them).
ALTER TABLE `users`
  ADD CONSTRAINT `chk_users_username_not_blank` CHECK (CHAR_LENGTH(TRIM(`username`)) > 0),
  ADD CONSTRAINT `chk_users_full_name_not_blank` CHECK (CHAR_LENGTH(TRIM(`full_name`)) > 0);

ALTER TABLE `categories`
  ADD CONSTRAINT `chk_categories_name_not_blank` CHECK (CHAR_LENGTH(TRIM(`name`)) > 0);

ALTER TABLE `suppliers`
  ADD CONSTRAINT `chk_suppliers_name_not_blank` CHECK (CHAR_LENGTH(TRIM(`name`)) > 0);

ALTER TABLE `products`
  ADD CONSTRAINT `chk_products_stock_qty_non_negative` CHECK (`stock_qty` >= 0),
  ADD CONSTRAINT `chk_products_sale_price_non_negative` CHECK (`sale_price` >= 0),
  ADD CONSTRAINT `chk_products_cost_price_non_negative` CHECK (`cost_price` >= 0),
  ADD CONSTRAINT `chk_products_reorder_level_non_negative` CHECK (`reorder_level` >= 0),
  ADD CONSTRAINT `chk_products_sku_not_blank` CHECK (CHAR_LENGTH(TRIM(`sku`)) > 0),
  ADD CONSTRAINT `chk_products_name_not_blank` CHECK (CHAR_LENGTH(TRIM(`name`)) > 0);

ALTER TABLE `customers`
  ADD CONSTRAINT `chk_customers_loyalty_points_non_negative` CHECK (`loyalty_points` >= 0);

ALTER TABLE `purchases`
  ADD CONSTRAINT `chk_purchases_subtotal_non_negative` CHECK (`subtotal` >= 0),
  ADD CONSTRAINT `chk_purchases_total_non_negative` CHECK (`total` >= 0);

ALTER TABLE `purchase_items`
  ADD CONSTRAINT `chk_purchase_items_quantity_positive` CHECK (`quantity` > 0),
  ADD CONSTRAINT `chk_purchase_items_unit_cost_non_negative` CHECK (`unit_cost` >= 0),
  ADD CONSTRAINT `chk_purchase_items_line_total_non_negative` CHECK (`line_total` >= 0);

ALTER TABLE `sales`
  ADD CONSTRAINT `chk_sales_subtotal_non_negative` CHECK (`subtotal` >= 0),
  ADD CONSTRAINT `chk_sales_discount_non_negative` CHECK (`discount_amount` >= 0),
  ADD CONSTRAINT `chk_sales_total_positive` CHECK (`total` > 0),
  ADD CONSTRAINT `chk_sales_discount_below_subtotal` CHECK (`discount_amount` < `subtotal`),
  ADD CONSTRAINT `chk_sales_points_non_negative` CHECK (`points_earned` >= 0);

ALTER TABLE `sale_items`
  ADD CONSTRAINT `chk_sale_items_quantity_positive` CHECK (`quantity` > 0),
  ADD CONSTRAINT `chk_sale_items_unit_price_non_negative` CHECK (`unit_price` >= 0),
  ADD CONSTRAINT `chk_sale_items_unit_cost_non_negative` CHECK (`unit_cost_snapshot` >= 0),
  ADD CONSTRAINT `chk_sale_items_discount_non_negative` CHECK (`discount_amount` >= 0),
  ADD CONSTRAINT `chk_sale_items_line_total_non_negative` CHECK (`line_total` >= 0);

ALTER TABLE `payments`
  ADD CONSTRAINT `chk_payments_amount_positive` CHECK (`amount` > 0),
  ADD CONSTRAINT `chk_payments_tendered_gte_amount` CHECK (`tendered_amount` >= `amount`),
  ADD CONSTRAINT `chk_payments_change_non_negative` CHECK (`change_amount` >= 0);

ALTER TABLE `inventory_movements`
  ADD CONSTRAINT `chk_inventory_movements_quantity_change_non_zero` CHECK (`quantity_change` <> 0);

ALTER TABLE `stock_counts`
  ADD CONSTRAINT `chk_stock_counts_system_qty_non_negative` CHECK (`system_qty` >= 0),
  ADD CONSTRAINT `chk_stock_counts_counted_qty_non_negative` CHECK (`counted_qty` >= 0),
  ADD CONSTRAINT `chk_stock_counts_reason_not_blank` CHECK (CHAR_LENGTH(TRIM(`reason`)) > 0);

ALTER TABLE `document_sequences`
  ADD CONSTRAINT `chk_document_sequences_last_value_non_negative` CHECK (`last_value` >= 0);
