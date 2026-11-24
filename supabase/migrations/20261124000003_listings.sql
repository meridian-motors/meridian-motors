-- =============================================================================
-- MERIDIAN MOTORS — 0003 LISTINGS, PUBLIC MARKETPLACE, BUYERS
-- =============================================================================

create type public.listing_status as enum (
  'draft', 'pending_approval', 'approved', 'published', 'paused', 'sold', 'withdrawn', 'rejected', 'expired', 'archived'
);
create type public.listing_event_type as enum ('view', 'save', 'unsave', 'enquiry', 'share', 'gallery_open', 'search_impression');
create type public.content_source as enum ('seller', 'staff', 'ai_approved');
create type public.draft_status as enum ('pending', 'approved', 'rejected', 'superseded');

-- -----------------------------------------------------------------------------
-- Listings
-- -----------------------------------------------------------------------------
create table public.listings (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete restrict,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 140),
  title text check (char_length(title) between 5 and 140),
  short_description text check (char_length(short_description) <= 300),
  description text check (char_length(description) <= 6000),
  highlights text[] not null default '{}',
  search_tags text[] not null default '{}',
  description_source public.content_source not null default 'seller',
  asking_price integer check (asking_price is null or asking_price between 100 and 5000000),
  location text check (char_length(location) <= 80),
  listing_status public.listing_status not null default 'draft',
  featured boolean not null default false,
  seller_approved_at timestamptz,
  seller_approved_by uuid references public.profiles (id),
  admin_approved_at timestamptz,
  admin_approved_by uuid references public.profiles (id),
  rejection_reason text,
  information_request text,
  published_at timestamptz,
  expires_at timestamptz,
  view_count integer not null default 0,
  save_count integer not null default 0,
  enquiry_count integer not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index listings_one_active_per_vehicle on public.listings (vehicle_id) where deleted_at is null;
create index listings_status_idx on public.listings (listing_status, published_at desc) where deleted_at is null;
create index listings_price_idx on public.listings (asking_price) where listing_status = 'published' and deleted_at is null;
create index listings_featured_idx on public.listings (featured) where featured and listing_status = 'published';
create trigger listings_updated_at before update on public.listings
  for each row execute function public.set_updated_at();

create or replace function public.is_listing_owner(p_listing uuid)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from public.listings l where l.id = p_listing and public.is_vehicle_owner(l.vehicle_id));
$$;

-- Generate a clean slug: make-model-year-<6 hex>
create or replace function public.generate_listing_slug(p_vehicle uuid)
returns text language sql volatile set search_path = public, extensions as $$
  select trim(both '-' from regexp_replace(lower(coalesce(v.make, 'vehicle') || '-' || coalesce(v.model, '') || '-' || coalesce(v.year::text, '')),
               '[^a-z0-9]+', '-', 'g')) || '-' || substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 6)
  from public.vehicles v where v.id = p_vehicle;
$$;

create or replace function public.listing_defaults()
returns trigger language plpgsql set search_path = public, extensions as $$
begin
  if new.slug is null or new.slug = '' then
    new.slug := public.generate_listing_slug(new.vehicle_id);
  end if;
  return new;
end $$;
create trigger listings_defaults before insert on public.listings
  for each row execute function public.listing_defaults();

-- Core listing guard: approvals, price authorisation, publication rules.
create or replace function public.guard_listing()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  v_min integer;
  v_desired integer;
  v_is_owner boolean := public.is_vehicle_owner(new.vehicle_id);
  v_is_service boolean := public.is_service_role();
  v_is_approver boolean := public.has_staff_role(array['sales_operator']::public.app_role[]);
  v_transition boolean := coalesce(current_setting('meridian.status_transition', true), 'off') = 'on';
  v_content_changed boolean;
begin
  select minimum_authorised_price, desired_asking_price into v_min, v_desired
    from public.vehicle_sale_terms where vehicle_id = new.vehicle_id;

  -- 1. Never below the seller's authorised minimum — applies to everyone.
  if new.asking_price is not null and v_min is not null and new.asking_price < v_min then
    raise exception 'Asking price cannot be below the seller''s authorised minimum' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    if not (v_is_service or public.is_staff()) then
      new.listing_status := 'draft';
      new.admin_approved_at := null; new.admin_approved_by := null;
      new.featured := false;
      new.description_source := 'seller';
      new.published_at := null;
    end if;
    if not v_is_service and not v_is_owner then
      new.seller_approved_at := null; new.seller_approved_by := null;
    end if;
    return new;
  end if;

  -- 2. Price changes by anyone other than the owner need seller authorisation.
  if new.asking_price is distinct from old.asking_price and not v_is_owner and not v_is_service then
    if not (
      (v_desired is not null and new.asking_price = v_desired)
      or exists (select 1 from public.price_recommendations pr
                  where pr.vehicle_id = new.vehicle_id and pr.approved_by_seller
                    and pr.recommended_price = new.asking_price
                    and pr.seller_decision_at > now() - interval '30 days')
    ) then
      raise exception 'Price changes require the seller''s authorisation' using errcode = '42501';
    end if;
  end if;

  -- 3. Approvals can only be given by the right party.
  if new.seller_approved_at is distinct from old.seller_approved_at and new.seller_approved_at is not null
     and not (v_is_owner or v_is_service) then
    raise exception 'Only the seller can approve their listing' using errcode = '42501';
  end if;
  if new.admin_approved_at is distinct from old.admin_approved_at and new.admin_approved_at is not null
     and not (v_is_approver or v_is_service) then
    raise exception 'Only Meridian sales staff can approve listings' using errcode = '42501';
  end if;
  if new.featured is distinct from old.featured and not (public.is_staff() or v_is_service) then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if new.description_source is distinct from old.description_source and not (public.is_staff() or v_is_service)
     and new.description_source <> 'seller' then
    raise exception 'Not permitted to change description source' using errcode = '42501';
  end if;

  -- 4. Content changes invalidate previous approvals (the other party must re-approve).
  v_content_changed := new.title is distinct from old.title or new.description is distinct from old.description
                       or new.short_description is distinct from old.short_description
                       or new.highlights is distinct from old.highlights;
  if v_content_changed then
    if old.listing_status in ('published', 'sold') and not (public.is_staff() or v_is_service) then
      raise exception 'Published listing content can only be changed by Meridian staff on request' using errcode = '42501';
    end if;
    if not (v_is_owner or v_is_service) then
      new.seller_approved_at := null; new.seller_approved_by := null;
    end if;
    if not (v_is_approver or v_is_service) then
      new.admin_approved_at := null; new.admin_approved_by := null;
    end if;
  end if;

  -- 5. Publication rules: listings go live only through the pipeline.
  if new.listing_status is distinct from old.listing_status then
    if new.listing_status = 'published' then
      if not (v_transition or v_is_service or v_is_approver) then
        raise exception 'Listings are published by Meridian after approval' using errcode = '42501';
      end if;
      if new.seller_approved_at is null or new.admin_approved_at is null or new.asking_price is null or new.description is null then
        raise exception 'A listing needs seller approval, Meridian approval, an asking price and a description before publication' using errcode = '23514';
      end if;
    elsif new.listing_status in ('approved', 'rejected', 'sold', 'archived', 'expired', 'paused')
          and not (v_transition or v_is_service or public.is_staff()) then
      raise exception 'Not permitted to set this listing status' using errcode = '42501';
    elsif new.listing_status in ('pending_approval', 'draft', 'withdrawn')
          and not (v_transition or v_is_service or public.is_staff() or v_is_owner) then
      raise exception 'Not permitted' using errcode = '42501';
    end if;
  end if;

  -- 6. Owners can never touch counters
  if not v_is_service and not public.is_staff() then
    new.view_count := old.view_count; new.save_count := old.save_count; new.enquiry_count := old.enquiry_count;
  end if;

  return new;
end $$;
create trigger listings_guard before insert or update on public.listings
  for each row execute function public.guard_listing();

create or replace function public.prevent_listing_hard_delete()
returns trigger language plpgsql as $$
begin
  if not public.is_service_role() then
    raise exception 'Listings are archived or soft-deleted, never hard-deleted' using errcode = '42501';
  end if;
  return old;
end $$;
create trigger listings_prevent_hard_delete before delete on public.listings
  for each row execute function public.prevent_listing_hard_delete();

-- AI/staff generated listing content awaiting approval.
create table public.listing_content_drafts (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  source text not null check (source in ('ai', 'staff')),
  title text not null check (char_length(title) between 5 and 140),
  short_description text check (char_length(short_description) <= 300),
  description text not null check (char_length(description) <= 6000),
  highlights text[] not null default '{}',
  search_tags text[] not null default '{}',
  ai_run_id uuid,
  draft_status public.draft_status not null default 'pending',
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index listing_content_drafts_listing_idx on public.listing_content_drafts (listing_id, created_at desc);

-- Approving a draft copies it into the listing. The seller (owner) or a
-- sales operator/admin may approve. Never publishes by itself.
create or replace function public.approve_listing_draft(p_draft uuid)
returns public.listings language plpgsql security definer set search_path = public, extensions as $$
declare
  v_draft public.listing_content_drafts;
  v_listing public.listings;
  v_owner boolean;
  v_staff boolean := public.has_staff_role(array['sales_operator']::public.app_role[]);
begin
  select * into v_draft from public.listing_content_drafts where id = p_draft for update;
  if not found or v_draft.draft_status <> 'pending' then
    raise exception 'Draft not found or already decided' using errcode = 'P0002';
  end if;
  v_owner := public.is_listing_owner(v_draft.listing_id);
  if not (v_owner or v_staff) then
    raise exception 'Not permitted to approve this content' using errcode = '42501';
  end if;

  update public.listing_content_drafts set draft_status = 'superseded'
   where listing_id = v_draft.listing_id and draft_status = 'pending' and id <> p_draft;
  update public.listing_content_drafts set draft_status = 'approved', decided_by = auth.uid(), decided_at = now()
   where id = p_draft;

  update public.listings set
    title = v_draft.title,
    short_description = v_draft.short_description,
    description = v_draft.description,
    highlights = v_draft.highlights,
    search_tags = v_draft.search_tags,
    description_source = case when v_draft.source = 'ai' then 'ai_approved'::public.content_source else 'staff'::public.content_source end,
    seller_approved_at = case when v_owner then now() else seller_approved_at end,
    seller_approved_by = case when v_owner then auth.uid() else seller_approved_by end
  where id = v_draft.listing_id
  returning * into v_listing;
  return v_listing;
end $$;

create or replace function public.reject_listing_draft(p_draft uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_listing uuid;
begin
  select listing_id into v_listing from public.listing_content_drafts where id = p_draft and draft_status = 'pending';
  if v_listing is null then raise exception 'Draft not found' using errcode = 'P0002'; end if;
  if not (public.is_listing_owner(v_listing) or public.has_staff_role(array['sales_operator']::public.app_role[])) then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  update public.listing_content_drafts set draft_status = 'rejected', decided_by = auth.uid(), decided_at = now() where id = p_draft;
end $$;

-- Seller approves the listing (content + price) for publication.
create or replace function public.seller_approve_listing(p_listing uuid)
returns public.listings language plpgsql security definer set search_path = public, extensions as $$
declare v_listing public.listings;
begin
  if not public.is_listing_owner(p_listing) then
    raise exception 'Only the seller can approve this listing' using errcode = '42501';
  end if;
  select * into v_listing from public.listings where id = p_listing and deleted_at is null;
  if v_listing.asking_price is null or v_listing.title is null or v_listing.description is null then
    raise exception 'Listing needs a title, description and asking price before approval' using errcode = '23514';
  end if;
  update public.listings set seller_approved_at = now(), seller_approved_by = auth.uid(),
         listing_status = case when listing_status = 'draft' then 'pending_approval'::public.listing_status else listing_status end
   where id = p_listing returning * into v_listing;
  return v_listing;
end $$;

-- Admin approval / rejection / information request.
create or replace function public.admin_review_listing(p_listing uuid, p_decision text, p_message text default null)
returns public.listings language plpgsql security definer set search_path = public, extensions as $$
declare v_listing public.listings;
begin
  if not public.has_staff_role(array['sales_operator']::public.app_role[]) then
    raise exception 'Only Meridian sales staff can review listings' using errcode = '42501';
  end if;
  if p_decision = 'approve' then
    update public.listings set admin_approved_at = now(), admin_approved_by = auth.uid(),
           listing_status = case when listing_status in ('draft', 'pending_approval', 'rejected') then 'approved'::public.listing_status else listing_status end,
           rejection_reason = null, information_request = null
     where id = p_listing and deleted_at is null returning * into v_listing;
  elsif p_decision = 'reject' then
    if coalesce(trim(p_message), '') = '' then raise exception 'A rejection reason is required' using errcode = '23514'; end if;
    update public.listings set admin_approved_at = null, admin_approved_by = null, listing_status = 'rejected', rejection_reason = p_message
     where id = p_listing and deleted_at is null returning * into v_listing;
  elsif p_decision = 'request_information' then
    if coalesce(trim(p_message), '') = '' then raise exception 'Describe the information required' using errcode = '23514'; end if;
    update public.listings set information_request = p_message, admin_approved_at = null, admin_approved_by = null
     where id = p_listing and deleted_at is null returning * into v_listing;
  else
    raise exception 'Unknown decision %', p_decision using errcode = '22023';
  end if;
  if v_listing.id is null then raise exception 'Listing not found' using errcode = 'P0002'; end if;
  return v_listing;
end $$;

-- -----------------------------------------------------------------------------
-- Listing events (analytics)
-- -----------------------------------------------------------------------------
create table public.listing_events (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  event_type public.listing_event_type not null,
  session_hash text,
  profile_id uuid references public.profiles (id) on delete set null,
  metadata jsonb not null default '{}',
  event_date date not null default ((now() at time zone 'utc')::date),
  created_at timestamptz not null default now()
);
create index listing_events_listing_idx on public.listing_events (listing_id, event_type, created_at desc);
create unique index listing_events_view_dedupe on public.listing_events (listing_id, session_hash, event_date)
  where event_type = 'view' and session_hash is not null;

create or replace function public.record_listing_event(p_listing uuid, p_event public.listing_event_type, p_session_hash text default null, p_metadata jsonb default '{}')
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_inserted integer;
begin
  if p_event not in ('view', 'share', 'gallery_open', 'search_impression') then
    raise exception 'Event type not allowed from clients' using errcode = '42501';
  end if;
  if not exists (select 1 from public.listings where id = p_listing and listing_status = 'published' and deleted_at is null) then
    return;
  end if;
  insert into public.listing_events (listing_id, event_type, session_hash, profile_id, metadata)
  values (p_listing, p_event, left(p_session_hash, 64), auth.uid(), coalesce(p_metadata, '{}'::jsonb) - 'ip')
  on conflict do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted > 0 and p_event = 'view' then
    update public.listings set view_count = view_count + 1 where id = p_listing;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Buyer side
-- -----------------------------------------------------------------------------
create table public.buyer_preferences (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null unique references public.buyers (id) on delete cascade,
  preferred_makes text[] not null default '{}',
  preferred_models text[] not null default '{}',
  minimum_budget integer check (minimum_budget is null or minimum_budget >= 0),
  maximum_budget integer check (maximum_budget is null or maximum_budget >= 0),
  maximum_mileage integer check (maximum_mileage is null or maximum_mileage >= 0),
  minimum_year smallint,
  preferred_fuel public.fuel_type[] not null default '{}',
  preferred_transmission public.transmission_type[] not null default '{}',
  preferred_body_type public.body_type[] not null default '{}',
  desired_features text[] not null default '{}',
  location text,
  postcode text,
  latitude numeric(8, 5),
  longitude numeric(8, 5),
  max_distance_miles integer check (max_distance_miles is null or max_distance_miles between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint buyer_pref_budget check (minimum_budget is null or maximum_budget is null or minimum_budget <= maximum_budget)
);
create trigger buyer_preferences_updated_at before update on public.buyer_preferences
  for each row execute function public.set_updated_at();

create table public.saved_vehicles (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.buyers (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (buyer_id, vehicle_id)
);
create index saved_vehicles_vehicle_idx on public.saved_vehicles (vehicle_id);

create or replace function public.saved_vehicle_counter()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if tg_op = 'INSERT' then
    update public.listings set save_count = save_count + 1 where vehicle_id = new.vehicle_id and deleted_at is null;
    insert into public.listing_events (listing_id, event_type, profile_id)
      select id, 'save', auth.uid() from public.listings where vehicle_id = new.vehicle_id and deleted_at is null;
    return new;
  else
    update public.listings set save_count = greatest(save_count - 1, 0) where vehicle_id = old.vehicle_id and deleted_at is null;
    return old;
  end if;
end $$;
create trigger saved_vehicles_counter after insert or delete on public.saved_vehicles
  for each row execute function public.saved_vehicle_counter();

create table public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.buyers (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  filters jsonb not null default '{}',
  alerts_enabled boolean not null default false,
  last_notified_at timestamptz,
  created_at timestamptz not null default now()
);
create index saved_searches_buyer_idx on public.saved_searches (buyer_id);

create table public.buyer_matches (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.buyers (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  match_score numeric(4, 3) not null check (match_score between 0 and 1),
  score_breakdown jsonb not null default '{}',
  match_explanation text,
  mismatches text[] not null default '{}',
  weights_version text,
  notified_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (buyer_id, vehicle_id)
);
create index buyer_matches_vehicle_idx on public.buyer_matches (vehicle_id, match_score desc);

-- -----------------------------------------------------------------------------
-- PUBLIC LISTING VIEW — the only public read path to vehicle data.
-- Contains only approved, published, available listings and only public columns.
-- Excluded by design: registration, VIN, seller identity/contact, postcode
-- (district only), sale terms, valuations, internal notes, documents.
-- -----------------------------------------------------------------------------
create or replace view public.public_listings with (security_barrier = true) as
select
  l.id,
  l.slug,
  l.vehicle_id,
  l.title,
  l.short_description,
  l.description,
  l.highlights,
  l.search_tags,
  l.asking_price,
  l.featured,
  l.published_at,
  l.view_count,
  v.make,
  v.model,
  v.derivative,
  v.year,
  v.mileage,
  v.fuel_type,
  v.transmission,
  v.body_type,
  v.engine_size,
  v.colour,
  v.doors,
  v.seats,
  v.specification,
  v.condition,
  v.cosmetic_damage,
  v.mechanical_issues,
  v.accident_history,
  v.has_outstanding_finance,
  v.modifications,
  v.other_disclosures,
  v.service_history,
  v.service_history_notes,
  case when v.mot_source in ('dvla', 'mot_history_api') then v.mot_expiry end as mot_expiry_verified,
  case when v.mot_source in ('dvla', 'mot_history_api') then v.mot_source end as mot_source,
  v.previous_keepers,
  coalesce(l.location, v.location) as location,
  v.postcode_district,
  round(v.latitude, 2) as latitude,
  round(v.longitude, 2) as longitude,
  case when v.dealership_id is not null then 'trade'
       else coalesce(s.seller_type::text, 'private') end as seller_type,
  (select vi.public_url from public.vehicle_images vi where vi.vehicle_id = v.id
    order by vi.is_primary desc, vi.display_order, vi.created_at limit 1) as primary_image_url,
  coalesce((select jsonb_agg(jsonb_build_object('url', vi.public_url, 'type', vi.image_type, 'width', vi.width, 'height', vi.height)
                     order by vi.is_primary desc, vi.display_order, vi.created_at)
              from public.vehicle_images vi where vi.vehicle_id = v.id), '[]'::jsonb) as images,
  coalesce((select jsonb_agg(jsonb_build_object('check_type', c.check_type, 'provider', c.provider, 'result', c.result,
                     'checked_at', c.checked_at, 'summary', c.summary, 'limitations', c.limitations) order by c.checked_at desc)
              from public.vehicle_checks c where c.vehicle_id = v.id and c.is_public), '[]'::jsonb) as checks,
  coalesce((select jsonb_agg(jsonb_build_object('verification_type', vv.verification_type, 'verified_at', vv.verified_at,
                     'summary', vv.public_summary) order by vv.verified_at desc)
              from public.vehicle_verifications vv where vv.vehicle_id = v.id and vv.status = 'verified'), '[]'::jsonb) as verifications,
  setweight(to_tsvector('simple', coalesce(v.make, '') || ' ' || coalesce(v.model, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(l.title, '') || ' ' || coalesce(v.derivative, '') || ' ' || array_to_string(l.search_tags, ' ')), 'B') ||
  setweight(to_tsvector('english', coalesce(l.description, '') || ' ' || array_to_string(v.specification, ' ') || ' ' || coalesce(v.colour, '')), 'C')
    as search_document
from public.listings l
join public.vehicles v on v.id = l.vehicle_id
left join public.sellers s on s.id = v.owner_id
where l.listing_status = 'published'
  and l.deleted_at is null
  and v.deleted_at is null
  and v.archived_at is null
  and v.vehicle_status in ('published', 'receiving_enquiries', 'viewing_arranged', 'offer_received')
  and (l.expires_at is null or l.expires_at > now());

revoke all on public.public_listings from public;
grant select on public.public_listings to anon, authenticated, service_role;

-- Distance in miles (haversine)
create or replace function public.distance_miles(lat1 numeric, lon1 numeric, lat2 numeric, lon2 numeric)
returns double precision language sql immutable as $$
  select 3958.8 * 2 * asin(sqrt(
    power(sin(radians((lat2 - lat1)::float8) / 2), 2) +
    cos(radians(lat1::float8)) * cos(radians(lat2::float8)) * power(sin(radians((lon2 - lon1)::float8) / 2), 2)
  ));
$$;

-- Marketplace search. Reads only from public_listings.
create or replace function public.search_listings(
  p_query text default null,
  p_make text default null,
  p_model text default null,
  p_min_price integer default null,
  p_max_price integer default null,
  p_min_year integer default null,
  p_max_year integer default null,
  p_max_mileage integer default null,
  p_fuel public.fuel_type[] default null,
  p_transmission public.transmission_type[] default null,
  p_body public.body_type[] default null,
  p_condition public.vehicle_condition[] default null,
  p_location text default null,
  p_lat numeric default null,
  p_lng numeric default null,
  p_radius_miles integer default null,
  p_sort text default 'newest',
  p_limit integer default 24,
  p_offset integer default 0
) returns jsonb language sql stable security invoker set search_path = public, extensions as $$
  with q as (
    select case when coalesce(trim(p_query), '') = '' then null
                else websearch_to_tsquery('english', p_query) end as tsq
  ),
  filtered as (
    select pl.*,
      case when q.tsq is null then 0 else ts_rank(pl.search_document, q.tsq) end as rank,
      case when p_lat is not null and p_lng is not null and pl.latitude is not null
           then public.distance_miles(p_lat, p_lng, pl.latitude, pl.longitude) end as distance
    from public.public_listings pl, q
    where (q.tsq is null or pl.search_document @@ q.tsq
           or (pl.make || ' ' || pl.model) ilike '%' || p_query || '%')
      and (p_make is null or lower(pl.make) = lower(p_make))
      and (p_model is null or lower(pl.model) = lower(p_model))
      and (p_min_price is null or pl.asking_price >= p_min_price)
      and (p_max_price is null or pl.asking_price <= p_max_price)
      and (p_min_year is null or pl.year >= p_min_year)
      and (p_max_year is null or pl.year <= p_max_year)
      and (p_max_mileage is null or pl.mileage <= p_max_mileage)
      and (p_fuel is null or cardinality(p_fuel) = 0 or pl.fuel_type = any (p_fuel))
      and (p_transmission is null or cardinality(p_transmission) = 0 or pl.transmission = any (p_transmission))
      and (p_body is null or cardinality(p_body) = 0 or pl.body_type = any (p_body))
      and (p_condition is null or cardinality(p_condition) = 0 or pl.condition = any (p_condition))
      and (p_location is null or pl.location ilike '%' || p_location || '%' or pl.postcode_district ilike p_location || '%')
  ),
  ranged as (
    select * from filtered
    where p_radius_miles is null or p_lat is null or (distance is not null and distance <= p_radius_miles)
  )
  select jsonb_build_object(
    'total', (select count(*) from ranged),
    'items', coalesce((
      select jsonb_agg(row_to_json(r)::jsonb - 'search_document' - 'description' - 'cosmetic_damage' - 'mechanical_issues'
                       - 'accident_history' - 'modifications' - 'other_disclosures' - 'checks' - 'verifications' - 'images')
      from (
        select * from ranged
        order by
          case when p_sort = 'price_asc' then asking_price end asc nulls last,
          case when p_sort = 'price_desc' then asking_price end desc nulls last,
          case when p_sort = 'mileage_asc' then mileage end asc nulls last,
          case when p_sort = 'distance' then distance end asc nulls last,
          case when p_sort = 'relevance' then rank end desc nulls last,
          featured desc,
          published_at desc,
          id
        limit least(greatest(coalesce(p_limit, 24), 1), 60)
        offset greatest(coalesce(p_offset, 0), 0)
      ) r
    ), '[]'::jsonb)
  );
$$;
grant execute on function public.search_listings to anon, authenticated;

create or replace function public.listing_suggestions(p_prefix text)
returns table (label text, make text, model text, listing_count bigint)
language sql stable security invoker set search_path = public, extensions as $$
  select make || ' ' || model as label, make, model, count(*) as listing_count
  from public.public_listings
  where length(trim(coalesce(p_prefix, ''))) >= 1
    and (make || ' ' || model) ilike '%' || trim(p_prefix) || '%'
  group by make, model
  order by count(*) desc, make, model
  limit 8;
$$;
grant execute on function public.listing_suggestions to anon, authenticated;

create or replace function public.marketplace_facets()
returns jsonb language sql stable security invoker set search_path = public, extensions as $$
  select jsonb_build_object(
    'makes', coalesce((select jsonb_agg(jsonb_build_object('make', make, 'count', c) order by make)
                        from (select make, count(*) c from public.public_listings group by make) m), '[]'::jsonb),
    'models', coalesce((select jsonb_agg(jsonb_build_object('make', make, 'model', model, 'count', c) order by make, model)
                        from (select make, model, count(*) c from public.public_listings group by make, model) m), '[]'::jsonb),
    'total', (select count(*) from public.public_listings)
  );
$$;
grant execute on function public.marketplace_facets to anon, authenticated;
