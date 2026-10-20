-- =============================================================================
-- MIGRATION: Fix deduct_order_stock RPC and variant / product stock sync
-- =============================================================================

CREATE OR REPLACE FUNCTION public.deduct_order_stock(p_order_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_rows int;
BEGIN
  -- Take an exclusive row lock on the target order to serialize concurrent calls
  PERFORM 1 FROM public.orders WHERE id = p_order_id FOR UPDATE;

  -- Iterate through order_items for this order
  FOR r IN 
    SELECT * FROM public.order_items WHERE order_id = p_order_id 
  LOOP
    CONTINUE WHEN r.product_id IS NULL OR r.quantity IS NULL OR r.quantity <= 0;

    -- Check if product has variants
    IF EXISTS (SELECT 1 FROM public.products WHERE product_id = r.product_id AND has_variants = true) THEN
      v_rows := 0;

      -- 1) Try match by SKU (if SKU is provided and not empty)
      IF r.sku IS NOT NULL AND TRIM(r.sku) <> '' THEN
        UPDATE public.product_variants
           SET stock = GREATEST(stock - r.quantity, 0)
         WHERE product_id = r.product_id
           AND sku = r.sku;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
      END IF;

      -- 2) Fallback: match by size and color (case-insensitive, trimmed)
      IF v_rows = 0 AND (r.size IS NOT NULL OR r.color IS NOT NULL) THEN
        UPDATE public.product_variants
           SET stock = GREATEST(stock - r.quantity, 0)
         WHERE product_id = r.product_id
           AND LOWER(TRIM(COALESCE(size, ''))) = LOWER(TRIM(COALESCE(r.size, '')))
           AND LOWER(TRIM(COALESCE(color, ''))) = LOWER(TRIM(COALESCE(r.color, '')));
        GET DIAGNOSTICS v_rows = ROW_COUNT;
      END IF;

      -- 3) Fallback: match by size only (if color was not specified on variant)
      IF v_rows = 0 AND r.size IS NOT NULL THEN
        UPDATE public.product_variants
           SET stock = GREATEST(stock - r.quantity, 0)
         WHERE product_id = r.product_id
           AND LOWER(TRIM(COALESCE(size, '')));
        GET DIAGNOSTICS v_rows = ROW_COUNT;
      END IF;

      -- 4) Sync base product stock to sum of all active variant stocks
      UPDATE public.products
         SET stock = (
           SELECT COALESCE(SUM(stock), 0)
           FROM public.product_variants
           WHERE product_id = r.product_id
         )
       WHERE product_id = r.product_id;

      -- 5) If no variant row matched, log to admin_notes for investigation
      IF v_rows = 0 THEN
        UPDATE public.orders
           SET admin_notes = CONCAT_WS(' | ', admin_notes,
               'STOCK: no variant matched for product ' || r.product_id || ' sku ' || COALESCE(r.sku, 'null'))
         WHERE id = p_order_id;
      END IF;
    ELSE
      -- Product without variants: decrement products.stock directly
      UPDATE public.products
         SET stock = GREATEST(stock - r.quantity, 0)
       WHERE product_id = r.product_id;
    END IF;
  END LOOP;

  -- Ensure stock_deducted is set to true
  UPDATE public.orders
     SET stock_deducted = true
   WHERE id = p_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.deduct_order_stock(text) TO authenticated, service_role, anon;
