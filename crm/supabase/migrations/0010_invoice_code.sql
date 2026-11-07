-- Invoice numbers in Morvix's own format: MOR-YYYY-MMDD-NN (NN = that day's invoice count, Dhaka date).
alter table public.payment_links add column invoice_code text unique;

create or replace function public.set_invoice_code() returns trigger
language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'Asia/Dhaka')::date; n int;
begin
  perform pg_advisory_xact_lock(hashtext('invoice_code'));   -- two invoices at once never get the same number
  select count(*) + 1 into n from payment_links where invoice_code like 'MOR-' || to_char(d, 'YYYY-MMDD') || '-%';
  new.invoice_code := 'MOR-' || to_char(d, 'YYYY-MMDD') || '-' || lpad(n::text, 2, '0');
  return new;
end $$;
revoke execute on function public.set_invoice_code() from public, anon, authenticated;
create trigger payment_links_invoice_code before insert on public.payment_links
  for each row when (new.invoice_code is null) execute function public.set_invoice_code();

update public.payment_links set invoice_code = 'MOR-' || to_char((created_at at time zone 'Asia/Dhaka')::date, 'YYYY-MMDD') || '-' || lpad(invoice_no::text, 2, '0')
 where invoice_code is null;
