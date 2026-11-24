-- Removes [DEMO] data loaded by demo.sql (local/demo environments only).
set session_replication_role = replica; -- bypass guard triggers for this maintenance task
delete from public.transactions where notes = '[DEMO]';
delete from public.listings where title like '[DEMO]%';
delete from public.vehicles where description like '[DEMO]%';
delete from public.sellers where profile_id = '00000000-0000-4000-8000-00000000d3a0';
delete from auth.users where id = '00000000-0000-4000-8000-00000000d3a0';
set session_replication_role = default;
