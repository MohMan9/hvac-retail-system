# Pre-Launch Audit Report — hvac-retail-system

Date: 2026-07-12
Scope: full static read of the application source (all routes, Server Actions, components, i18n, PDF pipeline), plus `npm run build` / `npm run lint` verification. **No Postgres schema/RLS/trigger SQL exists in this repo**, so every database-side assumption the app makes is flagged below as *verify-in-DB* rather than assumed safe. Findings only — nothing has been fixed.

Build status: `npm run build` passes cleanly (exit 0, no warnings).
Lint status: `npm run lint` **fails** — 1 error, 3 warnings (see §4.1).

---

## 1. SECURITY

### 1.1 — Deactivated accounts retain full access
- **Files:** `src/app/signin/actions.ts:36-39`, `src/app/dashboard/layout.tsx:20-28`, `src/app/dashboard/admin/actions.ts:132-159` (`toggleUserActive`)
- **Severity: Critical**
- `is_active` is enforced in exactly one place: the sign-in Server Action, which signs the user back out after password auth. Nothing else checks it:
  - `dashboard/layout.tsx` fetches only `role, full_name` — a deactivated user with a live session keeps using the entire app until their token naturally expires.
  - `toggleUserActive` flips the profile flag but does not revoke sessions or ban the auth user, so deactivation has no effect on someone currently signed in.
  - The Supabase anon key is public by design; a deactivated employee can call `supabase.auth.signInWithPassword` from a browser console, get a valid session, and hit every RLS-protected table directly — bypassing the sign-in form entirely. Unless every RLS policy independently checks `profiles.is_active` (*verify-in-DB*; nothing in the app suggests it), deactivation is cosmetic.
- **Fix:** (a) re-check `is_active` in `dashboard/layout.tsx` and sign out/redirect; (b) in `toggleUserActive`, also ban the auth user via `adminClient.auth.admin.updateUserById(userId, { ban_duration: "876600h" })` (and un-ban on reactivate) so existing refresh tokens die; (c) ideally add `is_active` to the RLS helper the policies use.

### 1.2 — `createStockTransfer` has no role re-check and no input validation
- **File:** `src/app/dashboard/inventory/transfers/new/actions.ts`
- **Severity: High**
- The transfers **page** correctly gates on manager/admin, but the Server Action only checks "authenticated with a profile". Its sibling `createWarehouse` re-checks the role with an explicit comment that "the page check alone doesn't stop a direct call" — this action is missing the same guard, so a salesperson can invoke it directly and write arbitrary `stock_transfers` rows (which the DB trigger turns into inventory changes: fake external stock-in, stock-out, transfers). This is the exact class of gap the last permissions audit found on `warehouses/new` — that one was fixed, this one was not.
- Additionally: `quantity` is `Number(formData.get("quantity"))` with **no** check for NaN / zero / negative, `product_id` is not checked non-empty, and both warehouses may be null simultaneously (a meaningless "external → external" row). Whether the trigger rejects negatives is *verify-in-DB*.
- **Fix:** add the same manager/admin re-check as `createWarehouse`; validate `Number.isFinite(quantity) && quantity > 0`, non-empty `product_id`, and at least one of from/to warehouse set. Confirm RLS on `stock_transfers` restricts INSERT by role regardless.

### 1.3 — `completeInvoice` has no role/ownership check and no draft-status guard
- **File:** `src/app/dashboard/invoices/[id]/actions.ts:160-180`
- **Severity: High**
- Known gap #2 from `PERMISSIONS_AUDIT.md`, still unresolved: any authenticated org member can complete **any** invoice, including another salesperson's. Neighbouring actions on the same invoice (`updateInvoiceItem`, `removeInvoiceItem`) enforce "manager/admin or the invoice's own salesperson" via `loadEditableInvoice` — completion, the most consequential action (deducts stock, locks the invoice), enforces nothing.
- It also doesn't filter on `status = 'draft'`. If the completion trigger fires on any UPDATE that sets `status='completed'` without comparing `OLD.status` (*verify-in-DB*), two concurrent completions (two tabs, two users) would insert the stock-deduction `stock_transfers` rows twice.
- **Fix:** reuse `loadEditableInvoice` (or at least add `.eq("status", "draft")` to the UPDATE and the same canEdit check). Verify the trigger guards on `OLD.status IS DISTINCT FROM NEW.status`.

### 1.4 — Editing an approved discount does not reset the approval
- **File:** `src/app/dashboard/invoices/[id]/actions.ts:280-371` (`updateInvoiceItem`)
- **Severity: High**
- The action resets a **rejected** discount back to pending when the amount changes (`shouldResetRejection`), but there is no equivalent for an **approved** one: `discount_approved_by` is left untouched when `line_discount` changes. A salesperson can request a 1₪ discount, get it approved, then edit the line to a 500₪ discount — the item still reads "approved" and the completion trigger will let the invoice through. Unless a DB trigger clears `discount_approved_by` when `line_discount` changes (*verify-in-DB* — the brief only describes triggers protecting *who sets* the approval columns), this is a working bypass of the entire approval workflow.
- **Fix:** in `updateInvoiceItem`, when `discountChanged && item.discount_approved_by`, clear `discount_approved_by` and send a fresh `notifyDiscountRequested`. (Belt-and-braces: also do it in the DB trigger.)

### 1.5 — Approve/reject can produce contradictory state and act on stale/completed invoices
- **File:** `src/app/dashboard/invoices/[id]/actions.ts:70-158`
- **Severity: Medium**
- `approveDiscount` does not clear `discount_rejected_by` (and `rejectDiscount` does not clear `discount_approved_by`). Manager A rejects; Manager B later approves from a stale notification → the row has **both** columns set. `DiscountBadge` shows "Approved" (approved is checked first), the rejection timestamp remains, and the completion trigger's behaviour on that state is anyone's guess (*verify-in-DB*). Neither action checks whether a decision was already made, nor whether the parent invoice is still a draft — decisions can land on completed invoices.
- **Fix:** in each action, null the opposing column, and bail out with a clear error if the item is already decided or the invoice is not a draft.

### 1.6 — RPCs callable directly from the browser must self-authorize (unverifiable from repo)
- **Files:** `src/app/dashboard/finance/report/report-client.tsx:99` (`get_monthly_report`), `src/app/dashboard/finance/register/actions.ts:26,70` (`open_cash_session`, `close_cash_session`)
- **Severity: Medium (verify-in-DB)**
- `get_monthly_report` is invoked from a `"use client"` component with the browser client — the admin gate on the page does not stop a salesperson calling the RPC from the console (known gap #3; the project brief says the function checks admin internally, but with no SQL in the repo this cannot be confirmed). The same reasoning applies to `open_cash_session`/`close_cash_session`: the Server Actions check manager/admin before calling, but the functions themselves are exposed to any authenticated session via PostgREST. If they don't re-check the caller's role internally, a salesperson can open/close the register directly.
- **Fix:** confirm all three functions internally verify the caller's role (and org). Keep the SQL for these functions checked into the repo so future audits can verify instead of trusting.

### 1.7 — Loaded cost shown to managers, but spec says cost data is admin-only
- **Files:** `src/app/dashboard/products/page.tsx:105-115, 227-231`, `src/app/dashboard/products/[id]/page.tsx:78-84`
- **Severity: Medium (verify-in-DB)**
- The role model says only **admin** sees cost/profit data, and `product_costs` is admin-only. But the products list and product detail query `v_product_loaded_cost` and render the "Loaded Cost" column for `canManage` (manager **or** admin). Either the view's baked-in role filter admits managers (spec violation — managers can derive `landed_cost`, i.e., factory+shipping+customs), or it's admin-only and managers see a permanently empty column (broken UI). One of the two is wrong.
- **Fix:** decide the intended rule; if admin-only, change both pages to `isAdmin` and confirm the view's WHERE clause matches.

### 1.8 — Notifications INSERT policy is necessarily permissive
- **Files:** `src/lib/notifications.ts`, notifications RLS (*verify-in-DB*)
- **Severity: Low**
- Discount-request notifications are inserted with the **salesperson's own session** for other users' `recipient_id`s, so the INSERT policy cannot be recipient-scoped — meaning any org member can insert arbitrary notifications (e.g., a fake "discount_approved") for anyone in the org. The approval state itself is trigger-protected, so this is spoofable UI noise, not privilege escalation — but a manager acting on a forged "request" modal is a social-engineering vector.
- **Fix:** either insert notifications from a `SECURITY DEFINER` function / service-role path with the caller verified, or constrain the INSERT policy (e.g., only allow `type='discount_request'` rows referencing an invoice item the inserter owns).

### 1.9 — Product images are on a public bucket
- **Files:** `src/lib/product-images.ts`, `src/app/dashboard/products/page.tsx:184-187` (`getPublicUrl`)
- **Severity: Low**
- Images resolve via `getPublicUrl`, so the bucket must be public: anyone with a URL (guessable as `org_id/product_id/filename`) can fetch images without auth. Acceptable for product photos, but contradicts the otherwise strict org-scoping; note it as a conscious decision or switch to signed URLs.

### 1.10 — Small admin-action hardening gaps
- **File:** `src/app/dashboard/admin/actions.ts`
- **Severity: Low**
- `createUser` / `updateUserRole` accept the `role` string without validating it against the enum (DB enum is the only backstop; the raw Postgres error would surface to the UI). Password policy is only the client-side `minLength={6}`. `updateUserRole` lets an admin change **their own** role (self-demotion → possible lockout if they're the last admin) while `toggleUserActive` explicitly blocks self-deactivation — inconsistent guard.
- **Fix:** whitelist `role ∈ {salesperson, manager, admin}` server-side, block self-role-change (or at least last-admin demotion), validate password length server-side.

### 1.11 — Verified-good items (for the record)
- Service-role client (`admin.ts`) is imported **only** by `dashboard/admin/actions.ts`, always after a session-client admin check. Never referenced from client code. ✔
- `.or()` filter injection: all three free-text search pages (`products`, `customers`, `invoices`) run input through `sanitizeSearchTerm` (strips `, ( )`); the `warehouses/[id]` `.or()` uses a DB-sourced UUID, and the `customer_id.in.(...)` list is built from DB-returned ids. ✔
- The PDF route authenticates and org-scopes the invoice. ✔ (Minor: it also serves *draft* invoices if the URL is typed manually — UI only links it for completed ones.)
- Every `finance/*`, `admin`, `warehouses*`, `products/new|edit`, `transfers/new` **page** has a real server-side role check; `warehouses/new` (old gap #1) is fixed at both page and action level. ✔

---

## 2. FUNCTIONAL BUGS

### 2.1 — Adding/raising a discount on an existing draft line never notifies managers
- **File:** `src/app/dashboard/invoices/[id]/actions.ts:349-367` (`updateInvoiceItem`)
- **Severity: High**
- `notifyDiscountRequested` fires only when `shouldResetRejection` (a previously-**rejected** discount was edited). If a salesperson edits a line whose discount was never rejected — most commonly changing `0 → 10` on the invoice detail page — no notification is created. The invoice is then stuck: the completion trigger blocks it as "unapproved discount", and no manager was ever told. (New-invoice discounts via `saveDraftInvoice` and new lines via `addInvoiceItem` do notify — only the edit path is broken.)
- **Fix:** notify whenever the edit leaves the line with a pending discount (`line_discount > 0` and not approved), not only after a rejection reset.

### 2.2 — Selecting a customer doesn't reprice the cart
- **File:** `src/app/dashboard/sales/SaleForm.tsx:226-239` vs `241-249`
- **Severity: High**
- `handleTierChange` (manual tier dropdown) rewrites every cart line's `unitPrice` to the new tier's price. `handleCustomerChange` / `handleCustomerCreated` set `appliedTier` **without** repricing. Sequence: scan 5 items as walk-in (retail prices) → pick a wholesale customer → invoice is saved as `applied_tier: "wholesale"` with retail unit prices. The daily flow (scan first, pick customer at the end) hits this every time.
- **Fix:** apply the same cart remap in `handleCustomerChange`/`handleCustomerCreated` (with care not to clobber deliberately hand-edited prices — e.g., only remap lines still at the old tier's list price).

### 2.3 — Dates are computed in UTC, not local (Palestine = UTC+2/+3)
- **Files:** `src/app/dashboard/sales/SaleForm.tsx:367` (`sale_date`), `src/app/dashboard/page.tsx:68,132-134` (today/month stats), `src/app/dashboard/inventory/transfers/new/transfer-form.tsx:22`, `src/app/dashboard/finance/expenses/new/expense-form.tsx:29`, `report-client.tsx:83` (default month)
- **Severity: Medium**
- All use `new Date().toISOString().slice(0, 10)`. Between local midnight and UTC midnight (00:00–02:00/03:00 local), sales are stamped with **yesterday's** date, the dashboard "today" totals query the wrong day, and on the 1st of the month the admin month-to-date stat can query the previous month. A shop open late will record post-midnight sales on the wrong day systematically.
- **Fix:** derive dates in the shop's timezone (e.g., `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Hebron' })` or a small helper) everywhere a calendar date is produced; ideally store the org timezone.

### 2.4 — Cash-session window is based on invoice `created_at`, and completed-while-closed cash is orphaned
- **Files:** `src/app/dashboard/finance/register/page.tsx:49-60`; `close_cash_session` RPC (*verify-in-DB*)
- **Severity: Medium**
- The running-total preview counts completed cash invoices with `created_at >= opened_at`. But `created_at` is the *draft creation* time, not the completion (payment) time: a draft created at 08:00, register opened 09:00, completed (paid) 10:00 is **excluded** from expected cash even though the money is in the drawer. If the RPC uses the same predicate the official expected-cash is wrong the same way; if it doesn't, preview and RPC disagree. Separately, nothing prevents completing a cash invoice while **no session is open** — that cash belongs to no session window and will never be "expected" at any close, silently absorbing drawer discrepancies.
- **Fix:** stamp a `completed_at` on completion and window on that; decide the business rule for cash completions while the register is closed (block, or warn) — the sidebar comment says salespeople "need to know before taking cash sales", but the system never enforces it.

### 2.5 — Multi-step writes aren't transactional; failures leave partial data with no cleanup path
- **Files:** `src/app/dashboard/sales/actions.ts:108-207` (`saveDraftInvoice`), `src/app/dashboard/products/new/actions.ts` (`createProduct`)
- **Severity: Medium**
- `saveDraftInvoice` inserts the invoice header, then items, then services with separate calls. If items fail, an orphaned header (with totals but no lines) persists — and since services are only inserted after items, a mid-flight failure can also drop service lines. The error text admits it ("Invoice was created, but product lines failed to save"), but there is **no UI to delete a draft invoice**, so these orphans are permanent and show up in lists/reports of drafts. `createProduct` has the same shape (product → images → prices → costs → initial stock), partially mitigated by explicit follow-up messages.
- **Fix:** move invoice creation into a single Postgres function (one transaction), or add a delete/void action for empty drafts. Same for product+price creation.

### 2.6 — `updateProduct` silently no-ops pricing when the price row is missing
- **File:** `src/app/dashboard/products/[id]/edit/actions.ts:68-83`
- **Severity: Medium**
- Pricing uses `.update(...).eq("product_id", ...)` — if the product never got its `product_prices` row (the exact partial-failure case `createProduct` warns about, telling the user to "Edit the product to add pricing"), the UPDATE matches 0 rows, returns no error, and the action redirects as success. The advertised recovery path doesn't work. The cost section directly below handles this correctly with a select-then-insert-or-update.
- **Fix:** upsert (`.upsert()` on `product_id`) or use the same existing-row check as costs.

### 2.7 — Line discounts may exceed the line amount → negative line totals
- **Files:** `src/app/dashboard/invoices/[id]/actions.ts:290,319,463`, `src/app/dashboard/sales/actions.ts:64-78`
- **Severity: Medium**
- Validation only requires `line_discount >= 0`; nothing caps it at `quantity × unit_price`. A 10₪ line with a 100₪ discount yields `line_total = -90` stored in the DB. The invoice-level VAT base is clamped (`Math.max(subtotal - discountTotal, 0)`) so the grand total floors at 0, but per-line totals and the printed PDF show negative lines, and `discount_total` can exceed `subtotal` on the record.
- **Fix:** validate `line_discount <= quantity * unit_price` in `saveDraftInvoice`, `addInvoiceItem`, `updateInvoiceItem`.

### 2.8 — Arabic text in the PDF renders only for product names
- **File:** `src/app/api/invoices/[id]/pdf/invoice-document.tsx`
- **Severity: Medium**
- The `NotoNaskhArabic` font is applied **only** to `productNameAr` (`styles.arabic`). `organizationName`, `customerName`, and service `description` render in Roboto, which has no Arabic glyphs — for a Palestinian shop, most customer names and service descriptions are Arabic and will render as blank/tofu boxes on the printed invoice. (The textkit patch fixes glyph slicing, not font coverage.)
- **Fix:** register a font family with fallback (react-pdf supports `Font.register({ family, fonts: [...] })` + per-Text styling), or apply the Arabic font to every field that can contain Arabic — header fields and service descriptions at minimum.

### 2.9 — An invoice can be completed with zero lines
- **Files:** `src/app/dashboard/invoices/[id]/actions.ts:373-420` (`removeInvoiceItem`), `completeInvoice`
- **Severity: Low**
- `saveDraftInvoice` refuses an empty sale, but on the draft page every line (items and there's no such guard when removing: delete all lines from a draft, then Complete — nothing checks the invoice still has content, so a 0.00 completed invoice is minted (consuming an invoice number, appearing in reports).
- **Fix:** in `completeInvoice`, verify at least one item or service row exists.

### 2.10 — Register close input edge cases
- **Files:** `src/app/dashboard/finance/register/actions.ts:49-82`, `register-client.tsx:229-250`
- **Severity: Low**
- The client validates the counted amount (`isFinite && >= 0`) but the Server Action does not — a direct call can pass `NaN`/negative to the RPC (behaviour *verify-in-DB*). Notes length is unbounded. Also `closeRegister` surfaces raw Postgres error messages (English) to the cashier.
- **Fix:** mirror the client validation server-side.

### 2.11 — Low-stock list misses products with no inventory rows
- **File:** `src/app/dashboard/page.tsx:95-127`
- **Severity: Low**
- The low-stock computation iterates `inventory` rows only. A product that has never had a stock transfer (or whose rows live in zero warehouses) has no rows at all and never appears — yet "0 in stock, never stocked" is exactly what a manager wants surfaced. Products sold down via invoices keep their rows (quantity 0) so they do appear; only never-stocked/new products are invisible.
- **Fix:** left-join from `products` (or fetch product ids and treat missing as 0).

### 2.12 — Notifications sent to inactive managers; requester can self-notify
- **File:** `src/lib/notifications.ts:25-29`
- **Severity: Low**
- `notifyDiscountRequested` selects all manager/admin profiles without filtering `is_active`, so deactivated staff accumulate unread notifications (and, per §1.1, can still read them). A manager making their own discounted sale also notifies themself.
- **Fix:** add `.eq("is_active", true)` and `.neq("id", requesterId)`.

### 2.13 — Clearing admin cost fields on product edit silently keeps old values
- **File:** `src/app/dashboard/products/[id]/edit/actions.ts:92`
- **Severity: Low**
- `if (factoryRaw || shippingRaw || customsRaw)` — if the admin blanks all three fields to remove costs, the block is skipped and the previous costs persist while the form suggested they were cleared.
- **Fix:** distinguish "fields absent" from "fields empty" (the form always submits them), or treat empty as explicit 0 when a cost row exists.

### 2.14 — Return-shape convention: verified, with two soft spots
- **Severity: Low**
- All Server Actions return `{ success, error }` (or redirect on success) — the convention holds everywhere, including the newer register/notification code. ✔ Two caveats: (a) `saveDraftInvoice`'s discount-notification loop and `approve/rejectDiscount`'s `notifyDiscountDecision` calls are un-awaited-error-checked inserts — a thrown network error there would escape as an unhandled exception rather than `{ success: false }` (Supabase returns errors rather than throwing, so this is mostly theoretical); (b) `signIn` returns the **raw** Supabase error message (English, sometimes technical) straight to the sign-in screen.

---

## 3. UX / DESIGN CONSISTENCY

### 3.1 — The root route `/` is still the create-next-app boilerplate
- **File:** `src/app/page.tsx`
- **Severity: High**
- Visiting the bare domain shows the untouched Next.js starter page (Next/Vercel logos, "To get started, edit the page.tsx file", dark-mode styles that match nothing else). This is the first URL a client will type.
- **Fix:** replace with a redirect to `/dashboard` (the layout already bounces unauthenticated users to `/signin`).

### 3.2 — Hardcoded English strings in user-facing UI (bilingual app)
- **Severity: Medium** (each individually small; collectively this is the most visible polish gap for an Arabic-first user)
- Confirmed instances:
  - `src/app/dashboard/notifications-bell.tsx:45-56` — the entire notification sentence ("X requested a 5.00 discount on Y — invoice Z", "approved/rejected your … discount") is built in English regardless of locale; also `"Missing invoice item reference."` (line 249).
  - `src/lib/format-relative-time.ts` — "just now", "N minutes ago", … (feeds the bell).
  - `src/app/dashboard/sales/SaleForm.tsx:287,346,352` — "No product found for barcode …", "Add at least one product or service before saving.", "Choose a warehouse for every product line."
  - `src/app/dashboard/invoices/[id]/DraftInvoiceItems.tsx:205` — same barcode message duplicated.
  - `src/app/dashboard/inventory/transfers/new/transfer-form.tsx:31` — "From and To warehouse cannot be the same." (also duplicated in the action).
  - `src/app/dashboard/admin/admin-form.tsx:25` — `Error: ${…}` prefix.
  - Success messages passed through redirect query strings: "Warehouse created." (`warehouses/new/actions.ts:47`), "Expense created." (`expenses/actions.ts:43`), "Product created." + image/stock failure sentences (`products/new/actions.ts:162-192`).
  - `src/components/ui/quantity-stepper.tsx:34,52` — aria-labels "Decrease/Increase quantity".
  - **Systemic:** every Server Action error string ("Not authenticated", "Only managers and admins can …", "Invoice not found", raw `error.message` from Postgres/Supabase) is English and rendered verbatim in the UI. For a non-technical Arabic-speaking cashier these are unreadable.
- **Fix:** route user-facing strings through the dictionary; for Server Actions return stable error **codes** and translate client-side (also fixes the URL-encoded-English-in-querystring pattern).

### 3.3 — Bilingual names displayed English-first (or English-only) everywhere
- **Severity: Medium**
- The display convention is `name_en || name_ar` regardless of locale (`invoices/[id]/page.tsx`, `dashboard/page.tsx` low-stock, `SaleForm`, `DraftInvoiceItems`, `transfer-form`, `warehouses/[id]/page.tsx`, PDF route, notifications payloads, `products/page.tsx`…). Arabic UI users see English product names whenever one exists. Worse:
  - `src/app/dashboard/inventory/page.tsx:37,100` selects **only** `products(name_en)` / `warehouses(name_en)` — since `name_en` is optional on products, Arabic-only products show a **blank** product cell in the inventory table.
  - Warehouse dropdowns/tables everywhere (`SaleForm`, `DraftInvoiceItems`, `transfer-form`, sales page, warehouses list) select only `name_en`, even though warehouses have a required `name_ar` that is never displayed anywhere except the warehouse edit form.
  - `services` select in `SaleForm` shows `name_en || name_ar` while the services admin table shows both.
- **Fix:** a shared `displayName(entity, locale)` helper (`locale === "ar" ? name_ar || name_en : name_en || name_ar`) and always select both name columns.

### 3.4 — Raw ISO timestamps shown to users
- **Files:** `src/app/dashboard/finance/register/register-client.tsx:115,169-174` (status line + history table), `report-client.tsx:381-386` (cash sessions detail)
- **Severity: Medium**
- `opened_at`/`closed_at` render as `2026-07-12T08:23:45.123456+00:00` — in UTC, not local time, and unformatted. A cashier reconciling the drawer can't read this.
- **Fix:** format with `Intl.DateTimeFormat(locale, { timeZone: 'Asia/Hebron', dateStyle: 'short', timeStyle: 'short' })`.

### 3.5 — No nav link back to the dashboard homepage
- **File:** `src/app/dashboard/sidebar.tsx`
- **Severity: Medium**
- `/dashboard` is now a real homepage (greeting, today's sales, register status, low stock) but no sidebar group links to it and the logo/app-name block is not a link. After the first click anywhere, the homepage is unreachable except by editing the URL.
- **Fix:** make the logo block a `<Link href="/dashboard">` or add a "Home/Overview" nav item.

### 3.6 — Register page has no topbar title
- **File:** `src/lib/nav-title.ts`
- **Severity: Low**
- `exactTitles` has no entry for `/dashboard/finance/register` and no `finance/` fallback, so the topbar shows the app name on that page while every sibling shows its own title. (`finance.register.title` exists in the dictionaries — it's just not mapped.)

### 3.7 — Success-message pattern is inconsistent across the create flows
- **Severity: Low**
- `warehouses/new`, `expenses/new`, `products/new` redirect with a translated-nowhere `?message=` banner; `partners/new`, `services/new`, `customers/new`, `transfers/new` redirect with **no** feedback at all (and the partners/services list pages don't even render a `message` param). Users get confirmation on some creates and silence on others.
- **Fix:** pick one pattern (e.g., a locale-keyed `?created=1` flag each list page translates) and apply it to all seven.

### 3.8 — Assorted small inconsistencies
- **Severity: Low**
  - `admin-form.tsx:61`: error message rendered in `text-slate-600` (same style as success) instead of red like every other form; the form isn't reset after a successful create.
  - `DraftInvoiceItems.tsx:152`: native `window.confirm` for row removal, while every other confirmation in the app is a styled modal.
  - Row-click affordance: `customers` and `warehouses` lists use `ClickableRow`; `products` and `invoices` lists don't (link on one cell only).
  - `products/[id]/page.tsx:163`: warranty renders as "— months" when null.
  - Register history / report detail tables are hard-capped (10 rows / current month) with no pagination — fine now, worth a note for a year of data.
  - Root layout loads **Inter with `latin` subset only**; all Arabic text falls back to system fonts, so the flagship design font effectively doesn't apply to the primary language. Consider pairing an Arabic font (e.g., IBM Plex Sans Arabic / Noto Naskh) via `next/font` and `--font-sans`.
  - `report-client.tsx` expense categories in `expenses_by_category` come back as raw enum keys from the RPC (`electricity`, `fixed_setup`) — the detail table translates them (`finance.report` tables reuse `categoryKeys`? No — `report-client.tsx:190-196` renders `{category}` raw). Verify RPC output vs the translated expense page.
- **RTL check:** no physical `ml-/mr-/pl-/pr-/left-/right-` utilities anywhere; logical `ms/me/ps/pe/start/end` used consistently. ✔ `dir="ltr"` islands for numbers/dates applied consistently. ✔ "Not authorized" wording/punctuation is uniform across all 8 dictionary entries. ✔

---

## 4. CODE QUALITY

### 4.1 — `npm run lint` fails (1 error, 3 warnings)
- **Severity: Medium**
  - **Error** — `src/app/dashboard/sales/SaleForm.tsx:130` `react-hooks/set-state-in-effect`: the sessionStorage draft-restore calls `setCart`/etc. synchronously in an effect. Works, but fails the lint gate; restructure (lazy `useState` initializer reading sessionStorage, or `useSyncExternalStore`) or suppress deliberately.
  - **Warnings** — `@next/next/no-img-element` in `products/page.tsx:198` and `products/[id]/page.tsx:116` (plain `<img>` for Supabase-hosted images; either switch to `next/image` with `remotePatterns` or suppress consciously); `sales/page.tsx:9` — `dict` assigned but never used (dead fetch of the dictionary).
- `npm run build` itself passes with zero errors/warnings. ✔

### 4.2 — Deprecated `middleware.ts` convention (Next 16)
- **File:** `middleware.ts`
- **Severity: Medium**
- Next 16 renamed the convention: "The `middleware` filename is deprecated, and has been renamed to `proxy`" (`node_modules/next/dist/docs/…/upgrading/version-16.md`). The build still accepts it (labels it "ƒ Proxy (Middleware)"), but this is on the removal path and the repo's own AGENTS.md warns to heed deprecation notices.
- **Fix:** rename to `proxy.ts`, export `proxy()` (the edge runtime isn't used here, so the nodejs-only constraint of `proxy` is fine).

### 4.3 — Schema-drift compensation hacks left in production code
- **Files:** `src/app/dashboard/admin/actions.ts:61-70`, `src/app/dashboard/admin/page.tsx:41-59`, `src/lib/product-images.ts:1` (`PRODUCT_IMAGE_BUCKETS` dual-bucket probe), `src/app/dashboard/products/new/actions.ts:77-91`
- **Severity: Low**
- Regex-matching Postgres error text to detect a missing `profiles.email` column, and try-each-bucket upload loops for `product-images` vs `product_images`, are workarounds for an unmigrated dev database. Against the production schema exactly one branch is live; the others are dead weight that masks real errors (a genuine storage failure now surfaces as a two-bucket error concatenation).
- **Fix:** settle the schema (add the email column; keep one bucket), then delete the fallbacks. Check the actual production values before deleting.

### 4.4 — Duplicated logic that should be shared helpers
- **Severity: Low**
  - The "authenticate → fetch profile → role check" preamble is hand-rolled in **all 13** Server Action files (`invoices/[id]/actions.ts` has a `getCaller()` helper; nothing else reuses it). One `requireUser(role?)` helper would remove ~150 lines and make missing role checks (§1.2) structurally impossible.
  - `money()` (`Math.round(v*100)/100`) and `formatMoney()` are re-declared in 8+ files.
  - The `name_en || name_ar` pick is duplicated ~12 times (see §3.3).
  - The barcode-lookup + "No product found" block is duplicated between `SaleForm` and `DraftInvoiceItems`.
  - `DifferenceValue` is exported from `finance/register/register-client.tsx` and imported by the report page — a page component acting as a shared library; move to `src/components/ui/`.
  - `unitKeys` / `customerTypeKeys` / `statusKeys` maps re-declared per page instead of living beside `badge.tsx`'s equivalents.

### 4.5 — Dead code / dead keys
- **Severity: Low**
  - Dictionary keys defined but unreferenced (survivors of the pre-redesign sales table): `sales.cartTitle`, `sales.colProduct`, `sales.colWarehouse`, `sales.colQty`, `sales.colUnitPrice`, `sales.colLineTotal`, `sales.colRemove`, `customers.newCustomerLink` (superseded by `sales.newCustomerLink`).
  - `src/app/dashboard/sales/page.tsx:9` fetches `dict` and never uses it.
  - `src/app/page.tsx` boilerplate (also §3.1).

### 4.6 — Query patterns
- **Severity: Low**
  - `products/page.tsx:82-84` fetches **every** `product_prices` row in the org to price a 20-row page — add `.in("product_id", productIds)` like the images query directly below it.
  - Org scoping is inconsistent: some list queries filter `.eq("organization_id", …)` explicitly (customers, invoices, sales page), others rely purely on RLS (products list, inventory, expenses, services, warehouses list, `product_prices` update in `updateProduct`). All safe **iff** RLS is airtight, but the mixed style makes it impossible to tell deliberate defense-in-depth from omission. Pick one convention.
  - `dashboard/layout.tsx` + every page re-fetch the caller's profile separately (2 profile queries per request minimum) — acceptable, but a `cache()`-wrapped helper would halve it.
- **TypeScript:** no `any` anywhere; casts (`as NotificationRow[]`, `as MonthlyReport`, `as AdminUserRow[]`) are unvalidated but typed. ✔ Comments are English-only throughout. ✔

### 4.7 — patch-package setup verified
- **Severity: Info (OK)**
- `patches/@react-pdf+textkit+6.3.0.patch` exists, targets the installed textkit version (6.3.0 exactly), `postinstall: "patch-package"` is present in `package.json`, and the patched code (`preferFirst` glyph-boundary logic) is confirmed present in `node_modules`. ⚠ Fragility note: `@react-pdf/renderer` is a caret dependency (`^4.5.1`) and textkit is its transitive dep — a routine `npm update` that bumps textkit past 6.3.0 will make the patch fail (patch-package errors loudly on postinstall, which is good). Consider pinning renderer, and re-test Arabic PDF output after any dependency update (also see §2.8).

---

## Suggested triage order

1. **§1.1 deactivation bypass** and **§1.2 transfer action role check** — real privilege issues, small fixes.
2. **§1.4/§2.1 discount edit loopholes** — they break the feature the client will demo first.
3. **§2.2 cart repricing** and **§2.3 UTC dates** — silent money/date corruption in daily use.
4. **§3.1 root page**, **§2.8 Arabic PDF**, **§3.2 hardcoded strings** — the things a non-technical client will actually *see* on day one.
5. Verify-in-DB items (§1.3 trigger guard, §1.6 RPC self-auth, §1.7 view roles, §2.4 RPC window) — one session against the real database with the SQL checked into the repo afterwards.
