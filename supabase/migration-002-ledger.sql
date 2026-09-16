-- Migration 002 — Cash & Bank ledger
--
-- Run this in the Supabase SQL Editor if you already ran the original
-- schema.sql before this feature existed. Safe to run once; re-running it
-- a second time may complain that the policy already exists, which is
-- harmless (everything else uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

alter table expenses add column if not exists paid_from text not null default 'Cash'
  check (paid_from in ('Cash', 'Mobile Money', 'Bank'));

create table if not exists ledger_entries (
  id uuid primary key default gen_random_uuid(),
  ledger text not null check (ledger in ('Cash', 'Mobile Money', 'Bank')),
  date timestamptz not null default now(),
  description text default '',
  type text not null check (type in ('Sale', 'Purchase', 'Expense', 'Deposit', 'Withdrawal', 'Opening Balance', 'Adjustment')),
  amount_in numeric not null default 0,
  amount_out numeric not null default 0,
  related_transfer_id uuid,
  created_at timestamptz not null default now()
);

alter table ledger_entries enable row level security;

create policy "logged in full access ledger_entries" on ledger_entries
  for all using (auth.role() = 'authenticated');

alter publication supabase_realtime add table ledger_entries;
