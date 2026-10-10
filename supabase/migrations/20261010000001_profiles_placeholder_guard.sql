-- Migration: Add placeholder guards for public.profiles and address backfill helper
-- Safe to re-run, no manual data updates.

-- 1. Helper function: checks if a text value is null, whitespace, or a placeholder string
CREATE OR REPLACE FUNCTION public.is_blank(txt text)
RETURNS boolean AS $$
BEGIN
  IF txt IS NULL THEN
    RETURN true;
  END IF;

  IF trim(txt) = '' THEN
    RETURN true;
  END IF;

  IF lower(trim(txt)) IN (
    'no name set',
    'no name',
    'no phone set',
    'no phone',
    'not set',
    'unknown',
    'unknown customer',
    'customer',
    'n/a',
    'na',
    'null',
    'undefined',
    'none'
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 2. Trigger function: sanitizes profiles on insert/update so placeholders and blank strings become NULL
CREATE OR REPLACE FUNCTION public.clean_profile_placeholders()
RETURNS trigger AS $$
BEGIN
  IF public.is_blank(NEW.name) THEN
    NEW.name := NULL;
  ELSE
    NEW.name := trim(NEW.name);
  END IF;

  IF public.is_blank(NEW.phone) THEN
    NEW.phone := NULL;
  ELSE
    NEW.phone := trim(NEW.phone);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_clean_profile_placeholders ON public.profiles;
CREATE TRIGGER trg_clean_profile_placeholders
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.clean_profile_placeholders();

-- 3. Replace handle_new_user() trigger function on auth.users
-- Previously stored 'No name set' / 'No phone set'. Now stores NULL when empty/placeholder.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_name text;
  v_phone text;
BEGIN
  v_name := trim(coalesce(new.raw_user_meta_data->>'name', ''));
  v_phone := trim(coalesce(new.raw_user_meta_data->>'phone', ''));

  IF public.is_blank(v_name) THEN
    v_name := NULL;
  END IF;

  IF public.is_blank(v_phone) THEN
    v_phone := NULL;
  END IF;

  INSERT INTO public.profiles (id, name, phone, email, created_at)
  VALUES (
    new.id,
    v_name,
    v_phone,
    new.email,
    coalesce(new.created_at, timezone('utc'::text, now()))
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    created_at = coalesce(public.profiles.created_at, EXCLUDED.created_at);

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Trigger function: when an address is added or updated, backfill profiles.name and profiles.phone
-- if they are currently blank/null
CREATE OR REPLACE FUNCTION public.fill_profile_from_address()
RETURNS trigger AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    UPDATE public.profiles
    SET
      name = CASE
        WHEN public.is_blank(profiles.name) AND NOT public.is_blank(NEW.full_name)
          THEN trim(NEW.full_name)
        ELSE profiles.name
      END,
      phone = CASE
        WHEN public.is_blank(profiles.phone) AND NOT public.is_blank(NEW.phone_number)
          THEN trim(NEW.phone_number)
        ELSE profiles.phone
      END,
      updated_at = timezone('utc'::text, now())
    WHERE id = NEW.user_id
      AND (
        (public.is_blank(profiles.name) AND NOT public.is_blank(NEW.full_name))
        OR
        (public.is_blank(profiles.phone) AND NOT public.is_blank(NEW.phone_number))
      );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_fill_profile_from_address ON public.addresses;
CREATE TRIGGER trg_fill_profile_from_address
AFTER INSERT OR UPDATE ON public.addresses
FOR EACH ROW
EXECUTE FUNCTION public.fill_profile_from_address();

-- 5. Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
