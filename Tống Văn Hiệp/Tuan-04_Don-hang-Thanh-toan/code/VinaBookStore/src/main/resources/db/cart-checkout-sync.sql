-- Schema changes for account carts and checkout inventory reservation (MySQL 8).
-- Apply once before deploying with ddl-auto=validate. Development ddl-auto=update
-- creates these automatically; inspect INFORMATION_SCHEMA before running manually.
-- Existing orders MUST retain stock_reserved=false; inventory was not reserved at creation.
ALTER TABLE carts ADD COLUMN sync_revision BIGINT NOT NULL DEFAULT 0;
ALTER TABLE carts ADD COLUMN last_sync_request VARCHAR(255) NULL;
CREATE TABLE cart_migration_keys (
    cart_id BIGINT NOT NULL,
    client_key VARCHAR(80) NOT NULL,
    PRIMARY KEY (cart_id, client_key),
    CONSTRAINT fk_cart_migration_cart FOREIGN KEY (cart_id) REFERENCES carts(cart_id)
);
ALTER TABLE orders ADD COLUMN stock_reserved BOOLEAN NOT NULL DEFAULT FALSE;
