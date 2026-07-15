"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ShoppingCart,
  Receipt,
  Package,
  Users,
  Boxes,
  Warehouse,
  Wrench,
  Wallet,
  Handshake,
  BarChart3,
  ShieldCheck,
  Vault,
  Wind,
  type LucideIcon,
} from "lucide-react";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { hasPermission, type Permissions } from "@/lib/permissions";

type NavItem = {
  href: string;
  labelKey: keyof Dictionary;
  icon: LucideIcon;
};

type NavGroup = {
  labelKey: keyof Dictionary;
  items: NavItem[];
};

export function Sidebar({ dict, permissions }: { dict: Dictionary; permissions: Permissions }) {
  const pathname = usePathname();
  // Every nav item's visibility is now driven by its matching permission
  // rather than by role. Items with no gating permission (Sales, Invoices,
  // Products, Customers, Inventory, and the read-only Cash Register status
  // view) stay visible to everyone; the actions inside each page are gated
  // separately (and by RLS).
  const can = (key: Parameters<typeof hasPermission>[1]) => hasPermission(permissions, key);

  const groups: NavGroup[] = [
    {
      labelKey: "nav.group.sales",
      items: [
        { href: "/dashboard/sales", labelKey: "nav.sales", icon: ShoppingCart },
        { href: "/dashboard/invoices", labelKey: "nav.invoices", icon: Receipt },
      ],
    },
    {
      labelKey: "nav.group.catalog",
      items: [
        { href: "/dashboard/products", labelKey: "nav.products", icon: Package },
        { href: "/dashboard/customers", labelKey: "nav.customers", icon: Users },
      ],
    },
    {
      labelKey: "nav.group.operations",
      items: [
        { href: "/dashboard/inventory", labelKey: "nav.inventory", icon: Boxes },
        ...(can("manage_warehouses")
          ? [{ href: "/dashboard/warehouses", labelKey: "nav.warehouses" as const, icon: Warehouse }]
          : []),
        // Whether the register is open/closed is a daily operational concern
        // for everyone (salespeople need to know before taking cash sales),
        // so this stays visible regardless of manage_cash_register — the
        // open/close actions inside are the gated part.
        { href: "/dashboard/finance/register", labelKey: "nav.register" as const, icon: Vault },
      ],
    },
    {
      labelKey: "nav.group.finance",
      items: [
        ...(can("manage_services")
          ? [{ href: "/dashboard/finance/services", labelKey: "nav.services" as const, icon: Wrench }]
          : []),
        ...(can("manage_expenses")
          ? [{ href: "/dashboard/finance/expenses", labelKey: "nav.expenses" as const, icon: Wallet }]
          : []),
        ...(can("manage_partners")
          ? [{ href: "/dashboard/finance/partners", labelKey: "nav.partners" as const, icon: Handshake }]
          : []),
        ...(can("view_monthly_report")
          ? [{ href: "/dashboard/finance/report", labelKey: "nav.report" as const, icon: BarChart3 }]
          : []),
      ],
    },
    ...(can("manage_users")
      ? [
          {
            labelKey: "nav.group.admin" as const,
            items: [
              { href: "/dashboard/admin", labelKey: "nav.admin" as const, icon: ShieldCheck },
            ],
          },
        ]
      : []),
  ];

  return (
    <aside className="fixed inset-y-0 start-0 z-20 flex w-60 flex-col border-e border-slate-200 bg-white">
      <Link
        href="/dashboard"
        className="flex items-center gap-2 border-b border-slate-200 px-5 py-5 hover:bg-slate-50"
      >
        <Wind className="h-6 w-6 shrink-0 text-blue-600" strokeWidth={2} />
        <span className="truncate text-base font-semibold text-slate-900">{dict["nav.appName"]}</span>
      </Link>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {groups
          .filter((group) => group.items.length > 0)
          .map((group) => (
            <div key={group.labelKey} className="mb-5">
              <p className="mb-1 px-3 text-xs font-medium uppercase tracking-wide text-slate-400">
                {dict[group.labelKey]}
              </p>
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-3 rounded-md border-s-[3px] px-3 py-2 text-sm ${
                        isActive
                          ? "border-blue-600 bg-blue-50 font-medium text-blue-600"
                          : "border-transparent text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{dict[item.labelKey]}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
      </nav>
    </aside>
  );
}
