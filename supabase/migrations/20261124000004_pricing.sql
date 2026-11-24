-- =============================================================================
-- MERIDIAN MOTORS — 0004 PRICING & VALUATIONS (Fast Sale engine storage)
-- =============================================================================

create type public.valuation_status as enum ('pending', 'completed', 'insufficient_data', 'failed', 'superseded');
create type public.recommendation_type as enum ('market', 'asking', 'fast_sale', 'price_review');

create table public.valuations (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  market_value_min integer check (market_value_min is null or market_value_min > 0),
  market_value_max integer check (market_value_max is null or market_value_max > 0),
  recommended_asking_price integer check (recommended_asking_price is null or recommended_asking_price > 0),
  fast_sale_price integer check (fast_sale_price is null or fast_sale_price > 0),
  confidence_score numeric(4, 3) check (confidence_score is null or confidence_score between 0 and 1),
  comparable_count integer not null default 0,
  valuation_source text not null default 'meridian_fast_sale_engine',
  engine_version text not null,
  valuation_explanation text,
  explanation_source text not null default 'deterministic' check (explanation_source in ('deterministic', 'ai')),
  data_limitations text[] not null default '{}',
  inputs jsonb not null default '{}',
  valuation_status public.valuation_status not null default 'pending',
  requested_by uuid references public.profiles (id),
  ai_run_id uuid,
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  constraint valuations_range check (market_value_min is null or market_value_max is null or market_value_min <= market_value_max),
  constraint valuations_completed_has_prices check (
    valuation_status <> 'completed' or (market_value_min is not null and market_value_max is not null
      and recommended_asking_price is not null and fast_sale_price is not null and confidence_score is not null)),
  constraint valuations_insufficient_has_no_prices check (
    valuation_status <> 'insufficient_data' or (recommended_asking_price is null and fast_sale_price is null))
);
create index valuations_vehicle_idx on public.valuations (vehicle_id, created_at desc);

-- Evidence. Every comparable must cite a real, traceable source.
create table public.comparable_vehicles (
  id uuid primary key default gen_random_uuid(),
  valuation_id uuid not null references public.valuations (id) on delete cascade,
  source_provider text not null check (source_provider ~ '^(meridian_completed_sale|meridian_listing|licensed:[a-z0-9_]+)$'),
  external_reference text not null check (char_length(external_reference) between 1 and 200),
  vehicle_details jsonb not null,
  observed_price integer not null check (observed_price between 100 and 5000000),
  adjusted_price integer check (adjusted_price is null or adjusted_price > 0),
  similarity numeric(4, 3) check (similarity is null or similarity between 0 and 1),
  price_type text not null default 'asking' check (price_type in ('asking', 'sold')),
  source_date date not null,
  created_at timestamptz not null default now()
);
create index comparable_vehicles_valuation_idx on public.comparable_vehicles (valuation_id);

-- Licensed comparable providers that are configured & authorised.
create table public.data_providers (
  id text primary key check (id ~ '^[a-z0-9_]+$'),
  display_name text not null,
  provider_type text not null check (provider_type in ('comparables', 'vehicle_history', 'mot', 'registration')),
  is_enabled boolean not null default false,
  licence_reference text,
  notes text,
  created_at timestamptz not null default now()
);

-- Anti-fabrication: Meridian-sourced comparables must reference a real record;
-- licensed comparables must come from an enabled, licensed provider.
create or replace function public.validate_comparable()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare v_provider text;
begin
  if new.source_provider = 'meridian_completed_sale' then
    if not exists (select 1 from public.transactions t
                   where t.id::text = new.external_reference and t.sale_status = 'completed' and t.agreed_price = new.observed_price) then
      raise exception 'Comparable does not match a completed Meridian transaction' using errcode = '23514';
    end if;
    new.price_type := 'sold';
  elsif new.source_provider = 'meridian_listing' then
    if not exists (select 1 from public.listings l
                   where l.id::text = new.external_reference and l.published_at is not null and l.asking_price is not null) then
      raise exception 'Comparable does not match a real Meridian listing' using errcode = '23514';
    end if;
    new.price_type := 'asking';
  else
    v_provider := substr(new.source_provider, 10);
    if not exists (select 1 from public.data_providers p where p.id = v_provider and p.is_enabled and p.provider_type = 'comparables') then
      raise exception 'Comparable provider % is not an enabled licensed provider', v_provider using errcode = '23514';
    end if;
  end if;
  if new.source_date > current_date then
    raise exception 'Comparable source date cannot be in the future' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger comparable_vehicles_validate before insert or update on public.comparable_vehicles
  for each row execute function public.validate_comparable();

-- A valuation can only be completed when enough real comparables are attached.
create or replace function public.guard_valuation_completion()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare v_min integer := coalesce((public.get_setting('pricing.min_comparables'))::int, 3);
        v_count integer;
begin
  if new.valuation_status = 'completed' then
    select count(*) into v_count from public.comparable_vehicles where valuation_id = new.id;
    if v_count < v_min then
      raise exception 'A valuation needs at least % verified comparables (found %)', v_min, v_count using errcode = '23514';
    end if;
    new.comparable_count := v_count;
  end if;
  return new;
end $$;
-- Valuations are inserted as 'pending', comparables attached, then completed.
create trigger valuations_completion_guard before insert or update on public.valuations
  for each row execute function public.guard_valuation_completion();

-- Only one current valuation per vehicle: completing a new one supersedes older ones.
create or replace function public.supersede_old_valuations()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.valuation_status in ('completed', 'insufficient_data') then
    update public.valuations set valuation_status = 'superseded'
     where vehicle_id = new.vehicle_id and id <> new.id and valuation_status in ('completed', 'insufficient_data', 'pending');
  end if;
  return new;
end $$;
create trigger valuations_supersede after insert or update of valuation_status on public.valuations
  for each row execute function public.supersede_old_valuations();

-- -----------------------------------------------------------------------------
-- Price recommendations (each requires an explicit seller decision)
-- -----------------------------------------------------------------------------
create table public.price_recommendations (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  valuation_id uuid references public.valuations (id) on delete set null,
  recommended_price integer not null check (recommended_price between 100 and 5000000),
  recommendation_type public.recommendation_type not null,
  explanation text,
  confidence_score numeric(4, 3) check (confidence_score is null or confidence_score between 0 and 1),
  approved_by_seller boolean,          -- null = undecided, true/false = decision
  seller_decision_at timestamptz,
  seller_decision_by uuid references public.profiles (id),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index price_recommendations_vehicle_idx on public.price_recommendations (vehicle_id, created_at desc);

create or replace function public.guard_price_recommendation()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if tg_op = 'INSERT' then
    if not (public.is_service_role() or public.is_staff() or public.is_vehicle_owner(new.vehicle_id)) then
      raise exception 'Not permitted' using errcode = '42501';
    end if;
    new.approved_by_seller := null; new.seller_decision_at := null; new.seller_decision_by := null;
    new.created_by := coalesce(new.created_by, auth.uid());
    return new;
  end if;
  if new.approved_by_seller is distinct from old.approved_by_seller then
    if not (public.is_vehicle_owner(new.vehicle_id) or public.is_service_role()) then
      raise exception 'Only the seller can accept or decline a price recommendation' using errcode = '42501';
    end if;
    new.seller_decision_at := now();
    new.seller_decision_by := auth.uid();
  end if;
  if new.recommended_price is distinct from old.recommended_price then
    raise exception 'Recommendations are immutable; create a new one' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger price_recommendations_guard before insert or update on public.price_recommendations
  for each row execute function public.guard_price_recommendation();

-- -----------------------------------------------------------------------------
-- Price history (append-only)
-- -----------------------------------------------------------------------------
create table public.price_history (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete restrict,
  listing_id uuid references public.listings (id) on delete set null,
  previous_price integer,
  new_price integer not null,
  changed_by uuid references public.profiles (id),
  change_reason text,
  authorised_by_seller boolean not null default false,
  price_recommendation_id uuid references public.price_recommendations (id),
  created_at timestamptz not null default now()
);
create index price_history_vehicle_idx on public.price_history (vehicle_id, created_at desc);

create or replace function public.record_price_history()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare v_rec uuid;
begin
  if new.asking_price is not null and (tg_op = 'INSERT' or new.asking_price is distinct from old.asking_price) then
    select pr.id into v_rec from public.price_recommendations pr
     where pr.vehicle_id = new.vehicle_id and pr.approved_by_seller and pr.recommended_price = new.asking_price
     order by pr.seller_decision_at desc limit 1;
    insert into public.price_history (vehicle_id, listing_id, previous_price, new_price, changed_by, change_reason,
                                      authorised_by_seller, price_recommendation_id)
    values (new.vehicle_id, new.id, case when tg_op = 'UPDATE' then old.asking_price end, new.asking_price, auth.uid(),
            nullif(current_setting('meridian.price_change_reason', true), ''),
            public.is_vehicle_owner(new.vehicle_id) or v_rec is not null, v_rec);
  end if;
  return new;
end $$;
create trigger listings_price_history after insert or update of asking_price on public.listings
  for each row execute function public.record_price_history();

-- Seller sets their asking price (with reason) — the authorised path.
create or replace function public.set_asking_price(p_listing uuid, p_price integer, p_reason text default null)
returns public.listings language plpgsql security definer set search_path = public, extensions as $$
declare v_listing public.listings;
begin
  if not (public.is_listing_owner(p_listing) or public.has_staff_role(array['sales_operator']::public.app_role[])) then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  perform set_config('meridian.price_change_reason', coalesce(p_reason, ''), true);
  -- guard_listing() enforces the minimum and seller authorisation for staff.
  update public.listings set asking_price = p_price where id = p_listing and deleted_at is null returning * into v_listing;
  if v_listing.id is null then raise exception 'Listing not found' using errcode = 'P0002'; end if;
  return v_listing;
end $$;

-- Seller decision on a recommendation; when accepted, optionally applies it.
create or replace function public.decide_price_recommendation(p_recommendation uuid, p_accept boolean, p_apply boolean default true)
returns public.price_recommendations language plpgsql security definer set search_path = public, extensions as $$
declare v_rec public.price_recommendations;
begin
  select * into v_rec from public.price_recommendations where id = p_recommendation for update;
  if not found then raise exception 'Recommendation not found' using errcode = 'P0002'; end if;
  if not public.is_vehicle_owner(v_rec.vehicle_id) then
    raise exception 'Only the seller can decide on price recommendations' using errcode = '42501';
  end if;
  update public.price_recommendations set approved_by_seller = p_accept where id = p_recommendation returning * into v_rec;
  if p_accept and p_apply then
    perform set_config('meridian.price_change_reason', 'Seller accepted ' || v_rec.recommendation_type || ' recommendation', true);
    update public.listings set asking_price = v_rec.recommended_price
     where vehicle_id = v_rec.vehicle_id and deleted_at is null;
  end if;
  return v_rec;
end $$;
