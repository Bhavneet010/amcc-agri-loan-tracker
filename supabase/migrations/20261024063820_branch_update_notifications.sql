-- No backfill: only meaningful loan updates committed after activation produce alerts.
create table public.amcc_notifications (
 id uuid primary key default gen_random_uuid(),
 loan_id text not null references public.amcc_loans(id) on delete cascade,
 branch_id text not null references public.amcc_branches(id),
 remarks_changed boolean not null, remarks text not null,
 decision_changed boolean not null, status_changed boolean not null,
 from_status text not null, to_status text not null, return_reason text not null,
 returned_date date, sanction_date date,
 source_app text not null check(source_app in ('agri','nirnay')),
 created_at timestamptz not null default clock_timestamp()
);
create index amcc_notifications_branch_created on public.amcc_notifications(branch_id,created_at,id);
create index amcc_notifications_loan on public.amcc_notifications(loan_id);
create table public.amcc_notification_reads (
 device_id uuid not null, event_id uuid not null references public.amcc_notifications(id) on delete cascade,
 read_at timestamptz not null default clock_timestamp(), primary key(device_id,event_id)
);
create index amcc_notification_reads_event on public.amcc_notification_reads(event_id);
alter table public.amcc_notifications enable row level security;
alter table public.amcc_notification_reads enable row level security;
revoke all on public.amcc_notifications,public.amcc_notification_reads from public,anon,authenticated;
grant all on public.amcc_notifications,public.amcc_notification_reads to service_role;

create function public.amcc_capture_notification() returns trigger language plpgsql security invoker set search_path='' as $$
declare decision_changed boolean;
begin
 if new.agri_archived then return null; end if;
 decision_changed:=old.status is distinct from new.status or old.return_reason is distinct from new.return_reason or old.returned_date is distinct from new.returned_date or old.sanction_date is distinct from new.sanction_date;
 if old.remarks is distinct from new.remarks or decision_changed then
  insert into public.amcc_notifications(loan_id,branch_id,remarks_changed,remarks,decision_changed,status_changed,from_status,to_status,return_reason,returned_date,sanction_date,source_app)
  values(new.id,new.branch_id,old.remarks is distinct from new.remarks,new.remarks,decision_changed,old.status is distinct from new.status,old.status,new.status,new.return_reason,new.returned_date,new.sanction_date,
   case when current_setting('amcc.source_app',true)='nirnay' then 'nirnay' else 'agri' end);
 end if;
 return null;
end;
$$;
create trigger amcc_loan_notification after update on public.amcc_loans for each row execute function public.amcc_capture_notification();
revoke all on function public.amcc_capture_notification() from public,anon,authenticated;
grant execute on function public.amcc_capture_notification() to service_role;

create function public.amcc_list_notifications(p_branch_id text,p_device_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 with pending as (
  select e.*,l.borrower_name,l.ats_id from public.amcc_notifications e
  join public.amcc_loans l on l.id=e.loan_id and l.branch_id=e.branch_id and not l.agri_archived
  where e.branch_id=p_branch_id and not exists(select 1 from public.amcc_notification_reads r where r.device_id=p_device_id and r.event_id=e.id)
  order by e.created_at,e.id limit 51
 ), batch as (select * from pending order by created_at,id limit 50)
 select jsonb_build_object('hasMore',(select count(*)>50 from pending),'items',coalesce((select jsonb_agg(jsonb_build_object(
  'id',id,'loanId',loan_id,'borrowerName',borrower_name,'atsId',ats_id,
  'remarksChanged',remarks_changed,'remarks',remarks,'decisionChanged',decision_changed,'statusChanged',status_changed,
  'fromStatus',from_status,'toStatus',to_status,'returnReason',return_reason,'returnedDate',returned_date,'sanctionDate',sanction_date,'sourceApp',source_app,'createdAt',created_at
 ) order by created_at,id) from batch),'[]'::jsonb));
$$;
create function public.amcc_read_notifications(p_branch_id text,p_device_id uuid,p_event_ids uuid[]) returns jsonb language plpgsql security invoker set search_path='' as $$
declare total integer;
begin
 if p_device_id is null or cardinality(p_event_ids) is null or cardinality(p_event_ids)<1 or cardinality(p_event_ids)>50 then raise exception 'Choose 1–50 updates to mark as read.'; end if;
 if not exists(select 1 from public.amcc_branches where id=p_branch_id) then raise exception 'Choose a valid branch.'; end if;
 if (select count(distinct id) from unnest(p_event_ids) id)<>(select count(*) from public.amcc_notifications e join public.amcc_loans l on l.id=e.loan_id and l.branch_id=e.branch_id and not l.agri_archived where e.id=any(p_event_ids) and e.branch_id=p_branch_id) then
  raise exception 'An update is no longer available for this branch. Refresh and try again.';
 end if;
 insert into public.amcc_notification_reads(device_id,event_id) select p_device_id,id from public.amcc_notifications where id=any(p_event_ids) and branch_id=p_branch_id on conflict do nothing;
 get diagnostics total=row_count;
 return jsonb_build_object('read',total);
end;
$$;
revoke all on function public.amcc_list_notifications(text,uuid),public.amcc_read_notifications(text,uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.amcc_list_notifications(text,uuid),public.amcc_read_notifications(text,uuid,uuid[]) to service_role;
