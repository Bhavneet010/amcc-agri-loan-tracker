-- Case formatting is not a canonical name edit. Clearing a remark retains its history event.
create or replace function public.amcc_prepare_shared() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP='INSERT' and new.category='new' and new.status='pending' and (select enabled from public.amcc_linkage_config where id) then new.share_eligible:=true; end if;
 return new;
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
 canonical_change:=amount_value<>r.amount_paise or next_branch<>r.branch_id or (d ? 'customerName' and public.amcc_normalize_name(d->>'customerName')<>public.amcc_normalize_name(r.borrower_name));
 if canonical_change and r.status<>'pending' then raise exception 'The Agri application is sanctioned; its application details cannot be changed.'; end if;
 perform set_config('amcc.request_id',rid,true);
 perform set_config('amcc.source_app','nirnay',true);
 perform set_config('amcc.author',coalesce(nullif(p_input->>'author',''),'Nirnay user'),true);
 if canonical_change or (d ? 'remarks' and btrim(d->>'remarks')<>r.remarks) then
  update public.amcc_loans set borrower_name=case when d ? 'customerName' and public.amcc_normalize_name(d->>'customerName')<>public.amcc_normalize_name(borrower_name) then btrim(d->>'customerName') else borrower_name end,
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
