-- Make customer-prod (mmzn) standalone for push: add push_subscriptions.
-- Surgical + idempotent. No FKs, no triggers, no shared functions touched.
set check_function_bodies = off;

create table if not exists public.push_subscriptions (
  id uuid not null default gen_random_uuid(),
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  phone text,
  role text default 'parent'::text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.push_subscriptions drop constraint if exists push_subscriptions_pkey;
alter table public.push_subscriptions add constraint push_subscriptions_pkey primary key (id);
alter table public.push_subscriptions drop constraint if exists push_subscriptions_endpoint_key;
alter table public.push_subscriptions add constraint push_subscriptions_endpoint_key unique (endpoint);
alter table public.push_subscriptions drop constraint if exists push_subscriptions_role_check;
alter table public.push_subscriptions add constraint push_subscriptions_role_check
  check (role = any (array['parent'::text, 'teacher'::text, 'admin'::text]));

create index if not exists idx_push_subs_role on public.push_subscriptions using btree (role);
create index if not exists idx_push_subs_phone on public.push_subscriptions using btree (phone);

alter table public.push_subscriptions enable row level security;
drop policy if exists allow_all_push_subscriptions on public.push_subscriptions;
create policy allow_all_push_subscriptions on public.push_subscriptions
  as permissive for all to public using (true);
