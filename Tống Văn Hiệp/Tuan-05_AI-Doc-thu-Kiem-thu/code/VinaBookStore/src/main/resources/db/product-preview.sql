-- Chạy một lần trước khi deploy production (production đang dùng ddl-auto=validate).
ALTER TABLE products
    ADD COLUMN preview_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE products
    ADD COLUMN preview_rights_confirmed BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS product_preview_pages (
    preview_page_id BIGINT NOT NULL AUTO_INCREMENT,
    product_id BIGINT NOT NULL,
    page_order INT NOT NULL,
    original_page_number INT NULL,
    image_url VARCHAR(1000) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    PRIMARY KEY (preview_page_id),
    UNIQUE KEY uq_preview_product_order (product_id, page_order),
    CONSTRAINT fk_preview_product FOREIGN KEY (product_id) REFERENCES products (product_id)
);
