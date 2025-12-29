-- Supabase reset for AWI
-- Wipes all AWI-related tables, functions, and types.
-- USE WITH CAUTION: THIS DELETES ALL DATA.

-- =============================================================================
-- 1. DROP TABLES (Dependencies first)
-- =============================================================================

drop table if exists public.device_tokens cascade;
drop table if exists public.notifications cascade;
drop table if exists public.meetings cascade;
drop table if exists public.zoom_tokens cascade;
drop table if exists public.google_tokens cascade;
drop table if exists public.user_profiles cascade;
drop table if exists public.awi_named_configs cascade;
drop table if exists public.awi_configs cascade;

-- =============================================================================
-- 2. DROP FUNCTIONS & TRIGGERS
-- =============================================================================

-- Triggers are dropped automatically when tables are dropped, but functions remain.

drop function if exists public.set_updated_at() cascade;
drop function if exists public.exec_sql(text) cascade;

-- =============================================================================
-- 3. DROP EXTENSIONS (Optional - usually better to keep them)
-- =============================================================================
-- drop extension if exists "uuid-ossp";
-- drop extension if exists "pgcrypto";
