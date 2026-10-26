-- Renewals above ₹2 lakh record whether the branch uploaded charge details for revenue records.
-- The image lives in a private bucket and is removed by the API once the loan is sanctioned.
create table public.amcc_charge_details (
  loan_id text primary key references public.amcc_loans(id) on delete cascade,
  choice text not null check (choice in ('yes','no')),
  image_path text check (image_path is null or length(image_path) between 1 and 200),
  image_bytes integer check (image_bytes is null or image_bytes > 0),
  uploaded_at timestamptz,
  updated_at timestamptz not null default now(),
  check (choice = 'yes' or image_path is null)
);
alter table public.amcc_charge_details enable row level security;
revoke all on public.amcc_charge_details from anon, authenticated;
grant all on public.amcc_charge_details to service_role;
create trigger amcc_charge_details_changed after insert or update or delete on public.amcc_charge_details for each statement execute function public.amcc_signal_change();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('amcc-charge-details', 'amcc-charge-details', false, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
