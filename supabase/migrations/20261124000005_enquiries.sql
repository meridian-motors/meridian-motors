-- =============================================================================
-- MERIDIAN MOTORS — 0005 ENQUIRIES, CONVERSATIONS, CRM ACTIVITY
-- =============================================================================

create type public.enquiry_type as enum ('general', 'viewing_request', 'price_question', 'history_question', 'finance_question', 'part_exchange', 'offer', 'other');
create type public.enquiry_status as enum ('new', 'assigned', 'in_progress', 'awaiting_buyer', 'awaiting_seller', 'viewing_arranged', 'offer_made', 'closed_won', 'closed_lost', 'spam');
create type public.enquiry_priority as enum ('low', 'normal', 'high');
create type public.message_type as enum ('text', 'system');
create type public.activity_type as enum ('call_note', 'email_note', 'follow_up', 'reminder', 'status_change', 'assignment', 'ai_analysis');

create table public.enquiries (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete restrict,
  vehicle_id uuid not null references public.vehicles (id) on delete restrict,
  buyer_id uuid references public.buyers (id) on delete set null,
  seller_id uuid references public.sellers (id) on delete set null,
  enquiry_type public.enquiry_type not null default 'general',
  message text not null check (char_length(message) between 10 and 3000),
  offer_amount integer check (offer_amount is null or offer_amount between 100 and 5000000),
  buyer_display_name text check (char_length(buyer_display_name) <= 80), -- first name only, shown to seller
  enquiry_status public.enquiry_status not null default 'new',
  priority public.enquiry_priority not null default 'normal',
  assigned_to uuid references public.profiles (id),
  follow_up_at timestamptz,
  ai_category text,
  ai_summary text,            -- staff only (exposed via staff views)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index enquiries_listing_idx on public.enquiries (listing_id, created_at desc);
create index enquiries_seller_idx on public.enquiries (seller_id, created_at desc);
create index enquiries_buyer_idx on public.enquiries (buyer_id, created_at desc);
create index enquiries_status_idx on public.enquiries (enquiry_status, created_at desc);
create index enquiries_assigned_idx on public.enquiries (assigned_to) where assigned_to is not null;
create trigger enquiries_updated_at before update on public.enquiries
  for each row execute function public.set_updated_at();

-- Buyer contact details are PRIVATE: only the buyer and Meridian staff can read them.
create table public.enquiry_contacts (
  enquiry_id uuid primary key references public.enquiries (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 120),
  email citext not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text check (phone is null or phone ~ '^[0-9+() -]{7,20}$'),
  created_at timestamptz not null default now()
);

create or replace function public.can_access_enquiry(p_enquiry uuid)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select public.is_staff() or exists (
    select 1 from public.enquiries e
    where e.id = p_enquiry
      and ((e.buyer_id is not null and e.buyer_id = public.current_buyer_id())
        or (e.seller_id is not null and e.seller_id = public.current_seller_id()))
  );
$$;

-- Sellers may only update the status of their own enquiries within a safe set;
-- assignment, priority and AI fields are staff-only.
create or replace function public.guard_enquiry_update()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if public.is_service_role() or public.is_staff() then return new; end if;
  if new.listing_id is distinct from old.listing_id or new.vehicle_id is distinct from old.vehicle_id
     or new.buyer_id is distinct from old.buyer_id or new.seller_id is distinct from old.seller_id
     or new.message is distinct from old.message or new.assigned_to is distinct from old.assigned_to
     or new.priority is distinct from old.priority or new.ai_category is distinct from old.ai_category
     or new.ai_summary is distinct from old.ai_summary or new.offer_amount is distinct from old.offer_amount then
    raise exception 'Not permitted to change these enquiry fields' using errcode = '42501';
  end if;
  if new.enquiry_status is distinct from old.enquiry_status
     and new.enquiry_status not in ('in_progress', 'awaiting_buyer', 'closed_lost', 'spam') then
    raise exception 'Not permitted to set this enquiry status' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger enquiries_guard_update before update on public.enquiries
  for each row execute function public.guard_enquiry_update();

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null unique references public.enquiries (id) on delete cascade,
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid references public.profiles (id) on delete set null,
  sender_role text not null check (sender_role in ('buyer', 'seller', 'staff', 'system')),
  message text not null check (char_length(message) between 1 and 3000),
  message_type public.message_type not null default 'text',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);

create or replace function public.prepare_message()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare v_enquiry public.enquiries;
begin
  select e.* into v_enquiry from public.enquiries e join public.conversations c on c.enquiry_id = e.id
   where c.id = new.conversation_id;
  if public.is_service_role() or coalesce(current_setting('meridian.system_insert', true), 'off') = 'on' then
    return new;
  end if;
  new.sender_id := auth.uid();
  new.message_type := 'text';
  new.read_at := null;
  if public.is_staff() then
    new.sender_role := 'staff';
  elsif v_enquiry.seller_id = public.current_seller_id() then
    new.sender_role := 'seller';
  elsif v_enquiry.buyer_id = public.current_buyer_id() then
    new.sender_role := 'buyer';
  else
    raise exception 'Not a participant in this conversation' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger messages_prepare before insert on public.messages
  for each row execute function public.prepare_message();

create or replace function public.touch_conversation()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end $$;
create trigger messages_touch_conversation after insert on public.messages
  for each row execute function public.touch_conversation();

-- Participants can only flag messages as read; content is immutable.
create or replace function public.guard_message_update()
returns trigger language plpgsql as $$
begin
  if public.is_service_role() then return new; end if;
  if new.message is distinct from old.message or new.sender_id is distinct from old.sender_id
     or new.sender_role is distinct from old.sender_role or new.conversation_id is distinct from old.conversation_id then
    raise exception 'Messages cannot be edited' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger messages_guard_update before update on public.messages
  for each row execute function public.guard_message_update();

-- Staff CRM activity: call notes, follow-ups, reminders. Never visible to customers.
create table public.enquiry_activities (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references public.enquiries (id) on delete cascade,
  activity_type public.activity_type not null,
  note text check (char_length(note) <= 4000),
  metadata jsonb not null default '{}',
  due_at timestamptz,
  completed_at timestamptz,
  author_id uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index enquiry_activities_enquiry_idx on public.enquiry_activities (enquiry_id, created_at desc);
create index enquiry_activities_due_idx on public.enquiry_activities (due_at) where completed_at is null and due_at is not null;

-- Viewing appointments
create table public.viewings (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references public.enquiries (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  scheduled_for timestamptz not null,
  location_note text check (char_length(location_note) <= 500),
  viewing_status text not null default 'proposed' check (viewing_status in ('proposed', 'confirmed', 'completed', 'cancelled', 'no_show')),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index viewings_vehicle_idx on public.viewings (vehicle_id, scheduled_for);
create trigger viewings_updated_at before update on public.viewings
  for each row execute function public.set_updated_at();
