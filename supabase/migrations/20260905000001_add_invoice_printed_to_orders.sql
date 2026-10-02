-- Add invoice_printed column to orders table
-- This tracks whether an invoice has already been printed for an order
-- to prevent duplicate printing.

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS invoice_printed BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN orders.invoice_printed IS 'Whether the invoice for this order has been printed by admin. Once true, cannot be reprinted.';
