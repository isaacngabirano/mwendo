-- Mwendo POS — Supabase schema
--
-- HOW TO USE THIS FILE:
-- 1. Create a free project at https://supabase.com
-- 2. Open your project's "SQL Editor" tab
-- 3. Paste this entire file in and click "Run"
-- That's it — no local Postgres install needed, this all runs on Supabase's
-- servers. You never have to write SQL day-to-day after this; the app talks
-- to these tables for you.

-- ============================================================
-- 1. PROFILES — extends Supabase's built-in auth.users with a
--    name + role. Supabase Auth handles emails/passwords for you;
--    this table just adds the shop-specific info.
-- ============================================================
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null default 'Cashier' check (role in ('Owner', 'Cashier')),
  created_at timestamptz not null default now()
);

-- Automatically create a profile row whenever someone signs up.
-- The very FIRST person who signs up should be manually promoted to
-- 'Owner' — see the note at the bottom of this file.
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', new.email), 'Cashier');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ============================================================
-- 2. CORE SHOP TABLES
-- ============================================================
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text default '',
  products_supplied text default '',
  contact text default '',
  location text default '',
  notes text default '',
  created_at timestamptz not null default now()
);

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'Walk-in' check (type in ('Walk-in', 'Credit')),
  contact text default '',
  credit_balance numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  sku text not null,
  name text not null,
  category text default '',
  supplier_id uuid references suppliers(id) on delete set null,
  base_unit text not null default 'kg',
  sell_units jsonb not null default '[]'::jsonb, -- [{id,label,factor,price}]
  cost_price numeric not null default 0,
  stock_qty numeric not null default 0,
  reorder_threshold numeric not null default 10,
  status text not null default 'Active' check (status in ('Active', 'Inactive')),
  image_color text default '#0f1b3d',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sales (
  id uuid primary key default gen_random_uuid(),
  date timestamptz not null default now(),
  items jsonb not null, -- [{productId,productName,sellUnitLabel,quantity,unitPrice,lineTotal}]
  payment_method text not null,
  customer_id uuid references customers(id) on delete set null,
  customer_name text default '',
  cashier_id uuid references profiles(id) on delete set null,
  cashier_name text default '',
  total_amount numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists purchases (
  id uuid primary key default gen_random_uuid(),
  date timestamptz not null default now(),
  supplier_id uuid references suppliers(id) on delete set null,
  supplier_name text default '',
  items jsonb not null, -- [{productId,productName,quantity,unitCost,lineTotal}]
  payment_method text not null,
  total_amount numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  date timestamptz not null default now(),
  description text not null,
  category text default '',
  amount numeric not null default 0,
  paid_from text not null default 'Cash' check (paid_from in ('Cash', 'Mobile Money', 'Bank')),
  created_at timestamptz not null default now()
);

-- ============================================================
-- 2b. CASH & BANK LEDGER — mirrors the client's Cashbook/Bankbook sheets.
-- Sales, purchases, and expenses post here automatically; deposits,
-- withdrawals, and transfers between accounts are added manually from the
-- Cash & Bank page. Running balance is computed by the app (sum of
-- amount_in - amount_out), not stored, so it's always consistent even
-- across multiple devices writing at once.
-- ============================================================
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

-- ============================================================
-- 3. ATOMIC STOCK FUNCTIONS
--
-- Why these matter: if two phones sell the last bag of sugar at almost the
-- same moment, we do NOT want "last write wins" (that's what a shared CSV
-- would do, and it's how sales silently disappear). Postgres can update a
-- row atomically — "subtract 2 from stock_qty" is safe even if a hundred
-- devices do it at the exact same millisecond, because the database
-- serializes the updates for us. The app calls these functions (via
-- supabase.rpc(...)) instead of writing stock_qty directly.
--
-- Each function is idempotent on the record's own id: if the same sale/
-- purchase is submitted twice (e.g. a phone retries after losing signal
-- mid-request), the second attempt is a no-op instead of double-counting
-- stock.
-- ============================================================

create or replace function record_sale(
  p_id uuid,
  p_date timestamptz,
  p_items jsonb,
  p_payment_method text,
  p_customer_id uuid,
  p_customer_name text,
  p_cashier_id uuid,
  p_cashier_name text,
  p_total numeric
) returns void as $$
declare
  item jsonb;
  inserted_count int;
begin
  insert into sales (id, date, items, payment_method, customer_id, customer_name, cashier_id, cashier_name, total_amount)
  values (p_id, p_date, p_items, p_payment_method, p_customer_id, p_customer_name, p_cashier_id, p_cashier_name, p_total)
  on conflict (id) do nothing;

  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then
    return; -- already recorded earlier — don't double-deduct stock
  end if;

  for item in select * from jsonb_array_elements(p_items) loop
    update products
    set stock_qty = greatest(0, stock_qty - (item->>'quantity')::numeric * coalesce((item->>'factor')::numeric, 1)),
        updated_at = now()
    where id = (item->>'productId')::uuid;
  end loop;

  if p_payment_method = 'Credit' and p_customer_id is not null then
    update customers set credit_balance = credit_balance + p_total where id = p_customer_id;
  end if;
end;
$$ language plpgsql security definer;

create or replace function record_purchase(
  p_id uuid,
  p_date timestamptz,
  p_supplier_id uuid,
  p_supplier_name text,
  p_items jsonb,
  p_payment_method text,
  p_total numeric
) returns void as $$
declare
  item jsonb;
  inserted_count int;
begin
  insert into purchases (id, date, supplier_id, supplier_name, items, payment_method, total_amount)
  values (p_id, p_date, p_supplier_id, p_supplier_name, p_items, p_payment_method, p_total)
  on conflict (id) do nothing;

  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then
    return;
  end if;

  for item in select * from jsonb_array_elements(p_items) loop
    update products
    set stock_qty = stock_qty + (item->>'quantity')::numeric,
        updated_at = now()
    where id = (item->>'productId')::uuid;
  end loop;
end;
$$ language plpgsql security definer;

-- ============================================================
-- 4. REALTIME — tell Supabase to broadcast changes on these tables
--    so every open device sees updates within a second or two.
-- ============================================================
alter publication supabase_realtime add table products, categories, suppliers, customers, sales, purchases, expenses, profiles, ledger_entries;

-- ============================================================
-- 5. ROW LEVEL SECURITY
--
-- This is a small trusted family team, all logged-in staff can see and
-- edit all shop data. We still turn RLS on (Supabase requires it for the
-- API to work safely) with a simple "any logged-in user" policy.
-- ============================================================
alter table profiles enable row level security;
alter table categories enable row level security;
alter table suppliers enable row level security;
alter table customers enable row level security;
alter table products enable row level security;
alter table sales enable row level security;
alter table purchases enable row level security;
alter table expenses enable row level security;
alter table ledger_entries enable row level security;

create policy "logged in read profiles" on profiles for select using (auth.role() = 'authenticated');
create policy "logged in update own profile" on profiles for update using (auth.uid() = id);

create policy "logged in full access categories" on categories for all using (auth.role() = 'authenticated');
create policy "logged in full access suppliers" on suppliers for all using (auth.role() = 'authenticated');
create policy "logged in full access customers" on customers for all using (auth.role() = 'authenticated');
create policy "logged in full access products" on products for all using (auth.role() = 'authenticated');
create policy "logged in full access sales" on sales for all using (auth.role() = 'authenticated');
create policy "logged in full access purchases" on purchases for all using (auth.role() = 'authenticated');
create policy "logged in full access expenses" on expenses for all using (auth.role() = 'authenticated');
create policy "logged in full access ledger_entries" on ledger_entries for all using (auth.role() = 'authenticated');

-- ============================================================
-- IMPORTANT MANUAL STEP after running this file:
--
-- 1. Go to Authentication > Users in the Supabase dashboard and click
--    "Add user" to create your first login (e.g. the owner's email).
-- 2. Then in the SQL Editor, run this one line (replace the email):
--
--    update profiles set role = 'Owner' where id =
--      (select id from auth.users where email = 'owner@mwendofoods.ug');
--
-- Every user after that can be added the same way via "Add user" in the
-- dashboard — no code required. New users default to the 'Cashier' role;
-- promote any of them to 'Owner' with the same update statement above.
-- ============================================================
