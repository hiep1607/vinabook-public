-- Additive migration: preserves existing images and page order. Run once.
ALTER TABLE product_preview_pages
    ADD COLUMN content_type VARCHAR(10) NULL,
    ADD COLUMN text_content TEXT NULL,
    ADD COLUMN heading VARCHAR(120) NULL,
    ADD COLUMN font_family VARCHAR(10) NULL,
    ADD COLUMN font_size INT NULL,
    ADD COLUMN text_align VARCHAR(10) NULL;
