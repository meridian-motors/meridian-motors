-- =============================================================================
-- MERIDIAN MOTORS — 0006 SALES, PAYMENTS, SERVICES, SUBSCRIPTIONS
-- Meridian never holds buyer purchase funds. Payments here are Meridian's own
-- fees and services only, collected through Stripe.
-- =============================================================================

create type public.sale_status as enum ('pending_confirmation', 'agreed', 'payment_pending', 'handover_pending', 'completed', 'fell_through', 'cancelled');
create type public.payment_status as enum ('pending', 'processing', 'succeeded', 'failed', 'cancelled', 'refunded', 'partially_refunded');
create type public.payment_type as enum ('sale_fee', 'service', 'subscription');
create type public.service_status as enum ('requested', 'quoted', 'awaiting_payment', 'in_progress', 'completed', 'cancelled');

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete restrict,
  listing_id uuid references public.listings (id) on delete restrict,
  seller_id uuid not null references public.sellers (id) on delete restrict,
  buyer_id uuid references public.buyers (id) on delete set null,
  enquiry_id uuid references public.enquiries (id) on delete set null,
  agreed_price integer not null check (agreed_price between 100 and 5000000),
  sale_status public.sale_status not null default 'pending_confirmation',
  reported_by uuid references public.profiles (id),
  seller_confirmed_at timestamptz,
  staff_confirmed_by uuid references public.profiles (id),
  staff_confirmed_at timestamptz,
  completed_at timestamptz,
  fee_amount integer check (fee_amount is null or fee_amount >= 0), -- GBP, from fee tiers at completion
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_completed_requires_confirmation check (
    sale_status <> 'completed' or (seller_confirmed_at is not null and staff_confirmed_at is not null and completed_at is not null))
);
create unique index transactions_one_open_per_vehicle on public.transactions (vehicle_id)
  where sale_status not in ('fell_through', 'cancelled');
create index transactions_status_idx on public.transactions (sale_status, created_at desc);
create trigger transactions_updated_at before update on public.transactions
  for each row execute function public.set_updated_at();

-- Completed sales history is permanent.
create or replace function public.protect_transaction()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Transaction records cannot be deleted' using errcode = '42501';
  end if;
  if old.sale_status = 'completed' and not public.is_service_role()
     and (new.agreed_price is distinct from old.agreed_price or new.sale_status is distinct from old.sale_status
          or new.completed_at is distinct from old.completed_at or new.fee_amount is distinct from old.fee_amount) then
    raise exception 'Completed transactions are immutable' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger transactions_protect before update or delete on public.transactions
  for each row execute function public.protect_transaction();

-- Fee tier lookup (configurable via platform_settings 'fees.sale_fee_tiers').
create or replace function public.calculate_sale_fee(p_price integer)
returns integer language sql stable security definer set search_path = public, extensions as $$
  select coalesce((
    select (t ->> 'fee')::int
    from jsonb_array_elements(public.get_setting('fees.sale_fee_tiers')) t
    where p_price >= (t ->> 'min')::int
      and (t ->> 'max' is null or p_price <= (t ->> 'max')::int)
    order by (t ->> 'min')::int desc
    limit 1
  ), 0);
$$;
grant execute on function public.calculate_sale_fee to anon, authenticated;

-- Seller reports a sale (subject to Meridian confirmation).
create or replace function public.seller_report_sale(p_vehicle uuid, p_price integer, p_notes text default null)
returns public.transactions language plpgsql security definer set search_path = public, extensions as $$
declare v_tx public.transactions; v_vehicle public.vehicles;
begin
  if not public.is_vehicle_owner(p_vehicle) then
    raise exception 'Only the seller can report a sale' using errcode = '42501';
  end if;
  select * into v_vehicle from public.vehicles where id = p_vehicle;
  if v_vehicle.vehicle_status not in ('published', 'receiving_enquiries', 'viewing_arranged', 'offer_received', 'sale_agreed', 'payment_pending', 'handover_pending') then
    raise exception 'This vehicle is not in a stage where a sale can be reported' using errcode = '23514';
  end if;
  select * into v_tx from public.transactions where vehicle_id = p_vehicle and sale_status not in ('fell_through', 'cancelled');
  if found then
    update public.transactions set seller_confirmed_at = now(), agreed_price = case when sale_status = 'completed' then agreed_price else p_price end,
           notes = coalesce(p_notes, notes)
     where id = v_tx.id returning * into v_tx;
    return v_tx;
  end if;
  insert into public.transactions (vehicle_id, listing_id, seller_id, agreed_price, sale_status, reported_by, seller_confirmed_at, notes)
  values (p_vehicle, (select id from public.listings where vehicle_id = p_vehicle and deleted_at is null), v_vehicle.owner_id,
          p_price, 'pending_confirmation', auth.uid(), now(), p_notes)
  returning * into v_tx;
  return v_tx;
end $$;

-- Staff confirm the sale is complete. The sale fee becomes payable at this point.
create or replace function public.staff_complete_sale(p_transaction uuid)
returns public.transactions language plpgsql security definer set search_path = public, extensions as $$
declare v_tx public.transactions; v_fee integer; v_profile uuid;
begin
  if not public.has_staff_role(array['sales_operator']::public.app_role[]) then
    raise exception 'Only Meridian sales staff can complete sales' using errcode = '42501';
  end if;
  select * into v_tx from public.transactions where id = p_transaction for update;
  if not found then raise exception 'Transaction not found' using errcode = 'P0002'; end if;
  if v_tx.seller_confirmed_at is null then
    raise exception 'The seller must confirm the sale first' using errcode = '23514';
  end if;
  if v_tx.sale_status = 'completed' then return v_tx; end if;

  v_fee := public.calculate_sale_fee(v_tx.agreed_price);
  update public.transactions set sale_status = 'completed', staff_confirmed_by = auth.uid(), staff_confirmed_at = now(),
         completed_at = now(), fee_amount = v_fee
   where id = p_transaction returning * into v_tx;

  -- Move the vehicle through the pipeline to completed if it is not there yet.
  perform set_config('meridian.status_transition', 'on', true);
  insert into public.vehicle_status_history (vehicle_id, previous_status, new_status, changed_by, reason)
    select id, vehicle_status, 'completed', auth.uid(), 'Sale confirmed by Meridian'
      from public.vehicles where id = v_tx.vehicle_id and vehicle_status <> 'completed';
  update public.vehicles set vehicle_status = 'completed' where id = v_tx.vehicle_id;
  perform set_config('meridian.status_transition', 'off', true);
  update public.listings set listing_status = 'sold' where vehicle_id = v_tx.vehicle_id and deleted_at is null;

  if v_fee > 0 then
    select profile_id into v_profile from public.sellers where id = v_tx.seller_id;
    insert into public.payments (transaction_id, profile_id, amount, currency, payment_status, payment_type, description)
    values (v_tx.id, v_profile, v_fee * 100, 'gbp', 'pending', 'sale_fee', 'Meridian Motors successful-sale fee');
  end if;
  return v_tx;
end $$;

-- -----------------------------------------------------------------------------
-- Services catalogue & orders (assisted selling)
-- -----------------------------------------------------------------------------
create table public.service_catalog (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_]+$'),
  name text not null,
  description text not null,
  price integer not null check (price >= 0), -- GBP
  is_active boolean not null default true,
  display_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger service_catalog_updated_at before update on public.service_catalog
  for each row execute function public.set_updated_at();

insert into public.service_catalog (code, name, description, price, display_order) values
  ('professional_listing', 'Professional listing creation', 'A Meridian specialist writes and optimises your listing from your confirmed vehicle details.', 49, 1),
  ('photography_assistance', 'Photography assistance', 'Guidance and review of your photographs, or an arranged photography session where available.', 79, 2),
  ('enquiry_management', 'Enquiry management', 'Meridian handles buyer questions and filters enquiries on your behalf.', 59, 3),
  ('viewing_coordination', 'Viewing coordination', 'We schedule and confirm viewings with interested buyers.', 39, 4),
  ('sales_support', 'Sales support', 'Guidance through negotiation, paperwork and handover.', 99, 5),
  ('listing_optimisation', 'Listing optimisation', 'A review of your listing performance with recommended improvements.', 29, 6);

create table public.service_orders (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers (id) on delete restrict,
  vehicle_id uuid references public.vehicles (id) on delete set null,
  service_id uuid not null references public.service_catalog (id),
  service_type text not null,
  service_status public.service_status not null default 'requested',
  price integer not null check (price >= 0),
  notes text check (char_length(notes) <= 2000),
  staff_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index service_orders_seller_idx on public.service_orders (seller_id, created_at desc);
create trigger service_orders_updated_at before update on public.service_orders
  for each row execute function public.set_updated_at();

create or replace function public.guard_service_order()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare v_service public.service_catalog;
begin
  if public.is_service_role() or public.is_staff() then return new; end if;
  if tg_op = 'INSERT' then
    select * into v_service from public.service_catalog where id = new.service_id and is_active;
    if not found then raise exception 'Service unavailable' using errcode = '23514'; end if;
    if new.seller_id is distinct from public.current_seller_id() then
      raise exception 'Not permitted' using errcode = '42501';
    end if;
    if new.vehicle_id is not null and not public.is_vehicle_owner(new.vehicle_id) then
      raise exception 'Not permitted' using errcode = '42501';
    end if;
    new.price := v_service.price;           -- price always from catalogue
    new.service_type := v_service.code;
    new.service_status := 'requested';
    new.staff_notes := null;
    return new;
  end if;
  -- sellers may only cancel a request that has not started
  if new.service_status is distinct from old.service_status
     and not (new.service_status = 'cancelled' and old.service_status in ('requested', 'quoted', 'awaiting_payment')) then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if new.price is distinct from old.price or new.service_id is distinct from old.service_id or new.staff_notes is distinct from old.staff_notes then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger service_orders_guard before insert or update on public.service_orders
  for each row execute function public.guard_service_order();

-- -----------------------------------------------------------------------------
-- Payments — status can only be confirmed by the server after a verified
-- Stripe webhook (service role). Clients can never mark a payment successful.
-- -----------------------------------------------------------------------------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid references public.transactions (id) on delete restrict,
  service_order_id uuid references public.service_orders (id) on delete restrict,
  subscription_id uuid,
  profile_id uuid references public.profiles (id) on delete set null,
  stripe_payment_id text unique,          -- PaymentIntent id
  stripe_checkout_session_id text unique,
  stripe_invoice_id text,
  receipt_url text,
  amount integer not null check (amount >= 0), -- minor units (pence)
  refunded_amount integer not null default 0 check (refunded_amount >= 0),
  currency text not null default 'gbp' check (currency ~ '^[a-z]{3}$'),
  payment_status public.payment_status not null default 'pending',
  payment_type public.payment_type not null,
  description text,
  failure_reason text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_subject check (num_nonnulls(transaction_id, service_order_id, subscription_id) = 1),
  constraint payments_refund_le_amount check (refunded_amount <= amount),
  constraint payments_succeeded_has_stripe check (payment_status not in ('succeeded', 'refunded', 'partially_refunded') or (stripe_payment_id is not null and paid_at is not null))
);
create index payments_profile_idx on public.payments (profile_id, created_at desc);
create index payments_status_idx on public.payments (payment_status, created_at desc);
create unique index payments_one_sale_fee_per_transaction on public.payments (transaction_id) where payment_type = 'sale_fee';
create trigger payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

create or replace function public.guard_payment()
returns trigger language plpgsql as $$
begin
  if public.is_service_role() then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then
    raise exception 'Payment records cannot be deleted' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    if new.payment_status <> 'pending' or new.paid_at is not null or new.stripe_payment_id is not null or new.refunded_amount <> 0 then
      raise exception 'Payments are created as pending and confirmed only by verified Stripe webhooks' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.payment_status is distinct from old.payment_status or new.paid_at is distinct from old.paid_at
     or new.stripe_payment_id is distinct from old.stripe_payment_id or new.amount is distinct from old.amount
     or new.refunded_amount is distinct from old.refunded_amount or new.receipt_url is distinct from old.receipt_url then
    raise exception 'Payment status can only be changed by verified payment-provider confirmation' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger payments_guard before insert or update or delete on public.payments
  for each row execute function public.guard_payment();

-- Idempotent webhook processing log
create table public.stripe_events (
  id text primary key,                 -- Stripe event id
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  processing_error text,
  received_at timestamptz not null default now()
);

create table public.refund_requests (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id) on delete restrict,
  requested_by uuid references public.profiles (id),
  amount integer not null check (amount > 0),
  reason text not null check (char_length(reason) between 3 and 1000),
  request_status text not null default 'requested' check (request_status in ('requested', 'approved', 'rejected', 'processed', 'failed')),
  stripe_refund_id text unique,
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

-- Future dealership subscriptions
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles (id) on delete set null,
  dealership_id uuid references public.dealerships (id) on delete cascade,
  plan text not null,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  status text not null default 'incomplete' check (status in ('incomplete', 'trialing', 'active', 'past_due', 'cancelled', 'unpaid')),
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();
alter table public.payments add constraint payments_subscription_fk foreign key (subscription_id) references public.subscriptions (id) on delete restrict;
