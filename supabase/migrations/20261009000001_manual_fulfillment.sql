-- Migration: Add manual fulfillment fields and tracking rate-limiting to public.orders
-- File: supabase/migrations/20261009000001_manual_fulfillment.sql

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS fulfillment_type text DEFAULT 'icarry',
  ADD COLUMN IF NOT EXISTS manual_courier_name text,
  ADD COLUMN IF NOT EXISTS manual_awb text,
  ADD COLUMN IF NOT EXISTS manual_tracking_url text,
  ADD COLUMN IF NOT EXISTS last_tracking_sync_at timestamptz;

-- Add check constraint for fulfillment_type ('icarry' or 'manual')
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_fulfillment_type_check'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_fulfillment_type_check
      CHECK (fulfillment_type IN ('icarry', 'manual'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS orders_fulfillment_type_idx ON public.orders (fulfillment_type);

-- Backfill ORD202610080002 to manual fulfillment:
-- Set fulfillment_type = 'manual', manual_courier_name = courier_name,
-- and null out the junk waybill value 'ST Courier'
UPDATE public.orders
SET
  fulfillment_type = 'manual',
  manual_courier_name = COALESCE(courier_name, 'ST Courier'),
  manual_awb = NULL,
  manual_tracking_url = 'https://stcourier.com',
  waybill = NULL
WHERE id = 'ORD202610080002';
