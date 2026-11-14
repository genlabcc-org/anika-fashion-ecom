-- Migration: Add whatsapp_tracking_sent_at to orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS whatsapp_tracking_sent_at timestamptz;

