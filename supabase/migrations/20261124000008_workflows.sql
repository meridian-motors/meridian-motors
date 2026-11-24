-- =============================================================================
-- MERIDIAN MOTORS — 0008 WORKFLOW FUNCTIONS & SAFE READ MODELS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enquiry submission (guests and signed-in buyers)
-- -----------------------------------------------------------------------------
create or replace function public.submit_enquiry(
  p_listing uuid,
  p_type public.enquiry_type,
  p_message text,
  p_full_name text,
  p_email text,
  p_phone text default null,
  p_offer integer default null,
  p_client_key text default null
) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare
  v_listing public.public_listings;
  v_vehicle public.vehicles;
  v_buyer uuid;
  v_enquiry uuid;
  v_conversation uuid;
  v_seller_profile uuid;
begin
  select * into v_listing from public.public_listings where id = p_listing;
  if not found then
    raise exception 'This vehicle is no longer available' using errcode = 'P0002';
  end if;
  if not public.check_rate_limit('enquiry:' || coalesce(auth.uid()::text, lower(coalesce(p_email, ''))), 6, 3600)
     or (p_client_key is not null and not public.check_rate_limit('enquiry-client:' || p_client_key, 10, 3600)) then
    raise exception 'Too many enquiries. Please try again later.' using errcode = '54000';
  end if;

  select * into v_vehicle from public.vehicles where id = v_listing.vehicle_id;

  if auth.uid() is not null then
    v_buyer := public.ensure_buyer();
    if public.is_vehicle_owner(v_vehicle.id) then
      raise exception 'You cannot enquire about your own vehicle' using errcode = '23514';
    end if;
  end if;

  insert into public.enquiries (listing_id, vehicle_id, buyer_id, seller_id, enquiry_type, message, offer_amount, buyer_display_name)
  values (p_listing, v_vehicle.id, v_buyer, v_vehicle.owner_id, p_type, trim(p_message),
          case when p_type = 'offer' then p_offer end,
          left(split_part(trim(p_full_name), ' ', 1), 80))
  returning id into v_enquiry;

  insert into public.enquiry_contacts (enquiry_id, full_name, email, phone)
  values (v_enquiry, trim(p_full_name), lower(trim(p_email)), nullif(trim(coalesce(p_phone, '')), ''));

  insert into public.conversations (enquiry_id) values (v_enquiry) returning id into v_conversation;
  perform set_config('meridian.system_insert', 'on', true);
  insert into public.messages (conversation_id, sender_id, sender_role, message, message_type)
  values (v_conversation, auth.uid(), 'buyer', trim(p_message), 'text');
  perform set_config('meridian.system_insert', 'off', true);

  update public.listings set enquiry_count = enquiry_count + 1 where id = p_listing;
  insert into public.listing_events (listing_id, event_type, profile_id) values (p_listing, 'enquiry', auth.uid());

  if v_vehicle.vehicle_status = 'published' then
    perform set_config('meridian.status_transition', 'on', true);
    update public.vehicles set vehicle_status = 'receiving_enquiries' where id = v_vehicle.id;
    insert into public.vehicle_status_history (vehicle_id, previous_status, new_status, changed_by, reason)
    values (v_vehicle.id, 'published', 'receiving_enquiries', null, 'First buyer enquiry received');
    perform set_config('meridian.status_transition', 'off', true);
  end if;

  select profile_id into v_seller_profile from public.sellers where id = v_vehicle.owner_id;
  perform public.notify(v_seller_profile, 'enquiry_received', 'New enquiry received',
    'You have a new ' || replace(p_type::text, '_', ' ') || ' enquiry about your ' || v_listing.year || ' ' || v_listing.make || ' ' || v_listing.model || '.',
    '/dashboard/enquiries/' || v_enquiry);

  return v_enquiry;
end $$;
grant execute on function public.submit_enquiry to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Owner-safe read models (exclude internal notes)
-- -----------------------------------------------------------------------------
create or replace function public.vehicle_timeline(p_vehicle uuid)
returns table (previous_status public.vehicle_status, new_status public.vehicle_status, reason text, created_at timestamptz)
language sql stable security definer set search_path = public, extensions as $$
  select h.previous_status, h.new_status, h.reason, h.created_at
  from public.vehicle_status_history h
  where h.vehicle_id = p_vehicle and (public.is_vehicle_owner(p_vehicle) or public.is_staff())
  order by h.created_at desc;
$$;

create or replace function public.vehicle_verification_summary(p_vehicle uuid)
returns table (verification_type public.verification_type, status public.verification_status, verified_at timestamptz, public_summary text)
language sql stable security definer set search_path = public, extensions as $$
  select v.verification_type, v.status, v.verified_at, v.public_summary
  from public.vehicle_verifications v
  where v.vehicle_id = p_vehicle and (public.is_vehicle_owner(p_vehicle) or public.is_staff());
$$;

-- -----------------------------------------------------------------------------
-- Seller dashboard statistics (real values only)
-- -----------------------------------------------------------------------------
create or replace function public.seller_dashboard_stats()
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  with mine as (
    select v.* from public.vehicles v
    where v.owner_id = public.current_seller_id() and v.deleted_at is null
  ), lst as (
    select l.* from public.listings l join mine on mine.id = l.vehicle_id where l.deleted_at is null
  )
  select jsonb_build_object(
    'active_listings', (select count(*) from mine where vehicle_status in ('published', 'receiving_enquiries', 'viewing_arranged', 'offer_received')),
    'pending_listings', (select count(*) from mine where vehicle_status in ('submitted', 'awaiting_information', 'verification_pending', 'valuation_completed', 'approved_for_publication')),
    'drafts', (select count(*) from mine where vehicle_status = 'draft'),
    'awaiting_your_approval', (select count(*) from mine where vehicle_status = 'awaiting_seller_approval'),
    'total_views', coalesce((select sum(view_count) from lst), 0),
    'total_saves', coalesce((select sum(save_count) from lst), 0),
    'total_enquiries', (select count(*) from public.enquiries e where e.seller_id = public.current_seller_id()),
    'new_enquiries', (select count(*) from public.enquiries e where e.seller_id = public.current_seller_id() and e.enquiry_status = 'new'),
    'receiving_interest', (select count(distinct e.vehicle_id) from public.enquiries e
                            where e.seller_id = public.current_seller_id() and e.created_at > now() - interval '14 days'),
    'sales_in_progress', (select count(*) from mine where vehicle_status in ('sale_agreed', 'payment_pending', 'handover_pending')),
    'completed_sales', (select count(*) from mine where vehicle_status = 'completed'),
    'outstanding_actions', coalesce((
      select jsonb_agg(a) from (
        select jsonb_build_object('type', 'complete_submission', 'vehicle_id', id, 'label',
                 'Finish your submission for ' || coalesce(make || ' ' || model, 'your vehicle')) a
          from mine where vehicle_status = 'draft'
        union all
        select jsonb_build_object('type', 'approve_listing', 'vehicle_id', id, 'label',
                 'Review and approve the listing for ' || make || ' ' || model)
          from mine where vehicle_status = 'awaiting_seller_approval'
        union all
        select jsonb_build_object('type', 'provide_information', 'vehicle_id', mine.id, 'label',
                 'Meridian needs more information about your ' || make || ' ' || model)
          from mine where vehicle_status = 'awaiting_information'
        union all
        select jsonb_build_object('type', 'price_decision', 'vehicle_id', pr.vehicle_id, 'label',
                 'Accept or decline a ' || replace(pr.recommendation_type::text, '_', '-') || ' price recommendation')
          from public.price_recommendations pr join mine on mine.id = pr.vehicle_id
         where pr.approved_by_seller is null and pr.recommendation_type in ('fast_sale', 'asking', 'price_review')
        union all
        select jsonb_build_object('type', 'pay_fee', 'payment_id', p.id, 'label', 'Successful-sale fee due')
          from public.payments p where p.profile_id = auth.uid() and p.payment_status = 'pending'
      ) x), '[]'::jsonb)
  );
$$;

-- -----------------------------------------------------------------------------
-- Admin overview statistics (actual recorded data only)
-- -----------------------------------------------------------------------------
create or replace function public.admin_dashboard_stats(p_from timestamptz default now() - interval '30 days', p_to timestamptz default now())
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare v jsonb;
begin
  if not public.is_staff() then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'total_users', (select count(*) from public.profiles where account_status <> 'deleted'),
    'new_users', (select count(*) from public.profiles where created_at between p_from and p_to),
    'total_sellers', (select count(*) from public.sellers),
    'total_buyers', (select count(*) from public.buyers),
    'total_vehicles', (select count(*) from public.vehicles where deleted_at is null),
    'active_listings', (select count(*) from public.public_listings),
    'pending_listings', (select count(*) from public.vehicles where deleted_at is null and vehicle_status in
                          ('submitted', 'awaiting_information', 'verification_pending', 'valuation_completed', 'awaiting_seller_approval', 'approved_for_publication')),
    'awaiting_review', (select count(*) from public.listings l where l.deleted_at is null and l.seller_approved_at is not null
                          and l.admin_approved_at is null and l.listing_status in ('pending_approval', 'draft')),
    'rejected_listings', (select count(*) from public.vehicles where deleted_at is null and vehicle_status = 'rejected'),
    'flagged_vehicles', (select count(*) from public.vehicles where deleted_at is null and is_flagged),
    'total_enquiries', (select count(*) from public.enquiries),
    'period_enquiries', (select count(*) from public.enquiries where created_at between p_from and p_to),
    'open_enquiries', (select count(*) from public.enquiries where enquiry_status not in ('closed_won', 'closed_lost', 'spam')),
    'sales_in_progress', (select count(*) from public.vehicles where deleted_at is null and vehicle_status in ('sale_agreed', 'payment_pending', 'handover_pending')),
    'completed_sales', (select count(*) from public.transactions where sale_status = 'completed'),
    'period_completed_sales', (select count(*) from public.transactions where sale_status = 'completed' and completed_at between p_from and p_to),
    'total_revenue_pence', coalesce((select sum(amount - refunded_amount) from public.payments where payment_status in ('succeeded', 'partially_refunded')), 0),
    'period_revenue_pence', coalesce((select sum(amount - refunded_amount) from public.payments
                                        where payment_status in ('succeeded', 'partially_refunded') and paid_at between p_from and p_to), 0),
    'outstanding_payments_pence', coalesce((select sum(amount) from public.payments where payment_status in ('pending', 'processing')), 0),
    'average_listing_price', (select round(avg(asking_price)) from public.public_listings),
    'average_sale_price', (select round(avg(agreed_price)) from public.transactions where sale_status = 'completed'),
    'average_days_to_sale', (select round(avg(extract(epoch from (t.completed_at - l.published_at)) / 86400)::numeric, 1)
                               from public.transactions t join public.listings l on l.id = t.listing_id
                              where t.sale_status = 'completed' and l.published_at is not null),
    'listing_to_sale_conversion', (select case when count(*) = 0 then null else
                                      round(count(*) filter (where vehicle_status = 'completed')::numeric / count(*), 4) end
                                     from public.vehicles v where exists (select 1 from public.listings l where l.vehicle_id = v.id and l.published_at is not null)),
    'enquiry_to_sale_conversion', (select case when count(distinct e.vehicle_id) = 0 then null else
                                      round(count(distinct t.vehicle_id)::numeric / count(distinct e.vehicle_id), 4) end
                                     from public.enquiries e left join public.transactions t on t.vehicle_id = e.vehicle_id and t.sale_status = 'completed'),
    'withdrawn_vehicles', (select count(*) from public.vehicles where vehicle_status = 'withdrawn'),
    'ai_runs', (select count(*) from public.ai_runs where created_at between p_from and p_to),
    'ai_cost_usd', coalesce((select round(sum(estimated_cost), 4) from public.ai_runs where created_at between p_from and p_to), 0),
    'ai_error_rate', (select case when count(*) = 0 then null else
                         round(count(*) filter (where status in ('error', 'validation_failed'))::numeric / count(*), 4) end
                        from public.ai_runs where created_at between p_from and p_to)
  ) into v;
  return v;
end $$;

-- Daily time series for analytics charts
create or replace function public.admin_timeseries(p_metric text, p_from timestamptz, p_to timestamptz)
returns table (day date, value numeric) language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not public.is_staff() then raise exception 'Not permitted' using errcode = '42501'; end if;
  return query
  with days as (select generate_series(p_from::date, p_to::date, interval '1 day')::date as day)
  select d.day,
    case p_metric
      when 'listing_views' then (select count(*)::numeric from public.listing_events e where e.event_type = 'view' and e.event_date = d.day)
      when 'saves' then (select count(*)::numeric from public.listing_events e where e.event_type = 'save' and e.event_date = d.day)
      when 'enquiries' then (select count(*)::numeric from public.enquiries e where e.created_at::date = d.day)
      when 'new_listings' then (select count(*)::numeric from public.listings l where l.published_at::date = d.day)
      when 'completed_sales' then (select count(*)::numeric from public.transactions t where t.sale_status = 'completed' and t.completed_at::date = d.day)
      when 'revenue' then (select coalesce(sum(p.amount - p.refunded_amount), 0)::numeric / 100 from public.payments p
                             where p.payment_status in ('succeeded', 'partially_refunded') and p.paid_at::date = d.day)
      when 'ai_cost' then (select coalesce(sum(a.estimated_cost), 0) from public.ai_runs a where a.created_at::date = d.day)
      when 'registrations' then (select count(*)::numeric from public.profiles p where p.created_at::date = d.day)
      when 'searches' then (select count(*)::numeric from public.listing_events e where e.event_type = 'search_impression' and e.event_date = d.day)
      else null
    end
  from days d order by d.day;
end $$;

-- Vehicles awaiting expiry
create or replace function public.expire_listings()
returns integer language plpgsql security definer set search_path = public, extensions as $$
declare v_count integer;
begin
  if not public.is_service_role() then raise exception 'Not permitted' using errcode = '42501'; end if;
  update public.listings set listing_status = 'expired'
   where listing_status = 'published' and expires_at is not null and expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end $$;
