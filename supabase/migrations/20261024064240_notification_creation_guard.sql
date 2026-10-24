-- Initial remarks are part of creation, not a later change.
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
  perform set_config('amcc.notification_new_loan',chosen,true);
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

create or replace function public.amcc_capture_notification() returns trigger language plpgsql security invoker set search_path='' as $$
declare decision_changed boolean;
begin
 if new.agri_archived or current_setting('amcc.notification_new_loan',true)=new.id then return null; end if;
 decision_changed:=old.status is distinct from new.status or old.return_reason is distinct from new.return_reason or old.returned_date is distinct from new.returned_date or old.sanction_date is distinct from new.sanction_date;
 if old.remarks is distinct from new.remarks or decision_changed then
  insert into public.amcc_notifications(loan_id,branch_id,remarks_changed,remarks,decision_changed,status_changed,from_status,to_status,return_reason,returned_date,sanction_date,source_app)
  values(new.id,new.branch_id,old.remarks is distinct from new.remarks,new.remarks,decision_changed,old.status is distinct from new.status,old.status,new.status,new.return_reason,new.returned_date,new.sanction_date,
   case when current_setting('amcc.source_app',true)='nirnay' then 'nirnay' else 'agri' end);
 end if;
 return null;
end;
$$;
