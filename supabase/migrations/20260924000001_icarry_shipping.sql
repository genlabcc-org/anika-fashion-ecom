-- Migration: Add iCarry shipping fields and address_id to public.orders table
-- Note: Reuses existing delivery columns (waybill, shipment_id, delivery_status, delivery_provider)

ALTER TABLE public.orders
  ALTER COLUMN delivery_provider SET DEFAULT 'iCarry';

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS address_id bigint REFERENCES public.addresses(address_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS courier_name text,
  ADD COLUMN IF NOT EXISTS tracking_url text,
  ADD COLUMN IF NOT EXISTS shipment_error text,
  ADD COLUMN IF NOT EXISTS shipped_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

CREATE INDEX IF NOT EXISTS orders_address_id_idx ON public.orders (address_id);
CREATE INDEX IF NOT EXISTS orders_waybill_idx ON public.orders (waybill);
CREATE INDEX IF NOT EXISTS orders_shipment_id_idx ON public.orders (shipment_id);
