-- Add show_out_of_stock to public.products table
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS show_out_of_stock boolean DEFAULT true;

UPDATE public.products
SET show_out_of_stock = true
WHERE show_out_of_stock IS NULL;

