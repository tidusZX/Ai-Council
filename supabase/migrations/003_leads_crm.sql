-- Migration 003: Leads & CRM
-- Tables for the lead intelligence pipeline and existing clients.
-- Additive only.

-- ---------------------------------------------------------------------------
-- clients: businesses that have already engaged Shaq
-- ---------------------------------------------------------------------------
create table if not exists public.clients (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users(id) on delete cascade,
  name           text not null,
  business_type  text,
  location       text,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists clients_owner_id_idx on public.clients(owner_id);
create index if not exists clients_name_idx on public.clients(name);

-- ---------------------------------------------------------------------------
-- leads: prospective customers discovered via lead intelligence
-- diagnosis stored as jsonb so the analyzer can evolve its shape
-- (branding score, visual quality notes, positioning gaps, etc.)
-- ---------------------------------------------------------------------------
create table if not exists public.leads (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null references auth.users(id) on delete cascade,
  business_name      text not null,
  ig_handle          text,
  website            text,
  location           text,
  opportunity_score  numeric(4,2) check (opportunity_score is null or (opportunity_score >= 0 and opportunity_score <= 100)),
  status             text not null default 'new' check (status in ('new','qualified','contacted','responded','won','lost','archived')),
  diagnosis          jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists leads_owner_id_idx on public.leads(owner_id);
create index if not exists leads_status_idx on public.leads(status);
create index if not exists leads_opportunity_score_idx on public.leads(opportunity_score desc);

-- ---------------------------------------------------------------------------
-- outreach_logs: every outbound touchpoint to a lead
-- ---------------------------------------------------------------------------
create table if not exists public.outreach_logs (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references public.leads(id) on delete cascade,
  channel       text not null check (channel in ('email','instagram_dm','whatsapp','sms','call','linkedin','other')),
  message_body  text not null,
  sent_at       timestamptz not null default now(),
  response_at   timestamptz,
  outcome       text check (outcome is null or outcome in ('no_response','positive','negative','meeting_booked','closed')),
  created_at    timestamptz not null default now()
);

create index if not exists outreach_logs_lead_id_idx on public.outreach_logs(lead_id);
create index if not exists outreach_logs_sent_at_idx on public.outreach_logs(sent_at desc);

-- ---------------------------------------------------------------------------
-- updated_at triggers (reuses public.handle_updated_at from migration 001)
-- ---------------------------------------------------------------------------
create trigger clients_updated_at
  before update on public.clients
  for each row execute procedure public.handle_updated_at();

create trigger leads_updated_at
  before update on public.leads
  for each row execute procedure public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.clients       enable row level security;
alter table public.leads         enable row level security;
alter table public.outreach_logs enable row level security;

-- clients: scoped by owner_id
create policy "clients_select" on public.clients
  for select using (auth.uid() = owner_id);
create policy "clients_insert" on public.clients
  for insert with check (auth.uid() = owner_id);
create policy "clients_update" on public.clients
  for update using (auth.uid() = owner_id);
create policy "clients_delete" on public.clients
  for delete using (auth.uid() = owner_id);

-- leads: scoped by owner_id
create policy "leads_select" on public.leads
  for select using (auth.uid() = owner_id);
create policy "leads_insert" on public.leads
  for insert with check (auth.uid() = owner_id);
create policy "leads_update" on public.leads
  for update using (auth.uid() = owner_id);
create policy "leads_delete" on public.leads
  for delete using (auth.uid() = owner_id);

-- outreach_logs: scoped via parent lead's owner_id
create policy "outreach_logs_select" on public.outreach_logs
  for select using (
    exists (
      select 1 from public.leads
      where leads.id = outreach_logs.lead_id
        and leads.owner_id = auth.uid()
    )
  );
create policy "outreach_logs_insert" on public.outreach_logs
  for insert with check (
    exists (
      select 1 from public.leads
      where leads.id = outreach_logs.lead_id
        and leads.owner_id = auth.uid()
    )
  );
create policy "outreach_logs_update" on public.outreach_logs
  for update using (
    exists (
      select 1 from public.leads
      where leads.id = outreach_logs.lead_id
        and leads.owner_id = auth.uid()
    )
  );
create policy "outreach_logs_delete" on public.outreach_logs
  for delete using (
    exists (
      select 1 from public.leads
      where leads.id = outreach_logs.lead_id
        and leads.owner_id = auth.uid()
    )
  );
