-- Migration: Create store_settings table for global store configurations
-- Allows admin to toggle settings such as displaying out-of-stock products on the website

CREATE TABLE IF NOT EXISTS public.store_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

-- 1. Public read access so website visitors can read store settings
DROP POLICY IF EXISTS "Allow public read access to store_settings" ON public.store_settings;
CREATE POLICY "Allow public read access to store_settings"
  ON public.store_settings FOR SELECT
  USING (true);

-- 2. Admin write access
DROP POLICY IF EXISTS "Admins can manage store_settings" ON public.store_settings;
CREATE POLICY "Admins can manage store_settings"
  ON public.store_settings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE public.admin_users.id = auth.uid() AND public.admin_users.role = 'admin'
    )
  );

-- 3. Default configuration: show_out_of_stock is true
INSERT INTO public.store_settings (key, value)
VALUES ('show_out_of_stock', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;

