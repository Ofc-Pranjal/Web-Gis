-- House tax module for the Urban GIS Portal
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> Run.
--
-- house_uid is "<localityId>-<houseNo>", derived in js/app.js by splitting each
-- allahabad_parcels_2009 MultiPoint into individual house points.
--
-- NOTE: this backs a DEMONSTRATION payment flow. No money moves; rows in
-- house_tax_payment are records of simulated payments only.

-- ---------------------------------------------------------------------------
-- Owner / assessment register. A house with no row here is "unassessed" and
-- the portal shows a provisional assessment until someone registers it.
-- ---------------------------------------------------------------------------
create table if not exists public.house_tax_register (
  house_uid       text primary key,
  locality_id     integer,
  locality_name   text,
  owner_name      text,
  property_type   text check (property_type in ('Residential', 'Commercial', 'Mixed Use')),
  built_up_area   numeric(10,2) check (built_up_area > 0),
  assessment_year integer not null,
  registered_by   uuid references auth.users(id) default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Payment ledger. Balance for a house = demand - sum(amount) for the year.
-- ---------------------------------------------------------------------------
create table if not exists public.house_tax_payment (
  id              bigserial primary key,
  house_uid       text not null,
  assessment_year integer not null,
  receipt_no      text not null unique,
  amount          numeric(12,2) not null check (amount > 0),
  method          text,
  is_demo         boolean not null default true,
  paid_by         uuid references auth.users(id) default auth.uid(),
  paid_at         timestamptz not null default now()
);

create index if not exists house_tax_payment_house_idx
  on public.house_tax_payment (house_uid, assessment_year);

-- ---------------------------------------------------------------------------
-- Row level security: signed-in users only.
-- ---------------------------------------------------------------------------
alter table public.house_tax_register enable row level security;
alter table public.house_tax_payment  enable row level security;

drop policy if exists "register readable by authenticated" on public.house_tax_register;
create policy "register readable by authenticated"
  on public.house_tax_register for select to authenticated using (true);

drop policy if exists "register writable by authenticated" on public.house_tax_register;
create policy "register writable by authenticated"
  on public.house_tax_register for insert to authenticated with check (true);

drop policy if exists "register updatable by authenticated" on public.house_tax_register;
create policy "register updatable by authenticated"
  on public.house_tax_register for update to authenticated using (true) with check (true);

drop policy if exists "payments readable by authenticated" on public.house_tax_payment;
create policy "payments readable by authenticated"
  on public.house_tax_payment for select to authenticated using (true);

-- A user may only record a payment under their own id, and never backdate it.
drop policy if exists "payments insertable by payer" on public.house_tax_payment;
create policy "payments insertable by payer"
  on public.house_tax_payment for insert to authenticated
  with check (paid_by = auth.uid());

-- Payments are an audit trail: no updates, no deletes (no policy granted).
