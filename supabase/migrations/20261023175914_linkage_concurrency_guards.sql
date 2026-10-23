alter table public.amcc_remark_events add column request_id text;
update public.amcc_remark_events set request_id='baseline:'||id::text where request_id is null;
alter table public.amcc_remark_events alter column request_id set not null;

create or replace function public.amcc_capture_remark() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.share_eligible and ((TG_OP='INSERT' and new.remarks<>'') or (TG_OP='UPDATE' and old.remarks is distinct from new.remarks)) then
  insert into public.amcc_remark_events(loan_id,body,source_app,author,request_id) values(new.id,new.remarks,
   coalesce(nullif(current_setting('amcc.source_app',true),''),'agri'),coalesce(nullif(current_setting('amcc.author',true),''),'Agri admin'),coalesce(nullif(current_setting('amcc.request_id',true),''),gen_random_uuid()::text));
 end if;
 return null;
end;
$$;

create or replace function public.amcc_loan_json(r public.amcc_loans) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',r.id,'branchId',r.branch_id,'branchName',b.name,'category',r.category,'atsId',r.ats_id,'borrowerName',r.borrower_name,'amountPaise',r.amount_paise,'status',r.status,'remarks',r.remarks,'compliance',r.compliance,'version',r.version,'createdAt',to_char(r.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'updatedAt',to_char(r.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
 'shareEligible',r.share_eligible,'agriArchived',r.agri_archived,
 'remarkHistory',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'requestId',e.request_id,'body',e.body,'sourceApp',e.source_app,'author',e.author,'createdAt',e.created_at) order by e.created_at,e.id) from public.amcc_remark_events e where e.loan_id=r.id),'[]'::jsonb),
 'nirnay',coalesce((select jsonb_build_object('firebaseId',n.firebase_id,'data',n.data,'archived',n.archived,'version',n.version) from public.amcc_nirnay_links n where n.loan_id=r.id),'{"data":{"status":"pending"},"archived":false,"version":0}'::jsonb))
 from public.amcc_branches b where b.id=r.branch_id;
$$;

create or replace function public.amcc_create_shared(p_input jsonb,p_source text) returns jsonb language plpgsql security invoker set search_path='' as $$
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

create or replace function public.amcc_update_nirnay(p_id text,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.amcc_loans; n public.amcc_nirnay_links; d jsonb; rid text; exists_id text; amount_value bigint; branch_code text; next_branch text; canonical_change boolean;
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
 canonical_change:=amount_value<>r.amount_paise or next_branch<>r.branch_id or (d ? 'customerName' and btrim(d->>'customerName')<>r.borrower_name);
 if canonical_change and r.status<>'pending' then raise exception 'The Agri application is sanctioned; its application details cannot be changed.'; end if;
 perform set_config('amcc.request_id',rid,true);
 perform set_config('amcc.source_app','nirnay',true);
 perform set_config('amcc.author',coalesce(nullif(p_input->>'author',''),'Nirnay user'),true);
 if canonical_change or (d ? 'remarks' and btrim(d->>'remarks')<>r.remarks) then
  update public.amcc_loans set borrower_name=case when d ? 'customerName' then btrim(d->>'customerName') else borrower_name end,
   branch_id=next_branch,amount_paise=amount_value,remarks=case when d ? 'remarks' then btrim(d->>'remarks') else remarks end,
   compliance=case when d ? 'remarks' and btrim(d->>'remarks')<>remarks and status='pending' then case when btrim(d->>'remarks')='' then 'none' else 'awaiting' end else compliance end,
   version=version+1,updated_at=clock_timestamp() where id=p_id;
 end if;
 update public.amcc_nirnay_links set data=data||(d-'remarks'-'amount'-'branch'-'customerName'),archived=coalesce((p_input->>'archived')::boolean,archived),version=version+1 where loan_id=p_id;
 insert into public.amcc_shared_requests(request_id,loan_id) values(rid,p_id);
 insert into public.amcc_audit(id,loan_id,actor,changes) values(gen_random_uuid()::text,p_id,'nirnay',jsonb_build_object('action','nirnay_update','sharedStatusChanged',false,'requestId',p_input->>'requestId')::text);
 return public.amcc_get_shared(p_id);
end;
$$;

create or replace function public.amcc_mutate_loan(p_operation text,p_id text,p_version integer,p_changes jsonb,p_actor text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.amcc_loans; snapshot jsonb;
begin
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
   update public.amcc_loans set ats_id=coalesce(nullif(p_changes->>'atsId',''),ats_id),borrower_name=coalesce(p_changes->>'borrowerName',borrower_name),amount_paise=coalesce((p_changes->>'amountPaise')::bigint,amount_paise),status=coalesce(p_changes->>'status',status),remarks=coalesce(p_changes->>'remarks',remarks),compliance=coalesce(p_changes->>'compliance',compliance),version=version+1,updated_at=clock_timestamp() where id=p_id returning * into r;
   snapshot:=p_changes;
  else raise exception 'Invalid operation.'; end if;
 end if;
 insert into public.amcc_audit(id,loan_id,actor,changes) values(gen_random_uuid()::text,p_id,p_actor,snapshot::text);
 if p_operation='delete' then return jsonb_build_object('deleted',true,'id',p_id); end if;
 return public.amcc_loan_json(r);
end;
$$;
