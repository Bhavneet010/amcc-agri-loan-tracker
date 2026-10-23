-- Dedicated Agri service. No existing application tables are altered.
create table public.amcc_branches (
  id text primary key check (id ~ '^branch-(0[1-9]|1[0-3])$'),
  name text not null unique check (length(name) between 1 and 80),
  version integer not null default 1 check (version > 0)
);
create table public.amcc_loans (
  id text primary key,
  branch_id text not null references public.amcc_branches(id),
  category text not null check (category in ('new','renewal')),
  ats_id text not null check (length(ats_id) between 1 and 80),
  borrower_name text not null default '' check (length(borrower_name) <= 120),
  amount_paise bigint not null check (amount_paise > 0 and amount_paise <= 9007199254740991),
  status text not null default 'pending' check (status in ('pending','sanctioned')),
  remarks text not null default '' check (length(remarks) <= 2000),
  compliance text not null default 'none' check (compliance in ('none','awaiting','complied')),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(branch_id,category,ats_id)
);
create index amcc_loans_branch_updated on public.amcc_loans(branch_id,updated_at desc,id desc);
create index amcc_loans_updated on public.amcc_loans(updated_at desc,id desc);
create table public.amcc_audit (
  id text primary key, loan_id text not null, actor text not null,
  changes text not null, created_at timestamptz not null default now()
);
create index amcc_audit_loan_created on public.amcc_audit(loan_id,created_at desc);
create table public.amcc_login_attempts (
  key text primary key, attempts integer not null default 0,
  window_start bigint not null
);
create table public.amcc_config (
  id boolean primary key default true check (id), enabled boolean not null default false,
  password_salt text not null default '', password_hash text not null default '', session_secret text not null default ''
);
insert into public.amcc_config(id) values(true);
create table public.amcc_changes (
  id boolean primary key default true check(id), revision bigint not null default 0,
  updated_at timestamptz not null default now()
);
insert into public.amcc_changes(id) values(true);

alter table public.amcc_branches enable row level security;
alter table public.amcc_loans enable row level security;
alter table public.amcc_audit enable row level security;
alter table public.amcc_login_attempts enable row level security;
alter table public.amcc_config enable row level security;
alter table public.amcc_changes enable row level security;
revoke all on public.amcc_branches, public.amcc_loans, public.amcc_audit, public.amcc_login_attempts, public.amcc_config, public.amcc_changes from anon, authenticated;
grant all on public.amcc_branches, public.amcc_loans, public.amcc_audit, public.amcc_login_attempts, public.amcc_config, public.amcc_changes to service_role;
grant select on public.amcc_changes to anon, authenticated;
create policy amcc_revision_read on public.amcc_changes for select to anon, authenticated using (true);

create function public.amcc_signal_change() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  update public.amcc_changes set revision = revision + 1, updated_at = clock_timestamp() where id;
  return null;
end;
$$;
create trigger amcc_loans_changed after insert or update or delete on public.amcc_loans for each statement execute function public.amcc_signal_change();
create trigger amcc_branches_changed after insert or update or delete on public.amcc_branches for each statement execute function public.amcc_signal_change();
revoke all on function public.amcc_signal_change() from public, anon, authenticated;
grant execute on function public.amcc_signal_change() to service_role;
alter publication supabase_realtime add table public.amcc_changes;

create function public.amcc_loan_json(r public.amcc_loans) returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('id',r.id,'branchId',r.branch_id,'branchName',b.name,'category',r.category,'atsId',r.ats_id,'borrowerName',r.borrower_name,'amountPaise',r.amount_paise,'status',r.status,'remarks',r.remarks,'compliance',r.compliance,'version',r.version,'createdAt',to_char(r.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'updatedAt',to_char(r.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) from public.amcc_branches b where b.id = r.branch_id;
$$;
revoke all on function public.amcc_loan_json(public.amcc_loans) from public, anon, authenticated;
grant execute on function public.amcc_loan_json(public.amcc_loans) to service_role;

create function public.amcc_mutate_loan(p_operation text,p_id text,p_version integer,p_changes jsonb,p_actor text) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r public.amcc_loans; snapshot jsonb;
begin
  if p_actor not in ('admin','branch') then raise exception 'Invalid actor.'; end if;
  if p_operation = 'create' then
    insert into public.amcc_loans(id,branch_id,category,ats_id,borrower_name,amount_paise)
    values(p_id,p_changes->>'branchId',p_changes->>'category',p_changes->>'atsId',coalesce(p_changes->>'borrowerName',''),(p_changes->>'amountPaise')::bigint) returning * into r;
    snapshot := p_changes || jsonb_build_object('action','create');
  else
    select * into r from public.amcc_loans where id = p_id for update;
    if not found then raise exception 'Loan not found.'; end if;
    if p_version is null or r.version <> p_version then raise exception 'This loan was updated by someone else. Refresh and try again.'; end if;
    if p_operation = 'delete' then
      if r.status = 'sanctioned' and p_actor <> 'admin' then raise exception 'Admin login is required to delete a sanctioned loan.'; end if;
      snapshot := public.amcc_loan_json(r) || jsonb_build_object('action','delete');
      delete from public.amcc_loans where id = p_id;
    elsif p_operation = 'update' then
      update public.amcc_loans set
        ats_id = coalesce(p_changes->>'atsId',ats_id), borrower_name = coalesce(p_changes->>'borrowerName',borrower_name),
        amount_paise = coalesce((p_changes->>'amountPaise')::bigint,amount_paise),
        status = coalesce(p_changes->>'status',status), remarks = coalesce(p_changes->>'remarks',remarks),
        compliance = coalesce(p_changes->>'compliance',compliance), version = version + 1, updated_at = clock_timestamp()
      where id = p_id returning * into r;
      snapshot := p_changes;
    else raise exception 'Invalid operation.';
    end if;
  end if;
  insert into public.amcc_audit(id,loan_id,actor,changes) values(gen_random_uuid()::text,p_id,p_actor,snapshot::text);
  if p_operation = 'delete' then return jsonb_build_object('deleted',true,'id',p_id); end if;
  return public.amcc_loan_json(r);
end;
$$;
revoke all on function public.amcc_mutate_loan(text,text,integer,jsonb,text) from public, anon, authenticated;
grant execute on function public.amcc_mutate_loan(text,text,integer,jsonb,text) to service_role;

create function public.amcc_rename_branch(p_id text,p_name text,p_version integer) returns void language plpgsql security invoker set search_path = '' as $$
begin
  update public.amcc_branches set name = p_name, version = version + 1 where id = p_id and version = p_version;
  if not found then raise exception 'This branch was renamed by someone else. Reload the latest name and try again.'; end if;
end;
$$;
revoke all on function public.amcc_rename_branch(text,text,integer) from public, anon, authenticated;
grant execute on function public.amcc_rename_branch(text,text,integer) to service_role;

create function public.amcc_login_attempt(p_key text) returns integer language plpgsql security invoker set search_path = '' as $$
declare n integer; global_n integer; current_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint; cutoff bigint;
begin
  cutoff := current_ms - 900000;
  insert into public.amcc_login_attempts(key,attempts,window_start) values('__global__',1,current_ms)
  on conflict(key) do update set attempts = case when amcc_login_attempts.window_start < cutoff then 1 else amcc_login_attempts.attempts + 1 end,
    window_start = case when amcc_login_attempts.window_start < cutoff then current_ms else amcc_login_attempts.window_start end returning attempts into global_n;
  insert into public.amcc_login_attempts(key,attempts,window_start) values(p_key,1,current_ms)
  on conflict(key) do update set attempts = case when amcc_login_attempts.window_start < cutoff then 1 else amcc_login_attempts.attempts + 1 end,
    window_start = case when amcc_login_attempts.window_start < cutoff then current_ms else amcc_login_attempts.window_start end returning attempts into n;
  delete from public.amcc_login_attempts where window_start < cutoff;
  if global_n > 30 then return 6; end if;
  return n;
end;
$$;
revoke all on function public.amcc_login_attempt(text) from public, anon, authenticated;
grant execute on function public.amcc_login_attempt(text) to service_role;
