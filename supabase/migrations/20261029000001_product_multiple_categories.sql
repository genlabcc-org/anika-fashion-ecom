-- Migration: Support multiple categories per product
-- Adds category_ids bigint[] to products and creates product_categories junction table

-- 1. Add category_ids array column to products table
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category_ids bigint[] DEFAULT '{}';

-- 2. Backfill existing products so their current category_id is in category_ids
UPDATE public.products
SET category_ids = ARRAY[category_id]
WHERE category_id IS NOT NULL AND (category_ids IS NULL OR category_ids = '{}');

-- 3. Create GIN index on products.category_ids for fast array containment queries
CREATE INDEX IF NOT EXISTS products_category_ids_gin_idx ON public.products USING GIN (category_ids);

-- 4. Create product_categories junction table for relational integrity & joins
CREATE TABLE IF NOT EXISTS public.product_categories (
  product_id bigint REFERENCES public.products(product_id) ON DELETE CASCADE,
  category_id bigint REFERENCES public.categories(category_id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, category_id)
);

CREATE INDEX IF NOT EXISTS product_categories_product_id_idx ON public.product_categories (product_id);
CREATE INDEX IF NOT EXISTS product_categories_category_id_idx ON public.product_categories (category_id);

-- 5. Enable RLS on product_categories
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to product_categories" ON public.product_categories;
CREATE POLICY "Allow public read access to product_categories"
  ON public.product_categories FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins can manage product_categories" ON public.product_categories;
CREATE POLICY "Admins can manage product_categories"
  ON public.product_categories FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE public.admin_users.id = auth.uid() AND public.admin_users.role = 'admin'
    )
  );

-- 6. Backfill existing product-category relationships into product_categories
INSERT INTO public.product_categories (product_id, category_id)
SELECT product_id, category_id
FROM public.products
WHERE category_id IS NOT NULL
ON CONFLICT (product_id, category_id) DO NOTHING;
