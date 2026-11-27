-- Schema del database "diritti-visita" (Supabase, eu-central-2 Zurigo).
-- Applicato il 27.11.2026 tramite due migrazioni:
--   1) schema_iniziale_diritti_visita
--   2) un_solo_account_e_permessi_link
-- Questo file serve come documentazione e per ricreare il database da zero.

-- ═══════════ 1) schema_iniziale_diritti_visita ═══════════
create table public.app_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  profile jsonb not null default '{}'::jsonb,
  children jsonb not null default '[]'::jsonb,
  birthdates jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.visits (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  child text not null check (char_length(child) between 1 and 60),
  day date not null,
  kind text not null check (kind in ('pern','sing')),
  updated_at timestamptz not null default now(),
  primary key (user_id, child, day)
);
create index visits_user_day_idx on public.visits (user_id, day);

create table public.visits_audit (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  child text not null,
  day date not null,
  old_kind text,
  new_kind text,
  changed_at timestamptz not null default now(),
  actor text not null
);
create index visits_audit_user_idx on public.visits_audit (user_id, changed_at desc);

create table public.share_links (
  token uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  label text check (label is null or char_length(label) <= 80),
  date_from date,
  date_to date,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  use_count integer not null default 0,
  check (expires_at <= created_at + interval '366 days'),
  check (date_from is null or date_to is null or date_from <= date_to)
);
create index share_links_user_idx on public.share_links (user_id);

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger visits_touch before update on public.visits
  for each row execute function public.touch_updated_at();
create trigger settings_touch before update on public.app_settings
  for each row execute function public.touch_updated_at();

create or replace function public.log_visit_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_actor text;
begin
  if auth.uid() is not null then
    v_actor := coalesce(auth.jwt() ->> 'email', auth.uid()::text) || ' (app)';
  else
    v_actor := 'amministrazione SQL (' || current_user || ')';
  end if;

  if tg_op = 'INSERT' then
    insert into public.visits_audit (user_id, child, day, old_kind, new_kind, actor)
    values (new.user_id, new.child, new.day, null, new.kind, v_actor);
    return new;
  elsif tg_op = 'UPDATE' then
    if new.kind is distinct from old.kind or new.child <> old.child or new.day <> old.day then
      insert into public.visits_audit (user_id, child, day, old_kind, new_kind, actor)
      values (new.user_id, new.child, new.day, old.kind, new.kind, v_actor);
    end if;
    return new;
  else
    insert into public.visits_audit (user_id, child, day, old_kind, new_kind, actor)
    values (old.user_id, old.child, old.day, old.kind, null, v_actor);
    return old;
  end if;
end $$;

create trigger visits_audit_trg after insert or update or delete on public.visits
  for each row execute function public.log_visit_change();

alter table public.app_settings enable row level security;
alter table public.visits enable row level security;
alter table public.visits_audit enable row level security;
alter table public.share_links enable row level security;

create policy "settings: solo proprietario" on public.app_settings
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "visits: solo proprietario" on public.visits
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "audit: lettura solo proprietario" on public.visits_audit
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "share: solo proprietario" on public.share_links
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.app_settings, public.visits, public.visits_audit, public.share_links from anon;
revoke insert, update, delete, truncate on public.visits_audit from authenticated;

create or replace function public.get_shared_calendar(p_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_link public.share_links%rowtype;
  v_children jsonb;
  v_visits jsonb;
begin
  select * into v_link from public.share_links
   where token = p_token and revoked_at is null and expires_at > now();
  if not found then
    raise exception 'Link non valido, scaduto o revocato' using errcode = '28000';
  end if;

  update public.share_links
     set last_used_at = now(), use_count = use_count + 1
   where token = p_token;

  select coalesce(s.children, '[]'::jsonb) into v_children
    from public.app_settings s where s.user_id = v_link.user_id;

  select coalesce(jsonb_agg(jsonb_build_object('child', v.child, 'day', v.day, 'kind', v.kind) order by v.day, v.child), '[]'::jsonb)
    into v_visits
    from public.visits v
   where v.user_id = v_link.user_id
     and (v_link.date_from is null or v.day >= v_link.date_from)
     and (v_link.date_to is null or v.day <= v_link.date_to);

  return jsonb_build_object(
    'label', v_link.label,
    'date_from', v_link.date_from,
    'date_to', v_link.date_to,
    'expires_at', v_link.expires_at,
    'children', coalesce(v_children, '[]'::jsonb),
    'visits', v_visits,
    'generated_at', now()
  );
end $$;

revoke all on function public.get_shared_calendar(uuid) from public;
grant execute on function public.get_shared_calendar(uuid) to anon, authenticated;
revoke all on function public.log_visit_change() from public, anon, authenticated;
revoke all on function public.touch_updated_at() from public, anon, authenticated;

-- ═══════════ 2) un_solo_account_e_permessi_link ═══════════
create or replace function public.block_extra_signups()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from auth.users) then
    raise exception 'Registrazione non consentita: questo calendario ha già un proprietario';
  end if;
  return new;
end $$;
revoke all on function public.block_extra_signups() from public, anon, authenticated;

create trigger un_solo_proprietario
  before insert on auth.users
  for each row execute function public.block_extra_signups();

revoke execute on function public.get_shared_calendar(uuid) from authenticated;
