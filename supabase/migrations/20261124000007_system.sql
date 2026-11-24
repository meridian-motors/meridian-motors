-- =============================================================================
-- MERIDIAN MOTORS — 0007 AI, IMPORTS, NOTIFICATIONS, AUDIT, COMPLIANCE, SUPPORT
-- =============================================================================

-- -----------------------------------------------------------------------------
-- AI runs (usage + cost logging)
-- -----------------------------------------------------------------------------
create table public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  vehicle_id uuid references public.vehicles (id) on delete set null,
  task_type text not null check (task_type in ('vehicle_enrichment', 'valuation_explanation', 'buyer_match_explanation',
                                               'listing_generation', 'enquiry_analysis', 'market_intelligence', 'search_parse',
                                               'document_extraction')),
  model text not null,
  prompt_version text not null,
  input_summary text,
  input_hash text,
  output jsonb,
  status text not null check (status in ('success', 'validation_failed', 'error', 'refused', 'disabled', 'rate_limited', 'cached')),
  error_message text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  token_usage jsonb not null default '{}',
  estimated_cost numeric(10, 6) not null default 0, -- USD
  duration_ms integer,
  created_at timestamptz not null default now()
);
create index ai_runs_created_idx on public.ai_runs (created_at desc);
create index ai_runs_user_day_idx on public.ai_runs (user_id, created_at desc);
create index ai_runs_cache_idx on public.ai_runs (task_type, input_hash, prompt_version) where status = 'success';

-- -----------------------------------------------------------------------------
-- Imports
-- -----------------------------------------------------------------------------
create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  uploaded_by uuid not null references public.profiles (id),
  file_name text not null,
  file_type text not null check (file_type in ('csv', 'xlsx')),
  file_hash text not null,
  column_mapping jsonb not null default '{}',
  total_rows integer not null default 0,
  selected_rows integer not null default 0,
  processed_rows integer not null default 0,
  imported_rows integer not null default 0,
  failed_rows integer not null default 0,
  duplicate_rows integer not null default 0,
  job_status text not null default 'uploaded' check (job_status in ('uploaded', 'mapping', 'previewed', 'queued', 'processing', 'completed', 'completed_with_errors', 'failed', 'cancelled')),
  locked_until timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);
create index import_jobs_status_idx on public.import_jobs (job_status, created_at);

create table public.import_rows (
  id uuid primary key default gen_random_uuid(),
  import_job_id uuid not null references public.import_jobs (id) on delete cascade,
  row_number integer not null,
  raw_data jsonb not null,
  mapped_data jsonb,
  validation_errors text[] not null default '{}',
  is_duplicate boolean not null default false,
  duplicate_of uuid,
  selected boolean not null default false, -- only valid rows are selected, after preview
  processing_status text not null default 'pending' check (processing_status in ('pending', 'invalid', 'skipped', 'processing', 'imported', 'failed', 'duplicate')),
  vehicle_id uuid references public.vehicles (id) on delete set null,
  attempts smallint not null default 0,
  last_error text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (import_job_id, row_number)
);
create index import_rows_job_status_idx on public.import_rows (import_job_id, processing_status);
alter table public.vehicles add constraint vehicles_import_job_fk foreign key (import_job_id) references public.import_jobs (id) on delete set null;
-- Idempotency: one vehicle per import row.
create unique index vehicles_import_row_uniq on public.vehicles ((submission_data ->> 'import_row_id')) where source = 'import';

-- Atomically claim a batch of rows for processing (safe under concurrent workers).
create or replace function public.claim_import_rows(p_job uuid, p_limit integer default 50)
returns setof public.import_rows language plpgsql security definer set search_path = public, extensions as $$
begin
  if not (public.is_service_role() or public.is_admin()) then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  return query
  update public.import_rows r set processing_status = 'processing', attempts = r.attempts + 1
   where r.id in (
     select id from public.import_rows
      where import_job_id = p_job and selected and processing_status = 'pending'
      order by row_number
      limit p_limit
      for update skip locked)
  returning r.*;
end $$;

-- -----------------------------------------------------------------------------
-- Notifications
-- -----------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  notification_type text not null,
  title text not null,
  message text not null,
  link text,
  email_status text check (email_status in ('not_required', 'queued', 'sent', 'failed', 'skipped_preference', 'unconfigured')),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_profile_idx on public.notifications (profile_id, created_at desc);
create index notifications_unread_idx on public.notifications (profile_id) where read_at is null;

create table public.notification_preferences (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  email_enquiries boolean not null default true,
  email_listing_updates boolean not null default true,
  email_valuations boolean not null default true,
  email_payments boolean not null default true,  -- transactional receipts are always sent
  email_buyer_matches boolean not null default false,
  email_saved_search_alerts boolean not null default false,
  email_marketing boolean not null default false,
  unsubscribe_token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  updated_at timestamptz not null default now()
);
create trigger notification_preferences_updated_at before update on public.notification_preferences
  for each row execute function public.set_updated_at();

create or replace function public.create_notification_preferences()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  insert into public.notification_preferences (profile_id, email_marketing)
  values (new.id, new.marketing_consent) on conflict do nothing;
  return new;
end $$;
create trigger profiles_create_notification_preferences after insert on public.profiles
  for each row execute function public.create_notification_preferences();

-- Server-side helper used by database functions
create or replace function public.notify(p_profile uuid, p_type text, p_title text, p_message text, p_link text default null)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  if p_profile is null then return null; end if;
  insert into public.notifications (profile_id, notification_type, title, message, link, email_status)
  values (p_profile, p_type, p_title, p_message, p_link, 'queued') returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.notify from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Audit logs (append-only)
-- -----------------------------------------------------------------------------
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_values jsonb,
  new_values jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, created_at desc);
create index audit_logs_user_idx on public.audit_logs (user_id, created_at desc);
create index audit_logs_created_idx on public.audit_logs (created_at desc);

create or replace function public.prevent_audit_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'Audit records are immutable' using errcode = '42501';
end $$;
create trigger audit_logs_immutable before update or delete on public.audit_logs
  for each row execute function public.prevent_audit_mutation();

-- Generic row audit trigger
create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_id uuid := coalesce((v_new ->> 'id')::uuid, (v_old ->> 'id')::uuid, (v_new ->> 'vehicle_id')::uuid, (v_old ->> 'vehicle_id')::uuid);
  k text;
begin
  if tg_op = 'UPDATE' then
    -- store only changed columns
    for k in select jsonb_object_keys(v_new) loop
      if v_new -> k = v_old -> k then
        v_new := v_new - k; v_old := v_old - k;
      end if;
    end loop;
    v_new := v_new - 'updated_at'; v_old := v_old - 'updated_at';
    if v_new = '{}'::jsonb then return new; end if;
  end if;
  -- never copy free-form submission blobs into the audit log
  v_new := v_new - 'submission_data'; v_old := v_old - 'submission_data';
  insert into public.audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, ip_address)
  values (auth.uid(), lower(tg_op), tg_table_name, v_id, v_old, v_new,
          nullif(split_part(coalesce(current_setting('request.headers', true)::jsonb ->> 'x-forwarded-for', ''), ',', 1), '')::inet);
  return coalesce(new, old);
exception when invalid_text_representation then
  insert into public.audit_logs (user_id, action, entity_type, entity_id, old_values, new_values)
  values (auth.uid(), lower(tg_op), tg_table_name, v_id, v_old, v_new);
  return coalesce(new, old);
end $$;

create trigger audit_profiles after update on public.profiles for each row execute function public.audit_row_change();
create trigger audit_vehicles after insert or update or delete on public.vehicles for each row execute function public.audit_row_change();
create trigger audit_sale_terms after insert or update on public.vehicle_sale_terms for each row execute function public.audit_row_change();
create trigger audit_listings after insert or update on public.listings for each row execute function public.audit_row_change();
create trigger audit_verifications after insert or update on public.vehicle_verifications for each row execute function public.audit_row_change();
create trigger audit_transactions after insert or update on public.transactions for each row execute function public.audit_row_change();
create trigger audit_payments after insert or update on public.payments for each row execute function public.audit_row_change();
create trigger audit_settings after insert or update on public.platform_settings for each row execute function public.audit_row_change();
create trigger audit_price_recs after update on public.price_recommendations for each row execute function public.audit_row_change();
create trigger audit_service_catalog after insert or update on public.service_catalog for each row execute function public.audit_row_change();
create trigger audit_documents after insert or delete on public.vehicle_documents for each row execute function public.audit_row_change();

-- Application-level audit entries (e.g. admin views of private documents)
create or replace function public.log_audit(p_action text, p_entity_type text, p_entity_id uuid, p_details jsonb default null)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if auth.uid() is null and not public.is_service_role() then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  insert into public.audit_logs (user_id, action, entity_type, entity_id, new_values)
  values (auth.uid(), left(p_action, 80), left(p_entity_type, 80), p_entity_id, p_details);
end $$;

-- -----------------------------------------------------------------------------
-- Rate limiting (works across serverless instances)
-- -----------------------------------------------------------------------------
create table public.rate_limits (
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, window_start)
);

create or replace function public.check_rate_limit(p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
        v_hits integer;
begin
  insert into public.rate_limits (bucket, window_start, hits) values (left(p_bucket, 200), v_window, 1)
  on conflict (bucket, window_start) do update set hits = public.rate_limits.hits + 1
  returning hits into v_hits;
  delete from public.rate_limits where window_start < now() - interval '1 day' and random() < 0.01;
  return v_hits <= p_limit;
end $$;
revoke execute on function public.check_rate_limit from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- UK GDPR: data subject requests & consent records
-- -----------------------------------------------------------------------------
create table public.data_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles (id) on delete set null,
  email citext not null,
  request_type text not null check (request_type in ('access', 'deletion', 'rectification', 'restriction', 'portability', 'objection')),
  details text check (char_length(details) <= 2000),
  request_status text not null default 'received' check (request_status in ('received', 'verifying', 'in_progress', 'completed', 'refused')),
  due_by timestamptz not null default (now() + interval '30 days'),
  handled_by uuid references public.profiles (id),
  resolution_notes text,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles (id) on delete cascade,
  anonymous_id text,
  consent_type text not null check (consent_type in ('cookies_analytics', 'cookies_marketing', 'marketing_email', 'terms', 'privacy_notice', 'seller_declaration')),
  granted boolean not null,
  policy_version text not null,
  created_at timestamptz not null default now()
);
create index consent_records_profile_idx on public.consent_records (profile_id, consent_type, created_at desc);

-- -----------------------------------------------------------------------------
-- Contact & support
-- -----------------------------------------------------------------------------
create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(full_name) between 1 and 120),
  email citext not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text,
  topic text not null check (topic in ('buying', 'selling', 'account', 'complaint', 'data_protection', 'press', 'other')),
  message text not null check (char_length(message) between 10 and 4000),
  status text not null default 'new' check (status in ('new', 'in_progress', 'resolved', 'spam')),
  profile_id uuid references public.profiles (id) on delete set null,
  handled_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.assistance_requests (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers (id) on delete cascade,
  vehicle_id uuid references public.vehicles (id) on delete set null,
  topic text not null check (topic in ('listing_change', 'pricing', 'photos', 'enquiries', 'viewing', 'sale', 'other')),
  message text not null check (char_length(message) between 5 and 2000),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  handled_by uuid references public.profiles (id),
  response text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger assistance_requests_updated_at before update on public.assistance_requests
  for each row execute function public.set_updated_at();
