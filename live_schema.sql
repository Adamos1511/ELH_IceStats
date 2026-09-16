-- Run once in the Supabase SQL Editor. Public access is SELECT only.
create table if not exists public.elh_matches (
  match_id text primary key check (match_id ~ '^[0-9]+$'),
  start_at timestamptz not null,
  state text not null default 'scheduled',
  payload jsonb not null,
  checked_at timestamptz not null default now(),
  final_seen_at timestamptz,
  final_complete boolean not null default false,
  archived boolean not null default false
);
create index if not exists elh_matches_start_idx on public.elh_matches(start_at);
alter table public.elh_matches enable row level security;
revoke all on public.elh_matches from anon, authenticated;
grant select on public.elh_matches to anon, authenticated;
grant all on public.elh_matches to service_role;
drop policy if exists elh_matches_read on public.elh_matches;
create policy elh_matches_read on public.elh_matches for select to anon, authenticated using (true);
-- Lease table has no public policies or permissions.
create table if not exists public.elh_match_leases (
  match_id text primary key, owner text not null, expires_at timestamptz not null
);
alter table public.elh_match_leases enable row level security;
revoke all on public.elh_match_leases from anon, authenticated;
grant all on public.elh_match_leases to service_role;
create or replace function public.elh_claim_match(p_id text,p_owner text) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare claimed text;
begin
  insert into public.elh_match_leases(match_id,owner,expires_at)
    values(p_id,p_owner,now()+interval '10 minutes')
  on conflict(match_id) do update set owner=excluded.owner, expires_at=excluded.expires_at
    where public.elh_match_leases.expires_at<now() or public.elh_match_leases.owner=p_owner
  returning match_id into claimed;
  return claimed is not null;
end; $$;
create or replace function public.elh_release_match(p_id text,p_owner text) returns void
language sql security invoker set search_path = '' as $$
  delete from public.elh_match_leases where match_id=p_id and owner=p_owner;
$$;
revoke all on function public.elh_claim_match(text,text) from public,anon,authenticated;
revoke all on function public.elh_release_match(text,text) from public,anon,authenticated;
grant execute on function public.elh_claim_match(text,text) to service_role;
grant execute on function public.elh_release_match(text,text) to service_role;
