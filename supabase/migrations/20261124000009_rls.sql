-- =============================================================================
-- MERIDIAN MOTORS — 0009 ROW LEVEL SECURITY
-- RLS is enabled on EVERY table in the public schema. Default is deny.
-- The public marketplace reads ONLY through public.public_listings / RPCs.
-- =============================================================================

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Owner-side helpers --------------------------------------------------------
create or replace function public.can_manage_vehicle(p_vehicle uuid)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select public.is_staff() or public.is_vehicle_owner(p_vehicle);
$$;

-- ---------------------------------------------------------------------------
-- Profiles & capabilities
-- ---------------------------------------------------------------------------
create policy profiles_select_own on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_select_staff on public.profiles for select to authenticated using (public.is_staff());
create policy profiles_update_own on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_update_admin on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy sellers_select on public.sellers for select to authenticated using (profile_id = auth.uid() or public.is_staff());
create policy sellers_insert_own on public.sellers for insert to authenticated with check (profile_id = auth.uid());
create policy sellers_update on public.sellers for update to authenticated
  using (profile_id = auth.uid() or public.is_staff()) with check (profile_id = auth.uid() or public.is_staff());

create policy buyers_select on public.buyers for select to authenticated using (profile_id = auth.uid() or public.is_staff());
create policy buyers_insert_own on public.buyers for insert to authenticated with check (profile_id = auth.uid());
create policy buyers_update on public.buyers for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy dealerships_select on public.dealerships for select to authenticated using (public.is_dealership_member(id) or public.is_staff());
create policy dealerships_admin on public.dealerships for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy dealerships_owner_update on public.dealerships for update to authenticated
  using (public.is_dealership_member(id, true)) with check (public.is_dealership_member(id, true));

create policy dealership_members_select on public.dealership_members for select to authenticated
  using (profile_id = auth.uid() or public.is_dealership_member(dealership_id) or public.is_staff());
create policy dealership_members_manage on public.dealership_members for all to authenticated
  using (public.is_dealership_member(dealership_id, true) or public.is_admin())
  with check (public.is_dealership_member(dealership_id, true) or public.is_admin());

create policy settings_public_read on public.platform_settings for select to anon, authenticated using (is_public or public.is_staff());
create policy settings_admin_write on public.platform_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Vehicles (private records — public reads go through public_listings)
-- ---------------------------------------------------------------------------
create policy vehicles_select on public.vehicles for select to authenticated using (public.can_manage_vehicle(id));
create policy vehicles_insert_owner on public.vehicles for insert to authenticated
  with check (owner_id = public.current_seller_id() or public.is_staff());
create policy vehicles_update on public.vehicles for update to authenticated
  using (public.can_manage_vehicle(id)) with check (public.can_manage_vehicle(id));
create policy vehicles_delete_draft on public.vehicles for delete to authenticated
  using (public.is_vehicle_owner(id) and vehicle_status = 'draft');

create policy sale_terms_select on public.vehicle_sale_terms for select to authenticated
  using (public.is_vehicle_owner(vehicle_id) or public.has_staff_role(array['sales_operator']::public.app_role[]));
create policy sale_terms_write_owner on public.vehicle_sale_terms for all to authenticated
  using (public.is_vehicle_owner(vehicle_id) or public.has_staff_role(array['sales_operator']::public.app_role[]))
  with check (public.is_vehicle_owner(vehicle_id) or public.has_staff_role(array['sales_operator']::public.app_role[]));

create policy images_select on public.vehicle_images for select to authenticated using (public.can_manage_vehicle(vehicle_id));
create policy images_write on public.vehicle_images for all to authenticated
  using (public.can_manage_vehicle(vehicle_id)) with check (public.can_manage_vehicle(vehicle_id));

create policy documents_select on public.vehicle_documents for select to authenticated
  using (public.is_staff() or (public.is_vehicle_owner(vehicle_id) and access_level = 'owner_and_staff'));
create policy documents_insert on public.vehicle_documents for insert to authenticated
  with check (public.can_manage_vehicle(vehicle_id) and (public.is_staff() or access_level = 'owner_and_staff'));
create policy documents_delete on public.vehicle_documents for delete to authenticated
  using (public.is_admin() or (public.is_vehicle_owner(vehicle_id) and uploaded_by = auth.uid()));

create policy checks_select on public.vehicle_checks for select to authenticated using (public.can_manage_vehicle(vehicle_id));
create policy checks_staff_write on public.vehicle_checks for all to authenticated
  using (public.has_staff_role(array['verification_operator']::public.app_role[]))
  with check (public.has_staff_role(array['verification_operator']::public.app_role[]));

create policy verifications_staff on public.vehicle_verifications for all to authenticated
  using (public.is_staff()) with check (public.has_staff_role(array['verification_operator']::public.app_role[]));

create policy dvla_staff_read on public.dvla_lookups for select to authenticated using (public.is_staff());
create policy internal_notes_staff on public.vehicle_internal_notes for all to authenticated
  using (public.is_staff()) with check (public.is_staff() and author_id = auth.uid());
create policy status_history_staff on public.vehicle_status_history for select to authenticated using (public.is_staff());
create policy status_transitions_read on public.vehicle_status_transitions for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Listings
-- ---------------------------------------------------------------------------
create policy listings_select on public.listings for select to authenticated using (public.can_manage_vehicle(vehicle_id));
create policy listings_insert on public.listings for insert to authenticated with check (public.can_manage_vehicle(vehicle_id));
create policy listings_update on public.listings for update to authenticated
  using (public.can_manage_vehicle(vehicle_id)) with check (public.can_manage_vehicle(vehicle_id));

create policy drafts_select on public.listing_content_drafts for select to authenticated
  using (exists (select 1 from public.listings l where l.id = listing_id and public.can_manage_vehicle(l.vehicle_id)));
create policy drafts_staff_insert on public.listing_content_drafts for insert to authenticated
  with check (public.has_staff_role(array['sales_operator']::public.app_role[]) and source = 'staff');

create policy listing_events_select on public.listing_events for select to authenticated
  using (exists (select 1 from public.listings l where l.id = listing_id and public.can_manage_vehicle(l.vehicle_id)));

-- ---------------------------------------------------------------------------
-- Buyers
-- ---------------------------------------------------------------------------
create policy buyer_prefs_own on public.buyer_preferences for all to authenticated
  using (buyer_id = public.current_buyer_id() or public.is_staff())
  with check (buyer_id = public.current_buyer_id());
create policy saved_vehicles_own on public.saved_vehicles for select to authenticated using (buyer_id = public.current_buyer_id());
create policy saved_vehicles_insert on public.saved_vehicles for insert to authenticated
  with check (buyer_id = public.current_buyer_id()
              and exists (select 1 from public.public_listings pl where pl.vehicle_id = saved_vehicles.vehicle_id));
create policy saved_vehicles_delete on public.saved_vehicles for delete to authenticated using (buyer_id = public.current_buyer_id());
create policy saved_searches_own on public.saved_searches for all to authenticated
  using (buyer_id = public.current_buyer_id()) with check (buyer_id = public.current_buyer_id());
create policy buyer_matches_select on public.buyer_matches for select to authenticated
  using (buyer_id = public.current_buyer_id() or public.is_staff());
create policy buyer_matches_dismiss on public.buyer_matches for update to authenticated
  using (buyer_id = public.current_buyer_id()) with check (buyer_id = public.current_buyer_id());

-- ---------------------------------------------------------------------------
-- Pricing
-- ---------------------------------------------------------------------------
create policy valuations_select on public.valuations for select to authenticated using (public.can_manage_vehicle(vehicle_id));
create policy valuations_staff_write on public.valuations for all to authenticated
  using (public.has_staff_role(array['sales_operator']::public.app_role[]))
  with check (public.has_staff_role(array['sales_operator']::public.app_role[]));
create policy comparables_select on public.comparable_vehicles for select to authenticated
  using (exists (select 1 from public.valuations v where v.id = valuation_id and public.can_manage_vehicle(v.vehicle_id)));
create policy price_recs_select on public.price_recommendations for select to authenticated using (public.can_manage_vehicle(vehicle_id));
create policy price_recs_insert on public.price_recommendations for insert to authenticated with check (public.can_manage_vehicle(vehicle_id));
create policy price_recs_update on public.price_recommendations for update to authenticated
  using (public.can_manage_vehicle(vehicle_id)) with check (public.can_manage_vehicle(vehicle_id));
create policy price_history_select on public.price_history for select to authenticated using (public.can_manage_vehicle(vehicle_id));
create policy data_providers_staff on public.data_providers for select to authenticated using (public.is_staff());
create policy data_providers_admin on public.data_providers for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Enquiries & messaging
-- ---------------------------------------------------------------------------
create policy enquiries_select on public.enquiries for select to authenticated using (public.can_access_enquiry(id));
create policy enquiries_update on public.enquiries for update to authenticated
  using (public.is_staff() or seller_id = public.current_seller_id())
  with check (public.is_staff() or seller_id = public.current_seller_id());
create policy enquiry_contacts_select on public.enquiry_contacts for select to authenticated
  using (public.is_staff() or exists (select 1 from public.enquiries e where e.id = enquiry_id and e.buyer_id = public.current_buyer_id()));
create policy conversations_select on public.conversations for select to authenticated using (public.can_access_enquiry(enquiry_id));
create policy messages_select on public.messages for select to authenticated
  using (exists (select 1 from public.conversations c where c.id = conversation_id and public.can_access_enquiry(c.enquiry_id)));
create policy messages_insert on public.messages for insert to authenticated
  with check (exists (select 1 from public.conversations c where c.id = conversation_id and public.can_access_enquiry(c.enquiry_id)));
create policy messages_mark_read on public.messages for update to authenticated
  using (exists (select 1 from public.conversations c where c.id = conversation_id and public.can_access_enquiry(c.enquiry_id))
         and sender_id is distinct from auth.uid())
  with check (exists (select 1 from public.conversations c where c.id = conversation_id and public.can_access_enquiry(c.enquiry_id)));
create policy enquiry_activities_staff on public.enquiry_activities for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy viewings_select on public.viewings for select to authenticated using (public.can_access_enquiry(enquiry_id));
create policy viewings_staff on public.viewings for all to authenticated
  using (public.has_staff_role(array['sales_operator']::public.app_role[]))
  with check (public.has_staff_role(array['sales_operator']::public.app_role[]));

-- ---------------------------------------------------------------------------
-- Commerce
-- ---------------------------------------------------------------------------
create policy transactions_select on public.transactions for select to authenticated
  using (public.is_staff() or seller_id = public.current_seller_id() or (buyer_id is not null and buyer_id = public.current_buyer_id()));
create policy transactions_staff on public.transactions for insert to authenticated
  with check (public.has_staff_role(array['sales_operator']::public.app_role[]));
create policy transactions_staff_update on public.transactions for update to authenticated
  using (public.has_staff_role(array['sales_operator']::public.app_role[]))
  with check (public.has_staff_role(array['sales_operator']::public.app_role[]));

create policy service_catalog_read on public.service_catalog for select to anon, authenticated using (is_active or public.is_staff());
create policy service_catalog_admin on public.service_catalog for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy service_orders_select on public.service_orders for select to authenticated
  using (seller_id = public.current_seller_id() or public.is_staff());
create policy service_orders_insert on public.service_orders for insert to authenticated
  with check (seller_id = public.current_seller_id() or public.is_staff());
create policy service_orders_update on public.service_orders for update to authenticated
  using (seller_id = public.current_seller_id() or public.is_staff())
  with check (seller_id = public.current_seller_id() or public.is_staff());

create policy payments_select on public.payments for select to authenticated using (profile_id = auth.uid() or public.is_staff());
-- (no insert/update/delete policies: payments are written by the server only)

create policy refund_requests_select on public.refund_requests for select to authenticated
  using (requested_by = auth.uid() or public.is_staff());
create policy refund_requests_insert on public.refund_requests for insert to authenticated
  with check (requested_by = auth.uid() and exists (select 1 from public.payments p where p.id = payment_id and p.profile_id = auth.uid()));
create policy refund_requests_admin on public.refund_requests for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy subscriptions_select on public.subscriptions for select to authenticated
  using (profile_id = auth.uid() or (dealership_id is not null and public.is_dealership_member(dealership_id)) or public.is_staff());

-- ---------------------------------------------------------------------------
-- System
-- ---------------------------------------------------------------------------
create policy ai_runs_staff on public.ai_runs for select to authenticated using (public.is_admin());
create policy import_jobs_admin on public.import_jobs for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy import_rows_admin on public.import_rows for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy notifications_own on public.notifications for select to authenticated using (profile_id = auth.uid());
create policy notifications_mark_read on public.notifications for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy notification_prefs_own on public.notification_preferences for select to authenticated using (profile_id = auth.uid());
create policy notification_prefs_update on public.notification_preferences for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy audit_logs_admin on public.audit_logs for select to authenticated using (public.is_admin());
create policy data_requests_own on public.data_requests for select to authenticated using (profile_id = auth.uid() or public.is_admin());
create policy data_requests_insert on public.data_requests for insert to authenticated with check (profile_id = auth.uid());
create policy data_requests_admin on public.data_requests for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy consent_own on public.consent_records for select to authenticated using (profile_id = auth.uid() or public.is_admin());
create policy consent_insert on public.consent_records for insert to authenticated with check (profile_id = auth.uid());
create policy contact_messages_staff on public.contact_messages for select to authenticated using (public.is_staff());
create policy contact_messages_staff_update on public.contact_messages for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy assistance_select on public.assistance_requests for select to authenticated
  using (seller_id = public.current_seller_id() or public.is_staff());
create policy assistance_insert on public.assistance_requests for insert to authenticated
  with check (seller_id = public.current_seller_id() and (vehicle_id is null or public.is_vehicle_owner(vehicle_id)));
create policy assistance_staff_update on public.assistance_requests for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
-- stripe_events, rate_limits: no policies (server only)

-- ---------------------------------------------------------------------------
-- Column-level hardening: anon never gets direct table access.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
grant select on public.public_listings to anon;
grant select on public.platform_settings to anon;
grant select on public.service_catalog to anon;

-- Internal-only functions must not be callable from the API.
revoke execute on function public.claim_import_rows(uuid, integer) from public, anon;
revoke execute on function public.expire_listings() from public, anon, authenticated;
revoke execute on function public.audit_row_change() from public, anon, authenticated;
