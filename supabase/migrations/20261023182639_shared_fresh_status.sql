-- Shared fresh Agriculture decisions; existing history/renewals are unchanged.
alter table public.amcc_loans drop constraint amcc_loans_status_check;
alter table public.amcc_loans add constraint amcc_loans_status_check check(status in ('pending','sanctioned','returned'));
alter table public.amcc_loans add constraint amcc_returned_fresh_only check(status<>'returned' or category='new');
alter table public.amcc_loans add column return_reason text not null default '' check(length(return_reason)<=2000);
alter table public.amcc_loans add column returned_date date;
alter table public.amcc_loans add column sanction_date date;
alter table public.amcc_loans add column status_changed_at timestamptz;
create table public.amcc_status_events(
 id uuid primary key default gen_random_uuid(),loan_id text not null references public.amcc_loans(id),
 from_status text not null,to_status text not null,reason text not null default '',returned_date date,
 source_app text not null check(source_app in ('agri','nirnay')),author text not null,request_id text not null,
 created_at timestamptz not null default clock_timestamp()
);
create index amcc_status_events_loan on public.amcc_status_events(loan_id,created_at,id);
alter table public.amcc_status_events enable row level security;
revoke all on public.amcc_status_events from anon,authenticated;
grant all on public.amcc_status_events to service_role;

create function public.amcc_prepare_decision() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.status='returned' and btrim(new.return_reason)='' then raise exception 'Enter a return reason.'; end if;
 if old.status is distinct from new.status then
  new.status_changed_at:=clock_timestamp();
  if new.status='returned' then new.returned_date:=coalesce(new.returned_date,(clock_timestamp() at time zone 'Asia/Kolkata')::date); end if;
  if new.status='sanctioned' then new.sanction_date:=coalesce(new.sanction_date,(clock_timestamp() at time zone 'Asia/Kolkata')::date); end if;
 end if;
 return new;
end;
$$;
create trigger amcc_prepare_decision before update on public.amcc_loans for each row execute function public.amcc_prepare_decision();
create function public.amcc_capture_decision() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.share_eligible and (old.status is distinct from new.status or old.return_reason is distinct from new.return_reason or old.returned_date is distinct from new.returned_date or old.sanction_date is distinct from new.sanction_date) then
  insert into public.amcc_status_events(loan_id,from_status,to_status,reason,returned_date,source_app,author,request_id)
   values(new.id,old.status,new.status,new.return_reason,new.returned_date,coalesce(nullif(current_setting('amcc.source_app',true),''),'agri'),coalesce(nullif(current_setting('amcc.author',true),''),'Agri admin'),coalesce(nullif(current_setting('amcc.request_id',true),''),gen_random_uuid()::text));
  insert into public.amcc_nirnay_links(loan_id,data) values(new.id,jsonb_build_object('status',new.status,'returnedDate',new.returned_date,'sanctionDate',new.sanction_date))
   on conflict(loan_id) do update set data=amcc_nirnay_links.data||excluded.data,version=amcc_nirnay_links.version+1;
 end if;
 return null;
end;
$$;
create trigger amcc_capture_decision after update on public.amcc_loans for each row execute function public.amcc_capture_decision();


create or replace function public.amcc_loan_json(r public.amcc_loans) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',r.id,'branchId',r.branch_id,'branchName',b.name,'category',r.category,'atsId',r.ats_id,'borrowerName',r.borrower_name,'amountPaise',r.amount_paise,'status',r.status,'remarks',r.remarks,'compliance',r.compliance,'version',r.version,'createdAt',to_char(r.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'updatedAt',to_char(r.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
 'returnedDate',r.returned_date,'returnReason',r.return_reason,'sanctionDate',r.sanction_date,'statusChangedAt',r.status_changed_at,
 'statusHistory',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'fromStatus',e.from_status,'toStatus',e.to_status,'reason',e.reason,'returnedDate',e.returned_date,'sourceApp',e.source_app,'author',e.author,'requestId',e.request_id,'createdAt',e.created_at) order by e.created_at,e.id) from public.amcc_status_events e where e.loan_id=r.id),'[]'::jsonb),
 'shareEligible',r.share_eligible,'agriArchived',r.agri_archived,
 'remarkHistory',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'requestId',e.request_id,'body',e.body,'sourceApp',e.source_app,'author',e.author,'createdAt',e.created_at) order by e.created_at,e.id) from public.amcc_remark_events e where e.loan_id=r.id),'[]'::jsonb),
 'nirnay',coalesce((select jsonb_build_object('firebaseId',n.firebase_id,'data',n.data,'archived',n.archived,'version',n.version) from public.amcc_nirnay_links n where n.loan_id=r.id),'{"data":{"status":"pending"},"archived":false,"version":0}'::jsonb))
 from public.amcc_branches b where b.id=r.branch_id;
$$;

create or replace function public.amcc_mutate_loan(p_operation text,p_id text,p_version integer,p_changes jsonb,p_actor text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.amcc_loans; snapshot jsonb;
begin
 perform set_config('amcc.source_app','agri',true);
 perform set_config('amcc.author','Agri admin',true);
 perform set_config('amcc.request_id',coalesce(nullif(p_changes->>'requestId',''),gen_random_uuid()::text),true);
 if p_actor not in ('admin','branch') then raise exception 'Invalid actor.'; end if;
 if p_operation='create' then
  insert into public.amcc_loans(id,branch_id,category,ats_id,borrower_name,amount_paise) values(p_id,p_changes->>'branchId',p_changes->>'category',p_changes->>'atsId',coalesce(p_changes->>'borrowerName',''),(p_changes->>'amountPaise')::bigint) returning * into r;
  snapshot:=p_changes||jsonb_build_object('action','create');
 else
  select * into r from public.amcc_loans where id=p_id and not agri_archived for update;
  if not found then raise exception 'Loan not found.'; end if;
  if p_version is null or r.version<>p_version then raise exception 'This loan was updated by someone else. Refresh and try again.'; end if;
  if p_operation='delete' then
   if r.status='sanctioned' and p_actor<>'admin' then raise exception 'Admin login is required to delete a sanctioned loan.'; end if;
   snapshot:=public.amcc_loan_json(r)||jsonb_build_object('action',case when r.share_eligible then 'archive_agri' else 'delete' end);
   if r.share_eligible then update public.amcc_loans set agri_archived=true,version=version+1,updated_at=clock_timestamp() where id=p_id;
   else delete from public.amcc_loans where id=p_id; end if;
  elsif p_operation='update' then
   update public.amcc_loans set ats_id=coalesce(nullif(p_changes->>'atsId',''),ats_id),borrower_name=coalesce(p_changes->>'borrowerName',borrower_name),amount_paise=coalesce((p_changes->>'amountPaise')::bigint,amount_paise),status=coalesce(p_changes->>'status',status),return_reason=coalesce(p_changes->>'returnReason',return_reason),returned_date=coalesce((p_changes->>'returnedDate')::date,returned_date),sanction_date=coalesce((p_changes->>'sanctionDate')::date,sanction_date),remarks=coalesce(p_changes->>'remarks',remarks),compliance=coalesce(p_changes->>'compliance',compliance),version=version+1,updated_at=clock_timestamp() where id=p_id returning * into r;
   snapshot:=p_changes;
  else raise exception 'Invalid operation.'; end if;
 end if;
 insert into public.amcc_audit(id,loan_id,actor,changes) values(gen_random_uuid()::text,p_id,p_actor,snapshot::text);
 if p_operation='delete' then return jsonb_build_object('deleted',true,'id',p_id); end if;
 return public.amcc_loan_json(r);
end;
$$;

create or replace function public.amcc_update_nirnay(p_id text,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.amcc_loans; n public.amcc_nirnay_links; d jsonb; rid text; exists_id text; amount_value bigint; branch_code text; next_branch text; canonical_change boolean; next_status text; decision_change boolean;
begin
 rid:='update:nirnay:'||(p_input->>'requestId');
 perform pg_advisory_xact_lock(hashtextextended(rid,0));
 select loan_id into exists_id from public.amcc_shared_requests where request_id=rid;
 if found then
  if exists_id<>p_id then raise exception 'This save request belongs to another application.'; end if;
  return public.amcc_get_shared(p_id);
 end if;
 select * into r from public.amcc_loans where id=p_id and share_eligible for update;
 if not found then raise exception 'Shared loan not found.'; end if;
 if r.version<>(p_input->>'version')::integer then raise exception 'This loan was updated by someone else. Refresh and try again.'; end if;
 insert into public.amcc_nirnay_links(loan_id) values(p_id) on conflict(loan_id) do nothing;
 select * into n from public.amcc_nirnay_links where loan_id=p_id for update;
 if n.version<>coalesce((p_input->>'nirnayVersion')::integer,0) then raise exception 'This loan was updated by someone else. Refresh and try again.'; end if;
 d:=coalesce(p_input->'data','{}'::jsonb);
 -- Raw amountPaise is computed by the validated server adapter, never by SQL float rounding.
 amount_value:=coalesce((p_input->>'amountPaise')::bigint,r.amount_paise);
 next_branch:=coalesce(p_input->>'branchId',r.branch_id);
 next_status:=coalesce(d->>'status',r.status);
 if next_status not in ('pending','sanctioned','returned') then raise exception 'Invalid loan status.'; end if;
 if next_status='returned' and r.status<>'returned' and coalesce(btrim(d->>'returnReason'),'')='' then raise exception 'Enter a return reason.'; end if;
 decision_change:=next_status<>r.status or (d ? 'returnReason' and d->>'returnReason'<>r.return_reason) or (nullif(d->>'returnedDate','') is not null and (d->>'returnedDate')::date is distinct from r.returned_date) or (nullif(d->>'sanctionDate','') is not null and (d->>'sanctionDate')::date is distinct from r.sanction_date);
 canonical_change:=amount_value<>r.amount_paise or next_branch<>r.branch_id or (d ? 'customerName' and public.amcc_normalize_name(d->>'customerName')<>public.amcc_normalize_name(r.borrower_name));
 if canonical_change and r.status<>'pending' and next_status<>'pending' then raise exception 'The Agri application is sanctioned; its application details cannot be changed.'; end if;
 perform set_config('amcc.request_id',rid,true);
 perform set_config('amcc.source_app','nirnay',true);
 perform set_config('amcc.author',coalesce(nullif(p_input->>'author',''),'Nirnay user'),true);
 if canonical_change or decision_change or (d ? 'remarks' and btrim(d->>'remarks')<>r.remarks) then
  update public.amcc_loans set borrower_name=case when d ? 'customerName' and public.amcc_normalize_name(d->>'customerName')<>public.amcc_normalize_name(borrower_name) then btrim(d->>'customerName') else borrower_name end,
   branch_id=next_branch,amount_paise=amount_value,status=next_status,return_reason=coalesce(d->>'returnReason',return_reason),returned_date=coalesce(nullif(d->>'returnedDate','')::date,returned_date),sanction_date=coalesce(nullif(d->>'sanctionDate','')::date,sanction_date),remarks=case when d ? 'remarks' then btrim(d->>'remarks') else remarks end,
   compliance=case when next_status<>'pending' then 'none' when d ? 'remarks' and btrim(d->>'remarks')<>remarks and status='pending' then case when btrim(d->>'remarks')='' then 'none' else 'awaiting' end else compliance end,
   version=version+1,updated_at=clock_timestamp() where id=p_id;
 end if;
 update public.amcc_nirnay_links set data=data||(d-'remarks'-'amount'-'branch'-'customerName'-'status'-'returnReason'-'returnedDate'-'sanctionDate')||jsonb_build_object('status',next_status),archived=coalesce((p_input->>'archived')::boolean,archived),version=version+1 where loan_id=p_id;
 insert into public.amcc_shared_requests(request_id,loan_id) values(rid,p_id);
 insert into public.amcc_audit(id,loan_id,actor,changes) values(gen_random_uuid()::text,p_id,'nirnay',jsonb_build_object('action','nirnay_update','sharedStatusChanged',next_status<>r.status,'requestId',p_input->>'requestId')::text);
 return public.amcc_get_shared(p_id);
end;
$$;

create or replace function public.amcc_create_shared_core(p_input jsonb,p_source text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.amcc_loans; existing_id text; candidates jsonb; rid text; bid text; ats text; chosen text; note text;
begin
 if not (select enabled from public.amcc_linkage_config where id) then raise exception 'Shared linkage is not enabled yet.'; end if;
 if p_source not in ('agri','nirnay') then raise exception 'Invalid source.'; end if;
 rid:='create:'||p_source||':'||(p_input->>'requestId'); bid:=p_input->>'branchId'; ats:=nullif(btrim(p_input->>'atsId'),'');
 perform pg_advisory_xact_lock(hashtextextended(rid,0));
 select loan_id into existing_id from public.amcc_shared_requests where request_id=rid;
 if found then return public.amcc_get_shared(existing_id); end if;
 perform pg_advisory_xact_lock(hashtextextended('amcc-create:'||bid,0));
 if ats is not null then
  select * into r from public.amcc_loans where branch_id=bid and category='new' and regexp_replace(ats_id,'[^0-9]','','g')=regexp_replace(ats,'[^0-9]','','g') and regexp_replace(ats,'[^0-9]','','g')<>'';
  if found then
   if not r.share_eligible then raise exception 'This ATS already belongs to an earlier application. No historical record was linked.'; end if;
   chosen:=r.id;
  end if;
 end if;
 if chosen is null then
  select jsonb_agg(public.amcc_loan_json(l) order by l.created_at,l.id) into candidates from public.amcc_loans l
   where l.share_eligible and l.category='new' and l.branch_id=bid and public.amcc_normalize_name(l.borrower_name)=public.amcc_normalize_name(p_input->>'borrowerName')
    and (ats is null or l.ats_id is null or regexp_replace(l.ats_id,'[^0-9]','','g')=regexp_replace(ats,'[^0-9]','','g'));
  if p_input->>'linkExistingId' is not null then
   if not exists(select 1 from jsonb_array_elements(coalesce(candidates,'[]'::jsonb)) c where c->>'id'=p_input->>'linkExistingId') then raise exception 'The selected match is no longer available. Refresh and try again.'; end if;
   chosen:=p_input->>'linkExistingId';
  elsif candidates is not null and not coalesce((p_input->>'allowDistinct')::boolean,false) then
   return jsonb_build_object('needsConfirmation',true,'error','This borrower already has a shared application. Select the existing loan or confirm a different application.','candidates',candidates);
  end if;
 end if;
 perform set_config('amcc.request_id',rid,true);
 perform set_config('amcc.source_app',p_source,true);
 perform set_config('amcc.author',coalesce(nullif(p_input->>'author',''),case when p_source='agri' then 'Agri admin' else 'Nirnay user' end),true);
 if chosen is null then
  chosen:=gen_random_uuid()::text;
  insert into public.amcc_loans(id,branch_id,category,ats_id,borrower_name,amount_paise,share_eligible)
   values(chosen,bid,'new',ats,btrim(p_input->>'borrowerName'),(p_input->>'amountPaise')::bigint,true);
  insert into public.amcc_audit(id,loan_id,actor,changes) values(gen_random_uuid()::text,chosen,p_source,jsonb_build_object('action','create_shared','requestId',p_input->>'requestId')::text);
 elsif ats is not null then
  update public.amcc_loans set ats_id=ats,version=version+1,updated_at=clock_timestamp() where id=chosen and ats_id is null;
 end if;
 if p_source='agri' then
  update public.amcc_loans set agri_archived=false,version=version+1,updated_at=clock_timestamp() where id=chosen and agri_archived;
 end if;
 if p_source='nirnay' then
  insert into public.amcc_nirnay_links(loan_id,data) values(chosen,coalesce(p_input->'nirnayData','{}'::jsonb)-'remarks'-'amount'-'branch'-'customerName'||'{"status":"pending"}'::jsonb) on conflict(loan_id) do update set archived=false,version=amcc_nirnay_links.version+1 where amcc_nirnay_links.archived;
 end if;
 note:=nullif(btrim(p_input->>'remarks'),'');
 if note is not null and (select remarks from public.amcc_loans where id=chosen) is distinct from note then
  update public.amcc_loans set remarks=note,compliance=case when status='pending' then 'awaiting' else 'none' end,version=version+1,updated_at=clock_timestamp() where id=chosen;
 end if;
 insert into public.amcc_shared_requests(request_id,loan_id) values(rid,chosen);
 return public.amcc_get_shared(chosen);
end;
$$;

create function public.amcc_attach_nirnay(p_id text,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.amcc_loans; n public.amcc_nirnay_links; fid text; decision text; note text;
begin
 fid:=p_input->>'firebaseId'; decision:=p_input->>'status';
 perform pg_advisory_xact_lock(hashtextextended('amcc-firebase:'||fid,0));
 select * into r from public.amcc_loans where id=p_id and share_eligible for update;
 if not found then raise exception 'Shared loan not found.'; end if;
 if r.branch_id<>p_input->>'branchId' or public.amcc_normalize_name(r.borrower_name)<>public.amcc_normalize_name(p_input->>'borrowerName') or r.amount_paise<>(p_input->>'amountPaise')::bigint then raise exception 'The selected application no longer matches. Refresh and review before linking.'; end if;
 select * into n from public.amcc_nirnay_links where loan_id=p_id for update;
 if n.firebase_id=fid then return public.amcc_get_shared(p_id); end if;
 if n.firebase_id is not null or exists(select 1 from public.amcc_nirnay_links where firebase_id=fid) then raise exception 'This application already has a different identity link.'; end if;
 if decision not in ('pending','sanctioned','returned') or (r.status<>'pending' and r.status<>decision) then raise exception 'The existing decisions conflict. Review before linking.'; end if;
 insert into public.amcc_nirnay_links(loan_id,firebase_id,data) values(p_id,fid,coalesce(p_input->'data','{}'::jsonb)||jsonb_build_object('status',decision))
  on conflict(loan_id) do update set firebase_id=excluded.firebase_id,data=amcc_nirnay_links.data||excluded.data,version=amcc_nirnay_links.version+1;
 perform set_config('amcc.source_app','nirnay',true);perform set_config('amcc.author','Existing Nirnay record',true);perform set_config('amcc.request_id','attach:nirnay:'||fid,true);
 note:=coalesce(p_input->>'remarks','');
 if note<>'' and r.remarks<>'' and note<>r.remarks then
  insert into public.amcc_remark_events(loan_id,body,source_app,author,request_id) values(p_id,note,'nirnay','Existing Nirnay record','attach:nirnay:'||fid);
 end if;
 update public.amcc_loans set status=decision,return_reason=case when decision='returned' then p_input->>'returnReason' else return_reason end,
  returned_date=coalesce(nullif(p_input->>'returnedDate','')::date,returned_date),sanction_date=coalesce(nullif(p_input->>'sanctionDate','')::date,sanction_date),
  remarks=case when remarks='' then note else remarks end,compliance=case when decision<>'pending' then 'none' else compliance end,version=version+1,updated_at=clock_timestamp() where id=p_id;
 insert into public.amcc_audit(id,loan_id,actor,changes) values(gen_random_uuid()::text,p_id,'admin',jsonb_build_object('action','attach_existing_nirnay','firebaseId',fid,'status',decision)::text);
 return public.amcc_get_shared(p_id);
end;
$$;
create or replace function public.amcc_create_shared(p_input jsonb,p_source text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare saved jsonb; prepared jsonb; match jsonb; candidate_id text; candidate_count integer;
begin
 prepared:=p_input; match:=p_input->'existingNirnay';
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


revoke all on function public.amcc_prepare_decision(),public.amcc_capture_decision(),public.amcc_create_shared_core(jsonb,text),public.amcc_attach_nirnay(text,jsonb) from public,anon,authenticated;
grant execute on function public.amcc_prepare_decision(),public.amcc_capture_decision(),public.amcc_create_shared_core(jsonb,text),public.amcc_attach_nirnay(text,jsonb) to service_role;
