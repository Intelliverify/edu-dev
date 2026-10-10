-- 005_add_is_default_password.sql
-- Track whether a parent is still using the auto-generated DEFAULT password
-- (first-letter-of-child + birth-year + last-4-of-phone). Used to show a
-- periodic "set your own password" reminder and to flip back to true on reset.
--
-- Idempotent. Apply ONCE per Supabase project via the SQL editor
-- (this repo has no Supabase CLI wiring; see 001_grants.sql).
--
-- Backfill semantics: existing rows become `true` via the column DEFAULT, i.e.
-- every existing parent is assumed to be on the default password and will get
-- one dismissible reminder. It flips to false the moment they set a custom
-- password (change-password or OTP reset with a chosen password).

ALTER TABLE parent_accounts
  ADD COLUMN IF NOT EXISTS is_default_password boolean NOT NULL DEFAULT true;
