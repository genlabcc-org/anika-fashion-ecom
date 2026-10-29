-- Migration: Drop product_categories junction table to resolve PostgREST relationship ambiguity (PGRST201)
-- Multiple categories are stored and queried directly on products.category_ids bigint[] with GIN index.

DROP TABLE IF EXISTS public.product_categories CASCADE;
