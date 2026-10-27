-- MyChefNotes recipes. Run this once in the Supabase SQL editor.
-- The service role used by Vercel bypasses row level security.
-- The public anon key cannot read or change these rows.

create table if not exists public.recipes (
  slug text primary key,
  title text not null,
  time text not null default '',
  temp text not null default '',
  servings text not null default '',
  source text not null default '',
  ingredients jsonb not null default '[]'::jsonb,
  steps jsonb not null default '[]'::jsonb,
  notes text not null default '',
  markdown text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.recipes enable row level security;
