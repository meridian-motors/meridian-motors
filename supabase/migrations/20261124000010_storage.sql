-- =============================================================================
-- MERIDIAN MOTORS — 0010 STORAGE BUCKETS & POLICIES
-- vehicle-images     : public read (unguessable paths), owner/staff write
-- vehicle-documents  : PRIVATE. Owner (owner_and_staff docs) + staff only,
--                      served to clients via short-lived signed URLs.
-- import-files       : PRIVATE. Admin only.
-- Object path convention: <vehicle_id>/<uuid>.<ext>
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('vehicle-images', 'vehicle-images', true, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('vehicle-documents', 'vehicle-documents', false, 15728640, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
  ('import-files', 'import-files', false, 20971520, array['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/octet-stream'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.storage_vehicle_id(p_name text)
returns uuid language plpgsql immutable as $$
begin
  return (split_part(p_name, '/', 1))::uuid;
exception when others then
  return null;
end $$;

-- Images
create policy "vehicle images are publicly readable" on storage.objects for select
  using (bucket_id = 'vehicle-images');
create policy "owners and staff upload vehicle images" on storage.objects for insert to authenticated
  with check (bucket_id = 'vehicle-images' and public.can_manage_vehicle(public.storage_vehicle_id(name)));
create policy "owners and staff update vehicle images" on storage.objects for update to authenticated
  using (bucket_id = 'vehicle-images' and public.can_manage_vehicle(public.storage_vehicle_id(name)));
create policy "owners and staff delete vehicle images" on storage.objects for delete to authenticated
  using (bucket_id = 'vehicle-images' and public.can_manage_vehicle(public.storage_vehicle_id(name)));

-- Documents (private)
create policy "owners and staff read vehicle documents" on storage.objects for select to authenticated
  using (bucket_id = 'vehicle-documents' and (
    public.is_staff() or exists (
      select 1 from public.vehicle_documents d
      where d.storage_path = name and d.access_level = 'owner_and_staff' and public.is_vehicle_owner(d.vehicle_id))));
create policy "owners and staff upload vehicle documents" on storage.objects for insert to authenticated
  with check (bucket_id = 'vehicle-documents' and public.can_manage_vehicle(public.storage_vehicle_id(name)));
create policy "admins delete vehicle documents" on storage.objects for delete to authenticated
  using (bucket_id = 'vehicle-documents' and (public.is_admin() or (owner = auth.uid() and public.is_vehicle_owner(public.storage_vehicle_id(name)))));

-- Import files (admin only)
create policy "admins manage import files" on storage.objects for all to authenticated
  using (bucket_id = 'import-files' and public.is_admin())
  with check (bucket_id = 'import-files' and public.is_admin());
