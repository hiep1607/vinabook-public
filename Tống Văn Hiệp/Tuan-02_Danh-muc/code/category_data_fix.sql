-- =====================================================================
-- VinaBook — Category data integrity fix (data only, no schema change)
--   1. Category #8 ' Sách thiếu nhi' has a leading space → trim it.
--   2. Category #9 'Sách Văn học' duplicates #3 'Sách Văn học nghệ thuật'
--      → move its 3 books to #3, then delete #9.
-- The only FK referencing categories is products.category_id, so deleting
-- #9 after reassigning its products is safe.
-- =====================================================================

SET NAMES utf8mb4;
START TRANSACTION;

UPDATE categories SET category_name = 'Sách thiếu nhi' WHERE category_id = 8;

UPDATE products SET category_id = 3 WHERE category_id = 9;
DELETE FROM categories WHERE category_id = 9;

COMMIT;

-- Verification
SELECT c.category_id, CONCAT('[', c.category_name, ']') AS category_name,
       COUNT(p.product_id) AS so_luong
FROM categories c LEFT JOIN products p ON p.category_id = c.category_id
GROUP BY c.category_id, c.category_name ORDER BY c.category_id;

SELECT COUNT(*) AS orphans
FROM products WHERE category_id IS NULL
   OR category_id NOT IN (SELECT category_id FROM categories);
