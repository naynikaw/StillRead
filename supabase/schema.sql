-- StillRead Supabase Schema
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- Articles table
create table if not exists articles (
  id uuid default gen_random_uuid() primary key,
  url text not null,
  title text not null default '',
  favicon text default '',
  scroll_position float default 0,
  completion_status text default 'unread' check (completion_status in ('unread', 'in-progress', 'completed')),
  last_updated_at timestamptz default now(),
  created_at timestamptz default now()
);

-- Enable Row Level Security but allow all access with anon key
-- (for a personal reading app, this is fine)
alter table articles enable row level security;

create policy "Allow all access" on articles
  for all
  using (true)
  with check (true);

-- Push subscriptions table
create table if not exists push_subscriptions (
  id uuid default gen_random_uuid() primary key,
  subscription jsonb not null,
  created_at timestamptz default now()
);

alter table push_subscriptions enable row level security;

create policy "Allow all access" on push_subscriptions
  for all
  using (true)
  with check (true);

-- Enable realtime for the articles table
alter publication supabase_realtime add table articles;
