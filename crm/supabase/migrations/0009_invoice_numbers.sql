-- Every payment link gets a human invoice number (MVX-INV-0001 ...) used on the PDF invoice.
create sequence if not exists public.invoice_no_seq;
alter table public.payment_links add column invoice_no int not null default nextval('public.invoice_no_seq');
alter table public.payment_links add constraint payment_links_invoice_no_key unique (invoice_no);
alter table public.payment_links add column due_date date;
