-- Branches resubmitting a returned fresh loan update that same record instead of adding a duplicate.
-- A branch adding a New loan is shown Returned loans in its branch with the same ATS or borrower name,
-- and can choose to update one with the new ATS and amount and send it back to Pending.
alter table public.amcc_loans add column resubmitted_at timestamptz;
alter table public.amcc_push_outbox add column kind text not null default 'created' check(kind in ('created','resubmitted'));

-- Returned loans in the branch that look like the application being added: same ATS, or same borrower name.
create function public.amcc_find_returned_matches(p_branch_id text,p_ats text,p_name text) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',l.id,'atsId',coalesce(l.ats_id,''),'borrowerName',l.borrower_name,'amountPaise',l.amount_paise,'version',l.version,
  'returnedDate',l.returned_date,'returnReason',l.return_reason,
  'atsMatch',coalesce(regexp_replace(l.ats_id,'[^0-9]','','g')=regexp_replace(coalesce(p_ats,''),'[^0-9]','','g') and regexp_replace(coalesce(p_ats,''),'[^0-9]','','g')<>'',false)
 ) order by l.returned_date desc nulls last,l.id),'[]'::jsonb)
 from public.amcc_loans l
 where l.branch_id=p_branch_id and l.category='new' and l.status='returned' and not l.agri_archived
  and ((regexp_replace(coalesce(p_ats,''),'[^0-9]','','g')<>'' and regexp_replace(coalesce(l.ats_id,''),'[^0-9]','','g')=regexp_replace(p_ats,'[^0-9]','','g'))
   or public.amcc_normalize_name(l.borrower_name)=public.amcc_normalize_name(coalesce(p_name,'')));
$$;

-- Updates a returned loan with the branch's new details and sends it back to Pending, in one transaction.
-- Retries of the same save request return the same loan without changing it again.
create function public.amcc_resubmit_returned(p_id text,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.amcc_loans; rid text; existing_id text; ats text; name text; amount bigint;
begin
 rid:='create:agri:'||(p_input->>'requestId');
 if coalesce(p_input->>'requestId','')='' then raise exception 'A stable save request ID is required.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(rid,0));
 select loan_id into existing_id from public.amcc_shared_requests where request_id=rid;
 if found then
  if existing_id<>p_id then raise exception 'This save request belongs to another application.'; end if;
  return jsonb_build_object('id',p_id);
 end if;
 ats:=nullif(btrim(p_input->>'atsId'),''); name:=btrim(coalesce(p_input->>'borrowerName','')); amount:=(p_input->>'amountPaise')::bigint;
 if ats is null or name='' or amount is null or amount<=0 then raise exception 'Enter the ATS number, borrower name and amount.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('amcc-create:'||(p_input->>'branchId'),0));
 select * into r from public.amcc_loans where id=p_id and not agri_archived for update;
 if not found or r.branch_id<>p_input->>'branchId' or r.category<>'new' then raise exception 'This returned loan is no longer available. Refresh and try again.'; end if;
 if r.status<>'returned' then raise exception 'This loan is no longer Returned; it was updated by someone else. Refresh and try again.'; end if;
 if regexp_replace(coalesce(r.ats_id,''),'[^0-9]','','g')<>regexp_replace(ats,'[^0-9]','','g') and public.amcc_normalize_name(r.borrower_name)<>public.amcc_normalize_name(name) then
  raise exception 'The returned loan does not have the same ATS or borrower name. Review the records before resubmitting.';
 end if;
 if exists(select 1 from public.amcc_loans where id<>p_id and branch_id=r.branch_id and category='new' and regexp_replace(coalesce(ats_id,''),'[^0-9]','','g')=regexp_replace(ats,'[^0-9]','','g')) then
  raise exception 'This ATS number already belongs to another loan in this branch.';
 end if;
 perform set_config('amcc.request_id',rid,true);
 perform set_config('amcc.source_app','agri',true);
 perform set_config('amcc.author','Agri branch',true);
 -- The branch made this change itself, so it gets no "Updates to your loans" entry for it.
 perform set_config('amcc.notification_new_loan',p_id,true);
 update public.amcc_loans set ats_id=ats,borrower_name=name,amount_paise=amount,status='pending',resubmitted_at=clock_timestamp(),version=version+1,updated_at=clock_timestamp() where id=p_id;
 insert into public.amcc_audit(id,loan_id,actor,changes) values(gen_random_uuid()::text,p_id,'branch',jsonb_build_object('action','resubmit_returned','requestId',p_input->>'requestId',
  'previous',jsonb_build_object('atsId',r.ats_id,'borrowerName',r.borrower_name,'amountPaise',r.amount_paise,'returnReason',r.return_reason,'returnedDate',r.returned_date),
  'atsId',ats,'borrowerName',name,'amountPaise',amount)::text);
 insert into public.amcc_shared_requests(request_id,loan_id) values(rid,p_id);
 insert into public.amcc_push_outbox(loan_id,source_app,kind) values(p_id,'agri','resubmitted');
 return jsonb_build_object('id',p_id);
end;
$$;

-- Same as before, plus the alert kind so a resubmission reads differently from a new loan.
create or replace function public.amcc_claim_push_jobs() returns jsonb language plpgsql security invoker set search_path='' as $$
declare claimed jsonb;
begin
 delete from public.amcc_push_outbox where attempts>=5 or created_at<clock_timestamp()-interval '1 day';
 with picked as (
  select id from public.amcc_push_outbox where claimed_at is null or claimed_at<clock_timestamp()-interval '2 minutes'
  order by created_at,id limit 20 for update skip locked
 ), updated as (
  update public.amcc_push_outbox o set claimed_at=clock_timestamp(),attempts=o.attempts+1 from picked where o.id=picked.id returning o.*
 )
 select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'loanId',l.id,'branchName',b.name,'category',l.category,'borrowerName',l.borrower_name,'amountPaise',l.amount_paise,'sourceApp',u.source_app,'kind',u.kind) order by u.created_at,u.id),'[]'::jsonb)
  into claimed from updated u join public.amcc_loans l on l.id=u.loan_id join public.amcc_branches b on b.id=l.branch_id;
 return claimed;
end;
$$;

revoke all on function public.amcc_find_returned_matches(text,text,text),public.amcc_resubmit_returned(text,jsonb) from public,anon,authenticated;
grant execute on function public.amcc_find_returned_matches(text,text,text),public.amcc_resubmit_returned(text,jsonb) to service_role;
