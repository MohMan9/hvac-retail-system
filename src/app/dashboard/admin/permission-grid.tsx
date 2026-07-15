"use client";

import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { PERMISSION_KEYS, type Permissions } from "@/lib/permissions";

// Shared checkbox grid for the 12 permission keys, used by both the create-user
// form and the edit-permissions modal. Labels come from the i18n dictionary
// (never the raw key). Each checkbox is also named `perm_<key>` so it's picked
// up by a native <form> submission (the create flow relies on that).
export function PermissionGrid({
  value,
  onChange,
  disabled,
}: {
  value: Permissions;
  onChange: (key: string, checked: boolean) => void;
  disabled?: boolean;
}) {
  const { t } = useLocale();

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {PERMISSION_KEYS.map((key) => (
        <label
          key={key}
          className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700"
        >
          <input
            type="checkbox"
            name={`perm_${key}`}
            checked={value[key] === true}
            disabled={disabled}
            onChange={(event) => onChange(key, event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
          />
          <span>{t(`permission.${key}` as keyof Dictionary)}</span>
        </label>
      ))}
    </div>
  );
}
