-- Migration: Setup pg_cron for iCarry shipment status sync
--
-- Before enabling this cron, create the secret in Supabase Vault:
-- SELECT vault.create_secret('YOUR_CRON_SECRET_VALUE', 'cron_secret', 'Secret for icarry-sync edge function');
--
-- Note: Replace 'https://xfwfxawnyzitpxsdtrqu.supabase.co' with your project URL if different.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Unschedules existing job if previously scheduled to avoid duplicate jobs
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'icarry-status-sync') THEN
    PERFORM cron.unschedule('icarry-status-sync');
  END IF;
END $$;

-- Schedule the job to run every 30 minutes
-- It retrieves 'cron_secret' from vault and calls icarry-sync via POST with x-cron-secret header
SELECT cron.schedule(
  'icarry-status-sync',
  '*/30 * * * *',
  $cron$
  SELECT
    net.http_post(
      url := 'https://xfwfxawnyzitpxsdtrqu.supabase.co/functions/v1/icarry-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', COALESCE(
          (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1),
          (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'icarry_webhook_token' LIMIT 1),
          ''
        )
      ),
      body := '{}'::jsonb
    ) as request_id;
  $cron$
);
