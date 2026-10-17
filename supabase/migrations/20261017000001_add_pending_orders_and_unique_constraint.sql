-- =============================================================================
-- MIGRATION: Harden order finalization (server-only pending_orders & unique constraint)
-- =============================================================================

-- 1. Create table pending_orders
CREATE TABLE IF NOT EXISTS public.pending_orders (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  razorpay_order_id text UNIQUE NOT NULL,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  address_id bigint REFERENCES public.addresses(address_id) ON DELETE SET NULL,
  items jsonb NOT NULL,
  amount numeric NOT NULL,
  shipping numeric NOT NULL DEFAULT 0,
  discount_code text,
  is_buy_now boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ensure is_buy_now column exists if table was already created
ALTER TABLE public.pending_orders 
ADD COLUMN IF NOT EXISTS is_buy_now boolean NOT NULL DEFAULT false;

-- Enable RLS
ALTER TABLE public.pending_orders ENABLE ROW LEVEL SECURITY;

-- Drop user INSERT and UPDATE policies (pending_orders is strictly server-written via service-role)
DROP POLICY IF EXISTS "Users can insert their own pending orders" ON public.pending_orders;
DROP POLICY IF EXISTS "Users can update their own pending orders" ON public.pending_orders;
DROP POLICY IF EXISTS "Users can select their own pending orders" ON public.pending_orders;
DROP POLICY IF EXISTS "Admins can manage all pending orders" ON public.pending_orders;

-- RLS: User can SELECT only their own rows
CREATE POLICY "Users can select their own pending orders"
  ON public.pending_orders FOR SELECT
  USING (auth.uid() = user_id);

-- Admins full access
CREATE POLICY "Admins can manage all pending orders"
  ON public.pending_orders FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE public.admin_users.id = auth.uid() AND public.admin_users.role = 'admin'
    )
  );

-- Indexes for pending_orders lookups
CREATE INDEX IF NOT EXISTS pending_orders_rzp_order_id_idx ON public.pending_orders (razorpay_order_id);
CREATE INDEX IF NOT EXISTS pending_orders_user_id_idx ON public.pending_orders (user_id);
CREATE INDEX IF NOT EXISTS pending_orders_status_idx ON public.pending_orders (status);

-- 2. Ensure optional columns exist on orders and order_items
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_fee numeric DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS stock_deducted boolean NOT NULL DEFAULT false;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS sku text;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS category text;

-- 3. Add UNIQUE constraint on public.orders (razorpay_order_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_razorpay_order_id_key'
  ) THEN
    -- Check if duplicate non-null values exist before adding constraint
    IF NOT EXISTS (
      SELECT 1 FROM public.orders
      WHERE razorpay_order_id IS NOT NULL
      GROUP BY razorpay_order_id
      HAVING count(*) > 1
    ) THEN
      ALTER TABLE public.orders ADD CONSTRAINT orders_razorpay_order_id_key UNIQUE (razorpay_order_id);
    ELSE
      RAISE NOTICE 'Duplicate razorpay_order_id values found in public.orders; please clean duplicates before adding unique constraint.';
    END IF;
  END IF;
END $$;
