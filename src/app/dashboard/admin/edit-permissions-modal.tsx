"use client";

import { useEffect, useState } from "react";
import { updateUserPermissions } from "./actions";
import { PermissionGrid } from "./permission-grid";
import { createClient } from "@/lib/supabase/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { emptyPermissions, type Permissions } from "@/lib/permissions";
import { btnPrimary, btnSecondary, cardClass } from "@/lib/ui";

export function EditPermissionsModal({
  userId,
  userName,
  onClose,
  onSaved,
}: {
  userId: string;
  userName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLocale();
  const [permissions, setPermissions] = useState<Permissions>(emptyPermissions());
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Always refetch this user's REAL current permissions when the modal opens
    // — never cache. After a role change the DB trigger reset them to the new
    // role's defaults, and we must reflect that, not stale values (Task 6).
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("user_permissions")
        .select("permission_key, granted")
        .eq("user_id", userId);

      if (cancelled) {
        return;
      }

      const next = emptyPermissions();
      for (const row of data ?? []) {
        next[row.permission_key] = row.granted === true;
      }
      setPermissions(next);
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  function togglePermission(key: string, checked: boolean) {
    setPermissions((current) => ({ ...current, [key]: checked }));
  }

  async function handleSave() {
    setIsSubmitting(true);
    setError(null);

    const result = await updateUserPermissions(userId, permissions);

    setIsSubmitting(false);

    if (!result.success) {
      setError(t(result.error as keyof Dictionary));
      return;
    }

    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className={`w-full max-w-lg ${cardClass} p-6`}>
        <h2 className="mb-1 text-lg font-semibold text-slate-900">
          {t("admin.editPermissionsTitle")}
        </h2>
        <p className="mb-4 text-sm text-slate-500">{userName}</p>

        {isLoading ? (
          <p className="py-6 text-center text-sm text-slate-500">{t("common.loading")}</p>
        ) : (
          <PermissionGrid
            value={permissions}
            onChange={togglePermission}
            disabled={isSubmitting}
          />
        )}

        <div className="mt-6 flex gap-3">
          <button type="button" onClick={onClose} className={`${btnSecondary} flex-1`}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSubmitting || isLoading}
            className={`${btnPrimary} flex-1`}
          >
            {isSubmitting ? t("common.saving") : t("admin.savePermissions")}
          </button>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
