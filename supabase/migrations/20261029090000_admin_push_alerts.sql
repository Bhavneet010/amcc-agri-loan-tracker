-- Phone alerts for the admin when a branch or Nirnay adds a loan. No backfill: only loans created after activation are queued.
create table public.amcc_push_keys (
 id boolean primary key default true check(id),
 public_key text not null, private_jwk jsonb not null,
 created_at timestamptz not null default clock_timestamp()
);
create table public.amcc_push_subscriptions (
 endpoint text primary key check(length(endpoint) between 1 and 1000),
 p256dh text not null, auth text not null,
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp()
);
create table public.amcc_push_outbox (
 id uuid primary key default gen_random_uuid(),
 loan_id text not null references public.amcc_loans(id) on delete cascade,
 source_app text not null check(source_app in ('agri','nirnay')),
 attempts integer not null default 0, claimed_at timestamptz,
 created_at timestamptz not null default clock_timestamp()
);
create index amcc_push_outbox_created on public.amcc_push_outbox(created_at,id);
create index amcc_push_outbox_loan on public.amcc_push_outbox(loan_id);
alter table public.amcc_push_keys enable row level security;
alter table public.amcc_push_subscriptions enable row level security;
alter table public.amcc_push_outbox enable row level security;
revoke all on public.amcc_push_keys,public.amcc_push_subscriptions,public.amcc_push_outbox from public,anon,authenticated;
grant all on public.amcc_push_keys,public.amcc_push_subscriptions,public.amcc_push_outbox to service_role;

-- Every creation path (Agri new and renewal loans, shared fresh applications from Agri or Nirnay) inserts here.
-- Rolled-back creations and request replays insert nothing, so they queue nothing.
create function public.amcc_queue_push_alert() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.agri_archived or current_setting('amcc.push_skip',true)='1' then return null; end if;
 insert into public.amcc_push_outbox(loan_id,source_app) values(new.id,case when current_setting('amcc.source_app',true)='nirnay' then 'nirnay' else 'agri' end);
 return null;
end;
$$;
create trigger amcc_loan_push_alert after insert on public.amcc_loans for each row execute function public.amcc_queue_push_alert();
revoke all on function public.amcc_queue_push_alert() from public,anon,authenticated;
grant execute on function public.amcc_queue_push_alert() to service_role;

-- Attaching an existing Nirnay application (an admin action) records an old application, not a new loan.
create or replace function public.amcc_create_shared(p_input jsonb,p_source text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare saved jsonb; prepared jsonb; match jsonb; candidate_id text; candidate_count integer;
begin
 prepared:=p_input; match:=p_input->'existingNirnay';
 if match is not null then perform set_config('amcc.push_skip','1',true); end if;
 if match is not null and p_input->>'linkExistingId' is null then
  select count(*),min(id) into candidate_count,candidate_id from public.amcc_loans where share_eligible and category='new' and branch_id=p_input->>'branchId'
   and public.amcc_normalize_name(borrower_name)=public.amcc_normalize_name(p_input->>'borrowerName') and amount_paise=(p_input->>'amountPaise')::bigint
   and (ats_id is null or nullif(p_input->>'atsId','') is null or regexp_replace(ats_id,'[^0-9]','','g')=regexp_replace(p_input->>'atsId','[^0-9]','','g'));
  if candidate_count=1 then prepared:=prepared||jsonb_build_object('linkExistingId',candidate_id); end if;
 end if;
 saved:=public.amcc_create_shared_core(prepared,p_source);
 if coalesce((saved->>'needsConfirmation')::boolean,false) then return saved; end if;
 if match is not null then saved:=public.amcc_attach_nirnay(saved->>'id',match); end if;
 return saved;
end;
$$;

-- Claims up to 20 queued alerts for two minutes, so overlapping deliveries do not send the same alert twice.
-- Alerts older than a day, or that failed five times, are dropped rather than arriving late.
create function public.amcc_claim_push_jobs() returns jsonb language plpgsql security invoker set search_path='' as $$
declare claimed jsonb;
begin
 delete from public.amcc_push_outbox where attempts>=5 or created_at<clock_timestamp()-interval '1 day';
 with picked as (
  select id from public.amcc_push_outbox where claimed_at is null or claimed_at<clock_timestamp()-interval '2 minutes'
  order by created_at,id limit 20 for update skip locked
 ), updated as (
  update public.amcc_push_outbox o set claimed_at=clock_timestamp(),attempts=o.attempts+1 from picked where o.id=picked.id returning o.*
 )
 select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'loanId',l.id,'branchName',b.name,'category',l.category,'borrowerName',l.borrower_name,'amountPaise',l.amount_paise,'sourceApp',u.source_app) order by u.created_at,u.id),'[]'::jsonb)
  into claimed from updated u join public.amcc_loans l on l.id=u.loan_id join public.amcc_branches b on b.id=l.branch_id;
 return claimed;
end;
$$;
revoke all on function public.amcc_claim_push_jobs() from public,anon,authenticated;
grant execute on function public.amcc_claim_push_jobs() to service_role;
