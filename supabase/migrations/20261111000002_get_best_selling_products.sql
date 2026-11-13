-- =============================================================================
-- Function: get_best_selling_product_ids
-- Description: Aggregates order_items to find products with the highest units sold,
--              excluding cancelled/refunded orders. Security definer so public
--              storefront visitors can query best selling products without
--              exposing private order tables directly.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_best_selling_product_ids(limit_count integer DEFAULT 8)
RETURNS TABLE (product_id bigint, total_sold bigint)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT 
    oi.product_id, 
    COALESCE(SUM(oi.quantity), 0)::bigint AS total_sold
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  JOIN public.products p ON p.product_id = oi.product_id
  WHERE oi.product_id IS NOT NULL
    AND p.is_active = true
    AND LOWER(COALESCE(o.status, '')) NOT IN (
      'cancelled', 
      'refunded', 
      'refund completed', 
      'partially refunded', 
      'returned'
    )
  GROUP BY oi.product_id
  ORDER BY total_sold DESC, MAX(o.order_date) DESC
  LIMIT limit_count;
$$;

GRANT EXECUTE ON FUNCTION public.get_best_selling_product_ids(integer) TO anon, authenticated, service_role;

