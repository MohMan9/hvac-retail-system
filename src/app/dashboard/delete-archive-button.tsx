"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { ArchiveResult } from "./archive-actions";
import { btnDestructiveOutline } from "@/lib/ui";

type Entity = "product" | "warehouse" | "customer";

// Per-entity dictionary keys, so one component serves all three.
const keys: Record<
  Entity,
  { title: keyof Dictionary; body: keyof Dictionary; deleted: keyof Dictionary; archived: keyof Dictionary }
> = {
  product: {
    title: "archive.product.confirmTitle",
    body: "archive.product.confirmBody",
    deleted: "archive.product.deleted",
    archived: "archive.product.archived",
  },
  warehouse: {
    title: "archive.warehouse.confirmTitle",
    body: "archive.warehouse.confirmBody",
    deleted: "archive.warehouse.deleted",
    archived: "archive.warehouse.archived",
  },
  customer: {
    title: "archive.customer.confirmTitle",
    body: "archive.customer.confirmBody",
    deleted: "archive.customer.deleted",
    archived: "archive.customer.archived",
  },
};

// Delete button + styled confirmation. The bound server action decides whether
// the row is really deleted or archived (because history references it); the
// outcome message is carried to the list page via ?message=.
export function DeleteArchiveButton({
  entity,
  action,
  listHref,
}: {
  entity: Entity;
  action: () => Promise<ArchiveResult>;
  listHref: string;
}) {
  const { t } = useLocale();
  const router = useRouter();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setIsPending(true);
    setError(null);

    const result = await action();

    if (!result.success) {
      setError(result.error);
      setIsPending(false);
      setIsConfirmOpen(false);
      return;
    }

    const message = t(result.result === "archived" ? keys[entity].archived : keys[entity].deleted);
    router.push(`${listHref}?message=${encodeURIComponent(message)}`);
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setIsConfirmOpen(true)}
        className={btnDestructiveOutline}
      >
        <Trash2 className="h-4 w-4" />
        {t("common.delete")}
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {isConfirmOpen && (
        <ConfirmDialog
          title={t(keys[entity].title)}
          body={t(keys[entity].body)}
          confirmLabel={isPending ? t("archive.deleting") : t("common.delete")}
          isPending={isPending}
          onConfirm={handleConfirm}
          onCancel={() => setIsConfirmOpen(false)}
        />
      )}
    </div>
  );
}
