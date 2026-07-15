"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createUser } from "./actions";
import { PermissionGrid } from "./permission-grid";
import { createClient } from "@/lib/supabase/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { emptyPermissions, type Permissions } from "@/lib/permissions";
import { btnPrimary, inputClass, labelClass } from "@/lib/ui";

// Fetch a role's default permission set fresh from the DB (so it always
// reflects the current definition). Returns the map; the caller owns setState.
//
// role_default_permissions is presence-based: it has columns (role,
// permission_key) with NO `granted` column — a row existing for (role, key)
// means that key is granted by default for that role. So we start from all
// false and flip each returned key to true. (salesperson has no rows at all,
// which correctly yields an all-unchecked grid.)
async function fetchRoleDefaults(role: string): Promise<Permissions> {
  const supabase = createClient();
  const { data } = await supabase
    .from("role_default_permissions")
    .select("permission_key")
    .eq("role", role);

  const permissions = emptyPermissions();
  for (const row of data ?? []) {
    permissions[row.permission_key] = true;
  }
  return permissions;
}

export function AdminForm() {
  const { t } = useLocale();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [role, setRole] = useState("salesperson");
  const [permissions, setPermissions] = useState<Permissions>(emptyPermissions());
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Pre-check the grid to the chosen role's defaults whenever the role changes;
  // the admin can then override individual boxes before submitting.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const defaults = await fetchRoleDefaults(role);
      if (!cancelled) {
        setPermissions(defaults);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [role]);

  function togglePermission(key: string, checked: boolean) {
    setPermissions((current) => ({ ...current, [key]: checked }));
  }

  async function handleSubmit(formData: FormData) {
    setIsSubmitting(true);
    setSuccess(null);
    setError(null);

    const result = await createUser(formData);

    if (result.success) {
      setSuccess(t("admin.userCreatedSuccess"));
      formRef.current?.reset();
      // Reset the controlled role back to the default for the next user; the
      // effect above re-loads that role's default permissions into the grid.
      setRole("salesperson");
      setPermissions(await fetchRoleDefaults("salesperson"));
      router.refresh();
    } else {
      // Actions return a stable error code (a dictionary key); t() falls back
      // to the raw string for any opaque DB message that isn't a known code.
      setError(t(result.error as keyof Dictionary));
    }

    setIsSubmitting(false);
  }

  return (
    <form ref={formRef} action={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label className={labelClass}>{t("admin.fullName")}</label>
        <input name="fullName" type="text" required className={inputClass} />
      </div>

      <div>
        <label className={labelClass}>{t("admin.email")}</label>
        <input name="email" type="email" required dir="ltr" className={inputClass} />
      </div>

      <div>
        <label className={labelClass}>{t("admin.password")}</label>
        <input name="password" type="password" required minLength={6} className={inputClass} />
      </div>

      <div>
        <label className={labelClass}>{t("admin.role")}</label>
        <select
          name="role"
          required
          value={role}
          onChange={(event) => setRole(event.target.value)}
          className={inputClass}
        >
          <option value="salesperson">{t("roles.salesperson")}</option>
          <option value="manager">{t("roles.manager")}</option>
          <option value="admin">{t("roles.admin")}</option>
        </select>
      </div>

      <div>
        <label className={labelClass}>{t("admin.permissionsLabel")}</label>
        <PermissionGrid value={permissions} onChange={togglePermission} disabled={isSubmitting} />
      </div>

      <button type="submit" disabled={isSubmitting} className={`${btnPrimary} mt-2`}>
        {isSubmitting ? t("common.creating") : t("admin.createButton")}
      </button>

      {success && <p className="mt-2 text-sm text-emerald-600">{success}</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </form>
  );
}
