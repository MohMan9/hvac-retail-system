# Permissions Audit

Scope: every route under `src/app/dashboard/` (including nested `admin/` and
`finance/` routes), plus the one related API route that serves invoice data
(`/api/invoices/[id]/pdf`) since it reads the same tables and has no nav
link of its own.

For each route:
- **Nav visibility** — which roles see a link to it in `dashboard/layout.tsx`.
- **Server-side check** — whether the page/action itself re-verifies the
  caller's role (or org membership), independent of the nav being hidden.
  "None" means the route currently relies only on nobody clicking a link
  they can't see, plus whatever Postgres RLS policy exists on the
  underlying table(s) — which this document does not verify (see the note
  at the end).
- **Tables** — which Supabase tables/RPCs the route reads or writes, so RLS
  policies can be checked against this list separately.

All routes require *some* authenticated session — that's enforced once, for
the whole `/dashboard/*` tree, by `src/app/dashboard/layout.tsx` (redirects
to `/signin` if there's no user or no profile row). The "Server-side check"
column below only calls out checks *beyond* that baseline.

## Summary of gaps found

1. **`/dashboard/warehouses/new` has no server-side role check at all** —
   neither the page nor `createWarehouse()` verifies the caller is a
   manager/admin. It's reachable directly by URL by any authenticated user
   (salesperson included), and the insert would only be blocked if RLS on
   `warehouses` restricts `INSERT` by role. Every other `.../new` and
   `.../edit` route in the app *does* re-check the role server-side
   (`products/new`, `products/[id]/edit`, `warehouses/[id]/edit`,
   `inventory/transfers/new`, all the `finance/*/new` routes) — this one is
   the odd one out.
2. **`completeInvoice()` (used from `/dashboard/invoices/[id]`) has no role
   check** — any authenticated org member can mark any invoice completed,
   whereas the neighboring `approveDiscounts()` action on the same page
   *is* restricted to manager/admin. This may well be intentional
   (salespeople completing their own sales), but it's an asymmetry worth a
   deliberate decision rather than an accident — flagging it rather than
   "fixing" it since I don't know the intended business rule.
3. **`/dashboard/finance/report` calls its Postgres RPC directly from the
   browser**, not through a Server Action. `report-client.tsx` is a
   `"use client"` component that calls `supabase.rpc("get_monthly_report", ...)`
   with the browser Supabase client. The page itself is gated to admins
   server-side, which stops the *page* from rendering for non-admins — but
   it does **not** stop a non-admin from calling
   `supabase.rpc('get_monthly_report', {...})` directly from the browser
   console with their own authenticated session, since the anon/authenticated
   Supabase client and its keys are inherently exposed client-side. Whatever
   authorization this needs has to live *inside* the `get_monthly_report`
   Postgres function itself (e.g. checking the caller's role before
   returning data) — worth confirming that function actually does that
   check, since the Next.js layer can't enforce it from here.

Everything else below has a real, redundant server-side check and isn't
relying on the nav link alone.

## Route-by-route

| Route | Nav shows it for | Server-side check | Tables / RPCs |
|---|---|---|---|
| `/dashboard` | not linked in nav (placeholder page) | None beyond layout auth | — |
| `/dashboard/sales` | all roles | None beyond layout auth (any authenticated role can create a draft sale) | read: `products`, `product_prices`, `customers`, `warehouses`, `services`, `organizations`; write: `invoices`, `invoice_items`, `invoice_services` |
| `/dashboard/invoices` | all roles | None beyond layout auth | read: `invoices`, `customers` |
| `/dashboard/invoices/[id]` | reached via links, not a top-level nav item | None beyond layout auth to *view*; `approveDiscounts()` checks manager/admin; `completeInvoice()` has **no role check** (see gap #2) | read: `invoices`, `customers`, `invoice_items`, `invoice_services`, `products`, `warehouses`; write: `invoices.status`, `invoice_items.discount_approved_by` |
| `/dashboard/products` | all roles | None beyond layout auth (manager/admin-only bits — Loaded Cost column, New/Edit links — are UI-only) | read: `products`, `product_prices`, `product_images`, `v_product_loaded_cost` (loaded cost only queried for manager/admin) |
| `/dashboard/products/[id]` | reached via links | None beyond layout auth | read: `products`, `product_prices`, `product_images`, `v_product_loaded_cost` |
| `/dashboard/products/new` | link shown only if manager/admin | **Yes** — page returns "Not authorized" if role isn't manager/admin; action re-checks too | read/write: `products`, `product_prices`, `product_images` (+ Storage); write: `product_costs` (admin only, re-checked in the action) |
| `/dashboard/products/[id]/edit` | link shown only if manager/admin | **Yes** — same pattern as `new` | read/write: `products`, `product_prices`; write: `product_costs` (admin only) |
| `/dashboard/customers` | all roles | None beyond layout auth (by design — customers are shared org data, all roles read/write per RLS) | read: `customers`, `invoices` (completed count) |
| `/dashboard/customers/new` | button on list, all roles | None beyond layout auth (by design) | write: `customers` |
| `/dashboard/customers/[id]` | reached via links | None beyond layout auth | read: `customers`, `invoices` |
| `/dashboard/customers/[id]/edit` | link on detail page, all roles | None beyond layout auth (by design) | write: `customers` |
| `/dashboard/inventory` | all roles | None beyond layout auth (New Transfer button is manager/admin-only UI) | read: `inventory`, `stock_transfers`, `products`, `warehouses` |
| `/dashboard/inventory/transfers/new` | link shown only if manager/admin | **Yes** | read: `products`, `warehouses`; write: `stock_transfers` (a DB trigger updates `inventory` from this) |
| `/dashboard/warehouses` | manager/admin only | **Yes** — non-manager/admin sees "Not authorized" | read: `warehouses` |
| `/dashboard/warehouses/new` | button on list (already gated), manager/admin only | **None** — see gap #1 | write: `warehouses` |
| `/dashboard/warehouses/[id]/edit` | link on list rows (already gated) | **Yes** | write: `warehouses` |
| `/dashboard/admin` | admin only | **Yes** — non-admin sees "Not authorized"; `createUser`/`updateUserRole`/`toggleUserActive` all re-check admin server-side via the session client before using the service-role client | read/write: `profiles`; write: `auth.users` (via `auth.admin.*`, service-role client) |
| `/dashboard/finance/services` | manager/admin only | **Yes** | read: `services` |
| `/dashboard/finance/services/new` | button on list (gated) | **Yes** | write: `services` |
| `/dashboard/finance/expenses` | admin only | **Yes** | read: `expenses` |
| `/dashboard/finance/expenses/new` | button on list (gated) | **Yes** | write: `expenses` |
| `/dashboard/finance/partners` | admin only | **Yes** | read: `partners` |
| `/dashboard/finance/partners/new` | button on list (gated) | **Yes** | write: `partners` |
| `/dashboard/finance/report` | admin only | **Yes** for the page itself; **No** for the underlying RPC call (see gap #3) | RPC: `get_monthly_report` (called client-side) |
| `/api/invoices/[id]/pdf` (not in nav) | reached via a link on completed invoices | Auth only — any authenticated org member can download any invoice in their org, same as the invoice detail page's own access model | read: `invoices`, `organizations`, `customers`, `invoice_items`, `invoice_services`, `products` |

## What this document doesn't verify

This is a static read of the Next.js application code only — it does not
inspect the actual Postgres RLS policies. Several rows above say "None
beyond layout auth (by design)" because an earlier task explicitly said RLS
is the real enforcement layer for that table (e.g. `customers`) and the app
code intentionally doesn't duplicate the check. That's only actually safe if
the RLS policy matches what's assumed here — this document should be
cross-checked against the real policies on `warehouses`, `customers`,
`invoices`, `stock_transfers`, and the `get_monthly_report` function
specifically, since those are the ones this audit had to take on faith.
