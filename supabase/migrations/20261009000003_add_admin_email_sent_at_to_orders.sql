-- Migration: Add admin_email_sent_at to public.orders for idempotent order notification emails
-- Safe to re-run; does not contain any UPDATE statements.

ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS admin_email_sent_at timestamptz;

NOTIFY pgrst, 'reload schema';
