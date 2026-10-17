-- =============================================================================
-- MIGRATION: Add attempt_id to pending_orders and orders for checkout idempotency
-- =============================================================================

-- 1. Add attempt_id to pending_orders
ALTER TABLE public.pending_orders 
ADD COLUMN IF NOT EXISTS attempt_id text;

CREATE UNIQUE INDEX IF NOT EXISTS pending_orders_attempt_id_idx 
ON public.pending_orders (attempt_id) 
WHERE attempt_id IS NOT NULL;

-- 2. Add attempt_id to orders
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS attempt_id text;

CREATE UNIQUE INDEX IF NOT EXISTS orders_attempt_id_idx 
ON public.orders (attempt_id) 
WHERE attempt_id IS NOT NULL;
