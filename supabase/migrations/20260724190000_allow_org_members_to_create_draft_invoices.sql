begin;

-- Creating a sale is available to every authenticated organization member in
-- the application, not only to users whose profile role is "salesperson".
-- Keep the policy narrow: callers may create only a draft assigned to
-- themselves and only inside their own organization.
alter table public.invoices enable row level security;

drop policy if exists "active org members can create their own draft invoices"
on public.invoices;

create policy "active org members can create their own draft invoices"
on public.invoices
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and salesperson_id = (select auth.uid())
  and organization_id = (select public.current_org_id())
  and status = 'draft'
  and exists (
    select 1
    from public.profiles as caller
    where caller.id = (select auth.uid())
      and caller.organization_id = invoices.organization_id
      and caller.is_active is true
  )
);

commit;
