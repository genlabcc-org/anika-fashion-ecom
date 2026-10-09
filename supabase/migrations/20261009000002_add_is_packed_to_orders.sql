-- Migration: Add is_packed and packed_at to public.orders
-- Safe to re-run; does not update existing data except schema defaults.

ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS is_packed boolean NOT NULL DEFAULT false;

ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS packed_at timestamptz;

-- Index for quickly filtering unpacked active orders
CREATE INDEX IF NOT EXISTS idx_orders_is_packed 
ON public.orders (is_packed) 
WHERE is_packed = false;

NOTIFY pgrst, 'reload schema';
