-- StillRead Auth Migration
-- Run this in your Supabase SQL Editor AFTER the initial schema.sql

-- 1. Add user_id column linked to auth.users
alter table articles
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- 2. Drop the old "allow all" policy
drop policy if exists "Allow all access" on articles;

-- 3. Create user-scoped RLS policies
create policy "Users see own articles"
  on articles for select
  using (auth.uid() = user_id);

create policy "Users insert own articles"
  on articles for insert
  with check (auth.uid() = user_id);

create policy "Users update own articles"
  on articles for update
  using (auth.uid() = user_id);

create policy "Users delete own articles"
  on articles for delete
  using (auth.uid() = user_id);
