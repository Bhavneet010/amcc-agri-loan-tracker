-- Shared deletion and restoration use one visibility state in both apps.
create function public.amcc_set_shared_visibility(p_id text,p_archived boolean) returns void language plpgsql security invoker set search_path='' as $$
declare r public.amcc_loans;
begin
 if p_archived is null then raise exception 'Choose whether to delete or restore the loan.'; end if;
 -- All callers acquire the canonical loan before its Nirnay link.
 select * into r from public.amcc_loans where id=p_id and share_eligible for update;
 if not found then raise exception 'Shared loan not found.'; end if;
 update public.amcc_loans set agri_archived=p_archived,version=version+1,updated_at=clock_timestamp() where id=p_id and agri_archived is distinct from p_archived;
 insert into public.amcc_nirnay_links(loan_id,data,archived) values(p_id,jsonb_build_object('status',r.status,'returnedDate',r.returned_date,'sanctionDate',r.sanction_date),p_archived)
  on conflict(loan_id) do update set archived=excluded.archived,version=amcc_nirnay_links.version+1 where amcc_nirnay_links.archived is distinct from excluded.archived;
end;
$$;
revoke all on function public.amcc_set_shared_visibility(text,boolean) from public,anon,authenticated;
grant execute on function public.amcc_set_shared_visibility(text,boolean) to service_role;


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
   snapshot:=public.amcc_loan_json(r)||jsonb_build_object('action',case when r.share_eligible then 'delete_shared' else 'delete' end);
   if r.share_eligible then perform public.amcc_set_shared_visibility(p_id,true);
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
 if p_input ? 'archived' then perform public.amcc_set_shared_visibility(p_id,(p_input->>'archived')::boolean); end if;
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
 perform 1 from public.amcc_loans where id=chosen for update;
 if p_source='nirnay' then
  insert into public.amcc_nirnay_links(loan_id,data) values(chosen,coalesce(p_input->'nirnayData','{}'::jsonb)-'remarks'-'amount'-'branch'-'customerName'||'{"status":"pending"}'::jsonb) on conflict(loan_id) do nothing;
 end if;
 perform public.amcc_set_shared_visibility(chosen,false);
 note:=nullif(btrim(p_input->>'remarks'),'');
 if note is not null and (select remarks from public.amcc_loans where id=chosen) is distinct from note then
  update public.amcc_loans set remarks=note,compliance=case when status='pending' then 'awaiting' else 'none' end,version=version+1,updated_at=clock_timestamp() where id=chosen;
 end if;
 insert into public.amcc_shared_requests(request_id,loan_id) values(rid,chosen);
 return public.amcc_get_shared(chosen);
end;
$$;

-- Honor either prior deletion; do not resurface an app-local deleted record.
do $$
declare q_id text;
begin
 for q_id in select l.id from public.amcc_loans l left join public.amcc_nirnay_links n on n.loan_id=l.id
  where l.share_eligible and (l.agri_archived or coalesce(n.archived,false)) and (l.agri_archived is distinct from n.archived or n.loan_id is null)
 loop perform public.amcc_set_shared_visibility(q_id,true); end loop;
end;
$$;
