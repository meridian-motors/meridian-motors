-- =============================================================================
-- MERIDIAN MOTORS — 0002 VEHICLES
-- Vehicles, private sale terms, images, documents, checks, verifications,
-- the sales pipeline (status machine) and its history.
-- =============================================================================

create type public.fuel_type as enum ('petrol', 'diesel', 'hybrid', 'plug_in_hybrid', 'electric', 'lpg', 'other');
create type public.transmission_type as enum ('manual', 'automatic', 'semi_automatic');
create type public.body_type as enum ('hatchback', 'saloon', 'estate', 'suv', 'coupe', 'convertible', 'mpv', 'pickup', 'van', 'other');
create type public.vehicle_condition as enum ('excellent', 'very_good', 'good', 'fair', 'poor');
create type public.service_history_status as enum ('full', 'partial', 'none', 'unknown');

-- The 17-stage sales pipeline plus a seller-side `draft` stage.
create type public.vehicle_status as enum (
  'draft',
  'submitted',
  'awaiting_information',
  'verification_pending',
  'valuation_completed',
  'awaiting_seller_approval',
  'approved_for_publication',
  'published',
  'receiving_enquiries',
  'viewing_arranged',
  'offer_received',
  'sale_agreed',
  'payment_pending',
  'handover_pending',
  'completed',
  'withdrawn',
  'rejected',
  'cancelled'
);

create type public.image_type as enum ('exterior', 'interior', 'dashboard', 'mileage', 'damage', 'engine', 'boot', 'wheels', 'other');
create type public.document_type as enum ('v5c', 'service_record', 'mot_certificate', 'invoice', 'finance_settlement', 'inspection_report', 'other');
create type public.document_access as enum ('owner_and_staff', 'staff_only');
create type public.check_type as enum ('dvla_vehicle_enquiry', 'mot_history', 'outstanding_finance', 'stolen', 'write_off', 'mileage', 'full_history');
create type public.check_result as enum ('pass', 'fail', 'warning', 'not_found', 'error', 'pending');
create type public.verification_type as enum ('identity', 'registration_match', 'mileage_photo', 'v5c_document', 'service_history', 'photos', 'disclosures');

-- -----------------------------------------------------------------------------
-- Vehicles
-- -----------------------------------------------------------------------------
create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.sellers (id) on delete restrict,
  dealership_id uuid references public.dealerships (id) on delete restrict,
  -- PRIVATE identifiers — never exposed through public views.
  registration_number text check (registration_number is null or registration_number ~ '^[A-Z0-9]{2,8}$'),
  vin text check (vin is null or vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  make text check (char_length(make) between 1 and 40),
  model text check (char_length(model) between 1 and 60),
  derivative text check (char_length(derivative) <= 120),
  year smallint check (year between 1950 and 2100),
  mileage integer check (mileage between 0 and 1500000),
  fuel_type public.fuel_type,
  transmission public.transmission_type,
  body_type public.body_type,
  engine_size integer check (engine_size is null or engine_size between 0 and 10000), -- cc
  colour text check (char_length(colour) <= 40),
  doors smallint check (doors is null or doors between 1 and 7),
  seats smallint check (seats is null or seats between 1 and 12),
  specification text[] not null default '{}',
  condition public.vehicle_condition,
  -- Seller disclosures (shown to buyers on the listing)
  cosmetic_damage text check (char_length(cosmetic_damage) <= 2000),
  mechanical_issues text check (char_length(mechanical_issues) <= 2000),
  accident_history text check (char_length(accident_history) <= 2000),
  has_outstanding_finance boolean,
  modifications text check (char_length(modifications) <= 2000),
  other_disclosures text check (char_length(other_disclosures) <= 2000),
  disclosures_confirmed_at timestamptz,
  -- History
  service_history public.service_history_status not null default 'unknown',
  service_history_notes text check (char_length(service_history_notes) <= 2000),
  mot_expiry date,
  mot_source text, -- 'seller' | 'dvla' | 'mot_history_api' — only non-seller sources are "verified"
  previous_keepers smallint check (previous_keepers is null or previous_keepers between 0 and 50),
  description text check (char_length(description) <= 6000),
  -- Location (public shows town + postcode district only)
  location text check (char_length(location) <= 80),
  postcode text check (postcode is null or postcode ~ '^[A-Z]{1,2}[0-9][A-Z0-9]? ?[0-9][A-Z]{2}$'),
  postcode_district text generated always as (nullif(split_part(coalesce(postcode, ''), ' ', 1), '')) stored,
  latitude numeric(8, 5), -- district-level centroid (privacy-preserving)
  longitude numeric(8, 5),
  vehicle_status public.vehicle_status not null default 'draft',
  -- Wizard autosave
  submission_step smallint not null default 1 check (submission_step between 1 and 8),
  submission_data jsonb not null default '{}',
  submitted_at timestamptz,
  seller_declaration_at timestamptz,
  source text not null default 'seller_submission' check (source in ('seller_submission', 'admin_manual', 'import')),
  import_job_id uuid,
  is_flagged boolean not null default false,
  flag_reason text,
  archived_at timestamptz,
  deleted_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicles_has_owner check (owner_id is not null or dealership_id is not null or source in ('admin_manual', 'import'))
);

create index vehicles_owner_idx on public.vehicles (owner_id);
create index vehicles_status_idx on public.vehicles (vehicle_status) where deleted_at is null;
create index vehicles_make_model_idx on public.vehicles (lower(make), lower(model));
create index vehicles_make_trgm_idx on public.vehicles using gin (make gin_trgm_ops);
create index vehicles_model_trgm_idx on public.vehicles using gin (model gin_trgm_ops);
create index vehicles_year_idx on public.vehicles (year);
create index vehicles_mileage_idx on public.vehicles (mileage);
create index vehicles_location_idx on public.vehicles (postcode_district);
create index vehicles_geo_idx on public.vehicles (latitude, longitude);
-- Duplicate protection: a registration can only be "live" once.
create unique index vehicles_active_registration_uniq on public.vehicles (registration_number)
  where deleted_at is null and registration_number is not null
    and vehicle_status not in ('completed', 'withdrawn', 'rejected', 'cancelled');
create unique index vehicles_active_vin_uniq on public.vehicles (vin)
  where deleted_at is null and vin is not null
    and vehicle_status not in ('completed', 'withdrawn', 'rejected', 'cancelled');

create trigger vehicles_updated_at before update on public.vehicles
  for each row execute function public.set_updated_at();

-- Normalise registration + postcode on write.
create or replace function public.normalise_vehicle()
returns trigger language plpgsql as $$
begin
  if new.registration_number is not null then
    new.registration_number := upper(regexp_replace(new.registration_number, '[^A-Za-z0-9]', '', 'g'));
  end if;
  if new.vin is not null then
    new.vin := upper(regexp_replace(new.vin, '\s', '', 'g'));
  end if;
  if new.postcode is not null then
    new.postcode := upper(regexp_replace(trim(new.postcode), '\s+', '', 'g'));
    new.postcode := regexp_replace(new.postcode, '^(.+)([0-9][A-Z]{2})$', '\1 \2');
  end if;
  if new.make is not null then new.make := initcap(trim(new.make)); end if;
  if new.model is not null then new.model := trim(new.model); end if;
  return new;
end $$;
create trigger vehicles_normalise before insert or update on public.vehicles
  for each row execute function public.normalise_vehicle();

create or replace function public.is_vehicle_owner(p_vehicle uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.vehicles v
    join public.sellers s on s.id = v.owner_id
    where v.id = p_vehicle and s.profile_id = auth.uid()
  ) or exists (
    select 1 from public.vehicles v
    where v.id = p_vehicle and v.dealership_id is not null
      and public.is_dealership_member(v.dealership_id)
  );
$$;

-- -----------------------------------------------------------------------------
-- Private sale terms (seller pricing intentions — NEVER public)
-- -----------------------------------------------------------------------------
create table public.vehicle_sale_terms (
  vehicle_id uuid primary key references public.vehicles (id) on delete cascade,
  desired_asking_price integer check (desired_asking_price is null or desired_asking_price between 100 and 5000000),
  expected_selling_price integer check (expected_selling_price is null or expected_selling_price between 100 and 5000000),
  minimum_authorised_price integer check (minimum_authorised_price is null or minimum_authorised_price between 100 and 5000000),
  preferred_contact_method public.contact_method not null default 'platform_messages',
  seller_comments text check (char_length(seller_comments) <= 2000),
  updated_at timestamptz not null default now(),
  constraint sale_terms_min_le_desired check (
    minimum_authorised_price is null or desired_asking_price is null
    or minimum_authorised_price <= desired_asking_price)
);
create trigger vehicle_sale_terms_updated_at before update on public.vehicle_sale_terms
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Images & documents
-- -----------------------------------------------------------------------------
create table public.vehicle_images (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  storage_path text not null unique,
  public_url text not null,
  image_type public.image_type not null default 'other',
  display_order smallint not null default 0,
  is_primary boolean not null default false,
  width integer,
  height integer,
  uploaded_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index vehicle_images_vehicle_idx on public.vehicle_images (vehicle_id, display_order);
create unique index vehicle_images_one_primary on public.vehicle_images (vehicle_id) where is_primary;

create table public.vehicle_documents (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  document_type public.document_type not null,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer not null check (size_bytes between 1 and 15728640),
  access_level public.document_access not null default 'owner_and_staff',
  uploaded_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index vehicle_documents_vehicle_idx on public.vehicle_documents (vehicle_id);

-- -----------------------------------------------------------------------------
-- Checks (third-party data) & verifications (Meridian staff decisions)
-- -----------------------------------------------------------------------------
create table public.vehicle_checks (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  check_type public.check_type not null,
  provider text not null,
  result public.check_result not null,
  summary text,
  limitations text,
  raw_response jsonb, -- staff only
  checked_at timestamptz not null default now(),
  expiry_date date,
  reference_id text,
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);
create index vehicle_checks_vehicle_idx on public.vehicle_checks (vehicle_id, check_type);

create table public.vehicle_verifications (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  verification_type public.verification_type not null,
  status public.verification_status not null default 'pending',
  verified_by uuid references public.profiles (id),
  verified_at timestamptz,
  notes text, -- internal
  public_summary text,
  created_at timestamptz not null default now(),
  unique (vehicle_id, verification_type),
  constraint verification_has_verifier check (status <> 'verified' or (verified_by is not null and verified_at is not null))
);

-- DVLA Vehicle Enquiry Service cache / audit. A DVLA lookup does NOT verify ownership.
create table public.dvla_lookups (
  id uuid primary key default gen_random_uuid(),
  registration_number text not null,
  status text not null check (status in ('success', 'not_found', 'error', 'unavailable', 'rate_limited')),
  response jsonb,
  error_message text,
  requested_by uuid references public.profiles (id),
  source text not null default 'dvla_ves',
  looked_up_at timestamptz not null default now()
);
create index dvla_lookups_reg_idx on public.dvla_lookups (registration_number, looked_up_at desc);

-- -----------------------------------------------------------------------------
-- Internal notes & status history
-- -----------------------------------------------------------------------------
create table public.vehicle_internal_notes (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  note text not null check (char_length(note) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index vehicle_internal_notes_vehicle_idx on public.vehicle_internal_notes (vehicle_id, created_at desc);

create table public.vehicle_status_history (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete restrict,
  previous_status public.vehicle_status,
  new_status public.vehicle_status not null,
  changed_by uuid references public.profiles (id),
  reason text,
  internal_notes text,
  created_at timestamptz not null default now()
);
create index vehicle_status_history_vehicle_idx on public.vehicle_status_history (vehicle_id, created_at desc);

-- Allowed pipeline transitions. actor = 'seller' transitions are also allowed to staff.
create table public.vehicle_status_transitions (
  from_status public.vehicle_status not null,
  to_status public.vehicle_status not null,
  actor text not null check (actor in ('seller', 'staff', 'system')),
  primary key (from_status, to_status)
);

insert into public.vehicle_status_transitions (from_status, to_status, actor) values
  ('draft', 'submitted', 'seller'),
  ('draft', 'withdrawn', 'seller'),
  ('submitted', 'awaiting_information', 'staff'),
  ('submitted', 'verification_pending', 'staff'),
  ('submitted', 'rejected', 'staff'),
  ('submitted', 'withdrawn', 'seller'),
  ('submitted', 'cancelled', 'staff'),
  ('awaiting_information', 'submitted', 'seller'),
  ('awaiting_information', 'verification_pending', 'staff'),
  ('awaiting_information', 'rejected', 'staff'),
  ('awaiting_information', 'withdrawn', 'seller'),
  ('verification_pending', 'valuation_completed', 'staff'),
  ('verification_pending', 'awaiting_information', 'staff'),
  ('verification_pending', 'rejected', 'staff'),
  ('verification_pending', 'withdrawn', 'seller'),
  ('valuation_completed', 'awaiting_seller_approval', 'staff'),
  ('valuation_completed', 'awaiting_information', 'staff'),
  ('valuation_completed', 'withdrawn', 'seller'),
  ('awaiting_seller_approval', 'approved_for_publication', 'seller'),
  ('awaiting_seller_approval', 'awaiting_information', 'staff'),
  ('awaiting_seller_approval', 'withdrawn', 'seller'),
  ('approved_for_publication', 'published', 'staff'),
  ('approved_for_publication', 'awaiting_seller_approval', 'staff'),
  ('approved_for_publication', 'withdrawn', 'seller'),
  ('published', 'receiving_enquiries', 'system'),
  ('published', 'viewing_arranged', 'staff'),
  ('published', 'offer_received', 'staff'),
  ('published', 'sale_agreed', 'staff'),
  ('published', 'withdrawn', 'seller'),
  ('published', 'cancelled', 'staff'),
  ('receiving_enquiries', 'viewing_arranged', 'staff'),
  ('receiving_enquiries', 'offer_received', 'staff'),
  ('receiving_enquiries', 'sale_agreed', 'staff'),
  ('receiving_enquiries', 'published', 'staff'),
  ('receiving_enquiries', 'withdrawn', 'seller'),
  ('viewing_arranged', 'offer_received', 'staff'),
  ('viewing_arranged', 'receiving_enquiries', 'staff'),
  ('viewing_arranged', 'sale_agreed', 'staff'),
  ('viewing_arranged', 'withdrawn', 'seller'),
  ('offer_received', 'sale_agreed', 'staff'),
  ('offer_received', 'receiving_enquiries', 'staff'),
  ('offer_received', 'withdrawn', 'seller'),
  ('sale_agreed', 'payment_pending', 'staff'),
  ('sale_agreed', 'handover_pending', 'staff'),
  ('sale_agreed', 'receiving_enquiries', 'staff'),
  ('sale_agreed', 'cancelled', 'staff'),
  ('payment_pending', 'handover_pending', 'staff'),
  ('payment_pending', 'sale_agreed', 'staff'),
  ('payment_pending', 'cancelled', 'staff'),
  ('handover_pending', 'completed', 'staff'),
  ('handover_pending', 'sale_agreed', 'staff'),
  ('handover_pending', 'cancelled', 'staff'),
  ('withdrawn', 'submitted', 'seller'),
  ('rejected', 'awaiting_information', 'staff');

-- The ONLY way to change vehicles.vehicle_status (enforced by trigger below).
create or replace function public.transition_vehicle_status(
  p_vehicle uuid,
  p_new_status public.vehicle_status,
  p_reason text default null,
  p_internal_notes text default null
) returns public.vehicles
language plpgsql security definer set search_path = public as $$
declare
  v_vehicle public.vehicles;
  v_actor text;
  v_allowed text;
  v_old_status public.vehicle_status;
begin
  select * into v_vehicle from public.vehicles where id = p_vehicle and deleted_at is null for update;
  if not found then
    raise exception 'Vehicle not found' using errcode = 'P0002';
  end if;

  if public.is_service_role() then
    v_actor := 'system';
  elsif public.is_staff() then
    v_actor := 'staff';
  elsif public.is_vehicle_owner(p_vehicle) then
    v_actor := 'seller';
  else
    raise exception 'Not permitted to change this vehicle' using errcode = '42501';
  end if;

  v_old_status := v_vehicle.vehicle_status;

  select actor into v_allowed from public.vehicle_status_transitions
   where from_status = v_vehicle.vehicle_status and to_status = p_new_status;

  if v_allowed is null then
    raise exception 'Invalid status transition from % to %', v_vehicle.vehicle_status, p_new_status using errcode = '22023';
  end if;
  if v_actor = 'seller' and v_allowed <> 'seller' then
    raise exception 'This status change must be made by Meridian staff' using errcode = '42501';
  end if;
  if v_actor = 'seller' and p_internal_notes is not null then
    p_internal_notes := null; -- sellers cannot write internal notes
  end if;

  -- Business preconditions
  if p_new_status = 'submitted' then
    if v_vehicle.make is null or v_vehicle.model is null or v_vehicle.year is null or v_vehicle.mileage is null
       or v_vehicle.fuel_type is null or v_vehicle.transmission is null or v_vehicle.postcode is null then
      raise exception 'Vehicle details are incomplete' using errcode = '23514';
    end if;
    if v_vehicle.seller_declaration_at is null and v_actor = 'seller' then
      raise exception 'Seller declaration is required before submission' using errcode = '23514';
    end if;
  end if;

  if p_new_status = 'approved_for_publication' and v_actor = 'seller' then
    if not exists (select 1 from public.listings l where l.vehicle_id = p_vehicle and l.seller_approved_at is not null
                   and l.asking_price is not null and l.deleted_at is null) then
      raise exception 'Approve your listing and asking price first' using errcode = '23514';
    end if;
  end if;

  if p_new_status = 'published' then
    if not exists (select 1 from public.listings l
                   where l.vehicle_id = p_vehicle and l.deleted_at is null
                     and l.seller_approved_at is not null and l.admin_approved_at is not null
                     and l.asking_price is not null and l.description is not null) then
      raise exception 'Listing must be approved by the seller and by Meridian before publication' using errcode = '23514';
    end if;
  end if;

  perform set_config('meridian.status_transition', 'on', true);
  update public.vehicles
     set vehicle_status = p_new_status,
         submitted_at = case when p_new_status = 'submitted' then now() else submitted_at end
   where id = p_vehicle
   returning * into v_vehicle;

  insert into public.vehicle_status_history (vehicle_id, previous_status, new_status, changed_by, reason, internal_notes)
  values (p_vehicle, v_old_status, p_new_status, auth.uid(), p_reason, p_internal_notes);

  -- Keep the listing status aligned with the pipeline
  if p_new_status = 'published' then
    update public.listings set listing_status = 'published', published_at = coalesce(published_at, now()),
           expires_at = coalesce(expires_at, now() + make_interval(days => coalesce((public.get_setting('listings.expiry_days'))::int, 90)))
     where vehicle_id = p_vehicle and deleted_at is null;
  elsif p_new_status in ('withdrawn', 'cancelled') then
    update public.listings set listing_status = 'withdrawn' where vehicle_id = p_vehicle and deleted_at is null and listing_status <> 'withdrawn';
  elsif p_new_status = 'rejected' then
    update public.listings set listing_status = 'rejected' where vehicle_id = p_vehicle and deleted_at is null;
  elsif p_new_status = 'completed' then
    update public.listings set listing_status = 'sold' where vehicle_id = p_vehicle and deleted_at is null;
  end if;
  perform set_config('meridian.status_transition', 'off', true);

  return v_vehicle;
end $$;

-- Guard: vehicle_status may only change through transition_vehicle_status().
-- Owners may only edit content while the vehicle is in an editable stage.
create or replace function public.guard_vehicle_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.vehicle_status is distinct from old.vehicle_status
     and coalesce(current_setting('meridian.status_transition', true), 'off') <> 'on' then
    raise exception 'Vehicle status must be changed through the sales pipeline' using errcode = '42501';
  end if;

  if public.is_service_role() or public.is_staff() then
    return new;
  end if;

  -- Sellers cannot change ownership, flags or provenance fields
  if new.owner_id is distinct from old.owner_id or new.dealership_id is distinct from old.dealership_id
     or new.is_flagged is distinct from old.is_flagged or new.flag_reason is distinct from old.flag_reason
     or new.source is distinct from old.source or new.archived_at is distinct from old.archived_at
     or new.mot_source is distinct from old.mot_source and new.mot_source is distinct from 'seller' then
    raise exception 'Not permitted to change protected vehicle fields' using errcode = '42501';
  end if;

  -- Core facts are frozen once a listing has been published or sale progressed.
  if old.vehicle_status in ('approved_for_publication', 'published', 'receiving_enquiries', 'viewing_arranged',
                            'offer_received', 'sale_agreed', 'payment_pending', 'handover_pending', 'completed')
     and (new.registration_number is distinct from old.registration_number
          or new.vin is distinct from old.vin
          or new.make is distinct from old.make or new.model is distinct from old.model
          or new.year is distinct from old.year or new.mileage is distinct from old.mileage) then
    raise exception 'Core vehicle details are locked after approval. Request assistance to change them.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger vehicles_guard_update before update on public.vehicles
  for each row execute function public.guard_vehicle_update();

-- New vehicles always start as draft unless inserted by staff/service.
create or replace function public.guard_vehicle_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.created_by := coalesce(new.created_by, auth.uid());
  if public.is_service_role() or public.is_staff() then
    return new;
  end if;
  new.vehicle_status := 'draft';
  new.source := 'seller_submission';
  new.is_flagged := false;
  new.flag_reason := null;
  new.mot_source := case when new.mot_expiry is null then null else 'seller' end;
  if new.owner_id is distinct from public.current_seller_id() then
    raise exception 'Vehicles must be created under your own seller account' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger vehicles_guard_insert before insert on public.vehicles
  for each row execute function public.guard_vehicle_insert();

-- Soft deletion only for vehicles that have reached the pipeline.
create or replace function public.prevent_vehicle_hard_delete()
returns trigger language plpgsql as $$
begin
  if old.vehicle_status <> 'draft' and not public.is_service_role() then
    raise exception 'Vehicles are soft-deleted (set deleted_at) once submitted' using errcode = '42501';
  end if;
  return old;
end $$;
create trigger vehicles_prevent_hard_delete before delete on public.vehicles
  for each row execute function public.prevent_vehicle_hard_delete();

-- Verifications can only be set to verified by staff.
create or replace function public.guard_verification()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_service_role() or public.has_staff_role(array['verification_operator']::public.app_role[])) then
    raise exception 'Only verification operators can record verifications' using errcode = '42501';
  end if;
  if new.status = 'verified' then
    new.verified_by := coalesce(new.verified_by, auth.uid());
    new.verified_at := coalesce(new.verified_at, now());
  end if;
  return new;
end $$;
create trigger vehicle_verifications_guard before insert or update on public.vehicle_verifications
  for each row execute function public.guard_verification();
