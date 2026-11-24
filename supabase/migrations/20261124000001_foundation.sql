-- =============================================================================
-- MERIDIAN MOTORS — 0001 FOUNDATION
-- Extensions, enums, helper functions, profiles, role model, platform settings.
-- All timestamps are timestamptz (stored in UTC).
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists citext with schema extensions;

-- -----------------------------------------------------------------------------
-- Enumerations
-- -----------------------------------------------------------------------------
-- Platform role. A "customer" can be a buyer and/or a seller at the same time
-- (capabilities come from rows in `buyers` / `sellers`). Dealership roles are
-- held per-dealership in `dealership_members.role`.
create type public.app_role as enum (
  'customer',
  'verification_operator',
  'sales_operator',
  'admin',
  'super_admin'
);

create type public.account_status as enum ('active', 'suspended', 'pending_deletion', 'deleted');
create type public.seller_type as enum ('private', 'trade');
create type public.verification_status as enum ('unverified', 'pending', 'verified', 'rejected');
create type public.contact_method as enum ('email', 'phone', 'platform_messages');
create type public.dealership_member_role as enum ('owner', 'staff');

-- -----------------------------------------------------------------------------
-- Generic helpers
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- True when the request comes from the trusted server (service-role JWT), or
-- from a direct database session with no API JWT at all (migrations, cron,
-- maintenance as postgres). Deliberately does NOT use current_user, because
-- inside SECURITY DEFINER functions current_user is the function owner.
create or replace function public.is_service_role()
returns boolean language sql stable as $$
  select case
    when nullif(current_setting('request.jwt.claims', true), '') is not null
      then (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role'
    else session_user in ('postgres', 'supabase_admin', 'service_role')
  end;
$$;

-- -----------------------------------------------------------------------------
-- Profiles
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email citext not null unique,
  first_name text check (char_length(first_name) <= 80),
  last_name text check (char_length(last_name) <= 80),
  phone text check (phone is null or phone ~ '^[0-9+() -]{7,20}$'),
  avatar_url text,
  role public.app_role not null default 'customer',
  account_status public.account_status not null default 'active',
  marketing_consent boolean not null default false,
  marketing_consent_at timestamptz,
  deletion_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_role_idx on public.profiles (role) where role <> 'customer';
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Role helpers. SECURITY DEFINER so they can be used inside RLS policies
-- without recursive policy evaluation on `profiles`.
create or replace function public.current_app_role()
returns public.app_role language sql stable security definer set search_path = public, extensions as $$
  select role from public.profiles
  where id = auth.uid() and account_status = 'active';
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select coalesce(public.current_app_role() in
    ('verification_operator', 'sales_operator', 'admin', 'super_admin'), false);
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select coalesce(public.current_app_role() in ('admin', 'super_admin'), false);
$$;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select coalesce(public.current_app_role() = 'super_admin', false);
$$;

create or replace function public.has_staff_role(roles public.app_role[])
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select coalesce(public.current_app_role() = any (roles || array['admin','super_admin']::public.app_role[]), false);
$$;

-- Prevent privilege escalation: users can never change their own role or
-- account status. Only admins may change roles, and only super admins may
-- grant or revoke admin/super_admin.
create or replace function public.guard_profile_privileges()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if public.is_service_role() then
    return new;
  end if;

  if new.role is distinct from old.role then
    if not public.is_admin() then
      raise exception 'Not permitted to change account roles' using errcode = '42501';
    end if;
    if (new.role in ('admin', 'super_admin') or old.role in ('admin', 'super_admin'))
       and not public.is_super_admin() then
      raise exception 'Only a super administrator can grant or revoke administrator roles' using errcode = '42501';
    end if;
    if new.id = auth.uid() then
      raise exception 'You cannot change your own role' using errcode = '42501';
    end if;
  end if;

  if new.account_status is distinct from old.account_status
     and not public.is_admin()
     and not (new.id = auth.uid() and new.account_status = 'pending_deletion') then
    raise exception 'Not permitted to change account status' using errcode = '42501';
  end if;

  if new.email is distinct from old.email and not public.is_service_role() then
    raise exception 'Email changes must go through the authentication service' using errcode = '42501';
  end if;

  if new.marketing_consent is distinct from old.marketing_consent then
    new.marketing_consent_at := now();
  end if;

  return new;
end $$;

create trigger profiles_guard_privileges before update on public.profiles
  for each row execute function public.guard_profile_privileges();

-- Create a profile automatically when a Supabase auth user is created.
-- Role is ALWAYS 'customer' regardless of any user-supplied metadata.
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  insert into public.profiles (id, email, first_name, last_name, marketing_consent, marketing_consent_at)
  values (
    new.id,
    new.email,
    nullif(left(new.raw_user_meta_data ->> 'first_name', 80), ''),
    nullif(left(new.raw_user_meta_data ->> 'last_name', 80), ''),
    coalesce((new.raw_user_meta_data ->> 'marketing_consent')::boolean, false),
    case when coalesce((new.raw_user_meta_data ->> 'marketing_consent')::boolean, false) then now() end
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- -----------------------------------------------------------------------------
-- Sellers / buyers (a profile may be both)
-- -----------------------------------------------------------------------------
create table public.sellers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete restrict,
  seller_type public.seller_type not null default 'private',
  verification_status public.verification_status not null default 'unverified',
  preferred_contact_method public.contact_method not null default 'platform_messages',
  address text,
  city text,
  postcode text,
  country text not null default 'GB',
  trade_declaration_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger sellers_updated_at before update on public.sellers
  for each row execute function public.set_updated_at();

create table public.buyers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete restrict,
  preferred_location text,
  minimum_budget integer check (minimum_budget is null or minimum_budget >= 0),
  maximum_budget integer check (maximum_budget is null or maximum_budget >= 0),
  matching_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint buyers_budget_range check (minimum_budget is null or maximum_budget is null or minimum_budget <= maximum_budget)
);
create trigger buyers_updated_at before update on public.buyers
  for each row execute function public.set_updated_at();

create or replace function public.current_seller_id()
returns uuid language sql stable security definer set search_path = public, extensions as $$
  select id from public.sellers where profile_id = auth.uid();
$$;

create or replace function public.current_buyer_id()
returns uuid language sql stable security definer set search_path = public, extensions as $$
  select id from public.buyers where profile_id = auth.uid();
$$;

-- Create (idempotently) the seller / buyer capability for the signed-in user.
create or replace function public.ensure_seller()
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  insert into public.sellers (profile_id) values (auth.uid())
    on conflict (profile_id) do nothing;
  select id into v_id from public.sellers where profile_id = auth.uid();
  return v_id;
end $$;

create or replace function public.ensure_buyer()
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  insert into public.buyers (profile_id) values (auth.uid())
    on conflict (profile_id) do nothing;
  select id into v_id from public.buyers where profile_id = auth.uid();
  return v_id;
end $$;

-- Sellers cannot verify themselves.
create or replace function public.guard_seller_verification()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if public.is_service_role() or public.is_staff() then return new; end if;
  if tg_op = 'INSERT' then
    new.verification_status := 'unverified';
  elsif new.verification_status is distinct from old.verification_status then
    raise exception 'Verification status can only be changed by Meridian staff' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger sellers_guard_verification before insert or update on public.sellers
  for each row execute function public.guard_seller_verification();

-- -----------------------------------------------------------------------------
-- Dealerships (future-facing; kept separate so private-seller launch is simple)
-- -----------------------------------------------------------------------------
create table public.dealerships (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  company_number text unique,
  contact_email citext not null,
  phone text,
  address text,
  verification_status public.verification_status not null default 'unverified',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger dealerships_updated_at before update on public.dealerships
  for each row execute function public.set_updated_at();

create table public.dealership_members (
  id uuid primary key default gen_random_uuid(),
  dealership_id uuid not null references public.dealerships (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role public.dealership_member_role not null default 'staff',
  created_at timestamptz not null default now(),
  unique (dealership_id, profile_id)
);

create or replace function public.is_dealership_member(p_dealership uuid, p_owner_only boolean default false)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1 from public.dealership_members
    where dealership_id = p_dealership and profile_id = auth.uid()
      and (not p_owner_only or role = 'owner')
  );
$$;

-- -----------------------------------------------------------------------------
-- Platform settings (all business-configurable values live here)
-- -----------------------------------------------------------------------------
create table public.platform_settings (
  id uuid primary key default gen_random_uuid(),
  setting_key text not null unique check (setting_key ~ '^[a-z0-9_.]+$'),
  setting_value jsonb not null,
  description text,
  is_public boolean not null default false,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);
create trigger platform_settings_updated_at before update on public.platform_settings
  for each row execute function public.set_updated_at();

create or replace function public.get_setting(p_key text)
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  select setting_value from public.platform_settings where setting_key = p_key;
$$;

insert into public.platform_settings (setting_key, setting_value, description, is_public) values
  ('fees.sale_fee_tiers', '[
     {"min": 2000,  "max": 4999,  "fee": 149},
     {"min": 5000,  "max": 9999,  "fee": 199},
     {"min": 10000, "max": 19999, "fee": 249},
     {"min": 20000, "max": 34999, "fee": 299},
     {"min": 35000, "max": null,  "fee": 399}
   ]'::jsonb, 'Successful-sale fee tiers in GBP (inclusive bounds). Initial proposal — review before launch.', true),
  ('fees.sale_fee_payable_on', '"sale_completed"'::jsonb,
     'The fee becomes payable only when a transaction reaches sale_status = completed (handover confirmed by seller and Meridian staff).', true),
  ('fees.currency', '"gbp"'::jsonb, 'Settlement currency', true),
  ('pricing.min_comparables', '3'::jsonb, 'Minimum number of real comparables required before a valuation can be completed', false),
  ('pricing.year_tolerance', '2'::jsonb, 'Comparable year window (+/- years)', false),
  ('pricing.mileage_tolerance_pct', '0.35'::jsonb, 'Comparable mileage window as a fraction of subject mileage', false),
  ('pricing.fast_sale_percentile', '0.25'::jsonb, 'Percentile of adjusted comparable prices used for the fast-sale price', false),
  ('pricing.valuation_validity_days', '30'::jsonb, 'Days a valuation is considered current', false),
  ('matching.weights', '{"budget":0.30,"make_model":0.25,"mileage":0.15,"location":0.15,"specification":0.10,"other":0.05}'::jsonb,
     'Buyer matching weights (must sum to 1)', false),
  ('matching.min_score', '0.55'::jsonb, 'Minimum match score before a buyer is notified', false),
  ('ai.enabled', 'true'::jsonb, 'Master switch for AI features', false),
  ('ai.daily_user_limit', '40'::jsonb, 'Maximum AI calls per user per day', false),
  ('ai.monthly_budget_gbp', '500'::jsonb, 'Soft monthly AI spending budget (alerts only)', false),
  ('listings.expiry_days', '90'::jsonb, 'Days before a published listing expires', false),
  ('imports.max_rows', '5000'::jsonb, 'Maximum rows per import file', false),
  ('site.support_email', '"support@meridianmotors.co.uk"'::jsonb, 'Public support email address', true);
