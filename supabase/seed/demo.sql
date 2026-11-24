-- =============================================================================
-- DEMO DATA — LOCAL / DEMO ENVIRONMENTS ONLY. NEVER RUN IN PRODUCTION.
-- Every record is labelled [DEMO]. Creates a demo seller, published demo
-- listings and completed demo sales so the Fast Sale engine has comparables.
-- Usage: psql "$LOCAL_DB_URL" -f supabase/seed/demo.sql
-- Remove:  psql "$LOCAL_DB_URL" -f supabase/seed/remove-demo.sql
-- =============================================================================
do $$
declare
  v_user uuid := '00000000-0000-4000-8000-00000000d3a0';
  v_seller uuid;
  v_vehicle uuid;
  v_listing uuid;
  r record;
  i int := 0;
begin
  if exists (select 1 from public.platform_settings where setting_key = 'site.environment' and setting_value = '"production"'::jsonb) then
    raise exception 'Refusing to load demo data into production';
  end if;
  insert into auth.users (id, email, raw_user_meta_data, aud, role, created_at, updated_at)
  values (v_user, 'demo.seller@example.invalid', '{"first_name":"[DEMO]","last_name":"Seller"}', 'authenticated', 'authenticated', now(), now())
  on conflict (id) do nothing;
  insert into public.sellers (profile_id) values (v_user) on conflict (profile_id) do nothing;
  select id into v_seller from public.sellers where profile_id = v_user;
  perform set_config('meridian.status_transition', 'on', true); -- trusted maintenance context

  for r in
    select * from (values
      ('Volkswagen','Golf','1.5 TSI Life DSG',2019,38000,'petrol','automatic','hatchback',14250,'London','SW1A 1AA'),
      ('Volkswagen','Golf','1.5 TSI Life DSG',2019,45000,'petrol','automatic','hatchback',13750,'Croydon','CR0 1NX'),
      ('Volkswagen','Golf','1.5 TSI Style DSG',2020,31000,'petrol','automatic','hatchback',15950,'Reading','RG1 1AF'),
      ('Volkswagen','Golf','1.0 TSI Life',2018,52000,'petrol','automatic','hatchback',12495,'Guildford','GU1 3AA'),
      ('Volkswagen','Golf','1.5 TSI Match DSG',2019,41000,'petrol','automatic','hatchback',13995,'Watford','WD17 1AP'),
      ('Ford','Focus','1.0 EcoBoost Titanium',2019,29000,'petrol','manual','hatchback',11995,'Leeds','LS1 4AP'),
      ('Ford','Focus','1.5 EcoBlue ST-Line',2020,34000,'diesel','manual','estate',13495,'York','YO1 7HH'),
      ('Toyota','Yaris','1.5 Hybrid Icon',2020,22000,'hybrid','automatic','hatchback',13250,'Bristol','BS1 4DJ'),
      ('BMW','3 Series','320d M Sport',2018,58000,'diesel','automatic','saloon',16995,'Manchester','M1 1AE'),
      ('Kia','Sportage','1.6 T-GDi GT-Line',2021,19000,'petrol','automatic','suv',21995,'Birmingham','B1 1AA')
    ) as t(make, model, derivative, year, mileage, fuel, trans, body, price, town, postcode)
  loop
    i := i + 1;
    insert into public.vehicles (owner_id, make, model, derivative, year, mileage, fuel_type, transmission, body_type, colour, doors, seats,
      condition, service_history, location, postcode, description, vehicle_status, source, seller_declaration_at, disclosures_confirmed_at, has_outstanding_finance)
    values (v_seller, r.make, r.model, r.derivative, r.year, r.mileage, r.fuel::public.fuel_type, r.trans::public.transmission_type, r.body::public.body_type,
      'Grey', 5, 5, 'very_good', 'full', r.town, r.postcode, '[DEMO] Demonstration vehicle — not a real listing.', 'published', 'seller_submission', now(), now(), false)
    returning id into v_vehicle;
    insert into public.vehicle_sale_terms (vehicle_id, desired_asking_price, minimum_authorised_price) values (v_vehicle, r.price, r.price - 1000);
    insert into public.listings (vehicle_id, title, description, asking_price, location, listing_status, seller_approved_at, admin_approved_at, published_at, expires_at)
    values (v_vehicle, '[DEMO] ' || r.year || ' ' || r.make || ' ' || r.model || ' ' || r.derivative,
            '[DEMO] This is demonstration data for a development environment. It does not describe a real vehicle for sale.',
            r.price, r.town, 'published', now(), now(), now() - (i || ' days')::interval, now() + interval '90 days')
    returning id into v_listing;
    -- every third demo vehicle becomes a completed demo sale (sold-price evidence)
    if i % 3 = 0 then
      update public.vehicles set vehicle_status = 'completed' where id = v_vehicle;
      update public.listings set listing_status = 'sold' where id = v_listing;
      insert into public.transactions (vehicle_id, listing_id, seller_id, agreed_price, sale_status, seller_confirmed_at, staff_confirmed_at, completed_at, fee_amount, notes)
      values (v_vehicle, v_listing, v_seller, r.price - 400, 'completed', now(), now(), now() - (i || ' days')::interval, public.calculate_sale_fee(r.price - 400), '[DEMO]');
    end if;
  end loop;
  raise notice 'Loaded % [DEMO] vehicles', i;
end $$;
