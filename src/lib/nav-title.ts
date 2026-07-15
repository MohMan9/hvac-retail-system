import type { Dictionary } from "@/lib/i18n/dictionaries";

const exactTitles: Record<string, keyof Dictionary> = {
  "/dashboard": "nav.appName",
  "/dashboard/sales": "sales.title",
  "/dashboard/invoices": "invoices.title",
  "/dashboard/products": "products.title",
  "/dashboard/products/new": "productForm.newTitle",
  "/dashboard/customers": "customers.title",
  "/dashboard/customers/new": "customers.newTitle",
  "/dashboard/inventory": "inventory.title",
  "/dashboard/inventory/transfers/new": "transfers.title",
  "/dashboard/warehouses": "warehouses.title",
  "/dashboard/warehouses/new": "warehouses.newTitle",
  "/dashboard/admin": "admin.createUserTitle",
  "/dashboard/finance/services": "finance.services.title",
  "/dashboard/finance/services/new": "finance.services.newTitle",
  "/dashboard/finance/expenses": "finance.expenses.title",
  "/dashboard/finance/expenses/new": "finance.expenses.newTitle",
  "/dashboard/finance/partners": "finance.partners.title",
  "/dashboard/finance/partners/new": "finance.partners.newTitle",
  "/dashboard/finance/report": "finance.report.title",
  "/dashboard/finance/register": "finance.register.title",
};

// Dynamic routes (/[id], /[id]/edit) can't be exact-matched — fall back to
// the section's list title, or its edit title when the path ends in /edit.
const sectionFallbacks: {
  prefix: string;
  titleKey: keyof Dictionary;
  editKey?: keyof Dictionary;
}[] = [
  { prefix: "/dashboard/products/", titleKey: "products.title", editKey: "productForm.editTitle" },
  { prefix: "/dashboard/customers/", titleKey: "customers.title", editKey: "customers.editTitle" },
  { prefix: "/dashboard/warehouses/", titleKey: "warehouses.title", editKey: "warehouses.editTitle" },
  { prefix: "/dashboard/invoices/", titleKey: "invoices.title" },
];

export function getPageTitleKey(pathname: string): keyof Dictionary {
  const exact = exactTitles[pathname];
  if (exact) {
    return exact;
  }

  for (const section of sectionFallbacks) {
    if (pathname.startsWith(section.prefix)) {
      if (section.editKey && pathname.endsWith("/edit")) {
        return section.editKey;
      }
      return section.titleKey;
    }
  }

  return "nav.appName";
}
