-- =============================================================================
-- Database security & workflow tests (run with: npm run test:db)
-- Every assertion raises on failure, stopping the run (ON_ERROR_STOP).
-- =============================================================================
\set QUIET on
create schema tests;
grant usage on schema tests to anon, authenticated, service_role;

create function tests.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is distinct from true then raise exception 'ASSERTION FAILED: %', p_msg; end if;
  raise notice 'ok - %', p_msg;
end $$;

create function tests.throws(p_sql text, p_msg text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise notice 'ok - % (rejected: %)', p_msg, sqlerrm;
    return;
  end;
  raise exception 'ASSERTION FAILED (expected an error): %', p_msg;
end $$;
grant execute on all functions in schema tests to anon, authenticated, service_role;

-- Act as a given user (or anon). `reset role` returns to the trusted server.
create function tests.act_as(p_user uuid) returns void language plpgsql as $$
begin
  if p_user is null then
    perform set_config('request.jwt.claims', '{"role":"anon"}', false);
    execute 'set role anon';
  else
    perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, false);
    execute 'set role authenticated';
  end if;
end $$;
create function tests.as_server() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', false);
end $$;

-- ---------------------------------------------------------------------------
-- Fixtures (as server)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'seller.a@example.test', '{"first_name":"Alice","role":"super_admin"}'),
  ('00000000-0000-0000-0000-00000000000b', 'seller.b@example.test', '{"first_name":"Ben"}'),
  ('00000000-0000-0000-0000-00000000000c', 'buyer.c@example.test', '{"first_name":"Cara"}'),
  ('00000000-0000-0000-0000-00000000000d', 'admin.d@example.test', '{"first_name":"Dan"}'),
  ('00000000-0000-0000-0000-00000000000e', 'super.e@example.test', '{"first_name":"Eve"}'),
  ('00000000-0000-0000-0000-00000000000f', 'sales.f@example.test', '{"first_name":"Finn"}');

select tests.ok((select role from public.profiles where id = '00000000-0000-0000-0000-00000000000a') = 'customer',
  'signup metadata cannot grant a role (profile created as customer)');

-- super admin provisioned by the trusted server only
update public.profiles set role = 'super_admin' where id = '00000000-0000-0000-0000-00000000000e';

-- super admin grants admin; admin grants sales operator
select tests.act_as('00000000-0000-0000-0000-00000000000e');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000d';
select tests.act_as('00000000-0000-0000-0000-00000000000d');
update public.profiles set role = 'sales_operator' where id = '00000000-0000-0000-0000-00000000000f';
select tests.throws($$update public.profiles set role = 'super_admin' where id = '00000000-0000-0000-0000-00000000000b'$$,
  'an admin cannot grant super_admin');
select tests.as_server();
select tests.ok((select role from public.profiles where id = '00000000-0000-0000-0000-00000000000f') = 'sales_operator',
  'role provisioning chain works');

-- ---------------------------------------------------------------------------
-- 1. Privilege escalation
-- ---------------------------------------------------------------------------
select tests.act_as('00000000-0000-0000-0000-00000000000a');
select tests.throws($$update public.profiles set role = 'admin' where id = auth.uid()$$, 'a user cannot change their own role');
select tests.throws($$update public.profiles set account_status = 'active', role = 'super_admin' where id = auth.uid()$$, 'a user cannot self-promote');
select tests.ok((select count(*) from public.profiles) = 1, 'a customer can only read their own profile');

-- ---------------------------------------------------------------------------
-- 2. Seller creates a vehicle
-- ---------------------------------------------------------------------------
select public.ensure_seller();
insert into public.vehicles (id, owner_id, registration_number, vin, make, model, year, mileage, fuel_type, transmission,
                             body_type, condition, postcode, location, vehicle_status, is_flagged)
values ('10000000-0000-0000-0000-000000000001', public.current_seller_id(), 'ab12 cde', 'WVWZZZ1KZAW000001', 'volkswagen', 'Golf', 2019, 42000,
        'petrol', 'automatic', 'hatchback', 'very_good', 'sw1a1aa', 'London', 'published', true);
select tests.ok((select vehicle_status from public.vehicles where id = '10000000-0000-0000-0000-000000000001') = 'draft',
  'seller-created vehicles always start as draft');
select tests.ok((select not is_flagged from public.vehicles where id = '10000000-0000-0000-0000-000000000001'),
  'seller cannot set protected flags on insert');
select tests.ok((select registration_number = 'AB12CDE' and postcode = 'SW1A 1AA' and make = 'Volkswagen'
                 from public.vehicles where id = '10000000-0000-0000-0000-000000000001'), 'registration/postcode normalised');
insert into public.vehicle_sale_terms (vehicle_id, desired_asking_price, expected_selling_price, minimum_authorised_price)
values ('10000000-0000-0000-0000-000000000001', 9000, 8800, 8500);
select tests.throws($$update public.vehicles set vehicle_status = 'published' where id = '10000000-0000-0000-0000-000000000001'$$,
  'vehicle status cannot be changed outside the pipeline');
select tests.throws($$select public.transition_vehicle_status('10000000-0000-0000-0000-000000000001', 'submitted')$$,
  'submission requires the seller declaration');
update public.vehicles set seller_declaration_at = now() where id = '10000000-0000-0000-0000-000000000001';
select public.transition_vehicle_status('10000000-0000-0000-0000-000000000001', 'submitted', 'Seller submitted');
select tests.throws($$select public.transition_vehicle_status('10000000-0000-0000-0000-000000000001', 'verification_pending')$$,
  'a seller cannot perform staff pipeline transitions');
select tests.throws($$insert into public.vehicles (owner_id, make, model) values ((select id from public.sellers where profile_id = '00000000-0000-0000-0000-00000000000b'), 'Ford', 'Fiesta')$$,
  'a seller cannot create a vehicle for another seller');

-- ---------------------------------------------------------------------------
-- 3. Cross-seller isolation
-- ---------------------------------------------------------------------------
select tests.act_as('00000000-0000-0000-0000-00000000000b');
select public.ensure_seller();
select tests.ok((select count(*) from public.vehicles where id = '10000000-0000-0000-0000-000000000001') = 0,
  'a seller cannot read another seller''s vehicle');
select tests.ok((select count(*) from public.vehicle_sale_terms) = 0, 'a seller cannot read another seller''s sale terms');
update public.vehicles set mileage = 1 where id = '10000000-0000-0000-0000-000000000001';
select tests.throws($$select public.transition_vehicle_status('10000000-0000-0000-0000-000000000001', 'withdrawn')$$,
  'a seller cannot withdraw another seller''s vehicle');
select tests.as_server();
select tests.ok((select mileage from public.vehicles where id = '10000000-0000-0000-0000-000000000001') = 42000,
  'cross-seller update had no effect');

-- ---------------------------------------------------------------------------
-- 4. Staff pipeline & listing approval
-- ---------------------------------------------------------------------------
select tests.act_as('00000000-0000-0000-0000-00000000000f');
select public.transition_vehicle_status('10000000-0000-0000-0000-000000000001', 'verification_pending', null, 'Docs look fine');
select public.transition_vehicle_status('10000000-0000-0000-0000-000000000001', 'valuation_completed');
select public.transition_vehicle_status('10000000-0000-0000-0000-000000000001', 'awaiting_seller_approval');
select tests.throws($$select public.transition_vehicle_status('10000000-0000-0000-0000-000000000001', 'completed')$$,
  'invalid pipeline transitions are rejected');

select tests.act_as('00000000-0000-0000-0000-00000000000a');
insert into public.listings (id, vehicle_id, title, description, asking_price, listing_status, admin_approved_at)
values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '2019 Volkswagen Golf 1.5 TSI',
        'Well maintained Golf with full service history.', 9000, 'published', now());
select tests.ok((select listing_status = 'draft' and admin_approved_at is null from public.listings where id = '20000000-0000-0000-0000-000000000001'),
  'a seller cannot self-publish or self-approve a listing');
select tests.throws($$update public.listings set asking_price = 8000 where id = '20000000-0000-0000-0000-000000000001'$$,
  'asking price can never go below the seller''s authorised minimum');

-- staff cannot change price without seller authorisation
select tests.act_as('00000000-0000-0000-0000-00000000000f');
select tests.throws($$select public.set_asking_price('20000000-0000-0000-0000-000000000001', 8700, 'fast sale')$$,
  'staff cannot change the price without seller authorisation');
insert into public.price_recommendations (id, vehicle_id, recommended_price, recommendation_type, explanation, approved_by_seller)
values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 8700, 'fast_sale', 'Competitive', true);
select tests.ok((select approved_by_seller is null from public.price_recommendations where id = '30000000-0000-0000-0000-000000000001'),
  'staff cannot pre-approve a recommendation on the seller''s behalf');
select tests.throws($$update public.price_recommendations set approved_by_seller = true where id = '30000000-0000-0000-0000-000000000001'$$,
  'only the seller can accept a price recommendation');
insert into public.price_recommendations (id, vehicle_id, recommended_price, recommendation_type)
values ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 8400, 'fast_sale');

select tests.act_as('00000000-0000-0000-0000-00000000000a');
select public.decide_price_recommendation('30000000-0000-0000-0000-000000000001', true);
select tests.ok((select asking_price from public.listings where id = '20000000-0000-0000-0000-000000000001') = 8700,
  'seller-accepted recommendation is applied');
select tests.throws($$select public.decide_price_recommendation('30000000-0000-0000-0000-000000000002', true)$$,
  'an accepted recommendation still cannot breach the authorised minimum');
select tests.ok((select count(*) from public.price_history where vehicle_id = '10000000-0000-0000-0000-000000000001') = 2,
  'price history recorded for every price change');

select tests.throws($$select public.transition_vehicle_status('10000000-0000-0000-0000-000000000001', 'approved_for_publication')$$,
  'seller must approve listing before approving for publication');
select public.seller_approve_listing('20000000-0000-0000-0000-000000000001');
select public.transition_vehicle_status('10000000-0000-0000-0000-000000000001', 'approved_for_publication');

select tests.act_as('00000000-0000-0000-0000-00000000000f');
select tests.throws($$select public.transition_vehicle_status('10000000-0000-0000-0000-000000000001', 'published')$$,
  'a listing cannot publish without Meridian approval');
select public.admin_review_listing('20000000-0000-0000-0000-000000000001', 'approve');

-- AI-generated content must be approved before it replaces the listing copy
select tests.as_server();
insert into public.listing_content_drafts (id, listing_id, source, title, description)
values ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'ai',
        '2019 Volkswagen Golf Automatic', 'AI generated description from confirmed details.');
select tests.ok((select description = 'Well maintained Golf with full service history.' from public.listings where id = '20000000-0000-0000-0000-000000000001'),
  'AI-generated content does not change the listing until approved');

select tests.act_as('00000000-0000-0000-0000-00000000000f');
select public.transition_vehicle_status('10000000-0000-0000-0000-000000000001', 'published');
select tests.as_server();
select tests.ok((select count(*) from public.public_listings where id = '20000000-0000-0000-0000-000000000001') = 1,
  'approved listing is publicly visible after publication');

select tests.act_as('00000000-0000-0000-0000-00000000000a');
select tests.throws($$update public.listings set description = 'Changed after publication text' where id = '20000000-0000-0000-0000-000000000001'$$,
  'sellers cannot silently change a published listing''s content');
select tests.throws($$select public.approve_listing_draft('40000000-0000-0000-0000-000000000001')$$,
  'AI content cannot be pushed into a published listing by the seller');

-- ---------------------------------------------------------------------------
-- 5. Public exposure
-- ---------------------------------------------------------------------------
select tests.act_as(null);
select tests.throws($$select * from public.vehicles$$, 'anonymous users cannot read the vehicles table');
select tests.throws($$select * from public.listings$$, 'anonymous users cannot read the listings table');
select tests.throws($$select * from public.vehicle_sale_terms$$, 'anonymous users cannot read sale terms');
select tests.throws($$select * from public.vehicle_documents$$, 'anonymous users cannot read document records');
select tests.ok((select count(*) from public.public_listings) = 1, 'anonymous users can read public listings');
select tests.ok(((public.search_listings(p_query => 'golf'))->>'total')::int = 1, 'public search finds published vehicles');
select tests.ok(((public.search_listings(p_max_price => 5000))->>'total')::int = 0, 'public search filters by price');
select tests.as_server();
select tests.ok(not exists (
  select 1 from information_schema.columns
   where table_schema = 'public' and table_name = 'public_listings'
     and column_name in ('registration_number', 'vin', 'postcode', 'owner_id', 'minimum_authorised_price',
                         'expected_selling_price', 'desired_asking_price', 'seller_comments', 'phone', 'email', 'submission_data')),
  'public_listings exposes no private columns');

-- Unapproved listings never appear publicly
select tests.act_as('00000000-0000-0000-0000-00000000000b');
insert into public.vehicles (id, owner_id, make, model, year, mileage, fuel_type, transmission, postcode)
values ('10000000-0000-0000-0000-000000000002', public.current_seller_id(), 'Ford', 'Fiesta', 2018, 30000, 'petrol', 'manual', 'M1 1AE');
insert into public.listings (vehicle_id, title, description, asking_price)
values ('10000000-0000-0000-0000-000000000002', '2018 Ford Fiesta', 'Draft listing', 6000);
select tests.act_as(null);
select tests.ok((select count(*) from public.public_listings where vehicle_id = '10000000-0000-0000-0000-000000000002') = 0,
  'unapproved listings are not publicly visible');

-- ---------------------------------------------------------------------------
-- 6. Valuations cannot use fabricated comparables
-- ---------------------------------------------------------------------------
select tests.as_server();
insert into public.valuations (id, vehicle_id, engine_version, valuation_status)
values ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'test', 'pending');
select tests.throws($$insert into public.comparable_vehicles (valuation_id, source_provider, external_reference, vehicle_details, observed_price, source_date)
  values ('50000000-0000-0000-0000-000000000001', 'meridian_completed_sale', 'made-up-ref', '{}', 7000, current_date)$$,
  'a comparable citing a non-existent Meridian sale is rejected');
select tests.throws($$insert into public.comparable_vehicles (valuation_id, source_provider, external_reference, vehicle_details, observed_price, source_date)
  values ('50000000-0000-0000-0000-000000000001', 'licensed:unknown_provider', 'X1', '{}', 7000, current_date)$$,
  'a comparable from an unlicensed provider is rejected');
select tests.throws($$insert into public.comparable_vehicles (valuation_id, source_provider, external_reference, vehicle_details, observed_price, source_date)
  values ('50000000-0000-0000-0000-000000000001', 'internet', 'X1', '{}', 7000, current_date)$$,
  'a comparable without a recognised source is rejected');
select tests.throws($$update public.valuations set valuation_status = 'completed', market_value_min = 1, market_value_max = 2,
  recommended_asking_price = 2, fast_sale_price = 1, confidence_score = 0.5 where id = '50000000-0000-0000-0000-000000000001'$$,
  'a valuation cannot complete without enough real comparables');
insert into public.comparable_vehicles (valuation_id, source_provider, external_reference, vehicle_details, observed_price, source_date)
values ('50000000-0000-0000-0000-000000000001', 'meridian_listing', '20000000-0000-0000-0000-000000000001', '{}', 8700, current_date);
select tests.ok((select count(*) from public.comparable_vehicles) = 1, 'a comparable citing a real Meridian listing is accepted');
update public.valuations set valuation_status = 'insufficient_data', data_limitations = array['Only 1 comparable']
 where id = '50000000-0000-0000-0000-000000000001';
select tests.ok(true, 'insufficient-data valuations can be recorded without prices');

-- ---------------------------------------------------------------------------
-- 7. Enquiries & private buyer data
-- ---------------------------------------------------------------------------
select tests.act_as(null);
select public.submit_enquiry('20000000-0000-0000-0000-000000000001', 'viewing_request',
  'Hello, could I view this car on Saturday please?', 'Guest Person', 'guest@example.test', '07700 900123');
select tests.act_as('00000000-0000-0000-0000-00000000000c');
select public.submit_enquiry('20000000-0000-0000-0000-000000000001', 'price_question',
  'Is there any flexibility on the price at all?', 'Cara Buyer', 'buyer.c@example.test');
select tests.ok((select count(*) from public.enquiries) = 1, 'a buyer sees only their own enquiries');
select tests.ok((select count(*) from public.enquiry_contacts) = 1, 'a buyer sees their own contact record');
select tests.ok((select count(*) from public.vehicles) = 0, 'a buyer cannot read private vehicle records');
select tests.ok((select count(*) from public.valuations) = 0, 'a buyer cannot read valuations');

select tests.act_as('00000000-0000-0000-0000-00000000000a');
select tests.ok((select count(*) from public.enquiries) = 2, 'seller sees enquiries for their vehicle');
select tests.ok((select count(*) from public.enquiry_contacts) = 0, 'seller cannot read buyer contact details');
select tests.ok((select vehicle_status from public.vehicles where id = '10000000-0000-0000-0000-000000000001') = 'receiving_enquiries',
  'first enquiry moves the vehicle to receiving_enquiries');
select tests.ok((select count(*) from public.notifications where notification_type = 'enquiry_received') = 2, 'seller notified of enquiries');
select tests.throws($$update public.enquiries set assigned_to = auth.uid()$$, 'seller cannot assign enquiries');

select tests.act_as('00000000-0000-0000-0000-00000000000b');
select tests.ok((select count(*) from public.enquiries) = 0, 'other sellers cannot see enquiries');
select tests.ok((select count(*) from public.messages) = 0, 'other sellers cannot read messages');

-- ---------------------------------------------------------------------------
-- 8. Sales & payments
-- ---------------------------------------------------------------------------
select tests.act_as('00000000-0000-0000-0000-00000000000a');
select public.seller_report_sale('10000000-0000-0000-0000-000000000001', 8600, 'Sold to a local buyer');
select tests.ok((select vehicle_status from public.vehicles where id = '10000000-0000-0000-0000-000000000001') = 'receiving_enquiries',
  'a seller''s sale report does not complete the sale without confirmation');
select tests.throws($$select public.staff_complete_sale((select id from public.transactions limit 1))$$,
  'a seller cannot confirm their own sale as complete');

select tests.act_as('00000000-0000-0000-0000-00000000000f');
select public.staff_complete_sale((select id from public.transactions limit 1));
select tests.as_server();
select tests.ok((select fee_amount from public.transactions limit 1) = 199, 'sale fee calculated from configurable tiers (£8,600 → £199)');
select tests.ok((select count(*) from public.payments where payment_type = 'sale_fee' and payment_status = 'pending') = 1,
  'sale fee becomes payable (pending) when the sale completes');
select tests.ok((select vehicle_status = 'completed' from public.vehicles where id = '10000000-0000-0000-0000-000000000001'), 'vehicle completed');
select tests.ok((select count(*) from public.public_listings) = 0, 'sold vehicles leave the public marketplace');

select tests.act_as('00000000-0000-0000-0000-00000000000a');
update public.payments set payment_status = 'succeeded';
select tests.as_server();
select tests.ok((select payment_status from public.payments limit 1) = 'pending', 'a customer cannot mark a payment successful');
select tests.act_as('00000000-0000-0000-0000-00000000000d');
update public.payments set payment_status = 'succeeded', paid_at = now(), stripe_payment_id = 'pi_fake';
select tests.as_server();
select tests.ok((select payment_status from public.payments limit 1) = 'pending',
  'even an admin cannot mark a payment successful without verified provider confirmation');
select tests.throws($$update public.payments set payment_status = 'succeeded'$$,
  'a payment cannot be successful without a Stripe payment id');
update public.payments set payment_status = 'succeeded', paid_at = now(), stripe_payment_id = 'pi_test_123';
select tests.ok((select payment_status from public.payments limit 1) = 'succeeded', 'server (verified webhook path) can confirm payment');
select tests.throws($$delete from public.transactions$$, 'completed transaction history cannot be deleted');
select tests.act_as('00000000-0000-0000-0000-00000000000d');
select tests.throws($$update public.transactions set agreed_price = 1$$, 'completed transactions are immutable');

-- ---------------------------------------------------------------------------
-- 9. Documents & storage
-- ---------------------------------------------------------------------------
select tests.as_server();
insert into storage.objects (bucket_id, name, owner) values
  ('vehicle-documents', '10000000-0000-0000-0000-000000000001/v5c.pdf', '00000000-0000-0000-0000-00000000000a'),
  ('vehicle-images', '10000000-0000-0000-0000-000000000001/front.jpg', '00000000-0000-0000-0000-00000000000a');
insert into public.vehicle_documents (vehicle_id, document_type, storage_path, file_name, mime_type, size_bytes, uploaded_by)
values ('10000000-0000-0000-0000-000000000001', 'v5c', '10000000-0000-0000-0000-000000000001/v5c.pdf', 'v5c.pdf', 'application/pdf', 1000,
        '00000000-0000-0000-0000-00000000000a');
select tests.act_as(null);
select tests.ok((select count(*) from storage.objects where bucket_id = 'vehicle-documents') = 0, 'public users cannot access private documents');
select tests.ok((select count(*) from storage.objects where bucket_id = 'vehicle-images') = 1, 'vehicle images are publicly readable');
select tests.act_as('00000000-0000-0000-0000-00000000000b');
select tests.ok((select count(*) from storage.objects where bucket_id = 'vehicle-documents') = 0, 'other sellers cannot access documents');
select tests.throws($$insert into storage.objects (bucket_id, name) values ('vehicle-documents', '10000000-0000-0000-0000-000000000001/evil.pdf')$$,
  'other sellers cannot upload into another seller''s vehicle folder');
select tests.act_as('00000000-0000-0000-0000-00000000000a');
select tests.ok((select count(*) from storage.objects where bucket_id = 'vehicle-documents') = 1, 'owners can access their own documents');
select tests.act_as('00000000-0000-0000-0000-00000000000f');
select tests.ok((select count(*) from storage.objects where bucket_id = 'vehicle-documents') = 1, 'staff can access documents');

-- ---------------------------------------------------------------------------
-- 10. Admin-only functions & audit
-- ---------------------------------------------------------------------------
select tests.act_as('00000000-0000-0000-0000-00000000000c');
select tests.throws($$select public.admin_dashboard_stats()$$, 'customers cannot read admin statistics');
select tests.ok((select count(*) from public.audit_logs) = 0, 'customers cannot read audit logs');
select tests.ok((select count(*) from public.ai_runs) = 0, 'customers cannot read AI usage');
select tests.act_as('00000000-0000-0000-0000-00000000000d');
select tests.ok((public.admin_dashboard_stats() ->> 'completed_sales')::int = 1, 'admin statistics reflect recorded data');
select tests.ok((select count(*) from public.audit_logs where entity_type = 'vehicles') > 0, 'admins can read the audit trail');
delete from public.audit_logs;
select tests.ok((select count(*) from public.audit_logs) > 0, 'audit logs cannot be deleted by admins');
select tests.as_server();
select tests.throws($$update public.audit_logs set action = 'x'$$, 'audit logs are immutable even for the server');
select tests.ok((select count(*) from public.vehicle_status_history where vehicle_id = '10000000-0000-0000-0000-000000000001'
                 and previous_status = 'submitted' and new_status = 'verification_pending' and internal_notes = 'Docs look fine') = 1,
  'status history records previous status, new status and notes');

-- seller-facing timeline hides internal notes
select tests.act_as('00000000-0000-0000-0000-00000000000a');
select tests.ok((select count(*) from public.vehicle_status_history) = 0, 'sellers cannot read raw status history (internal notes)');
select tests.ok((select count(*) from public.vehicle_timeline('10000000-0000-0000-0000-000000000001')) >= 8, 'sellers see their timeline');
select tests.ok((public.seller_dashboard_stats() ->> 'completed_sales')::int = 1, 'seller dashboard stats are real');

select tests.as_server();
\echo '✓ 01_security.test.sql complete'
