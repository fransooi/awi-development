-- Supabase setup for AWI
-- Full Database Schema: Tables, Indexes, RLS Policies, Triggers, and RPCs.
-- Run this in Supabase SQL Editor to initialize the entire backend.

-- =============================================================================
-- 1. EXTENSIONS
-- =============================================================================
create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

-- Ensure authenticated role can use public schema
grant usage on schema public to authenticated;

-- =============================================================================
-- 2. TABLES
-- =============================================================================

-- 2.1. Core Configuration Tables
create table if not exists public.awi_configs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  main_config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.awi_named_configs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  config_type text not null,
  config_name text not null,
  config_data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint awi_named_configs_user_type_name_uniq unique (user_id, config_type, config_name)
);

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  username text,
  full_name text,
  country text,
  language text,
  updated_at timestamptz not null default now()
);

-- 2.2. OAuth & Integrations Tables
create table if not exists public.google_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_token text not null,
  refresh_token text,
  expires_at bigint, -- Epoch milliseconds
  scope text,
  token_type text default 'bearer',
  updated_at timestamptz default now()
);

create table if not exists public.zoom_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  zoom_user_id text,
  access_token text,
  refresh_token text,
  expires_at bigint, -- Epoch milliseconds
  scope text,
  account_id text,
  token_type text default 'bearer',
  updated_at timestamptz default now()
);

-- 2.3. Operational Tables (Meetings, Notifications, Devices)
create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  location text,
  meeting_code text,
  meeting_link text,
  start_time timestamptz,
  end_time timestamptz,
  should_record boolean default false,
  recording_id text,
  source text default 'manual',
  attendees jsonb default '[]'::jsonb,
  additional_data jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade, -- null = broadcast
  type text default 'general',
  title text,
  message text,
  data jsonb default '{}'::jsonb,
  read boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  platform text default 'unknown',
  push_provider text default 'expo',
  push_token text not null,
  active boolean default true,
  last_seen_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint device_tokens_uniq unique (user_id, device_id, push_provider)
);

-- =============================================================================
-- 3. INDEXES
-- =============================================================================
create index if not exists idx_awnc_user on public.awi_named_configs (user_id);
create index if not exists idx_awnc_type_name on public.awi_named_configs (config_type, config_name);
create index if not exists idx_meetings_user on public.meetings (user_id);
create index if not exists idx_notifications_user on public.notifications (user_id);
create index if not exists idx_device_tokens_user on public.device_tokens (user_id);

-- =============================================================================
-- 4. ROW LEVEL SECURITY (RLS)
-- =============================================================================

-- Enable RLS on all tables
alter table public.awi_configs enable row level security;
alter table public.awi_named_configs enable row level security;
alter table public.user_profiles enable row level security;
alter table public.google_tokens enable row level security;
alter table public.zoom_tokens enable row level security;
alter table public.meetings enable row level security;
alter table public.notifications enable row level security;
alter table public.device_tokens enable row level security;

-- Grants
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to service_role;

-- --- Policy Template Function ---
-- Since most policies are "users can only access their own data", we create these repetitively.

-- 4.1. awi_configs
create policy awi_configs_all_own on public.awi_configs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 4.2. awi_named_configs
create policy awi_named_configs_all_own on public.awi_named_configs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 4.3. user_profiles
create policy user_profiles_all_own on public.user_profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- 4.4. google_tokens
create policy google_tokens_all_own on public.google_tokens
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 4.5. zoom_tokens
create policy zoom_tokens_all_own on public.zoom_tokens
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 4.6. meetings
create policy meetings_all_own on public.meetings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 4.7. notifications
-- Users can see their own notifications.
create policy notifications_select_own on public.notifications
  for select using (auth.uid() = user_id or user_id is null);
-- Users generally don't insert/update notifications (system does), but if needed:
create policy notifications_mod_own on public.notifications
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 4.8. device_tokens
create policy device_tokens_all_own on public.device_tokens
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =============================================================================
-- 5. TRIGGERS (updated_at)
-- =============================================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end
$$;

create trigger trg_awi_configs_updated before update on public.awi_configs
  for each row execute procedure public.set_updated_at();

create trigger trg_awi_named_configs_updated before update on public.awi_named_configs
  for each row execute procedure public.set_updated_at();

create trigger trg_user_profiles_updated before update on public.user_profiles
  for each row execute procedure public.set_updated_at();

create trigger trg_google_tokens_updated before update on public.google_tokens
  for each row execute procedure public.set_updated_at();

create trigger trg_zoom_tokens_updated before update on public.zoom_tokens
  for each row execute procedure public.set_updated_at();

create trigger trg_meetings_updated before update on public.meetings
  for each row execute procedure public.set_updated_at();

create trigger trg_device_tokens_updated before update on public.device_tokens
  for each row execute procedure public.set_updated_at();

-- =============================================================================
-- 6. RPCs
-- =============================================================================

-- 'exec_sql' allows the Node.js server (with service_role key) to execute arbitrary SQL.
-- This is used for maintenance or bootstrapping dynamic schemas.
create or replace function exec_sql(query text) returns void as $$
begin
  if current_setting('request.jwt.claims', true)::json->>'role' != 'service_role' then
    raise exception 'exec_sql can only be called with service_role key';
  end if;
  execute query;
end;
$$ language plpgsql security definer;
