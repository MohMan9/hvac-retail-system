import Link from "next/link";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { buildPageHref } from "@/lib/pagination";

// Active / Archived switch for the products, warehouses and customers lists.
// Server-rendered links (no client state) so it works the same as the existing
// invoice status tabs. Switching views always resets to page 1.
export function ArchiveViewTabs({
  basePath,
  params,
  showArchived,
  dict,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  showArchived: boolean;
  dict: Dictionary;
}) {
  const pill = (active: boolean) =>
    `rounded-full px-3 py-1.5 font-medium ${
      active ? "bg-blue-600 text-white" : "border border-slate-300 text-slate-600 hover:bg-slate-50"
    }`;

  return (
    <div className="mb-4 flex gap-2 text-sm">
      <Link
        href={buildPageHref(basePath, { ...params, archived: undefined }, 1)}
        className={pill(!showArchived)}
      >
        {dict["archive.showActive"]}
      </Link>
      <Link
        href={buildPageHref(basePath, { ...params, archived: "1" }, 1)}
        className={pill(showArchived)}
      >
        {dict["archive.showArchived"]}
      </Link>
    </div>
  );
}
