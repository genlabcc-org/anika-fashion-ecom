-- =============================================================================
-- ANIKA FASHION E-COM — COMPLETE DATABASE SCHEMA (LATEST / INCLUDING ICARRY)
-- =============================================================================
-- Single source of truth for the entire Supabase PostgreSQL database schema.
-- Includes all core tables, product variants, subcategories, banners, shipping rates,
-- social videos, order item details, and iCarry delivery & tracking integration.
--
-- Tables:
--   1.  admin_users
--   2.  profiles
--   3.  categories
--   4.  subcategories
--   5.  products
--   6.  product_variants
--   7.  addresses
--   8.  orders (with iCarry, Razorpay, Invoice & Admin Notes)
--   9.  order_items
--  10.  cart_items
--  11.  wishlist_items
--  12.  banners
--  13.  shipping_rates
--  14.  social_videos
--  15.  order_id_seq (internal sequence counter for order IDs)
--
-- Functions & Triggers:
--   - check_user_exists(email_to_check text)
--   - handle_new_user()          [trigger on auth.users]
--   - delete_own_user()
--   - generate_order_id()
--   - set_order_id()             [trigger on public.orders]
--
-- Storage Buckets: product_img, categories_img, banners
-- =============================================================================


-- =============================================================================
-- EXTENSIONS
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- =============================================================================
-- 1. ADMIN USERS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.admin_users (
  id         uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email      text NOT NULL UNIQUE,
  role       text NOT NULL DEFAULT 'admin',
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can check if they are admin"
  ON public.admin_users FOR SELECT
  USING (auth.uid() = id);


-- =============================================================================
-- 2. USER PROFILES TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id         uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  name       text,
  phone      text,
  email      text,
  updated_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE public.admin_users.id = auth.uid() AND public.admin_users.role = 'admin'
    )
  );


-- =============================================================================
-- 3. PRODUCT CATEGORIES TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.categories (
  category_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        text NOT NULL UNIQUE,
  description text,
  slug        text NOT NULL UNIQUE,
  image_url   text,
  parent_id   bigint REFERENCES public.categories(category_id) ON DELETE SET NULL,
  sort_order  integer DEFAULT 0,
  is_active   boolean DEFAULT true,
  created_at  timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to categories"
  ON public.categories FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage categories"
  ON public.categories FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE public.admin_users.id = auth.uid() AND public.admin_users.role = 'admin'
    )
  );


-- =============================================================================
-- 4. SUBCATEGORIES TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.subcategories (
  subcategory_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name           text NOT NULL,
  image_url      text,
  parent_id      bigint REFERENCES public.categories(category_id) ON DELETE CASCADE,
  is_active      boolean DEFAULT true,
  created_at     timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.subcategories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to subcategories"
  ON public.subcategories FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage subcategories"
  ON public.subcategories FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE public.admin_users.id = auth.uid() AND public.admin_users.role = 'admin'
    )
  );


-- =============================================================================
-- 5. PRODUCTS CATALOG TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.products (
  product_id     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  category_id    bigint REFERENCES public.categories(category_id) ON DELETE SET NULL,
  subcategory_id bigint REFERENCES public.subcategories(subcategory_id) ON DELETE SET NULL,
  name           text NOT NULL,
  description    text,
  sku            text UNIQUE,
  image_url      text,
  images         text[],
  price          numeric NOT NULL,
  compare_price  numeric,
  discount_price numeric,
  stock          integer DEFAULT 0,
  stock_alert    integer DEFAULT 5,
  material       text,
  weight         numeric,
  sizes          text[],
  colors         text[],
  care           text,
  has_variants   boolean DEFAULT false,
  is_active      boolean DEFAULT true,
  is_featured    boolean DEFAULT false,
  created_at     timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at     timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to products"
  ON public.products FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage products"
  ON public.products FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE public.admin_users.id = auth.uid() AND public.admin_users.role = 'admin'
    )
  );

CREATE INDEX IF NOT EXISTS products_category_id_idx    ON public.products (category_id);
CREATE INDEX IF NOT EXISTS products_subcategory_id_idx ON public.products (subcategory_id);
CREATE INDEX IF NOT EXISTS products_sku_idx            ON public.products (sku);


-- =============================================================================
-- 6. PRODUCT VARIANTS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.product_variants (
  variant_id    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id    bigint REFERENCES public.products(product_id) ON DELETE CASCADE NOT NULL,
  sku           text,
  size          text,
  color         text,
  price         numeric NOT NULL DEFAULT 0,
  compare_price numeric,
  stock         integer DEFAULT 0,
  stock_alert   integer,
  images        text[],
  is_active     boolean DEFAULT true,
  created_at    timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to product variants"
  ON public.product_variants FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage product variants"
  ON public.product_variants FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE public.admin_users.id = auth.uid() AND public.admin_users.role = 'admin'
    )
  );

CREATE INDEX IF NOT EXISTS product_variants_product_id_idx ON public.product_variants (product_id);
CREATE INDEX IF NOT EXISTS product_variants_sku_idx        ON public.product_variants (sku);


-- =============================================================================
-- 7. CUSTOMER ADDRESSES TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.addresses (
  address_id    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  full_name     text NOT NULL,
  phone_number  text NOT NULL,
  address_line1 text NOT NULL,
  address_line2 text,
  city          text NOT NULL,
  state         text NOT NULL,
  postal_code   text NOT NULL,
  country       text DEFAULT 'India'::text,
  address_type  text DEFAULT 'home'::text,
  is_default    boolean DEFAULT false,
  created_at    timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own addresses"
  ON public.addresses FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all customer addresses"
  ON public.addresses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE public.admin_users.id = auth.uid() AND public.admin_users.role = 'admin'
    )
  );

CREATE INDEX IF NOT EXISTS addresses_user_id_idx ON public.addresses (user_id);


-- =============================================================================
-- 8. ORDERS TABLE (INCLUDES ICARRY SHIPPING & RAZORPAY)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.orders (
  -- Core order fields
  id                      text PRIMARY KEY,               -- ORD{YYYYMMDD}{NNNN} generated via trigger
  user_id                 uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  order_date              timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  item_name               text NOT NULL,
  quantity                integer NOT NULL,
  total_price             numeric NOT NULL,
  payment                 text NOT NULL DEFAULT 'COD',
  type                    text NOT NULL DEFAULT 'Regular',
  status                  text NOT NULL DEFAULT 'Pending',
  admin_notes             text,
  invoice_printed         boolean DEFAULT FALSE,

  -- Razorpay online payments
  razorpay_order_id       text,
  razorpay_payment_id     text,
  razorpay_signature      text,

  -- Shipping & Delivery (iCarry Integration)
  address_id              bigint REFERENCES public.addresses(address_id) ON DELETE SET NULL,
  delivery_provider       text DEFAULT 'iCarry',
  waybill                 text,                          -- Air Waybill (AWB) number
  shipment_id             text,                          -- iCarry shipment ID
  delivery_status         text DEFAULT 'Pending',
  estimated_delivery_date timestamptz,
  courier_name            text,
  tracking_url            text,
  shipment_error          text,
  shipped_at              timestamptz,
  delivered_at            timestamptz
);

COMMENT ON COLUMN public.orders.invoice_printed IS
  'Whether the invoice for this order has been printed by admin. Once true, cannot be reprinted.';

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own orders"
  ON public.orders FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can place their own orders"
  ON public.orders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view and update all customer orders"
  ON public.orders FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE public.admin_users.id = auth.uid() AND public.admin_users.role = 'admin'
    )
  );

-- Indexes for orders & iCarry lookups
CREATE INDEX IF NOT EXISTS orders_user_id_idx     ON public.orders (user_id);
CREATE INDEX IF NOT EXISTS orders_address_id_idx  ON public.orders (address_id);
CREATE INDEX IF NOT EXISTS orders_waybill_idx     ON public.orders (waybill);
CREATE INDEX IF NOT EXISTS orders_shipment_id_idx ON public.orders (shipment_id);


-- =============================================================================
-- 9. ORDER ITEMS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.order_items (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id     text REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  product_id   bigint REFERENCES public.products(product_id) ON DELETE SET NULL,
  product_name text NOT NULL,
  quantity     integer NOT NULL,
  price        numeric NOT NULL,
  size         text,
  color        text,
  image_url    text
);

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own order items"
  ON public.order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE public.orders.id = order_items.order_id
        AND public.orders.user_id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE public.admin_users.id = auth.uid() AND public.admin_users.role = 'admin'
    )
  );

CREATE POLICY "Users can insert order items for their own orders"
  ON public.order_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE public.orders.id = order_items.order_id
        AND public.orders.user_id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE public.admin_users.id = auth.uid() AND public.admin_users.role = 'admin'
    )
  );

CREATE POLICY "Admins can manage order items"
  ON public.order_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE public.admin_users.id = auth.uid() AND public.admin_users.role = 'admin'
    )
  );

CREATE INDEX IF NOT EXISTS order_items_order_id_idx   ON public.order_items (order_id);
CREATE INDEX IF NOT EXISTS order_items_product_id_idx ON public.order_items (product_id);


-- =============================================================================
-- 10. CART ITEMS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.cart_items (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  product_id bigint REFERENCES public.products(product_id) ON DELETE CASCADE NOT NULL,
  qty        integer NOT NULL DEFAULT 1 CHECK (qty > 0),
  size       text,
  color      text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT cart_items_user_id_product_id_size_color_key UNIQUE (user_id, product_id, size, color)
);

ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own cart items"
  ON public.cart_items FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS cart_items_user_id_idx ON public.cart_items (user_id);


-- =============================================================================
-- 11. WISHLIST ITEMS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.wishlist_items (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  product_id bigint REFERENCES public.products(product_id) ON DELETE CASCADE NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE (user_id, product_id)
);

ALTER TABLE public.wishlist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own wishlist items"
  ON public.wishlist_items FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS wishlist_items_user_id_idx ON public.wishlist_items (user_id);


-- =============================================================================
-- 12. BANNERS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.banners (
  banner_id   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id          bigint GENERATED ALWAYS AS (banner_id) STORED,
  title       text,
  description text,
  image_url   text,
  mobile_url  text,
  is_active   boolean DEFAULT true,
  created_at  timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at  timestamp with time zone DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to banners"
  ON public.banners FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage banners"
  ON public.banners FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE public.admin_users.id = auth.uid() AND public.admin_users.role = 'admin'
    )
  );


-- =============================================================================
-- 13. SHIPPING RATES TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.shipping_rates (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  state       text NOT NULL UNIQUE,
  fee         numeric NOT NULL DEFAULT 0,
  free_above  numeric,
  is_active   boolean DEFAULT true,
  created_at  timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.shipping_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to active shipping rates"
  ON public.shipping_rates FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage shipping rates"
  ON public.shipping_rates FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE public.admin_users.id = auth.uid() AND public.admin_users.role = 'admin'
    )
  );


-- =============================================================================
-- 14. SOCIAL VIDEOS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.social_videos (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  platform      text NOT NULL DEFAULT 'youtube',
  code          text NOT NULL,
  url           text,
  title         text,
  thumbnail_url text,
  is_active     boolean DEFAULT true,
  created_at    timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT social_videos_platform_code_key UNIQUE (platform, code)
);

ALTER TABLE public.social_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to active social videos"
  ON public.social_videos FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage social videos"
  ON public.social_videos FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE public.admin_users.id = auth.uid() AND public.admin_users.role = 'admin'
    )
  );


-- =============================================================================
-- 15. ORDER ID SEQUENCE TABLE (Internal counter helper)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.order_id_seq (
  seq_date date PRIMARY KEY,
  last_seq integer NOT NULL DEFAULT 0
);

ALTER TABLE public.order_id_seq ENABLE ROW LEVEL SECURITY;

-- Revoke direct table grants — access exclusively via generate_order_id()
REVOKE SELECT, INSERT, UPDATE ON public.order_id_seq FROM authenticated;
REVOKE SELECT, INSERT, UPDATE ON public.order_id_seq FROM service_role;


-- =============================================================================
-- FUNCTIONS & TRIGGERS
-- =============================================================================

-- ── Helper: check if a user already exists in auth.users by email ──
CREATE OR REPLACE FUNCTION public.check_user_exists(email_to_check text)
RETURNS boolean
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM auth.users WHERE email = email_to_check
  );
END;
$$ LANGUAGE plpgsql;


-- ── Trigger function: auto-create profile on signup ──
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, name, phone, email, created_at)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'name',  'No name set'),
    COALESCE(new.raw_user_meta_data->>'phone', 'No phone set'),
    new.email,
    new.created_at
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- ── Self-delete: allow users to delete their own auth account ──
CREATE OR REPLACE FUNCTION public.delete_own_user()
RETURNS void AS $$
BEGIN
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ── Order ID generator: ORD{YYYYMMDD}{NNNN} ──
CREATE OR REPLACE FUNCTION public.generate_order_id()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  today    date    := current_date;
  date_str text    := to_char(today, 'YYYYMMDD');
  next_seq integer;
BEGIN
  INSERT INTO public.order_id_seq (seq_date, last_seq)
  VALUES (today, 1)
  ON CONFLICT (seq_date) DO UPDATE
    SET last_seq = order_id_seq.last_seq + 1
  RETURNING last_seq INTO next_seq;

  RETURN 'ORD' || date_str || lpad(next_seq::text, 4, '0');
END;
$$;


-- ── Trigger function: auto-set order id before insert ──
CREATE OR REPLACE FUNCTION public.set_order_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF new.id IS NULL OR new.id = '' THEN
    new.id := public.generate_order_id();
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_order_id ON public.orders;
CREATE TRIGGER trg_set_order_id
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_order_id();


-- =============================================================================
-- STORAGE BUCKETS & RLS POLICIES
-- =============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('product_img',    'product_img',    true),
  ('categories_img', 'categories_img', true),
  ('banners',        'banners',        true)
ON CONFLICT (id) DO NOTHING;

-- Public read access
CREATE POLICY "Allow public read access to product images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product_img');

CREATE POLICY "Allow public read access to category images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'categories_img');

CREATE POLICY "Allow public read access to banner images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'banners');

-- Admin write access — product images
CREATE POLICY "Admins can manage product images"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'product_img' AND
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE public.admin_users.id = auth.uid() AND public.admin_users.role = 'admin'
    )
  )
  WITH CHECK (
    bucket_id = 'product_img' AND
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE public.admin_users.id = auth.uid() AND public.admin_users.role = 'admin'
    )
  );

-- Admin write access — category images
CREATE POLICY "Admins can manage category images"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'categories_img' AND
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE public.admin_users.id = auth.uid() AND public.admin_users.role = 'admin'
    )
  )
  WITH CHECK (
    bucket_id = 'categories_img' AND
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE public.admin_users.id = auth.uid() AND public.admin_users.role = 'admin'
    )
  );

-- Admin write access — banner images
CREATE POLICY "Admins can manage banner images"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'banners' AND
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE public.admin_users.id = auth.uid() AND public.admin_users.role = 'admin'
    )
  )
  WITH CHECK (
    bucket_id = 'banners' AND
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE public.admin_users.id = auth.uid() AND public.admin_users.role = 'admin'
    )
  );
