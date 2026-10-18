-- Nova accounts: run this once in Supabase > SQL Editor > New query > Run.
-- It creates two private tables. Each person can only ever see and change their own rows.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar text,
  updated_at timestamptz default now()
);

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  code text not null,
  role text default 'participant',
  started_at timestamptz default now(),
  duration_s integer default 0,
  max_people integer default 1
);
create index if not exists meetings_user_started on public.meetings (user_id, started_at desc);

alter table public.profiles enable row level security;
alter table public.meetings enable row level security;

drop policy if exists "profiles: read own" on public.profiles;
drop policy if exists "profiles: insert own" on public.profiles;
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: read own"   on public.profiles for select using (auth.uid() = id);
create policy "profiles: insert own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles: update own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "meetings: read own" on public.meetings;
drop policy if exists "meetings: insert own" on public.meetings;
drop policy if exists "meetings: update own" on public.meetings;
drop policy if exists "meetings: delete own" on public.meetings;
create policy "meetings: read own"   on public.meetings for select using (auth.uid() = user_id);
create policy "meetings: insert own" on public.meetings for insert with check (auth.uid() = user_id);
create policy "meetings: update own" on public.meetings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "meetings: delete own" on public.meetings for delete using (auth.uid() = user_id);
