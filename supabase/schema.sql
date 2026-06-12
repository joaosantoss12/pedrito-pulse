-- =====================================================================
-- PEDRITO SENDPULSE — database schema
-- Run this in the Supabase SQL editor (or via the CLI) on a fresh project.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Admin profiles
-- A row here = this auth user is an admin (operator).
-- Anonymous visitors never get a row, so is_admin() returns false for them.
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  email       text,
  created_at  timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid());
$$;

-- ---------------------------------------------------------------------
-- Flows (visual flow definitions)
-- definition holds the React Flow graph: { nodes: [...], edges: [...] }
-- ---------------------------------------------------------------------
create table if not exists public.flows (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  definition  jsonb not null default '{"nodes":[],"edges":[]}'::jsonb,
  published   boolean not null default false,
  color       text,
  created_by  uuid references auth.users on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Add color to pre-existing installs.
alter table public.flows add column if not exists color text;

-- ---------------------------------------------------------------------
-- Shareable links to a flow
-- ---------------------------------------------------------------------
create table if not exists public.flow_links (
  id          uuid primary key default gen_random_uuid(),
  flow_id     uuid not null references public.flows on delete cascade,
  slug        text not null unique,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Conversations (one per visitor session entering a link)
-- user_id is the anonymous auth user created via signInAnonymously().
-- ---------------------------------------------------------------------
create table if not exists public.conversations (
  id              uuid primary key default gen_random_uuid(),
  flow_id         uuid references public.flows on delete set null,
  link_id         uuid references public.flow_links on delete set null,
  user_id         uuid not null references auth.users on delete cascade,
  visitor_name    text,
  status          text not null default 'active',     -- active | completed
  current_node_id text,
  variables       jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create index if not exists conversations_user_idx on public.conversations(user_id);
create index if not exists conversations_last_msg_idx on public.conversations(last_message_at desc);
-- One conversation per (link, visitor) — hard guarantee against duplicates.
create unique index if not exists conversations_link_user_uniq
  on public.conversations(link_id, user_id) where link_id is not null;

-- ---------------------------------------------------------------------
-- Messages
-- sender: bot | user | admin     type: text | image | video
-- ---------------------------------------------------------------------
create table if not exists public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations on delete cascade,
  sender           text not null,
  type             text not null default 'text',
  content          text,
  media_url        text,
  button_label     text,
  button_url       text,
  node_id          text,
  created_at       timestamptz not null default now()
);

alter table public.messages add column if not exists button_label text;
alter table public.messages add column if not exists button_url text;

create index if not exists messages_conversation_idx on public.messages(conversation_id, created_at);

-- Keep conversations.last_message_at fresh so the admin inbox can sort.
create or replace function public.touch_conversation()
returns trigger
language plpgsql
as $$
begin
  update public.conversations
     set last_message_at = now()
   where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation();

-- ---------------------------------------------------------------------
-- Web Push subscriptions (one per visitor browser, tied to a conversation)
-- ---------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations on delete cascade,
  user_id         uuid not null references auth.users on delete cascade,
  endpoint        text not null unique,
  subscription    jsonb not null,
  created_at      timestamptz not null default now()
);

create index if not exists push_subs_conversation_idx
  on public.push_subscriptions(conversation_id);

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.profiles      enable row level security;
alter table public.flows         enable row level security;
alter table public.flow_links    enable row level security;
alter table public.conversations enable row level security;
alter table public.messages      enable row level security;
alter table public.push_subscriptions enable row level security;

-- push_subscriptions: a visitor manages their own; admins can read all.
drop policy if exists push_subs_select on public.push_subscriptions;
create policy push_subs_select on public.push_subscriptions
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists push_subs_insert on public.push_subscriptions;
create policy push_subs_insert on public.push_subscriptions
  for insert with check (user_id = auth.uid());

drop policy if exists push_subs_update on public.push_subscriptions;
create policy push_subs_update on public.push_subscriptions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- profiles: a user can read their own profile; admins can read all.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (id = auth.uid() or public.is_admin());

-- A non-anonymous (email) user can self-register as an admin operator.
-- Anonymous visitors are blocked, so they can never self-promote.
-- NOTE: for a real product, gate this further (invite-only / allowlist).
drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
  for insert with check (
    id = auth.uid()
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );

-- flows: admins manage everything; anyone signed in can read PUBLISHED flows
-- (visitors need this to run the flow).
drop policy if exists flows_admin_all on public.flows;
create policy flows_admin_all on public.flows
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists flows_read_published on public.flows;
create policy flows_read_published on public.flows
  for select using (published or public.is_admin());

-- flow_links: admins manage; anyone signed in can read ACTIVE links.
drop policy if exists flow_links_admin_all on public.flow_links;
create policy flow_links_admin_all on public.flow_links
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists flow_links_read_active on public.flow_links;
create policy flow_links_read_active on public.flow_links
  for select using (active or public.is_admin());

-- conversations: a visitor sees/edits only their own; admins see/edit all.
drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists conversations_insert on public.conversations;
create policy conversations_insert on public.conversations
  for insert with check (user_id = auth.uid());

drop policy if exists conversations_update on public.conversations;
create policy conversations_update on public.conversations
  for update using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- messages: readable/insertable by the owning visitor or any admin.
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id and c.user_id = auth.uid()
    )
  );

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert with check (
    public.is_admin()
    or exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id and c.user_id = auth.uid()
    )
  );

-- Only admins can delete messages from a thread.
drop policy if exists messages_delete on public.messages;
create policy messages_delete on public.messages
  for delete using (public.is_admin());

-- Full row in realtime DELETE payloads so the filter (conversation_id) works.
alter table public.messages replica identity full;

-- =====================================================================
-- Realtime: publish the tables the apps subscribe to.
-- =====================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversations'
  ) then
    alter publication supabase_realtime add table public.conversations;
  end if;
end $$;

-- =====================================================================
-- Storage bucket for chat images/videos (public read).
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('chat-media', 'chat-media', true)
on conflict (id) do nothing;

drop policy if exists chat_media_read on storage.objects;
create policy chat_media_read on storage.objects
  for select using (bucket_id = 'chat-media');

drop policy if exists chat_media_write on storage.objects;
create policy chat_media_write on storage.objects
  for insert to authenticated with check (bucket_id = 'chat-media');
