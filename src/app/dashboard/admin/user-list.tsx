"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { updateUserRole, toggleUserActive } from "./actions";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { ActiveBadge } from "@/components/ui/badge";
import {
  btnDestructiveOutlineSm,
  btnSecondarySm,
  inputClass,
  tableWrapClass,
  tdClass,
  theadRowClass,
  thClass,
  trClass,
} from "@/lib/ui";

type UserRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  is_active: boolean;
};

export function UserList({
  users,
  currentUserId,
  dict,
}: {
  users: UserRow[];
  currentUserId: string;
  dict: Dictionary;
}) {
  const { t } = useLocale();
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errorById, setErrorById] = useState<Record<string, string>>({});
  const [successById, setSuccessById] = useState<Record<string, boolean>>({});

  async function handleRoleChange(userId: string, role: string) {
    setPendingId(userId);
    setErrorById((current) => ({ ...current, [userId]: "" }));
    setSuccessById((current) => ({ ...current, [userId]: false }));

    const result = await updateUserRole(userId, role);

    if (!result.success) {
      setErrorById((current) => ({ ...current, [userId]: result.error }));
    } else {
      setSuccessById((current) => ({ ...current, [userId]: true }));
      router.refresh();
    }

    setPendingId(null);
  }

  async function handleToggleActive(userId: string, nextActive: boolean) {
    setPendingId(userId);
    setErrorById((current) => ({ ...current, [userId]: "" }));

    const result = await toggleUserActive(userId, nextActive);

    if (!result.success) {
      setErrorById((current) => ({ ...current, [userId]: result.error }));
    } else {
      router.refresh();
    }

    setPendingId(null);
  }

  return (
    <div className={tableWrapClass}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className={theadRowClass}>
            <th className={thClass}>{t("admin.colName")}</th>
            <th className={thClass}>{t("admin.colEmail")}</th>
            <th className={thClass}>{t("admin.colRole")}</th>
            <th className={thClass}>{t("admin.status")}</th>
            <th className={thClass}>{t("common.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => {
            const isSelf = user.id === currentUserId;

            return (
              <tr key={user.id} className={`${trClass} align-top`}>
                <td className={tdClass}>{user.full_name ?? "—"}</td>
                <td className={tdClass}>{user.email ?? "—"}</td>
                <td className={tdClass}>
                  <select
                    defaultValue={user.role}
                    disabled={pendingId === user.id}
                    onChange={(event) => handleRoleChange(user.id, event.target.value)}
                    className={`${inputClass} w-auto py-1.5 disabled:opacity-50`}
                  >
                    <option value="salesperson">{t("roles.salesperson")}</option>
                    <option value="manager">{t("roles.manager")}</option>
                    <option value="admin">{t("roles.admin")}</option>
                  </select>
                  {successById[user.id] && (
                    <p className="mt-1 text-xs text-emerald-600">{t("admin.roleUpdated")}</p>
                  )}
                </td>
                <td className={tdClass}>
                  <ActiveBadge isActive={user.is_active} dict={dict} />
                </td>
                <td className={tdClass}>
                  {isSelf ? (
                    <span className="text-xs text-slate-400">{t("admin.currentUser")}</span>
                  ) : (
                    <button
                      type="button"
                      disabled={pendingId === user.id}
                      onClick={() => handleToggleActive(user.id, !user.is_active)}
                      className={user.is_active ? btnDestructiveOutlineSm : btnSecondarySm}
                    >
                      {user.is_active ? t("admin.deactivate") : t("admin.activate")}
                    </button>
                  )}
                  {errorById[user.id] && (
                    <p className="mt-1 text-xs text-red-600">{errorById[user.id]}</p>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
