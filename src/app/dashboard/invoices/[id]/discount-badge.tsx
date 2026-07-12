import { Badge } from "@/components/ui/badge";
import type { Dictionary } from "@/lib/i18n/dictionaries";

// Pure presentational — takes a `t` lookup function as a prop instead of
// using the useLocale() hook, so it can be rendered from both the plain
// server-rendered read-only (completed invoice) table and the interactive
// client-side draft table, each of which has a differently-shaped access
// to translations (a raw `dict` object server-side, `t()` client-side).
export function DiscountBadge({
  approvedBy,
  rejectedBy,
  t,
}: {
  approvedBy: string | null;
  rejectedBy: string | null;
  t: (key: keyof Dictionary) => string;
}) {
  if (approvedBy) {
    return <Badge tone="emerald">{t("invoiceDetail.decisionApproved")}</Badge>;
  }

  if (rejectedBy) {
    return <Badge tone="red">{t("invoiceDetail.decisionRejected")}</Badge>;
  }

  return null;
}
